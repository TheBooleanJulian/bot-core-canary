// node --test   (Node 22+). The bot-core modules are tested in bot-core itself; this checks the canary's gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import worker, { selfCheck } from '../worker.js';

test('every bot-core self-check passes', () => {
  const checks = selfCheck();
  assert.ok(Object.values(checks).every((v) => v === 'ok'), JSON.stringify(checks));
});

test('/healthz reports pass and the bot-core sha', async () => {
  const res = await worker.fetch(new Request('https://x/healthz'), { BOT_CORE_SHA: 'abc1234' }, {});
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'pass');
  assert.equal(body.bot_core.sha, 'abc1234');
});

test('/ serves the branded status page', async () => {
  const res = await worker.fetch(new Request('https://x/'), {}, {});
  const html = await res.text();
  assert.match(html, /bot-core canary/);
  assert.match(html, /--cyan/);
});

test('/webhook refuses without a token or with a wrong secret', async () => {
  assert.equal((await worker.fetch(new Request('https://x/webhook', { method: 'POST', body: '{}' }), {}, {})).status, 503);
  const env = { BOT_TOKEN: '1:x', WEBHOOK_SECRET: 'right' };
  const req = new Request('https://x/webhook', { method: 'POST', body: '{}', headers: { 'X-Telegram-Bot-Api-Secret-Token': 'wrong' } });
  assert.equal((await worker.fetch(req, env, {})).status, 403);
});
