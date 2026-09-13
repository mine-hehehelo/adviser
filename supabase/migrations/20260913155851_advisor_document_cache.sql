create table public.advisor_document_cache (
  cache_key text primary key,
  prompt_text text not null
    check (char_length(trim(prompt_text)) > 0),
  reference_text text not null
    check (char_length(trim(reference_text)) > 0),
  fetched_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger advisor_document_cache_set_updated_at
before update on public.advisor_document_cache
for each row execute function public.set_updated_at();

alter table public.advisor_document_cache
enable row level security;

revoke all
on public.advisor_document_cache
from public, anon, authenticated;