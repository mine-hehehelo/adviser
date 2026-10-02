import { z } from 'zod';

import { requireAllowedUser } from '@/lib/server/auth';
import { errorResponse, HttpError } from '@/lib/server/errors';
import { createAdminClient } from '@/lib/supabase/admin';

const createConversationSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(120).optional(),
});

export async function GET() {
  try {
    const { user } = await requireAllowedUser();
    const admin = createAdminClient();
    const { error: cleanupError } = await admin.rpc(
      'purge_empty_advisor_conversations',
      { p_user_id: user.id }
    );
    if (cleanupError) throw cleanupError;

    const { data, error } = await admin
      .from('conversations')
      .select('id, title, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      throw error;
    }

    return Response.json({
      conversations: data,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireAllowedUser();
    const body = await request.json();
    const input = createConversationSchema.parse(body);
    const admin = createAdminClient();

    const { data, error } = await admin
      .from('conversations')
      .insert({
        ...(input.id ? { id: input.id } : {}),
        user_id: user.id,
        title: input.title ?? 'New conversation',
      })
      .select('id, title, created_at, updated_at')
      .single();

    if (error) {
      if (error.code === '23505' && input.id) {
        const { data: existing, error: lookupError } = await admin
          .from('conversations')
          .select('id, title, created_at, updated_at')
          .eq('id', input.id)
          .eq('user_id', user.id)
          .maybeSingle();
        if (lookupError) throw lookupError;
        if (existing?.title === (input.title ?? 'New conversation')) {
          return Response.json({ conversation: existing, reused: true });
        }
        throw new HttpError(
          409,
          'This conversation ID is already in use',
          'conversation_id_conflict'
        );
      }
      throw error;
    }

    return Response.json(
      { conversation: data },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
