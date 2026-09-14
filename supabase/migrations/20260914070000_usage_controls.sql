-- Daily usage totals for each user

create table public.usage_counters (
  user_id uuid not null
    references auth.users(id) on delete cascade,
  usage_day date not null,
  messages_today integer not null default 0
    check (messages_today >= 0),
  tokens_today bigint not null default 0
    check (tokens_today >= 0),
  est_spend_today numeric(18, 10) not null default 0
    check (est_spend_today >= 0),
  updated_at timestamptz not null default now(),

  primary key (user_id, usage_day)
);

-- One protected record for every accepted, blocked or failed request

create table public.advisor_turn_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references auth.users(id) on delete cascade,
  conversation_id uuid
    references public.conversations(id) on delete set null,
  request_id uuid not null,

  user_input text not null
    check (char_length(trim(user_input)) > 0),
  assistant_response text,

  status text not null default 'processing'
    check (
      status in (
        'processing',
        'completed',
        'blocked',
        'failed'
      )
    ),

  block_reason text
    check (
      block_reason is null
      or block_reason in (
        'message_cap',
        'token_cap',
        'rate_limit'
      )
    ),

  error_code text,
  model text,

  document_source text
    check (
      document_source is null
      or document_source in (
        'google',
        'cache',
        'stale-cache'
      )
    ),

  prompt_tokens integer
    check (prompt_tokens is null or prompt_tokens >= 0),
  completion_tokens integer
    check (
      completion_tokens is null
      or completion_tokens >= 0
    ),
  total_tokens integer
    check (total_tokens is null or total_tokens >= 0),

  est_cost_usd numeric(18, 10)
    check (est_cost_usd is null or est_cost_usd >= 0),

  created_at timestamptz not null default now(),
  completed_at timestamptz,

  unique (conversation_id, request_id)
);

-- Support rate checks and admin usage queries

create index advisor_turn_logs_user_created_idx
  on public.advisor_turn_logs (
    user_id,
    created_at desc
  );

create index advisor_turn_logs_conversation_created_idx
  on public.advisor_turn_logs (
    conversation_id,
    created_at
  );

-- Maintain the usage counter timestamp automatically

create trigger usage_counters_set_updated_at
before update on public.usage_counters
for each row execute function public.set_updated_at();

-- Preserve small OpenRouter cost values accurately

alter table public.messages
alter column est_cost_usd
type numeric(18, 10);

-- Keep usage and cost information inaccessible to browser clients

alter table public.usage_counters
enable row level security;

alter table public.advisor_turn_logs
enable row level security;

revoke all
on public.usage_counters
from public, anon, authenticated;

revoke all
on public.advisor_turn_logs
from public, anon, authenticated;

-- The protected backend and future admin endpoint may read the tables

grant select
on public.usage_counters
to service_role;

grant select
on public.advisor_turn_logs
to service_role;