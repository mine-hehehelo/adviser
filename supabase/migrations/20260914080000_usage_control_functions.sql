-- Check limits and reserve one request before contacting OpenRouter

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
      'turn_log_id', existing_log.id
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

  -- Count recent provider-bound requests

  select count(*)
  into recent_requests
  from public.advisor_turn_logs
  where user_id = p_user_id
    and created_at > now() - interval '1 minute'
    and status in (
      'processing',
      'completed',
      'failed'
    );

  -- Select the first applicable blocking reason

  if current_messages >= p_daily_message_limit then
    block_reason_value := 'message_cap';
  elsif current_tokens >= p_daily_token_limit then
    block_reason_value := 'token_cap';
  elsif recent_requests >= p_requests_per_minute then
    block_reason_value := 'rate_limit';
  end if;

  -- Record blocked requests without contacting OpenRouter

  if block_reason_value is not null then
    insert into public.advisor_turn_logs (
      user_id,
      conversation_id,
      request_id,
      user_input,
      status,
      block_reason,
      completed_at
    )
    values (
      p_user_id,
      p_conversation_id,
      p_request_id,
      trim(p_user_input),
      'blocked',
      block_reason_value,
      now()
    )
    returning id into turn_log_id;

    return jsonb_build_object(
      'allowed', false,
      'duplicate', false,
      'status', 'blocked',
      'reason', block_reason_value,
      'retry_after_seconds',
        case
          when block_reason_value = 'rate_limit' then 60
          else null
        end,
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

-- Save a successful request, its messages and its actual usage

create or replace function public.complete_advisor_turn(
  p_user_id uuid,
  p_conversation_id uuid,
  p_request_id uuid,
  p_assistant_response text,
  p_model text,
  p_document_source text,
  p_prompt_tokens integer,
  p_completion_tokens integer,
  p_total_tokens integer,
  p_est_cost_usd numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_status text;
  existing_reply text;
  usage_day_value date;
  saved_result jsonb;
begin
  if char_length(trim(p_assistant_response)) = 0 then
    raise exception 'Assistant response cannot be empty';
  end if;

  if p_prompt_tokens is not null
    and p_prompt_tokens < 0 then
    raise exception 'Prompt tokens cannot be negative';
  end if;

  if p_completion_tokens is not null
    and p_completion_tokens < 0 then
    raise exception 'Completion tokens cannot be negative';
  end if;

  if p_total_tokens is not null
    and p_total_tokens < 0 then
    raise exception 'Total tokens cannot be negative';
  end if;

  if p_est_cost_usd is not null
    and p_est_cost_usd < 0 then
    raise exception 'Estimated cost cannot be negative';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_user_id::text)::bigint
  );

  select
    status,
    assistant_response,
    (created_at at time zone 'Asia/Manila')::date
  into
    existing_status,
    existing_reply,
    usage_day_value
  from public.advisor_turn_logs
  where user_id = p_user_id
    and conversation_id = p_conversation_id
    and request_id = p_request_id
  for update;

  if not found then
    raise exception 'Advisor turn was not found';
  end if;

  -- Return the already-saved response if completion is retried

  if existing_status = 'completed' then
    return jsonb_build_object(
      'duplicate', true,
      'status', 'completed',
      'reply', existing_reply
    );
  end if;

  if existing_status <> 'processing' then
    raise exception 'Advisor turn is not processing';
  end if;

  -- Save both visible messages in one database transaction

    saved_result := public.save_fixed_turn(
    p_user_id,
    p_conversation_id,
    p_request_id,
    (
        select user_input
        from public.advisor_turn_logs
        where user_id = p_user_id
        and conversation_id = p_conversation_id
        and request_id = p_request_id
    ),
    p_assistant_response
    );

  -- Store the provider's prompt and completion token counts

  update public.messages
  set token_count = p_prompt_tokens
  where conversation_id = p_conversation_id
    and request_id = p_request_id
    and role = 'user';

  update public.messages
  set
    token_count = p_completion_tokens,
    est_cost_usd = p_est_cost_usd
  where conversation_id = p_conversation_id
    and request_id = p_request_id
    and role = 'assistant';

  -- Finish the protected audit record

  update public.advisor_turn_logs
  set
    assistant_response = trim(p_assistant_response),
    status = 'completed',
    model = nullif(trim(p_model), ''),
    document_source = p_document_source,
    prompt_tokens = p_prompt_tokens,
    completion_tokens = p_completion_tokens,
    total_tokens = p_total_tokens,
    est_cost_usd = p_est_cost_usd,
    completed_at = now()
  where user_id = p_user_id
    and conversation_id = p_conversation_id
    and request_id = p_request_id;

  -- Add the actual provider usage to the request's original day

  insert into public.usage_counters (
    user_id,
    usage_day,
    messages_today,
    tokens_today,
    est_spend_today
  )
  values (
    p_user_id,
    usage_day_value,
    0,
    coalesce(p_total_tokens, 0),
    coalesce(p_est_cost_usd, 0)
  )
  on conflict (user_id, usage_day)
  do update
  set
    tokens_today =
      public.usage_counters.tokens_today
      + excluded.tokens_today,
    est_spend_today =
      public.usage_counters.est_spend_today
      + excluded.est_spend_today;

  return saved_result || jsonb_build_object(
    'duplicate', false,
    'status', 'completed'
  );
end;
$$;

-- Record a request that started but could not finish

create or replace function public.fail_advisor_turn(
  p_user_id uuid,
  p_conversation_id uuid,
  p_request_id uuid,
  p_error_code text,
  p_document_source text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_status text;
  safe_error_code text :=
    coalesce(
      nullif(trim(p_error_code), ''),
      'unknown_error'
    );
begin
  perform pg_advisory_xact_lock(
    hashtext(p_user_id::text)::bigint
  );

  select status
  into existing_status
  from public.advisor_turn_logs
  where user_id = p_user_id
    and conversation_id = p_conversation_id
    and request_id = p_request_id
  for update;

  if not found then
    raise exception 'Advisor turn was not found';
  end if;

  if existing_status <> 'processing' then
    return jsonb_build_object(
      'duplicate', true,
      'status', existing_status
    );
  end if;

  update public.advisor_turn_logs
  set
    status = 'failed',
    error_code = safe_error_code,
    document_source = p_document_source,
    completed_at = now()
  where user_id = p_user_id
    and conversation_id = p_conversation_id
    and request_id = p_request_id;

  return jsonb_build_object(
    'duplicate', false,
    'status', 'failed'
  );
end;
$$;

-- Only the protected backend may call these functions

revoke all
on function public.begin_advisor_turn(
  uuid,
  uuid,
  uuid,
  text,
  integer,
  bigint,
  integer
)
from public, anon, authenticated;

revoke all
on function public.complete_advisor_turn(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  integer,
  numeric
)
from public, anon, authenticated;

revoke all
on function public.fail_advisor_turn(
  uuid,
  uuid,
  uuid,
  text,
  text
)
from public, anon, authenticated;

grant execute
on function public.begin_advisor_turn(
  uuid,
  uuid,
  uuid,
  text,
  integer,
  bigint,
  integer
)
to service_role;

grant execute
on function public.complete_advisor_turn(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  integer,
  numeric
)
to service_role;

grant execute
on function public.fail_advisor_turn(
  uuid,
  uuid,
  uuid,
  text,
  text
)
to service_role;

