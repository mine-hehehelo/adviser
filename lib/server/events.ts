import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export type EventContext = {
  userId: string;
  conversationId: string;
  requestId: string;
};
type EventName =
  | 'prompt_cache_hit'
  | 'prompt_cache_miss'
  | 'doc_fetch_error'
  | 'provider_error';
type EventMetadata = {
  fallback?: boolean;
  status?: number;
  kind?: 'connection' | 'http' | 'invalid_response';
};

// Only structured operational fields belong here. Never pass prompts, messages,
// provider bodies, credentials, or arbitrary Error objects into the audit feed.
export async function recordEvent(
  name: EventName,
  context?: EventContext,
  metadata: EventMetadata = {}
) {
  const { error } = await createAdminClient()
    .from('advisor_events')
    .insert({
      event_name: name,
      user_id: context?.userId ?? null,
      conversation_id: context?.conversationId ?? null,
      request_id: context?.requestId ?? null,
      metadata,
    });
  if (error) throw new Error('Unable to record advisor event');
}
