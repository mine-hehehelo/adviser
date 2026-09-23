require('tsx/cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const userId = '11111111-1111-4111-8111-111111111111';
const conversationId = '22222222-2222-4222-8222-222222222222';
let authenticated = true;
let rpcResult = { data: true, error: null };
let rpcCalls = [];

const originalLoad = Module._load;
Module._load = function (request, parent, main) {
  if (request === 'server-only') return {};
  if (request === '@/lib/server/auth') {
    return {
      requireAllowedUser: async () => {
        if (!authenticated) {
          const { HttpError } = require('../lib/server/errors.ts');
          throw new HttpError(401, 'You must sign in');
        }
        return { user: { id: userId } };
      },
    };
  }
  if (request === '@/lib/supabase/admin') {
    return {
      createAdminClient: () => ({
        rpc: async (name, args) => {
          rpcCalls.push({ name, args });
          return rpcResult;
        },
      }),
    };
  }
  return originalLoad.call(this, request, parent, main);
};

const { DELETE } = require('../app/api/conversations/[id]/route.ts');
const context = id => ({ params: Promise.resolve({ id }) });
const request = new Request('http://localhost/api/conversations/test', { method: 'DELETE' });

test('delete requires a signed-in user and a valid conversation ID', async () => {
  rpcCalls = [];
  authenticated = false;
  assert.equal((await DELETE(request, context(conversationId))).status, 401);
  authenticated = true;
  assert.equal((await DELETE(request, context('invalid'))).status, 400);
  assert.equal(rpcCalls.length, 0);
});

test('delete uses the authenticated user and returns 404 for unowned chats', async () => {
  rpcCalls = [];
  rpcResult = { data: false, error: null };
  assert.equal((await DELETE(request, context(conversationId))).status, 404);
  assert.deepEqual(rpcCalls[0], {
    name: 'delete_advisor_conversation',
    args: { p_user_id: userId, p_conversation_id: conversationId },
  });
  rpcResult = { data: true, error: null };
  const response = await DELETE(request, context(conversationId));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: true });
});

test('delete waits for a processing turn', async () => {
  rpcResult = { data: null, error: { message: 'conversation_has_processing_turn' } };
  const response = await DELETE(request, context(conversationId));
  assert.equal(response.status, 409);
});
