create or replace function public.save_fixed_turn(
  p_user_id uuid,
  p_conversation_id uuid,
  p_request_id uuid,
  p_user_content text,
  p_assistant_content text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_sequence integer;
  user_message_id uuid;
  assistant_message_id uuid;
begin
  if char_length(trim(p_user_content)) = 0 then
    raise exception 'User message cannot be empty';
  end if;

  if char_length(trim(p_assistant_content)) = 0 then
    raise exception 'Assistant message cannot be empty';
  end if;

  -- Lock this conversation while assigning sequence numbers

  perform 1
  from public.conversations
  where id = p_conversation_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Conversation was not found';
  end if;

  -- Return an existing result when the same request is retried

  select id
  into user_message_id
  from public.messages
  where conversation_id = p_conversation_id
    and request_id = p_request_id
    and role = 'user';

  if user_message_id is not null then
    select id
    into assistant_message_id
    from public.messages
    where conversation_id = p_conversation_id
      and request_id = p_request_id
      and role = 'assistant';

    return jsonb_build_object(
      'duplicate', true,
      'user_message_id', user_message_id,
      'assistant_message_id', assistant_message_id
    );
  end if;

  select coalesce(max(sequence), 0) + 1
  into next_sequence
  from public.messages
  where conversation_id = p_conversation_id;

  user_message_id := gen_random_uuid();
  assistant_message_id := gen_random_uuid();

  insert into public.messages (
    id,
    conversation_id,
    request_id,
    sequence,
    role,
    content,
    status
  )
  values (
    user_message_id,
    p_conversation_id,
    p_request_id,
    next_sequence,
    'user',
    trim(p_user_content),
    'completed'
  );

  insert into public.messages (
    id,
    conversation_id,
    request_id,
    sequence,
    role,
    content,
    status
  )
  values (
    assistant_message_id,
    p_conversation_id,
    p_request_id,
    next_sequence + 1,
    'assistant',
    trim(p_assistant_content),
    'completed'
  );

  update public.conversations
  set updated_at = now()
  where id = p_conversation_id;

  return jsonb_build_object(
    'duplicate', false,
    'user_message_id', user_message_id,
    'assistant_message_id', assistant_message_id
  );
end;
$$;

revoke all
on function public.save_fixed_turn(uuid, uuid, uuid, text, text)
from public, anon, authenticated;

grant execute
on function public.save_fixed_turn(uuid, uuid, uuid, text, text)
to service_role;