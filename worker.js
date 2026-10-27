// bot-core-canary on Cloudflare Workers: the pre-flight check for the shared JS bot skeleton (lib/).
// Same job as main.py had for the Python bot-core: if the skeleton is broken, this fails first,
// loudly, before any real bot picks the change up.
//
//   GET  /healthz  self-check of every lib module (200 pass, 500 fail)
//   POST /webhook  Telegram updates (only when BOT_TOKEN + WEBHOOK_SECRET are set); /start is owner-only
//   cron           re-runs the self-check and logs a heartbeat

import { log, redact } from './lib/log.js';
import { verifyWebhook, reply } from './lib/telegram.js';
import { createRouter, parseCommand } from './lib/router.js';
import { isAdmin, adminOnly } from './lib/admin.js';

const BOT_NAME = 'bot-core canary';

export function selfCheck() {
  const checks = {};
  const run = (name, fn) => {
    try {
      checks[name] = fn() ? 'ok' : 'FAIL: returned false';
    } catch (err) {
      checks[name] = `FAIL: ${err.message}`;
    }
  };
  run('log', () => redact('bot123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij leaked') === 'bot<bot-token> leaked');
  run('router', () => parseCommand('/start@CanaryBot hi', 'canarybot')?.name === 'start' && parseCommand('/start@OtherBot', 'canarybot') === null);
  run('admin', () => isAdmin({ OWNER_TELEGRAM_ID: '1, 2' }, 2) && !isAdmin({ OWNER_TELEGRAM_ID: '1' }, 3));
  return checks;
}

const route = createRouter({
  commands: {
    start: adminOnly((ctx) => reply(ctx.env, ctx.message, '✅ <b>canary alive</b> on Cloudflare Workers'))
  }
});

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { 'Content-Type': 'application/json' } });
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    if (pathname === '/healthz' || pathname === '/') {
      const checks = selfCheck();
      const ok = Object.values(checks).every((v) => v === 'ok');
      return json({ bot: BOT_NAME, status: ok ? 'pass' : 'fail', checks, webhook: Boolean(env.BOT_TOKEN && env.WEBHOOK_SECRET) }, ok ? 200 : 500);
    }

    if (pathname === '/webhook' && request.method === 'POST') {
      if (!env.BOT_TOKEN) return new Response('bot not configured', { status: 503 });
      if (!verifyWebhook(request, env)) return new Response('forbidden', { status: 403 });
      const update = await request.json().catch(() => null);
      if (!update) return new Response('bad request', { status: 400 });
      // Acknowledge at once; Telegram retries slow webhooks. The handler finishes in the background.
      ctx.waitUntil(route(update, env, ctx.waitUntil.bind(ctx)));
      return new Response('ok');
    }

    return new Response('not found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    const checks = selfCheck();
    const failed = Object.entries(checks).filter(([, v]) => v !== 'ok');
    if (failed.length) log.error('self-check failed', { cron: event.cron, checks });
    else log.info('heartbeat', { cron: event.cron, checks });
  }
};
