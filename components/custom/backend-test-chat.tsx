'use client';


import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useSWRConfig } from 'swr';

import { SidebarToggle } from '@/components/custom/sidebar-toggle';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  ChatRequestError,
  parseChatResponse as parseResponse,
} from '@/lib/chat-response';

type Conversation = {
  id: string;
  title: string;
};

type SavedMessage = {
  id: string;
  request_id: string;
  sequence: number;
  role: 'user' | 'assistant';
  content: string;
  status: string;
  created_at: string;
};

export function BackendTestChat({
  initialConversationId,
}: {
  initialConversationId?: string;
}) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SavedMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStarting, setIsStarting] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryUntil, setRetryUntil] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const pending = useRef<{
    id: string;
    text: string;
    conversation: string;
  } | null>(null);
  const retrySeconds = Math.max(0, Math.ceil((retryUntil - clock) / 1000));
  useEffect(() => {
    if (!retryUntil) return;
    const timer = setInterval(() => setClock(Date.now()), 250);
    return () => clearInterval(timer);
  }, [retryUntil]);

  useEffect(() => {
    let cancelled = false;

    async function loadConversation() {
      try {
        let selectedConversationId = initialConversationId ?? null;

        if (!selectedConversationId) {
          const response = await fetch('/api/conversations');

          const result = await parseResponse<{
            conversations: Conversation[];
          }>(response);

          selectedConversationId = result.conversations[0]?.id ?? null;
        }

        if (!selectedConversationId || cancelled) {
          setConversationId(null);
          setMessages([]);
          return;
        }

        const historyResponse = await fetch(
          `/api/conversations/${selectedConversationId}/messages`
        );

        const history = await parseResponse<{
          messages: SavedMessage[];
        }>(historyResponse);

        if (!cancelled) {
          setConversationId(selectedConversationId);
          setMessages(history.messages);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : 'Could not load the conversation'
          );
        }
      } finally {
        if (!cancelled) {
          setIsStarting(false);
        }
      }
    }

    setIsStarting(true);
    setError(null);

    void loadConversation();

    return () => {
      cancelled = true;
    };
  }, [initialConversationId]);

  async function createConversation(title: string) {
    const response = await fetch('/api/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title }),
    });

    const result = await parseResponse<{
      conversation: Conversation;
    }>(response);

    setConversationId(result.conversation.id);
    await mutate('/api/conversations');

    return result.conversation.id;
  }

  async function handleNewConversation() {
    setError(null);

    try {
      const newConversationId = await createConversation(
        'New advisor conversation'
      );

      setMessages([]);
      setInput('');

      router.push(`/chat/${newConversationId}`);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not create a conversation'
      );
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = input.trim();

    if (!text || isSending || isStarting || Date.now() < retryUntil) {
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      let activeConversationId = conversationId;

      if (!activeConversationId) {
        activeConversationId = await createConversation(text.slice(0, 60));
      }

      if (
        !pending.current ||
        pending.current.text !== text ||
        pending.current.conversation !== activeConversationId
      ) {
        pending.current = {
          id: crypto.randomUUID(),
          text,
          conversation: activeConversationId,
        };
      }
      const sendResponse = await fetch(
        `/api/conversations/${activeConversationId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requestId: pending.current.id,
            text,
          }),
        }
      );

      await parseResponse(sendResponse);

      const historyResponse = await fetch(
        `/api/conversations/${activeConversationId}/messages`
      );

      const history = await parseResponse<{
        messages: SavedMessage[];
      }>(historyResponse);

      pending.current = null;
      setMessages(history.messages);
      setInput('');
      await mutate('/api/conversations');

      if (!initialConversationId) {
        router.replace(`/chat/${activeConversationId}`);
      }
    } catch (caughtError) {
      if (caughtError instanceof ChatRequestError) {
        if (caughtError.retryAfterSeconds) {
          setClock(Date.now());
          setRetryUntil(Date.now() + caughtError.retryAfterSeconds * 1000);
        }
        if (
          caughtError.status === 429 ||
          caughtError.code === 'previous_failed' ||
          (caughtError.status < 500 && caughtError.code !== 'processing')
        )
          pending.current = null;
      }
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not send the message. Your draft is saved; try again'
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex h-dvh min-w-0 flex-col bg-background">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <SidebarToggle />

        <div>
          <div className="font-semibold"><span aria-hidden="true">👎</span> DeInfluenceMe</div>
          <div className="text-xs text-muted-foreground">
            Your advisor workspace
          </div>
        </div>

        <Button
          className="ml-auto"
          disabled={isSending || isStarting}
          onClick={handleNewConversation}
          type="button"
          variant="outline"
        >
          New conversation
        </Button>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {isStarting && (
            <p className="text-sm text-muted-foreground">
              Loading conversation...
            </p>
          )}

          {!isStarting && messages.length === 0 && (
            <p className="text-center text-muted-foreground">
              What would you like help with today?
            </p>
          )}

          {messages.map((message) => (
            <div
              className={
                message.role === 'user'
                  ? 'ml-auto max-w-[80%] rounded-xl bg-primary px-4 py-3 text-primary-foreground'
                  : 'mr-auto max-w-[80%] rounded-xl bg-muted px-4 py-3'
              }
              key={message.id}
            >
              <div className="mb-1 text-xs opacity-70">
                {message.role === 'user' ? 'You' : 'Advisor'}
              </div>

              <div className="whitespace-pre-wrap">{message.content}</div>
            </div>
          ))}

          {isSending && (
            <p className="text-sm text-muted-foreground">
              Advisor is responding...
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}
          {retrySeconds > 0 && (
            <p role="status" className="text-sm text-muted-foreground">
              You can try again in {retrySeconds} seconds. Your draft is saved.
            </p>
          )}
        </div>
      </main>

      <form
        className="mx-auto flex w-full max-w-3xl gap-2 px-4 pb-6"
        onSubmit={handleSubmit}
      >
        <Textarea
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Send a message..."
          rows={3}
          value={input}
        />

        <Button
          disabled={
            !input.trim() || isSending || isStarting || retrySeconds > 0
          }
          type="submit"
        >
          {isSending
            ? 'Sending...'
            : retrySeconds > 0
              ? `Wait ${retrySeconds}s`
              : 'Send'}
        </Button>
      </form>
    </div>
  );
}
