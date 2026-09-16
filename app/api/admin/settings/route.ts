import { requireAdmin } from '@/lib/server/auth';
import { errorResponse } from '@/lib/server/errors';
import { getUsageLimits } from '@/lib/server/usage-limits';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdmin();
    const docUrl = (id: string | undefined) =>
      id && /^[\w-]+$/.test(id.trim())
        ? `https://docs.google.com/document/d/${id.trim()}/edit`
        : null;
    const ttl = Number(process.env.GOOGLE_DOC_CACHE_TTL_SECONDS ?? 300);
    if (!Number.isFinite(ttl) || ttl <= 0)
      throw new Error('Invalid document cache TTL');
    // Explicit allow-list: never serialize process.env or private document content.
    return Response.json(
      {
        limits: getUsageLimits(),
        model: process.env.OPENROUTER_MODEL?.trim() || null,
        cacheTtlSeconds: ttl,
        promptUrl: docUrl(process.env.GOOGLE_PROMPT_DOC_ID),
        referenceUrl: docUrl(process.env.GOOGLE_REFERENCE_DOC_ID),
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
