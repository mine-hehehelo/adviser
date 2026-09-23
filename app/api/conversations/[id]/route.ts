import { z } from 'zod';

import { requireAllowedUser } from '@/lib/server/auth';
import { errorResponse, HttpError } from '@/lib/server/errors';
import { createAdminClient } from '@/lib/supabase/admin';

const conversationIdSchema = z.string().uuid();

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAllowedUser();
    const id = conversationIdSchema.parse((await context.params).id);
    const admin = createAdminClient();
    const { data: deleted, error } = await admin.rpc(
      'delete_advisor_conversation',
      { p_user_id: user.id, p_conversation_id: id }
    );

    if (error?.message.includes('conversation_has_processing_turn')) {
      throw new HttpError(
        409,
        'Wait for the current reply before deleting this chat'
      );
    }
    if (error) throw error;
    if (!deleted) throw new HttpError(404, 'Conversation was not found');

    return Response.json(
      { deleted: true },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
