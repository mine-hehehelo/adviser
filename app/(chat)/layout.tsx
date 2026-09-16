import { cookies } from 'next/headers';

import { AppSidebar } from '@/components/custom/app-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const isCollapsed = cookieStore.get('sidebar:state')?.value !== 'true';

  // Verify this request's session; a shared cache must not decide whose admin link is shown.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Use the protected profile, not editable user metadata, for navigation visibility.
  const profile = user
    ? await createAdminClient()
        .from('profiles')
        .select('role, is_allowed')
        .eq('id', user.id)
        .maybeSingle()
    : null;
  const isAdmin =
    profile?.data?.role === 'admin' && profile?.data?.is_allowed === true;

  return (
    <SidebarProvider defaultOpen={!isCollapsed}>
      <AppSidebar user={user} isAdmin={isAdmin} />
      <SidebarInset className="min-w-0">{children}</SidebarInset>
    </SidebarProvider>
  );
}
