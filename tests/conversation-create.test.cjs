require('tsx/cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const userId = '11111111-1111-4111-8111-111111111111';
const conversationId = '22222222-2222-4222-8222-222222222222';
const records = new Map();
const originalLoad = Module._load;
Module._load = function(request, parent, main) {
  if (request === 'server-only') return {};
  if (request === '@/lib/server/auth') return { requireAllowedUser: async () => ({ user: { id: userId } }) };
  if (request === '@/lib/supabase/admin') return {
    createAdminClient: () => ({
      from: (table) => {
        assert.equal(table, 'conversations');
        const filters = [];
        const query = {
          select() { return query; },
          eq(field, value) { filters.push([field, value]); return query; },
          async maybeSingle() {
            const row = [...records.values()].find((record) => filters.every(([field,value]) => record[field] === value));
            return { data: row ?? null, error: null };
          },
          insert(value) {
            return {
              select() {
                return {
                  async single() {
                    if (records.has(value.id)) return { data: null, error: { code: '23505' } };
                    const row = { ...value, created_at: '2026-10-02T00:00:00Z', updated_at: '2026-10-02T00:00:00Z' };
                    records.set(value.id, row);
                    return { data: row, error: null };
                  },
                };
              },
            };
          },
        };
        return query;
      },
    }),
  };
  return originalLoad.call(this, request, parent, main);
};

const { POST } = require('../app/api/conversations/route.ts');
const create = (id, title) => POST(new Request('http://localhost/api/conversations', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ id, title }),
}));

test('repeating first-chat creation reuses the same owned conversation', async () => {
  records.clear();
  const first = await create(conversationId, 'Should I buy this 😀');
  assert.equal(first.status, 201);
  const repeated = await create(conversationId, 'Should I buy this 😀');
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).reused, true);
  assert.equal(records.size, 1);
});

test('a reused ID with changed content or another owner is rejected', async () => {
  assert.equal((await create(conversationId, 'Different title')).status, 409);
  records.set(conversationId, { ...records.get(conversationId), user_id: '33333333-3333-4333-8333-333333333333' });
  assert.equal((await create(conversationId, 'Should I buy this 😀')).status, 409);
});
