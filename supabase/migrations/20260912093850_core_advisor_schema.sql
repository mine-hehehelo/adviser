create extension if not exists pgcrypto with schema extensions;

-- Application profiles linked to Supabase Auth

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'user'
    check (role in ('user', 'admin')),
  is_allowed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One conversation belongs to one authenticated user

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation'
    check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Every message belongs to one conversation

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.conversations(id) on delete cascade,
  request_id uuid not null,
  sequence integer not null check (sequence > 0),
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(trim(content)) > 0),
  token_count integer check (token_count is null or token_count >= 0),
  est_cost_usd numeric(12, 6)
    check (est_cost_usd is null or est_cost_usd >= 0),
  status text not null default 'completed'
    check (status in ('pending', 'completed', 'failed')),
  created_at timestamptz not null default now(),

  unique (conversation_id, sequence),
  unique (conversation_id, request_id, role)
);

-- Indexes for ownership checks, history and relationships

create index conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);

create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

-- Automatically update updated_at

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

-- Automatically create a profile after authentication

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    email,
    display_name
  )
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    display_name = excluded.display_name,
    updated_at = now();

  return new;
end;
$$;

create trigger on_auth_user_created
after insert or update on auth.users
for each row execute function public.handle_new_auth_user();

-- Include users who existed before the migration

insert into public.profiles (
  id,
  email,
  display_name
)
select
  id,
  email,
  raw_user_meta_data ->> 'full_name'
from auth.users
on conflict (id) do nothing;

-- Enable database-level user isolation

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- Signed-out users receive no table access

revoke all on public.profiles from anon;
revoke all on public.conversations from anon;
revoke all on public.messages from anon;

-- Signed-in browser clients can only read permitted records
-- All application writes will pass through your backend

revoke all on public.profiles from authenticated;
revoke all on public.conversations from authenticated;
revoke all on public.messages from authenticated;

grant select on public.profiles to authenticated;
grant select on public.conversations to authenticated;
grant select on public.messages to authenticated;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = id
);

create policy conversations_select_own
on public.conversations
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

create policy messages_select_from_owned_conversations
on public.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.conversations
    where public.conversations.id = messages.conversation_id
      and public.conversations.user_id = (select auth.uid())
  )
);