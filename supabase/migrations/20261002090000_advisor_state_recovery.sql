-- Reconcile abandoned serverless requests after the bounded request lifetime.
-- The audit trigger charges an uncertain provider call and refunds a request
-- that never reached the provider. Only the protected backend may call this.
create index advisor_turn_logs_processing_age_idx
  on public.advisor_turn_logs (user_id, created_at)
  where status = 'processing';

create function public.reconcile_stale_advisor_turns(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  reconciled integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text)::bigint);

  update public.advisor_turn_logs
  set status = 'failed', error_code = 'interrupted', completed_at = now()
  where user_id = p_user_id
    and status = 'processing'
    and created_at < now() - interval '10 minutes';

  get diagnostics reconciled = row_count;
  return reconciled;
end;
$$;

revoke all on function public.reconcile_stale_advisor_turns(uuid)
from public, anon, authenticated;
grant execute on function public.reconcile_stale_advisor_turns(uuid)
to service_role;

-- Admit one turn at a time per conversation, before loading its history.

create or replace function public.begin_advisor_turn(
  p_user_id uuid,
  p_conversation_id uuid,
  p_request_id uuid,
  p_user_input text,
  p_daily_message_limit integer,
  p_daily_token_limit bigint,
  p_requests_per_minute integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  usage_day_value date :=
    (now() at time zone 'Asia/Manila')::date;

  existing_log public.advisor_turn_logs%rowtype;

  current_messages integer;
  current_tokens bigint;
  recent_requests bigint;

  block_reason_value text;
  turn_log_id uuid;
  active_turn_id uuid;
begin
  if char_length(trim(p_user_input)) = 0 then
    raise exception 'User input cannot be empty';
  end if;

  if p_daily_message_limit <= 0 then
    raise exception 'Daily message limit must be positive';
  end if;

  if p_daily_token_limit <= 0 then
    raise exception 'Daily token limit must be positive';
  end if;

  if p_requests_per_minute <= 0 then
    raise exception 'Rate limit must be positive';
  end if;

  -- Serialize short usage checks for this user

  perform pg_advisory_xact_lock(
    hashtext(p_user_id::text)::bigint
  );

  -- Confirm that the conversation belongs to this user

  perform 1
  from public.conversations
  where id = p_conversation_id
    and user_id = p_user_id;

  if not found then
    raise exception 'Conversation was not found';
  end if;

  perform public.reconcile_stale_advisor_turns(p_user_id);

  -- Return the existing request instead of creating another
  -- OpenRouter call

  select *
  into existing_log
  from public.advisor_turn_logs
  where conversation_id = p_conversation_id
    and request_id = p_request_id;

  if found then
    return jsonb_build_object(
      'allowed', false,
      'duplicate', true,
      'status', existing_log.status,
      'reason', existing_log.block_reason,
      'reply', existing_log.assistant_response,
      'provider_started', existing_log.provider_started,
      'retry_after_seconds',
        case when existing_log.block_reason = 'rate_limit' then 60 else null end,
      'turn_log_id', existing_log.id
    );
  end if;

  select id into active_turn_id
  from public.advisor_turn_logs
  where conversation_id = p_conversation_id
    and status = 'processing'
  limit 1;

  if active_turn_id is not null then
    return jsonb_build_object(
      'allowed', false,
      'duplicate', false,
      'status', 'processing',
      'reason', 'conversation_busy',
      'retry_after_seconds', 5,
      'turn_log_id', active_turn_id
    );
  end if;

  -- Ensure today's counter exists

  insert into public.usage_counters (
    user_id,
    usage_day
  )
  values (
    p_user_id,
    usage_day_value
  )
  on conflict (user_id, usage_day) do nothing;

  -- Lock today's counter while checking and updating it

  select
    messages_today,
    tokens_today
  into
    current_messages,
    current_tokens
  from public.usage_counters
  where user_id = p_user_id
    and usage_day = usage_day_value
  for update;

  -- Count logged attempts, including blocks, to bound audit writes.

  select count(*)
  into recent_requests
  from public.advisor_turn_logs
  where user_id = p_user_id
    and created_at > now() - interval '1 minute';

  -- Preserve the daily-cap reason even if many blocked retries also reach
  -- the per-minute cap. Keep one visible cap event per window.
  if current_messages >= p_daily_message_limit then
    block_reason_value := 'message_cap';
  elsif current_tokens >= p_daily_token_limit then
    block_reason_value := 'token_cap';
  end if;

  if block_reason_value is not null then
    select id into turn_log_id
    from public.advisor_turn_logs
    where user_id = p_user_id
      and created_at > now() - interval '1 minute'
      and status = 'blocked'
      and block_reason = block_reason_value
    order by created_at desc
    limit 1;

    if turn_log_id is null then
      insert into public.advisor_turn_logs (
        user_id, conversation_id, request_id, user_input,
        status, block_reason, completed_at
      ) values (
        p_user_id, p_conversation_id, p_request_id, trim(p_user_input),
        'blocked', block_reason_value, now()
      ) returning id into turn_log_id;
    end if;

    return jsonb_build_object(
      'allowed', false,
      'duplicate', false,
      'status', 'blocked',
      'reason', block_reason_value,
      'turn_log_id', turn_log_id
    );
  end if;

  -- Keep one visible rate-limit event per window, not one row per retry.
  if recent_requests >= p_requests_per_minute then
    select id into turn_log_id
    from public.advisor_turn_logs
    where user_id = p_user_id
      and created_at > now() - interval '1 minute'
      and status = 'blocked'
      and block_reason = 'rate_limit'
    order by created_at desc
    limit 1;

    if turn_log_id is null then
      insert into public.advisor_turn_logs (
        user_id, conversation_id, request_id, user_input,
        status, block_reason, completed_at
      ) values (
        p_user_id, p_conversation_id, p_request_id, trim(p_user_input),
        'blocked', 'rate_limit', now()
      ) returning id into turn_log_id;
    end if;

    return jsonb_build_object(
      'allowed', false,
      'duplicate', false,
      'status', 'blocked',
      'reason', 'rate_limit',
      'retry_after_seconds', 60,
      'turn_log_id', turn_log_id
    );
  end if;

  -- Reserve the request before the external model call begins

  insert into public.advisor_turn_logs (
    user_id,
    conversation_id,
    request_id,
    user_input,
    status
  )
  values (
    p_user_id,
    p_conversation_id,
    p_request_id,
    trim(p_user_input),
    'processing'
  )
  returning id into turn_log_id;

  update public.usage_counters
  set messages_today = messages_today + 1
  where user_id = p_user_id
    and usage_day = usage_day_value
  returning
    messages_today,
    tokens_today
  into
    current_messages,
    current_tokens;

  return jsonb_build_object(
    'allowed', true,
    'duplicate', false,
    'status', 'processing',
    'turn_log_id', turn_log_id,
    'messages_today', current_messages,
    'tokens_today', current_tokens
  );
end;
$$;

-- Refund the daily message slot if no provider call started. Keep uncertain
-- provider usage charged conservatively, once, as before.
create or replace function public.audit_advisor_turn() returns trigger
language plpgsql security definer set search_path = '' as $$
declare name_value text;
begin
  if TG_OP = 'INSERT' then
    insert into public.advisor_events(event_name, user_id, conversation_id, request_id)
      values ('message_sent', new.user_id, new.conversation_id, new.request_id);
  end if;

  if TG_OP = 'UPDATE' then
    if old.status = new.status then return new; end if;

    if old.status = 'processing' and new.status in ('blocked', 'failed')
       and not new.provider_started then
      update public.usage_counters
      set messages_today = greatest(messages_today - 1, 0)
      where user_id = new.user_id
        and usage_day = (new.created_at at time zone 'Asia/Manila')::date;
    end if;

    if old.status = 'processing' and new.provider_started
       and (new.status = 'failed' or
            (new.status = 'completed' and new.total_tokens is null)) then
      update public.usage_counters
      set tokens_today = tokens_today + new.token_budget
      where user_id = new.user_id
        and usage_day = (new.created_at at time zone 'Asia/Manila')::date;
      insert into public.advisor_events(event_name, user_id, conversation_id, request_id, metadata)
        values ('usage_uncertain', new.user_id, new.conversation_id, new.request_id,
          jsonb_build_object('charged_tokens', new.token_budget));
    end if;
  end if;

  name_value := case new.status
    when 'blocked' then 'request_blocked'
    when 'completed' then 'llm_call_completed'
    when 'failed' then 'turn_failed'
    else null end;
  if name_value is not null then
    insert into public.advisor_events(event_name, user_id, conversation_id, request_id, metadata)
      values (name_value, new.user_id, new.conversation_id, new.request_id,
        jsonb_strip_nulls(jsonb_build_object(
          'reason', new.block_reason,
          'error_code', new.error_code,
          'total_tokens', new.total_tokens,
          'reserved_tokens', new.token_budget,
          'source', new.document_source)));
  end if;
  if new.status = 'completed' and new.token_budget > 0
     and new.total_tokens > new.token_budget then
    insert into public.advisor_events(event_name, user_id, conversation_id, request_id, metadata)
      values ('token_estimate_exceeded', new.user_id, new.conversation_id, new.request_id,
        jsonb_build_object('actual_tokens', new.total_tokens,
          'reserved_tokens', new.token_budget));
  end if;
  return new;
end;
$$;

-- A crashed request no longer prevents its owner from deleting the chat forever.
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
  perform public.reconcile_stale_advisor_turns(p_user_id);

  perform 1 from public.conversations
  where id = p_conversation_id and user_id = p_user_id
  for update;
  if not found then return false; end if;

  if exists (
    select 1 from public.advisor_turn_logs
    where conversation_id = p_conversation_id and status = 'processing'
  ) then
    raise exception 'conversation_has_processing_turn';
  end if;

  update public.advisor_turn_logs
  set user_input = '[deleted conversation]', assistant_response = null
  where conversation_id = p_conversation_id;

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

-- The UI creates a chat before its first turn. Remove old empty chats left by
-- lost network responses or blocked first turns without dropping usage records.
create function public.purge_empty_advisor_conversations(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  removed integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text)::bigint);
  perform public.reconcile_stale_advisor_turns(p_user_id);

  for candidate in
    select c.id from public.conversations c
    where c.user_id = p_user_id
      and c.created_at < now() - interval '1 hour'
      and not exists (
        select 1 from public.messages m where m.conversation_id = c.id
      )
      and not exists (
        select 1 from public.advisor_turn_logs t
        where t.conversation_id = c.id and t.status = 'processing'
      )
  loop
    if public.delete_advisor_conversation(p_user_id, candidate.id) then
      removed := removed + 1;
    end if;
  end loop;

  return removed;
end;
$$;

revoke all on function public.purge_empty_advisor_conversations(uuid)
from public, anon, authenticated;
grant execute on function public.purge_empty_advisor_conversations(uuid)
to service_role;

notify pgrst, 'reload schema';
