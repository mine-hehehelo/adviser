import { loadAdvisorPrompt } from '@/lib/server/advisor-docs';
import { requireAdmin } from '@/lib/server/auth';
import { errorResponse } from '@/lib/server/errors';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdmin();

    const advisorPrompt = await loadAdvisorPrompt(
      'Test the advisor document connection'
    );

    return Response.json({
      ok: true,
      documentSource: advisorPrompt.documentSource,
      documentsFetchedAt: advisorPrompt.documentsFetchedAt,
    });
  } catch (error) {
    return errorResponse(error);
  }
}