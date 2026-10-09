import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../config/database';
import { retrieveKnowledge } from '../services/retrieval';

/**
 * Integration tests against the local database (keyword path — no embedding key
 * required). They assert the single most important property of the system:
 * brand-scoped retrieval never crosses the tenant boundary.
 */

let acmeId = '';
let freshId = '';

before(async () => {
  const { rows } = await pool.query('SELECT id, name FROM brands');
  acmeId = rows.find((r) => r.name === 'Acme Drinks')?.id;
  freshId = rows.find((r) => r.name === 'FreshBottle')?.id;
  assert.ok(acmeId && freshId, 'seed brands must exist — run seed.sql');
});

after(async () => {
  await pool.end();
});

test('retrieves the correct brand-specific shipping policy for Acme', async () => {
  const res = await retrieveKnowledge(acmeId, 'How long does shipping take?');
  assert.ok(res.relevant.length > 0, 'should find a relevant policy');
  const combined = res.relevant.map((e) => e.content).join(' ');
  assert.match(combined, /3 to 5/, 'Acme ships in 3 to 5 business days');
  assert.doesNotMatch(combined, /2 to 4/, 'must NOT contain FreshBottle timing');
});

test('retrieves the different shipping policy for FreshBottle', async () => {
  const res = await retrieveKnowledge(freshId, 'How long does shipping take?');
  const combined = res.relevant.map((e) => e.content).join(' ');
  assert.match(combined, /2 to 4/, 'FreshBottle ships in 2 to 4 business days');
  assert.doesNotMatch(combined, /3 to 5/, 'must NOT contain Acme timing');
});

test('brand isolation: no Acme row is ever returned for a FreshBottle query', async () => {
  const res = await retrieveKnowledge(freshId, 'refund return cancel shipping policy');
  for (const entry of res.entries) {
    const { rows } = await pool.query('SELECT brand_id FROM kb_entries WHERE id = $1', [entry.id]);
    assert.equal(rows[0].brand_id, freshId, 'every retrieved row must belong to FreshBottle');
  }
});

test('no-knowledge fallback: an unrelated question returns method "none"', async () => {
  const res = await retrieveKnowledge(acmeId, 'zxqwerty nonsense unmatched term');
  assert.equal(res.method, 'none');
  assert.equal(res.relevant.length, 0);
});

// ---------------------------------------------------------------------------
// Reply lifecycle: generate -> send -> idempotent re-send
// ---------------------------------------------------------------------------
import { runGenerate, sendReply } from '../modules/ai/ai.service';

test('generate → send → idempotent re-send does not duplicate the message', async () => {
  // Create an isolated conversation so we never pollute seed data.
  const cust = await pool.query(
    `INSERT INTO customers (name, email) VALUES ('Test User', 'test+${Date.now()}@example.com') RETURNING id`
  );
  const conv = await pool.query(
    `INSERT INTO conversations (brand_id, customer_id, order_id)
     VALUES ($1, $2, $3) RETURNING id`,
    [acmeId, cust.rows[0].id, `ORD-TEST-${Date.now()}`]
  );
  const convId = conv.rows[0].id;
  await pool.query(
    `INSERT INTO messages (conversation_id, sender_type, content)
     VALUES ($1, 'CUSTOMER', 'How long does shipping take?')`,
    [convId]
  );

  try {
    const gen = await runGenerate(convId);
    assert.ok(gen.logId, 'generation should produce a log id');
    assert.equal(gen.retrieval.method, 'keyword');
    assert.equal(gen.confidence, 'answered');

    const first = await sendReply(gen.logId, 'Shipping takes 3 to 5 business days.');
    assert.equal(first.alreadySent, false);

    const second = await sendReply(gen.logId, 'Shipping takes 3 to 5 business days.');
    assert.equal(second.alreadySent, true, 'second send must be idempotent');

    const msgs = await pool.query(
      `SELECT count(*)::int AS c FROM messages WHERE conversation_id = $1 AND sender_type = 'AGENT'`,
      [convId]
    );
    assert.equal(msgs.rows[0].c, 1, 'exactly one AGENT message should exist');

    const log = await pool.query(`SELECT status FROM ai_reply_logs WHERE id = $1`, [gen.logId]);
    assert.equal(log.rows[0].status, 'SENT');
  } finally {
    await pool.query('DELETE FROM conversations WHERE id = $1', [convId]); // cascades
    await pool.query('DELETE FROM customers WHERE id = $1', [cust.rows[0].id]);
  }
});
