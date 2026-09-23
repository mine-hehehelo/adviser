'use client';

import { User } from '@supabase/supabase-js';
import { ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { PlusIcon } from '@/components/custom/icons';
import { SidebarHistory } from '@/components/custom/sidebar-history';
import { SidebarUserNav } from '@/components/custom/sidebar-user-nav';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  useSidebar,
} from '@/components/ui/sidebar';
import { BetterTooltip } from '@/components/ui/tooltip';

export function AppSidebar({
  user,
  isAdmin = false,
}: {
  user: User | null;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const { setOpenMobile } = useSidebar();

  function openNewConversation() {
    setOpenMobile(false);
    router.push(`/?draft=${crypto.randomUUID()}`);
  }

  return (
    <Sidebar className="group-data-[side=left]:border-r-0">
      <SidebarHeader>
        <SidebarMenu>
          <div className="flex flex-row justify-between items-center">
            <div
              onClick={() => {
                setOpenMobile(false);
                router.push('/');
                router.refresh();
              }}
              className="flex flex-row gap-3 items-center"
            >
              <span className="text-lg font-semibold px-2 hover:bg-muted rounded-md cursor-pointer">
                <span aria-hidden="true">👎</span> DeInfluenceMe
              </span>
            </div>
            <BetterTooltip content="New conversation" align="start">
              <Button
                variant="ghost"
                className="p-2 h-fit"
                onClick={openNewConversation}
              >
                <PlusIcon />
              </Button>
            </BetterTooltip>
          </div>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarHistory user={user ?? undefined} />
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-0">
        {isAdmin && (
          <Link
            href="/admin"
            onClick={() => setOpenMobile(false)}
            className="flex items-center gap-2 rounded-md px-4 py-3 text-sm hover:bg-muted"
          >
            <ShieldCheck size={16} />
            Admin view
          </Link>
        )}
        {user && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarUserNav user={user} />
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
