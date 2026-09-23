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
  const [pendingMessage, setPendingMessage] = useState<{
    id: string;
    text: string;
  } | null>(null);
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
  const inFlight = useRef(false);
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
        if (!initialConversationId || cancelled) {
          setConversationId(null);
          setMessages([]);
          return;
        }

        const historyResponse = await fetch(
          `/api/conversations/${initialConversationId}/messages`
        );

        const history = await parseResponse<{
          messages: SavedMessage[];
        }>(historyResponse);

        if (!cancelled) {
          setConversationId(initialConversationId);
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
    void mutate('/api/conversations').catch(() => {});

    return result.conversation.id;
  }

  function handleNewConversation() {
    router.push(`/?draft=${crypto.randomUUID()}`);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = input.trim();

    if (!text || inFlight.current || isStarting || Date.now() < retryUntil) {
      return;
    }

    inFlight.current = true;
    setIsSending(true);
    setError(null);
    const requestId =
      pending.current?.text === text &&
      pending.current.conversation === conversationId
        ? pending.current.id
        : crypto.randomUUID();
    setPendingMessage({ id: requestId, text });
    setInput('');

    try {
      let activeConversationId = conversationId;

      if (!activeConversationId) {
        activeConversationId = await createConversation(
          text.replace(/\s+/g, ' ').slice(0, 60)
        );
      }

      pending.current = {
        id: requestId,
        text,
        conversation: activeConversationId,
      };
      const send = async (id: string) => {
        const response = await fetch(
          `/api/conversations/${activeConversationId}/messages`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requestId: id, text }),
          }
        );
        return parseResponse<{ requestId: string; reply: string }>(response);
      };

      let completion;
      try {
        completion = await send(requestId);
      } catch (caughtError) {
        if (
          !(caughtError instanceof ChatRequestError) ||
          caughtError.code !== 'previous_failed'
        ) {
          throw caughtError;
        }
        // The original attempt is known to have failed; one new attempt is safe.
        const freshId = crypto.randomUUID();
        pending.current = {
          id: freshId,
          text,
          conversation: activeConversationId,
        };
        setPendingMessage({ id: freshId, text });
        completion = await send(freshId);
      }

      pending.current = null;
      setPendingMessage(null);
      const now = new Date().toISOString();
      setMessages((current) => [
        ...current,
        {
          id: `${completion.requestId}-user`,
          request_id: completion.requestId,
          sequence: current.length + 1,
          role: 'user',
          content: text,
          status: 'completed',
          created_at: now,
        },
        {
          id: `${completion.requestId}-assistant`,
          request_id: completion.requestId,
          sequence: current.length + 2,
          role: 'assistant',
          content: completion.reply,
          status: 'completed',
          created_at: now,
        },
      ]);

      let historySynced = false;
      try {
        const historyResponse = await fetch(
          `/api/conversations/${activeConversationId}/messages`
        );
        const history = await parseResponse<{ messages: SavedMessage[] }>(
          historyResponse
        );
        setMessages(history.messages);
        historySynced = true;
      } catch {
        setError(
          'Reply saved, but the conversation could not refresh. Reopen it to sync.'
        );
      }
      void mutate('/api/conversations').catch(() => {});

      if (!initialConversationId && historySynced) {
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
      setPendingMessage(null);
      setInput(text);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not send the message. Your draft is saved; try again'
      );
    } finally {
      inFlight.current = false;
      setIsSending(false);
    }
  }

  return (
    <div className="flex h-dvh min-w-0 flex-col bg-background">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <SidebarToggle />

        <div>
          <div className="font-semibold">
            <span aria-hidden="true">👎</span> DeInfluenceMe
          </div>
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

          {!isStarting && messages.length === 0 && !pendingMessage && (
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

          {pendingMessage && (
            <div
              className="ml-auto max-w-[80%] rounded-xl bg-primary px-4 py-3 text-primary-foreground"
              key={pendingMessage.id}
            >
              <div className="mb-1 text-xs opacity-70">You · Sending...</div>
              <div className="whitespace-pre-wrap">{pendingMessage.text}</div>
            </div>
          )}

          {isSending && pendingMessage && (
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
          disabled={isSending || isStarting}
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
