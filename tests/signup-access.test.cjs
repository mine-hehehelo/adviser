// Exercise the actual SQL migrations and auth trigger in an isolated database.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { test } = require('node:test');

test('new signups get user access while existing blocks, roles and browser restrictions survive', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema auth; create schema extensions;
      create role anon; create role authenticated; create role service_role;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql as 'select null::uuid';
    `);
    const migration = '20260922160000_enable_chat_for_new_users.sql';
    const files = fs.readdirSync('supabase/migrations').filter(x => x.endsWith('.sql')).sort();
    const apply = name => db.exec(fs.readFileSync(`supabase/migrations/${name}`, 'utf8')
      .replace('create extension if not exists pgcrypto with schema extensions;', ''));
    for (const name of files.filter(x => x < migration)) await apply(name);

    const blocked = '11111111-1111-4111-8111-111111111111';
    const admin = '22222222-2222-4222-8222-222222222222';
    const newcomer = '33333333-3333-4333-8333-333333333333';
    await db.query('insert into auth.users(id) values ($1), ($2)', [blocked, admin]);
    await db.query("update public.profiles set role='admin', is_allowed=true where id=$1", [admin]);
    for (const name of files.filter(x => x >= migration)) await apply(name);
    // The migration is safe to apply again and never unlocks existing accounts.
    await apply(migration);
    await db.query(`insert into auth.users(id, email, raw_user_meta_data)
      values ($1, 'signup@example.invalid', '{"full_name":"New user","role":"admin","is_allowed":false}')`, [newcomer]);
    const profile = async id => (await db.query('select role,is_allowed from public.profiles where id=$1', [id])).rows[0];
    assert.deepEqual(await profile(newcomer), { role: 'user', is_allowed: true });
    assert.deepEqual(await profile(blocked), { role: 'user', is_allowed: false });
    assert.deepEqual(await profile(admin), { role: 'admin', is_allowed: true });

    // Signing in or changing user-editable metadata must not restore a block
    // or promote an ordinary user into an administrator.
    await db.query('update public.profiles set is_allowed=false where id=$1', [newcomer]);
    await db.exec(`update auth.users set raw_user_meta_data='{"role":"admin","is_allowed":true}'`);
    assert.deepEqual(await profile(newcomer), { role: 'user', is_allowed: false });
    assert.deepEqual(await profile(blocked), { role: 'user', is_allowed: false });
    assert.deepEqual(await profile(admin), { role: 'admin', is_allowed: true });
    for (const role of ['anon', 'authenticated']) {
      for (const privilege of ['INSERT', 'UPDATE', 'DELETE']) {
        const result = await db.query("select has_table_privilege($1, 'public.profiles', $2) as allowed", [role, privilege]);
        assert.equal(result.rows[0].allowed, false);
      }
    }
  } finally {
    await db.close();
  }
});
