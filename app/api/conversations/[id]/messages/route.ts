import { z } from 'zod';

import { requireAllowedUser } from '@/lib/server/auth';
import { errorResponse, HttpError } from '@/lib/server/errors';
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
  context: RouteContext,
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
        'id, request_id, sequence, role, content, status, created_at',
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
  context: RouteContext,
) {
  try {
    const { user } = await requireAllowedUser();
    const { id } = await context.params;
    const input = sendMessageSchema.parse(await request.json());
    const admin = createAdminClient();

    const reply =
      `response: ${input.text} `;

    const { data, error } = await admin.rpc('save_fixed_turn', {
      p_user_id: user.id,
      p_conversation_id: id,
      p_request_id: input.requestId,
      p_user_content: input.text,
      p_assistant_content: reply,
    });

    if (error) {
      throw error;
    }

    return Response.json({
      requestId: input.requestId,
      reply,
      saved: data,
    });
  } catch (error) {
    return errorResponse(error);
  }
}