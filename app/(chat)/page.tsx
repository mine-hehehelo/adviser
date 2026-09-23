import { BackendTestChat } from '@/components/custom/backend-test-chat';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const { draft } = await searchParams;
  return <BackendTestChat key={draft ?? 'new'} />;
}
