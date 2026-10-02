const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

async function createDatabase() {
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create schema extensions;
    create role anon;
    create role authenticated;
    create role service_role;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql as 'select null::uuid';
  `);
  for (const name of fs.readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort()) {
    const sql = fs.readFileSync(`supabase/migrations/${name}`, 'utf8')
      .replace('create extension if not exists pgcrypto with schema extensions;', '');
    await db.exec(sql);
  }
  return db;
}

test('one conversation turn at a time, with abandoned turns reconciled', async () => {
  const db = await createDatabase();
  try {
    const user = randomUUID();
    const chat = randomUUID();
    const oldChat = randomUUID();
    await db.query('insert into auth.users(id) values ($1)', [user]);
    await db.query('insert into conversations(id,user_id) values ($1,$3),($2,$3)', [chat, oldChat, user]);
    const begin = async (requestId, conversationId = chat) =>
      (await db.query(
        "select public.begin_advisor_turn($1,$2,$3,'hello',20,50000,100) as result",
        [user, conversationId, requestId]
      )).rows[0].result;
    const messages = async () => Number((await db.query(
      'select coalesce(sum(messages_today),0) as count from usage_counters where user_id=$1', [user]
    )).rows[0].count);

    const first = randomUUID();
    const second = randomUUID();
    assert.equal((await begin(first)).allowed, true);
    const busy = await begin(second);
    assert.equal(busy.allowed, false);
    assert.equal(busy.reason, 'conversation_busy');
    assert.equal(await messages(), 1);
    await db.query("select public.fail_advisor_turn($1,$2,$3,'before_provider',null)", [user,chat,first]);
    assert.equal(await messages(), 0, 'pre-provider failure refunds the message slot');
    assert.equal((await begin(second)).allowed, true);

    await db.query('select public.reserve_advisor_tokens($1,$2,$3,1200,50000)', [user,chat,second]);
    await db.query('select public.start_advisor_provider($1,$2,$3)', [user,chat,second]);
    await db.query("update advisor_turn_logs set created_at=now()-interval '11 minutes' where request_id=$1", [second]);
    const third = randomUUID();
    assert.equal((await begin(third)).allowed, true);
    const stale = (await db.query('select status,error_code from advisor_turn_logs where request_id=$1', [second])).rows[0];
    assert.deepEqual(stale, {status:'failed',error_code:'interrupted'});
    assert.equal(Number((await db.query('select sum(tokens_today) as total from usage_counters where user_id=$1', [user])).rows[0].total), 1200);
    await db.query("select public.fail_advisor_turn($1,$2,$3,'before_provider',null)", [user,chat,third]);

    const beforeTokenBlock = await messages();
    const tokenBlocked = randomUUID();
    assert.equal((await begin(tokenBlocked)).allowed, true);
    const reservation = (await db.query(
      'select public.reserve_advisor_tokens($1,$2,$3,50000,50000) as result',
      [user,chat,tokenBlocked]
    )).rows[0].result;
    assert.equal(reservation.allowed, false);
    assert.equal(await messages(), beforeTokenBlock, 'token admission failure refunds the message slot');

    const oldRequest = randomUUID();
    assert.equal((await begin(oldRequest, oldChat)).allowed, true);
    await db.query("update advisor_turn_logs set created_at=now()-interval '11 minutes' where request_id=$1", [oldRequest]);
    assert.equal((await db.query('select public.delete_advisor_conversation($1,$2) as deleted', [user,oldChat])).rows[0].deleted,true);

    const orphan = randomUUID();
    await db.query("insert into conversations(id,user_id,created_at) values ($1,$2,now()-interval '2 hours')", [orphan,user]);
    assert.equal((await db.query('select public.purge_empty_advisor_conversations($1) as removed',[user])).rows[0].removed,1);
    assert.equal((await db.query('select count(*)::int as count from conversations where id=$1',[orphan])).rows[0].count,0);
  } finally {
    await db.close();
  }
});

test('rate-limited retries do not create unbounded audit rows', async () => {
  const db = await createDatabase();
  try {
    const user = randomUUID(), chat = randomUUID();
    await db.query('insert into auth.users(id) values ($1)', [user]);
    await db.query('insert into conversations(id,user_id) values ($1,$2)', [chat,user]);
    const begin = async (requestId = randomUUID()) => (await db.query(
      "select public.begin_advisor_turn($1,$2,$3,'hello',20,50000,1) as result",
      [user,chat,requestId]
    )).rows[0].result;
    const firstRequest = randomUUID();
    assert.equal((await begin(firstRequest)).allowed,true);
    await db.query("select public.fail_advisor_turn($1,$2,$3,'before_provider',null)",[user,chat,firstRequest]);
    for (let attempt=0; attempt<5; attempt++) {
      const result=await begin();
      assert.equal(result.reason,'rate_limit');
    }
    const logs=(await db.query('select count(*)::int as count from advisor_turn_logs where user_id=$1',[user])).rows[0].count;
    assert.equal(logs,2);
  } finally {
    await db.close();
  }
});

test('daily caps keep their reason without logging every blocked retry', async () => {
  const db = await createDatabase();
  try {
    const user = randomUUID(), chat = randomUUID();
    await db.query('insert into auth.users(id) values ($1)', [user]);
    await db.query('insert into conversations(id,user_id) values ($1,$2)', [chat,user]);
    await db.query(
      "insert into usage_counters(user_id,usage_day,messages_today) values ($1,(now() at time zone 'Asia/Manila')::date,1)",
      [user]
    );
    for (let attempt=0; attempt<5; attempt++) {
      const result=(await db.query(
        "select public.begin_advisor_turn($1,$2,$3,'hello',1,50000,1) as result",
        [user,chat,randomUUID()]
      )).rows[0].result;
      assert.equal(result.reason,'message_cap');
    }
    const logs=(await db.query(
      'select count(*)::int as count from advisor_turn_logs where user_id=$1',[user]
    )).rows[0].count;
    assert.equal(logs,1);
  } finally {
    await db.close();
  }
});

test('an older Google Docs refresh cannot overwrite a newer one', async () => {
  const db=await createDatabase();
  try {
    const write=async(text,startedAt)=> (await db.query(
      'select * from public.write_advisor_document_cache($1,$2,$3)',
      [text,`${text} reference`,startedAt]
    )).rows[0];
    await write('old','2026-10-02T00:00:00Z');
    await write('new','2026-10-02T00:02:00Z');
    const result=await write('late old','2026-10-02T00:01:00Z');
    assert.equal(result.prompt_text,'new');
    assert.equal(result.reference_text,'new reference');
  } finally {
    await db.close();
  }
});
