import { BackendTestChat } from '@/components/custom/backend-test-chat';

type ChatPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ChatPage({ params }: ChatPageProps) {
  const { id } = await params;

  return <BackendTestChat initialConversationId={id} />;
}
