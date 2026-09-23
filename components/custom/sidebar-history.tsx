'use client';

import { Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import useSWR, { useSWRConfig } from 'swr';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

import type { User } from '@supabase/supabase-js';

type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type ConversationResponse = {
  conversations: Conversation[];
};

async function fetchConversations(url: string): Promise<ConversationResponse> {
  const response = await fetch(url);
  const body = await response.json();

  if (!response.ok) {
    throw new Error(
      body.error ?? `Could not load conversations (${response.status})`
    );
  }

  return body;
}

export function SidebarHistory({ user }: { user: User | undefined }) {
  const params = useParams();
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  const { mutate } = useSWRConfig();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const activeId = typeof params.id === 'string' ? params.id : undefined;

  const { data, error, isLoading } = useSWR<ConversationResponse>(
    user ? '/api/conversations' : null,
    fetchConversations,
    {
      refreshInterval: 5000,
      revalidateOnFocus: true,
    }
  );

  if (!user) {
    return (
      <SidebarGroupContent>
        <p className="px-2 text-sm text-muted-foreground">
          Sign in to view saved conversations
        </p>
      </SidebarGroupContent>
    );
  }

  if (isLoading) {
    return (
      <SidebarGroupContent>
        <p className="px-2 text-sm text-muted-foreground">
          Loading conversations...
        </p>
      </SidebarGroupContent>
    );
  }

  if (error) {
    return (
      <SidebarGroupContent>
        <p className="px-2 text-sm text-red-500">
          Could not load conversations
        </p>
      </SidebarGroupContent>
    );
  }

  const conversations = data?.conversations ?? [];

  async function deleteConversation(conversation: Conversation) {
    setDeletingId(conversation.id);
    try {
      const response = await fetch(`/api/conversations/${conversation.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error ?? 'Could not delete the conversation');
      }
      void mutate('/api/conversations').catch(() => {});
      if (activeId === conversation.id) {
        router.replace(`/?draft=${crypto.randomUUID()}`);
      }
      toast.success('Conversation deleted');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Could not delete the conversation'
      );
    } finally {
      setDeletingId(null);
    }
  }

  if (conversations.length === 0) {
    return (
      <SidebarGroupContent>
        <p className="px-2 text-sm text-muted-foreground">
          No saved conversations
        </p>
      </SidebarGroupContent>
    );
  }

  return (
    <SidebarGroupContent>
      <div className="px-2 py-1 text-xs text-muted-foreground">
        Conversations
      </div>

      <SidebarMenu>
        {conversations.map((conversation) => (
          <SidebarMenuItem key={conversation.id}>
            <div className="group/conversation flex items-center gap-1">
              <SidebarMenuButton
                asChild
                isActive={conversation.id === activeId}
              >
                <Link
                  href={`/chat/${conversation.id}`}
                  onClick={() => setOpenMobile(false)}
                >
                  <span className="truncate">{conversation.title}</span>
                </Link>
              </SidebarMenuButton>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    aria-label={`Delete ${conversation.title}`}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    disabled={deletingId === conversation.id}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Delete this conversation?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the chat and its messages. Usage totals and
                      non-content audit records remain.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => void deleteConversation(conversation)}
                    >
                      Delete chat
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroupContent>
  );
}
