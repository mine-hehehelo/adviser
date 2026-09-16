import { z } from 'zod';


import {
  loadAdvisorPrompt,
  type AdvisorPrompt,
} from '@/lib/server/advisor-docs';
import { requireAllowedUser } from '@/lib/server/auth';
import { errorResponse, HttpError } from '@/lib/server/errors';
import {
  generateAdvisorReply,
  type OpenRouterMessage,
} from '@/lib/server/openrouter';
import { estimateTokenBudget } from '@/lib/server/token-budget';
import { getUsageLimits } from '@/lib/server/usage-limits';
import { createAdminClient } from '@/lib/supabase/admin';

const sendMessageSchema = z.object({
  requestId: z.string().uuid(),
  text: z.string().trim().min(1).max(4000),
});

const limitReasonSchema = z.enum(['message_cap', 'token_cap', 'rate_limit']);

type LimitReason = z.infer<typeof limitReasonSchema>;

const beginAdvisorTurnSchema = z.object({
  allowed: z.boolean(),
  duplicate: z.boolean(),
  status: z.enum(['processing', 'completed', 'blocked', 'failed']),
  reason: limitReasonSchema.nullable().optional(),
  reply: z.string().nullable().optional(),
  turn_log_id: z.string().uuid(),
  retry_after_seconds: z.number().int().positive().nullable().optional(),
});

function createLimitResponse(
  reason: LimitReason,
  retryAfterSeconds?: number | null
) {
  const messages: Record<LimitReason, string> = {
    message_cap: 'You have reached today’s message limit. It resets at midnight (Manila time)',
    token_cap: 'There is not enough available usage for this message. Try a shorter conversation or return after midnight (Manila time)',
    rate_limit: 'Too many requests. Please wait before trying again',
  };

  const headers =
    reason === 'rate_limit' && retryAfterSeconds
      ? {
          'Retry-After': String(retryAfterSeconds),
        }
      : undefined;

  return Response.json(
    {
      error: messages[reason],
      code: reason,
      retryAfterSeconds: retryAfterSeconds ?? null,
    },
    {
      status: 429,
      headers,
    }
  );
}

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { user } = await requireAllowedUser();
    const { id } = await context.params;
    const admin = createAdminClient();

    const { data: conversation } = await admin
      .from('conversations')
      .select('id, title, user_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!conversation) {
      throw new HttpError(404, 'Conversation was not found');
    }

    const { data: messages, error } = await admin
      .from('messages')
      .select('id, request_id, sequence, role, content, status, created_at')
      .eq('conversation_id', id)
      .order('sequence', { ascending: true });

    if (error) {
      throw error;
    }

    return Response.json({
      conversation,
      messages,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { user } = await requireAllowedUser();
    const { id } = await context.params;
    const input = sendMessageSchema.parse(await request.json());
    const admin = createAdminClient();

    // Confirm that this conversation belongs to the signed-in user

    const { data: conversation, error: conversationError } = await admin
      .from('conversations')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (conversationError) {
      throw conversationError;
    }

    if (!conversation) {
      throw new HttpError(404, 'Conversation was not found');
    }

    // Return the stored reply when the same request is retried

    const { data: existingMessages, error: existingMessagesError } = await admin
      .from('messages')
      .select('id, role, content')
      .eq('conversation_id', id)
      .eq('request_id', input.requestId);

    if (existingMessagesError) {
      throw existingMessagesError;
    }

    const existingUserMessage = existingMessages?.find(
      (message) => message.role === 'user'
    );

    const existingAssistantMessage = existingMessages?.find(
      (message) => message.role === 'assistant'
    );

    if (existingAssistantMessage) {
      return Response.json({
        requestId: input.requestId,
        reply: existingAssistantMessage.content,
        saved: {
          duplicate: true,
          user_message_id: existingUserMessage?.id ?? null,
          assistant_message_id: existingAssistantMessage.id,
        },
      });
    }

    // Load previous messages so the model understands the conversation

    const { data: history, error: historyError } = await admin
      .from('messages')
      .select('role, content, sequence')
      .eq('conversation_id', id)
      .eq('status', 'completed')
      .order('sequence', { ascending: true });

    if (historyError) {
      throw historyError;
    }

    // Check and reserve the user's usage before external API work

    const limits = getUsageLimits();

    const { data: beginTurnData, error: beginTurnError } = await admin.rpc(
      'begin_advisor_turn',
      {
        p_user_id: user.id,
        p_conversation_id: id,
        p_request_id: input.requestId,
        p_user_input: input.text,
        p_daily_message_limit: limits.dailyMessageLimit,
        p_daily_token_limit: limits.dailyTokenLimit,
        p_requests_per_minute: limits.requestsPerMinute,
      }
    );

    if (beginTurnError) {
      throw beginTurnError;
    }

    const beginTurn = beginAdvisorTurnSchema.parse(beginTurnData);

    // Handle a request ID that has already been used

    if (beginTurn.duplicate) {
      if (beginTurn.status === 'completed' && beginTurn.reply) {
        return Response.json({
          requestId: input.requestId,
          reply: beginTurn.reply,
          saved: {
            duplicate: true,
            user_message_id: null,
            assistant_message_id: null,
          },
        });
      }

      if (beginTurn.status === 'blocked' && beginTurn.reason) {
        return createLimitResponse(
          beginTurn.reason,
          beginTurn.retry_after_seconds
        );
      }

      if (beginTurn.status === 'processing') {
        throw new HttpError(
          409,
          'This message is already being processed',
          'processing',
          5
        );
      }

      throw new HttpError(
        409,
        'The previous attempt failed. You can send your message again',
        'previous_failed'
      );
    }

    // Stop a newly blocked request before calling OpenRouter

    if (!beginTurn.allowed) {
      if (!beginTurn.reason) {
        throw new Error('Blocked advisor request did not include a reason');
      }

      return createLimitResponse(
        beginTurn.reason,
        beginTurn.retry_after_seconds
      );
    }

    // Track which document source was available if the turn fails

    let documentSource: AdvisorPrompt['documentSource'] | null = null;

    try {
      // Load the private system prompt and relevant reference excerpt

      const eventContext = {
        userId: user.id,
        conversationId: id,
        requestId: input.requestId,
      };
      const advisorPrompt = await loadAdvisorPrompt(input.text, eventContext);

      documentSource = advisorPrompt.documentSource;

      const historyMessages: OpenRouterMessage[] = (history ?? []).map(
        (message) => ({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: message.content,
        })
      );

      const modelMessages: OpenRouterMessage[] = [
        {
          role: 'system',
          content: advisorPrompt.systemPrompt,
        },
        ...historyMessages,
        {
          role: 'user',
          content: input.text,
        },
      ];

      // Request the advisor response

      const identity = {
        p_user_id: user.id,
        p_conversation_id: id,
        p_request_id: input.requestId,
      };
      const { data: reservation, error: reservationError } = await admin.rpc(
        'reserve_advisor_tokens',
        {
          ...identity,
          p_token_budget: estimateTokenBudget(modelMessages),
          p_daily_token_limit: limits.dailyTokenLimit,
        }
      );
      if (reservationError) throw reservationError;
      if (!z.object({ allowed: z.boolean() }).parse(reservation).allowed)
        return createLimitResponse('token_cap');
      const { error: startError } = await admin.rpc(
        'start_advisor_provider',
        identity
      );
      if (startError) throw startError;
      const completion = await generateAdvisorReply(
        modelMessages,
        eventContext
      );

      // Save the messages, usage and completed status together

      const { data: saved, error: completeTurnError } = await admin.rpc(
        'complete_advisor_turn',
        {
          p_user_id: user.id,
          p_conversation_id: id,
          p_request_id: input.requestId,
          p_assistant_response: completion.reply,
          p_model: completion.model,
          p_document_source: advisorPrompt.documentSource,
          p_prompt_tokens: completion.usage.promptTokens,
          p_completion_tokens: completion.usage.completionTokens,
          p_total_tokens: completion.usage.totalTokens,
          p_est_cost_usd: completion.usage.costUsd,
        }
      );

      if (completeTurnError) {
        throw completeTurnError;
      }

      return Response.json({
        requestId: input.requestId,
        reply: completion.reply,
        saved,
      });
    } catch (turnError) {
      // Close the reservation when document, model or saving fails

      const errorCode =
        turnError instanceof HttpError
          ? `http_${turnError.status}`
          : 'request_failed';

      const { error: failTurnError } = await admin.rpc('fail_advisor_turn', {
        p_user_id: user.id,
        p_conversation_id: id,
        p_request_id: input.requestId,
        p_error_code: errorCode,
        p_document_source: documentSource,
      });

      if (failTurnError) {
        console.error(
          'Could not mark advisor turn as failed:',
          failTurnError.message
        );
      }

      throw turnError;
    }
  } catch (error) {
    return errorResponse(error);
  }
}
