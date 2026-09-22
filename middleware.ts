import { NextRequest, NextResponse } from 'next/server';

import { updateSession } from '@/lib/supabase/middleware';

const retiredTemplateApis = new Set([
  '/api/chat',
  '/api/document',
  '/api/files/upload',
  '/api/history',
  '/api/suggestions',
  '/api/vote',
]);

export async function middleware(request: NextRequest) {
  if (retiredTemplateApis.has(request.nextUrl.pathname)) {
    return NextResponse.json(
      { error: 'This template endpoint is no longer available' },
      { status: 410 }
    );
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
