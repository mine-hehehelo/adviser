'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSWRConfig } from 'swr';

import { SidebarToggle } from '@/components/custom/sidebar-toggle';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  ChatRequestError,
  parseChatResponse as parseResponse,
} from '@/lib/chat-response';
import { isConversationListKey } from '@/lib/conversation-cache';
import { titleFromMessage } from '@/lib/conversation-title';

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

type PendingRequest = { id: string; text: string; conversation: string };

const chatPendingKey = (viewerId: string | undefined, id: string) =>
  viewerId ? `advisor-pending:${viewerId}:chat:${id}` : null;

function readPending(key: string | null): PendingRequest | null {
  if (!key) return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    return value &&
      typeof value.id === 'string' &&
      typeof value.text === 'string' &&
      typeof value.conversation === 'string'
      ? value
      : null;
  } catch {
    return null;
  }
}

function storePending(keys: (string | null)[], value: PendingRequest) {
  try {
    for (const key of keys) if (key) sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The in-memory request ID still protects retries in this open page.
  }
}

function clearPending(keys: (string | null)[]) {
  try {
    for (const key of keys) if (key) sessionStorage.removeItem(key);
  } catch {
    // Storage can be disabled by the browser; the visible chat still works.
  }
}

export function BackendTestChat({
  initialConversationId,
  viewerId,
  draftId,
}: {
  initialConversationId?: string;
  viewerId?: string;
  draftId?: string;
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
  const pending = useRef<PendingRequest | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const pendingKey = viewerId
    ? `advisor-pending:${viewerId}:${initialConversationId ? `chat:${initialConversationId}` : `draft:${draftId ?? 'root'}`}`
    : null;
  const retrySeconds = Math.max(0, Math.ceil((retryUntil - clock) / 1000));
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!retryUntil) return;
    const timer = setInterval(() => setClock(Date.now()), 250);
    return () => clearInterval(timer);
  }, [retryUntil]);

  useEffect(() => {
    let cancelled = false;

    async function loadConversation() {
      const saved = readPending(pendingKey);
      const selectedId = initialConversationId ?? saved?.conversation;
      try {
        if (!selectedId || cancelled) {
          setConversationId(null);
          setMessages([]);
          return;
        }

        const historyResponse = await fetch(
          `/api/conversations/${selectedId}/messages`
        );

        const history = await parseResponse<{
          messages: SavedMessage[];
        }>(historyResponse);

        if (!cancelled) {
          setConversationId(selectedId);
          setMessages(history.messages);
          if (saved) {
            const completed = history.messages.some(
              (message) =>
                message.request_id === saved.id && message.role === 'assistant'
            );
            if (completed) {
              clearPending([pendingKey, chatPendingKey(viewerId, saved.conversation)]);
              if (!initialConversationId) router.replace(`/chat/${selectedId}`);
            } else {
              pending.current = saved;
              setInput(saved.text);
            }
          }
        }
      } catch (caughtError) {
        if (!cancelled) {
          if (saved && !initialConversationId) {
            // Creation may have succeeded while its response was lost.
            pending.current = saved;
            setInput(saved.text);
            setConversationId(null);
          } else {
            setError(
              caughtError instanceof Error
                ? caughtError.message
                : 'Could not load the conversation'
            );
          }
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
  }, [initialConversationId, pendingKey, viewerId, router]);

  async function createConversation(title: string, id: string) {
    const response = await fetch('/api/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id, title }),
    });

    const result = await parseResponse<{
      conversation: Conversation;
      reused?: boolean;
    }>(response);

    if (mounted.current) setConversationId(result.conversation.id);
    void mutate(isConversationListKey).catch(() => {});

    return { id: result.conversation.id, created: !result.reused };
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
    const prior =
      pending.current?.text === text &&
      (!conversationId || pending.current.conversation === conversationId)
        ? pending.current
        : null;
    const requestId = prior?.id ?? crypto.randomUUID();
    let activeConversationId =
      conversationId ?? prior?.conversation ?? crypto.randomUUID();
    pending.current = {
      id: requestId,
      text,
      conversation: activeConversationId,
    };
    storePending(
      [pendingKey, chatPendingKey(viewerId, activeConversationId)],
      pending.current
    );
    setPendingMessage({ id: requestId, text });
    setInput('');
    let conversationCreated = false;

    try {
      if (!conversationId) {
        const created = await createConversation(
          titleFromMessage(text),
          activeConversationId
        );
        activeConversationId = created.id;
        conversationCreated = created.created;
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
        storePending(
          [pendingKey, chatPendingKey(viewerId, activeConversationId)],
          pending.current
        );
        setPendingMessage({ id: freshId, text });
        completion = await send(freshId);
      }

      pending.current = null;
      clearPending([pendingKey, chatPendingKey(viewerId, activeConversationId)]);
      if (!mounted.current) return;
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

      try {
        const historyResponse = await fetch(
          `/api/conversations/${activeConversationId}/messages`
        );
        const history = await parseResponse<{ messages: SavedMessage[] }>(
          historyResponse
        );
        setMessages(history.messages);
      } catch {
        setError(
          'Reply saved, but the conversation could not refresh. Reopen it to sync.'
        );
      }
      void mutate(isConversationListKey).catch(() => {});

      if (!initialConversationId) {
        router.replace(`/chat/${activeConversationId}`);
      }
    } catch (caughtError) {
      if (caughtError instanceof ChatRequestError) {
        if (caughtError.retryAfterSeconds) {
          setClock(Date.now());
          setRetryUntil(Date.now() + caughtError.retryAfterSeconds * 1000);
        }
        const discardRequest =
          caughtError.status === 429 ||
          caughtError.code === 'previous_failed' ||
          (caughtError.status < 500 &&
            caughtError.code !== 'processing' &&
            caughtError.code !== 'conversation_busy' &&
            caughtError.code !== 'previous_uncertain');
        if (discardRequest) {
          pending.current = null;
          clearPending([pendingKey, chatPendingKey(viewerId, activeConversationId)]);
        }
        if (caughtError.status === 429 && conversationCreated) {
          // A first message blocked by a limit should not leave an empty chat.
          try {
            const response = await fetch(`/api/conversations/${activeConversationId}`, {
              method: 'DELETE',
            });
            if (response.ok) {
              if (mounted.current) setConversationId(null);
              void mutate(isConversationListKey).catch(() => {});
            }
          } catch {
            // An old empty chat can still be removed from the sidebar.
          }
        }
      }
      if (!mounted.current) return;
      setPendingMessage(null);
      setInput(text);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not send the message. Your draft is saved; try again'
      );
    } finally {
      inFlight.current = false;
      if (mounted.current) setIsSending(false);
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

              {message.role === 'assistant' ? (
                <div className="prose max-w-none break-words dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  <ReactMarkdown
                    disallowedElements={['img']}
                    remarkPlugins={[remarkGfm]}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="whitespace-pre-wrap">{message.content}</div>
              )}
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
