import { requireAdmin } from '@/lib/server/auth';
import { errorResponse, HttpError } from '@/lib/server/errors';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const day = new URL(request.url).searchParams.get('day');
    if (
      !day ||
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      !Number.isFinite(Date.parse(day)) ||
      new Date(day).toISOString().slice(0, 10) !== day
    )
      throw new HttpError(400, 'Invalid event date');
    const start = new Date(`${day}T00:00:00+08:00`);
    const { data, error } = await createAdminClient()
      .from('advisor_events')
      .select(
        'id,event_name,user_id,conversation_id,request_id,metadata,created_at'
      )
      .gte('created_at', start.toISOString())
      .lt('created_at', new Date(start.getTime() + 86400000).toISOString())
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return Response.json(
      { events: data },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
