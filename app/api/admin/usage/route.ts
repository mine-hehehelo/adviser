import { z } from 'zod';

import { requireAdmin } from '@/lib/server/auth';
import { errorResponse, HttpError } from '@/lib/server/errors';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);

    const date = new Date(Date.UTC(year, month - 1, day));

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, 'Invalid calendar date');

const querySchema = z.object({
  day: daySchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const TURN_SELECT =
  'id, user_id, conversation_id, request_id, status, block_reason, error_code, model, document_source, prompt_tokens, completion_tokens, total_tokens, est_cost_usd, created_at, completed_at, user_input, assistant_response' as const;

function getManilaDay(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function getManilaDayRange(day: string) {
  const start = new Date(`${day}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    await requireAdmin();

    const url = new URL(request.url);

    const parsedQuery = querySchema.safeParse({
      day: url.searchParams.get('day') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
    });

    if (!parsedQuery.success) {
      throw new HttpError(400, 'Invalid usage query parameters');
    }

    const day = parsedQuery.data.day ?? getManilaDay();
    const limit = parsedQuery.data.limit;
    const range = getManilaDayRange(day);
    const admin = createAdminClient();

    const [usageResult, turnsResult, conversationsResult, profilesResult] =
      await Promise.all([
        admin
          .from('usage_counters')
          .select(
            'user_id, usage_day, messages_today, tokens_today, est_spend_today'
          )
          .eq('usage_day', day)
          .order('messages_today', { ascending: false }),

        admin
          .from('advisor_turn_logs')
          .select(TURN_SELECT)
          .gte('created_at', range.start)
          .lt('created_at', range.end)
          .order('created_at', { ascending: false })
          .limit(limit),

        admin
          .from('conversations')
          .select('id, user_id, title, created_at, updated_at')
          .order('updated_at', { ascending: false })
          .limit(limit),

        admin.from('profiles').select('id, email, display_name'),
      ]);

    if (usageResult.error) {
      throw usageResult.error;
    }

    if (turnsResult.error) {
      throw turnsResult.error;
    }

    if (conversationsResult.error) {
      throw conversationsResult.error;
    }

    if (profilesResult.error) {
      throw profilesResult.error;
    }

    const usageRows = usageResult.data ?? [];
    const turnRows = turnsResult.data ?? [];
    const conversationRows = conversationsResult.data ?? [];
    const profileRows = profilesResult.data ?? [];

    const profilesById = new Map(
      profileRows.map((profile) => [profile.id, profile] as const)
    );

    function getUser(userId: string) {
      const profile = profilesById.get(userId);

      return {
        userId,
        email: profile?.email ?? null,
        displayName: profile?.display_name ?? null,
      };
    }

    const totals = usageRows.reduce(
      (result, row) => ({
        users: result.users + 1,
        messages: result.messages + row.messages_today,
        tokens: result.tokens + row.tokens_today,
        estimatedCostUsd: result.estimatedCostUsd + row.est_spend_today,
      }),
      {
        users: 0,
        messages: 0,
        tokens: 0,
        estimatedCostUsd: 0,
      }
    );

    return Response.json(
      {
        day,
        generatedAt: new Date().toISOString(),
        totals,

        users: usageRows.map((row) => ({
          ...getUser(row.user_id),
          messagesToday: row.messages_today,
          tokensToday: row.tokens_today,
          estimatedCostUsd: row.est_spend_today,
        })),

        recentConversations: conversationRows.map((conversation) => ({
          id: conversation.id,
          title: conversation.title,
          ...getUser(conversation.user_id),
          createdAt: conversation.created_at,
          updatedAt: conversation.updated_at,
        })),

        recentTurns: turnRows.map((turn) => ({
          id: turn.id,
          conversationId: turn.conversation_id,
          requestId: turn.request_id,
          ...getUser(turn.user_id),
          status: turn.status,
          blockReason: turn.block_reason,
          errorCode: turn.error_code,
          model: turn.model,
          documentSource: turn.document_source,
          promptTokens: turn.prompt_tokens,
          completionTokens: turn.completion_tokens,
          totalTokens: turn.total_tokens,
          estimatedCostUsd: turn.est_cost_usd,
          userInput: turn.user_input,
          assistantResponse: turn.assistant_response,
          createdAt: turn.created_at,
          completedAt: turn.completed_at,
        })),
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
