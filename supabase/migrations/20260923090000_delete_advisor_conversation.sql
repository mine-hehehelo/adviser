-- Remove a user's chat while preserving non-content usage and audit metadata.
-- The API supplies the authenticated user ID; only the service role can call this.
create or replace function public.delete_advisor_conversation(
  p_user_id uuid,
  p_conversation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text)::bigint);

  perform 1
  from public.conversations
  where id = p_conversation_id and user_id = p_user_id
  for update;

  if not found then
    return false;
  end if;

  if exists (
    select 1 from public.advisor_turn_logs
    where conversation_id = p_conversation_id and status = 'processing'
  ) then
    raise exception 'conversation_has_processing_turn';
  end if;

  update public.advisor_turn_logs
  set user_input = '[deleted conversation]', assistant_response = null
  where conversation_id = p_conversation_id;

  -- Messages cascade; logs and events retain status/usage but lose their
  -- conversation link. The existing daily counter is intentionally retained.
  delete from public.conversations
  where id = p_conversation_id and user_id = p_user_id;

  return true;
end;
$$;

revoke all on function public.delete_advisor_conversation(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.delete_advisor_conversation(uuid, uuid)
to service_role;

notify pgrst, 'reload schema';
