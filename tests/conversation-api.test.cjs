// Isolated route tests: every database and identity call is replaced in memory.
require('tsx/cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const userId = '11111111-1111-4111-8111-111111111111';
const conversationId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
let conversation = { id: conversationId, title: 'Test', user_id: userId };
let conversationError = null;
let messages = [];
let turn = null;
let rangeCalls = [];
let beginResult = null;

function matchingRows(table, filters) {
  const source = table === 'conversations'
    ? (conversation ? [conversation] : [])
    : table === 'messages'
      ? messages
      : turn ? [turn] : [];
  return source.filter(row => filters.every(([field, value]) => row[field] === value));
}

function from(table) {
  const filters = [];
  const query = {
    select() { return query; },
    eq(field, value) { filters.push([field, value]); return query; },
    order() { return query; },
    range(start, end) {
      rangeCalls.push([start, end]);
      return Promise.resolve({ data: matchingRows(table, filters).slice(start, end + 1), error: null });
    },
    maybeSingle() {
      return Promise.resolve({
        data: matchingRows(table, filters)[0] ?? null,
        error: table === 'conversations' ? conversationError : null,
      });
    },
    single() {
      return Promise.resolve({ data: matchingRows(table, filters)[0] ?? null, error: null });
    },
    then(resolve, reject) {
      return Promise.resolve({ data: matchingRows(table, filters), error: null }).then(resolve, reject);
    },
  };
  return query;
}

const originalLoad = Module._load;
Module._load = function(request, parent, main) {
  if (request === 'server-only') return {};
  if (request === '@/lib/server/auth') return { requireAllowedUser: async () => ({ user: { id: userId } }) };
  if (request === '@/lib/supabase/admin') return {
    createAdminClient: () => ({
      from,
      rpc: async () => ({ data: beginResult, error: null }),
    }),
  };
  return originalLoad.call(this, request, parent, main);
};

const route = require('../app/api/conversations/[id]/messages/route.ts');
const conversations = require('../app/api/conversations/route.ts');
const context = id => ({ params: Promise.resolve({ id }) });
const messageRequest = (text, id = requestId) => new Request('http://localhost/api/conversations/test/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ requestId: id, text }),
});

test('invalid IDs and malformed creation JSON are rejected before database work', async () => {
  assert.equal((await route.GET(new Request('http://localhost/'), context('invalid'))).status, 400);
  assert.equal((await route.POST(messageRequest('Hello'), context('invalid'))).status, 400);
  const create = new Request('http://localhost/api/conversations', { method: 'POST', body: '{' });
  assert.equal((await conversations.POST(create)).status, 400);
});

test('conversation lookup failures remain server errors, while missing ownership is 404', async () => {
  conversationError = { message: 'isolated database failure' };
  assert.equal((await route.GET(new Request('http://localhost/'), context(conversationId))).status, 500);
  conversationError = null;
  conversation = null;
  assert.equal((await route.GET(new Request('http://localhost/'), context(conversationId))).status, 404);
  conversation = { id: conversationId, title: 'Test', user_id: userId };
});

test('long conversation history is loaded across database pages in sequence', async () => {
  messages = Array.from({ length: 1205 }, (_, index) => ({
    id: String(index), conversation_id: conversationId, request_id: requestId, sequence: index + 1,
    role: index % 2 ? 'assistant' : 'user', content: `Message ${index + 1}`,
    status: 'completed', created_at: '2026-09-23T00:00:00Z',
  }));
  rangeCalls = [];
  const response = await route.GET(new Request('http://localhost/'), context(conversationId));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.messages.length, 1205);
  assert.equal(body.messages[0].sequence, 1);
  assert.equal(body.messages.at(-1).sequence, 1205);
  assert.deepEqual(rangeCalls, [[0, 499], [500, 999], [1000, 1499]]);
});

test('reused request IDs cannot return a reply for different text', async () => {
  messages = [
    { id: 'user-message', conversation_id: conversationId, request_id: requestId, role: 'user', content: 'Original' },
    { id: 'reply-message', conversation_id: conversationId, request_id: requestId, role: 'assistant', content: 'Saved reply' },
  ];
  const conflict = await route.POST(messageRequest('Different'), context(conversationId));
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).code, 'request_id_conflict');
  const retry = await route.POST(messageRequest('Original'), context(conversationId));
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).reply, 'Saved reply');
});

test('an in-flight request ID is also bound to its original text', async () => {
  messages = [];
  turn = { user_id: userId, conversation_id: conversationId, request_id: requestId, user_input: 'Original' };
  beginResult = {
    allowed: false, duplicate: true, status: 'processing',
    turn_log_id: '44444444-4444-4444-8444-444444444444',
  };
  const conflict = await route.POST(messageRequest('Different'), context(conversationId));
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).code, 'request_id_conflict');
});
