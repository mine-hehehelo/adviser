begin;

alter table public.advisor_turn_logs
  add column token_budget bigint not null default 0 check (token_budget >= 0),
  add column provider_started boolean not null default false;

create table public.advisor_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  user_id uuid references auth.users(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  request_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index advisor_events_created_idx on public.advisor_events(created_at desc);
alter table public.advisor_events enable row level security;
revoke all on public.advisor_events from public, anon, authenticated;
grant select, insert on public.advisor_events to service_role;

-- Same per-user lock as begin/complete/fail: two concurrent calls cannot spend
-- the same remaining budget. A crashed in-flight call retains its reservation.
create function public.reserve_advisor_tokens(
  p_user_id uuid, p_conversation_id uuid, p_request_id uuid,
  p_token_budget bigint, p_daily_token_limit bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_turn public.advisor_turn_logs%rowtype;
  accounted bigint;
  reserved bigint;
  day_value date;
begin
  if p_token_budget is null or p_token_budget <= 0 or p_daily_token_limit is null or p_daily_token_limit <= 0 then
    raise exception 'Token budget and limit must be positive';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_user_id::text)::bigint);
  select * into current_turn from public.advisor_turn_logs
    where user_id=p_user_id and conversation_id=p_conversation_id and request_id=p_request_id for update;
  if not found or current_turn.status <> 'processing' then
    raise exception 'Processing turn was not found';
  end if;
  if current_turn.provider_started then
    raise exception 'Provider call already started';
  end if;
  day_value := (current_turn.created_at at time zone 'Asia/Manila')::date;
  select tokens_today into accounted from public.usage_counters
    where user_id=p_user_id and usage_day=day_value for update;
  select coalesce(sum(token_budget),0) into reserved from public.advisor_turn_logs
    where user_id=p_user_id and status='processing' and id<>current_turn.id
      and (created_at at time zone 'Asia/Manila')::date=day_value;
  if coalesce(accounted,0)+reserved+p_token_budget > p_daily_token_limit then
    update public.advisor_turn_logs set status='blocked', block_reason='token_cap', completed_at=now()
      where id=current_turn.id;
    return jsonb_build_object('allowed',false,'reason','token_cap');
  end if;
  update public.advisor_turn_logs set token_budget=p_token_budget where id=current_turn.id;
  return jsonb_build_object('allowed',true,'reserved_tokens',p_token_budget);
end;
$$;

create function public.start_advisor_provider(p_user_id uuid, p_conversation_id uuid, p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text)::bigint);
  update public.advisor_turn_logs set provider_started=true
    where user_id=p_user_id and conversation_id=p_conversation_id and request_id=p_request_id
      and status='processing' and token_budget>0 and not provider_started;
  if not found then raise exception 'Reserved turn was not found or already started'; end if;
end;
$$;

create function public.audit_advisor_turn() returns trigger
language plpgsql security definer set search_path = '' as $$
declare name_value text;
begin
  if TG_OP='INSERT' then
    insert into public.advisor_events(event_name,user_id,conversation_id,request_id)
      values ('message_sent',new.user_id,new.conversation_id,new.request_id);
  end if;
  if TG_OP='UPDATE' then
    if old.status=new.status then return new; end if;
    -- Missing provider usage and interrupted calls are charged conservatively,
    -- once only. Known successful usage is accounted by complete_advisor_turn.
    if old.status='processing' and new.provider_started
       and (new.status='failed' or (new.status='completed' and new.total_tokens is null)) then
      update public.usage_counters set tokens_today=tokens_today+new.token_budget
        where user_id=new.user_id and usage_day=(new.created_at at time zone 'Asia/Manila')::date;
      insert into public.advisor_events(event_name,user_id,conversation_id,request_id,metadata)
        values ('usage_uncertain',new.user_id,new.conversation_id,new.request_id,
          jsonb_build_object('charged_tokens',new.token_budget));
    end if;
  end if;
  name_value := case new.status when 'blocked' then 'request_blocked'
    when 'completed' then 'llm_call_completed' when 'failed' then 'turn_failed' else null end;
  if name_value is not null then
    insert into public.advisor_events(event_name,user_id,conversation_id,request_id,metadata)
      values(name_value,new.user_id,new.conversation_id,new.request_id,
        jsonb_strip_nulls(jsonb_build_object('reason',new.block_reason,'error_code',new.error_code,
          'total_tokens',new.total_tokens,'reserved_tokens',new.token_budget,'source',new.document_source)));
  end if;
  if new.status='completed' and new.token_budget>0 and new.total_tokens>new.token_budget then
    insert into public.advisor_events(event_name,user_id,conversation_id,request_id,metadata)
      values ('token_estimate_exceeded',new.user_id,new.conversation_id,new.request_id,
        jsonb_build_object('actual_tokens',new.total_tokens,'reserved_tokens',new.token_budget));
  end if;
  return new;
end;
$$;
create trigger advisor_turn_audit after insert or update on public.advisor_turn_logs
  for each row execute function public.audit_advisor_turn();
revoke all on function public.reserve_advisor_tokens(uuid,uuid,uuid,bigint,bigint) from public,anon,authenticated;
revoke all on function public.start_advisor_provider(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.audit_advisor_turn() from public,anon,authenticated;
grant execute on function public.reserve_advisor_tokens(uuid,uuid,uuid,bigint,bigint) to service_role;
grant execute on function public.start_advisor_provider(uuid,uuid,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
