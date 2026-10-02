import { BackendTestChat } from '@/components/custom/backend-test-chat';
import { createClient } from '@/lib/supabase/server';

type ChatPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ChatPage({ params }: ChatPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <BackendTestChat initialConversationId={id} viewerId={user?.id} />;
}
