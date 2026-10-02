-- Prefer the refresh that started later, even if an older fetch finishes last.
create function public.write_advisor_document_cache(
  p_prompt_text text,
  p_reference_text text,
  p_fetch_started_at timestamptz
)
returns table(prompt_text text, reference_text text, fetched_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_fetch_started_at is null then
    raise exception 'Document fetch timestamp is required';
  end if;

  insert into public.advisor_document_cache as cache (
    cache_key, prompt_text, reference_text, fetched_at
  ) values (
    'advisor-documents', p_prompt_text, p_reference_text, p_fetch_started_at
  )
  on conflict (cache_key) do update
    set prompt_text = excluded.prompt_text,
        reference_text = excluded.reference_text,
        fetched_at = excluded.fetched_at
    where cache.fetched_at < excluded.fetched_at;

  return query
    select cache.prompt_text, cache.reference_text, cache.fetched_at
    from public.advisor_document_cache as cache
    where cache.cache_key = 'advisor-documents';
end;
$$;

revoke all on function public.write_advisor_document_cache(text, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.write_advisor_document_cache(text, text, timestamptz)
to service_role;

notify pgrst, 'reload schema';
