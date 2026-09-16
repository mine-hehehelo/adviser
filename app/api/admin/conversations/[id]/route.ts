import { z } from 'zod';

import { requireAdmin } from '@/lib/server/auth';
import { errorResponse, HttpError } from '@/lib/server/errors';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
const querySchema = z.object({
  id: z.string().uuid(),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const input = querySchema.parse({
      ...(await context.params),
      offset: new URL(request.url).searchParams.get('offset') ?? undefined,
    });
    const admin = createAdminClient();
    const { data: conversation, error } = await admin
      .from('conversations')
      .select('id, title')
      .eq('id', input.id)
      .maybeSingle();
    if (error) throw error;
    if (!conversation) throw new HttpError(404, 'Conversation was not found');
    // Fetch one extra record to detect another page without dropping long histories.
    const result = await admin
      .from('messages')
      .select('id, role, content, sequence, created_at')
      .eq('conversation_id', input.id)
      .order('sequence', { ascending: true })
      .range(input.offset, input.offset + 100);
    if (result.error) throw result.error;
    return Response.json(
      {
        conversation,
        messages: result.data.slice(0, 100),
        nextOffset: result.data.length > 100 ? input.offset + 100 : null,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
