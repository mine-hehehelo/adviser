import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AdminConsole } from '@/components/admin/admin-console';
import { requireAdmin } from '@/lib/server/auth';
import { HttpError } from '@/lib/server/errors';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin | DeInfluenceMe' };

export default async function AdminPage() {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) redirect('/login');
    if (!(error instanceof HttpError) || error.status !== 403) throw error;
    return (
      <main className="mx-auto max-w-lg px-6 py-24">
        <p className="text-sm text-muted-foreground">ADVISOR CONSOLE</p>
        <h1 className="mt-4 text-3xl font-semibold">
          Administrator access required
        </h1>
        <p className="my-5 text-muted-foreground">
          Your account cannot open this workspace. Ask your project
          administrator to check your access.
        </p>
        <Link className="underline" href="/">
          Return to chat
        </Link>
      </main>
    );
  }
  return <AdminConsole />;
}
