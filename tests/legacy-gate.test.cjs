// The retired template APIs must not bypass advisor usage controls.
require('tsx/cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const { middleware } = require('../middleware.ts');

test('retired template API paths reject requests before their old handlers run', async () => {
  for (const path of [
    '/api/chat', '/api/document', '/api/files/upload',
    '/api/history', '/api/suggestions', '/api/vote',
  ]) {
    const response = await middleware(new NextRequest(`http://localhost${path}`));
    assert.equal(response.status, 410, path);
  }
});
