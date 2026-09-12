export async function GET() {
  return Response.json({
    ok: true,
    service: 'advisor-console',
    time: new Date().toISOString(),
  });
}