'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';

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
  const { setOpenMobile } = useSidebar();

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
            <SidebarMenuButton asChild isActive={conversation.id === activeId}>
              <Link
                href={`/chat/${conversation.id}`}
                onClick={() => setOpenMobile(false)}
              >
                <span className="truncate">{conversation.title}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroupContent>
  );
}
