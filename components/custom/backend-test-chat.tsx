'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { useSWRConfig } from 'swr';

import { SidebarToggle } from '@/components/custom/sidebar-toggle';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

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

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json();

  if (!response.ok) {
    throw new Error(
      body.error ?? `Request failed with status ${response.status}`
    );
  }

  return body as T;
}

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

    if (!text || isSending) {
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      let activeConversationId = conversationId;

      if (!activeConversationId) {
        activeConversationId = await createConversation(text.slice(0, 60));
      }

      const sendResponse = await fetch(
        `/api/conversations/${activeConversationId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requestId: crypto.randomUUID(),
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

      setMessages(history.messages);
      setInput('');
      await mutate('/api/conversations');

      if (!initialConversationId) {
        router.replace(`/chat/${activeConversationId}`);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not send the message'
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
          <div className="font-semibold">Advisor Console</div>
          <div className="text-xs text-muted-foreground">Backend test mode</div>
        </div>

        <Button
          className="ml-auto"
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
              Send a message to test the backend
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

          {error && <p className="text-sm text-red-500">{error}</p>}
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

        <Button disabled={!input.trim() || isSending} type="submit">
          {isSending ? 'Sending...' : 'Send'}
        </Button>
      </form>
    </div>
  );
}
