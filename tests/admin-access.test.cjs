// Run: node --test tests/admin-access.test.cjs
// Supabase is replaced at its boundary; no live accounts or data are changed.
require('tsx/cjs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
let signedIn = false;
let profile = null;
let calls = [];
let messages = [];
let conversation = { id: '11111111-1111-4111-8111-111111111111', title: 'Test' };
function table(name) {
  calls.push(name);
  const chain = { select() { return chain; }, eq() { return chain; }, order() { return chain; },
    single: async () => ({ data: profile, error: null }),
    maybeSingle: async () => ({ data: conversation, error: null }),
    range: async (start, end) => ({ data: messages.slice(start, end + 1), error: null }) };
  return chain;
}
const original = Module._load;
Module._load = function(request, parent, main) {
  if (request === 'server-only') return {};
  if (request === '@/lib/supabase/server') return { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: signedIn ? { id: 'test-user' } : null }, error: null }) } }) };
  if (request === '@/lib/supabase/admin') return { createAdminClient: () => ({ from: table }) };
  return original.call(this, request, parent, main);
};
const { requireAdmin } = require('../lib/server/auth.ts');
const settings = require('../app/api/admin/settings/route.ts');
const history = require('../app/api/admin/conversations/[id]/route.ts');
const usage = require('../app/api/admin/usage/route.ts');
const events = require('../app/api/admin/events/route.ts');
const docs = require('../app/api/admin/docs-status/route.ts');
const context = { params: Promise.resolve({ id: conversation.id }) };

test('all admin APIs reject signed-out, ordinary, missing-profile and blocked-admin accounts before data reads', async () => {
  for (const state of [
    { signedIn: false, profile: null, status: 401 },
    { signedIn: true, profile: { role: 'user', is_allowed: true }, status: 403 },
    { signedIn: true, profile: { role: 'admin', is_allowed: false }, status: 403 },
    { signedIn: true, profile: null, status: 403 },
  ]) {
    signedIn = state.signedIn; profile = state.profile;
    for (const route of [settings, history, usage, docs, events]) {
      calls = [];
      const response = await route.GET(new Request('http://localhost/api/admin/test'), context);
      assert.equal(response.status, state.status);
      assert.ok(calls.every(name => name === 'profiles'));
      assert.deepEqual(Object.keys(await response.json()), ['error']);
    }
  }
});
test('eligible admin is accepted and settings only expose the explicit safe fields', async () => {
  signedIn = true; profile = { role: 'admin', is_allowed: true };
  assert.equal((await requireAdmin()).profile.role, 'admin');
  process.env.SUPABASE_SECRET_KEY = 'secret-canary-never-return';
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 = 'private-canary-never-return';
  process.env.GOOGLE_PROMPT_DOC_ID = 'safe_doc_id';
  process.env.GOOGLE_REFERENCE_DOC_ID = 'another_safe_doc';
  const response = await settings.GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ['cacheTtlSeconds','limits','model','promptUrl','referenceUrl'].sort());
  assert.ok(!JSON.stringify(body).includes('canary'));
  assert.equal(body.limits.dailyMessageLimit, 20);
});
test('admin conversation history returns complete ordered pages, validates IDs and offsets, and handles missing conversations', async () => {
  signedIn = true; profile = { role: 'admin', is_allowed: true };
  messages = Array.from({ length: 105 }, (_, i) => ({ id: `${i}`, sequence: i + 1, role: 'user', content: `Message ${i}`, created_at: '2026-09-15T00:00:00Z' }));
  const first = await history.GET(new Request('http://localhost/api/admin/test'), context);
  const page1 = await first.json();
  assert.equal(page1.messages.length, 100); assert.equal(page1.nextOffset, 100);
  const second = await history.GET(new Request('http://localhost/api/admin/test?offset=100'), context);
  const page2 = await second.json();
  assert.equal(page2.messages.length, 5); assert.equal(page2.nextOffset, null);
  assert.equal(page2.messages[0].sequence, 101);
  assert.equal((await history.GET(new Request('http://localhost/?offset=-1'), context)).status, 400);
  assert.equal((await history.GET(new Request('http://localhost/'), { params: Promise.resolve({ id: 'invalid' }) })).status, 400);
  conversation = null;
  assert.equal((await history.GET(new Request('http://localhost/'), context)).status, 404);
});
