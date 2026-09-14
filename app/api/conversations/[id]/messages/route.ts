import { z } from 'zod';

import { loadAdvisorPrompt } from '@/lib/server/advisor-docs';
import { requireAllowedUser } from '@/lib/server/auth';
import { errorResponse, HttpError } from '@/lib/server/errors';
import {
  generateAdvisorReply,
  type OpenRouterMessage,
} from '@/lib/server/openrouter';
import { createAdminClient } from '@/lib/supabase/admin';

const sendMessageSchema = z.object({
  requestId: z.string().uuid(),
  text: z.string().trim().min(1).max(4000),
});

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  _request: Request,
  context: RouteContext
) {
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
      .select(
        'id, request_id, sequence, role, content, status, created_at'
      )
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

export async function POST(
  request: Request,
  context: RouteContext
) {
  try {
    const { user } = await requireAllowedUser();
    const { id } = await context.params;
    const input = sendMessageSchema.parse(await request.json());
    const admin = createAdminClient();

    // Confirm that this conversation belongs to the signed-in user

    const {
      data: conversation,
      error: conversationError,
    } = await admin
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

    const {
      data: existingMessages,
      error: existingMessagesError,
    } = await admin
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

    // Load the private system prompt and relevant reference excerpt

    const advisorPrompt = await loadAdvisorPrompt(input.text);

    const historyMessages: OpenRouterMessage[] = (
      history ?? []
    ).map((message) => ({
      role:
        message.role === 'assistant'
          ? 'assistant'
          : 'user',
      content: message.content,
    }));

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

    // Request the real advisor response

    const completion = await generateAdvisorReply(
      modelMessages
    );

    // Save the user message and assistant response together

    const { data: saved, error: saveError } =
      await admin.rpc('save_fixed_turn', {
        p_user_id: user.id,
        p_conversation_id: id,
        p_request_id: input.requestId,
        p_user_content: input.text,
        p_assistant_content: completion.reply,
      });

    if (saveError) {
      throw saveError;
    }

    return Response.json({
      requestId: input.requestId,
      reply: completion.reply,
      saved,
    });
  } catch (error) {
    return errorResponse(error);
  }
}