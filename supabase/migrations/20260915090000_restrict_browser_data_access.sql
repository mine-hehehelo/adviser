-- Use the protected backend for conversation and message access

revoke all
on public.conversations
from public, anon, authenticated;

revoke all
on public.messages
from public, anon, authenticated;

drop policy if exists conversations_select_own
on public.conversations;

drop policy if exists messages_select_from_owned_conversations
on public.messages;