import { BackendTestChat } from '@/components/custom/backend-test-chat';
import { createClient } from '@/lib/supabase/server';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const { draft } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <BackendTestChat key={draft ?? 'new'} draftId={draft} viewerId={user?.id} />;
}
