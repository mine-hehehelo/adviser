import { z } from 'zod';

import { requireAllowedUser } from '@/lib/server/auth';
import { errorResponse } from '@/lib/server/errors';
import { createAdminClient } from '@/lib/supabase/admin';

const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

export async function GET() {
  try {
    const { user } = await requireAllowedUser();
    const admin = createAdminClient();

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
        user_id: user.id,
        title: input.title ?? 'New conversation',
      })
      .select('id, title, created_at, updated_at')
      .single();

    if (error) {
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
