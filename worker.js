// bot-core-canary on Cloudflare Workers: the gate for thebooleanjulian-bot-core's JS edition.
// propagate-workers.yml deploys this first, built against the exact bot-core commit, and only fans out
// to the real bots once /healthz reports that commit with every self-check passing.
//
//   GET  /healthz  self-check of every bot-core module + the bot-core sha (200 pass, 500 fail)
//   GET  /         branded status page (bot-core's statusPage on the Unified UI tokens)
//   POST /webhook  Telegram updates (only when BOT_TOKEN + WEBHOOK_SECRET are set); /start is owner-only
//   cron           re-runs the self-check and logs a heartbeat

import {
  log, redact, verifyWebhook, reply, createRouter, parseCommand, isAdmin, adminOnly, errorBoundary,
  fmtSuccess, fmtStatusMessage, confirmKeyboard, paginatedKeyboard, fmtDatetime, healthz, statusPage,
  renderStatusPage, BRAND_CSS, BOT_CORE_VERSION
} from 'thebooleanjulian-bot-core';

export function selfCheck() {
  const checks = {};
  const run = (name, fn) => {
    try {
      checks[name] = fn() ? 'ok' : 'FAIL: returned false';
    } catch (err) {
      checks[name] = `FAIL: ${err.message}`;
    }
  };
  run('log', () => redact('https://api.telegram.org/bot123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij/getMe').includes('bot<bot-token>/getMe'));
  run('router', () => parseCommand('/start@CanaryBot hi', 'canarybot')?.name === 'start' && parseCommand('/start@OtherBot', 'canarybot') === null);
  run('admin', () => isAdmin({ OWNER_TELEGRAM_ID: '1, 2' }, 2) && !isAdmin({ OWNER_TELEGRAM_ID: '1' }, 3));
  run('branding', () => fmtSuccess('ok') === '✅ <b>ok</b>' && fmtStatusMessage('c', 'online', {}).includes('ONLINE'));
  run('ui', () => confirmKeyboard().inline_keyboard[0].length === 2 && paginatedKeyboard([['a', 'a']]).inline_keyboard.length === 1);
  run('time', () => fmtDatetime(new Date('2026-10-27T02:30:00Z')) === '27 Oct 2026, 10:30 SGT');
  run('brand', () => BRAND_CSS.includes('--cyan') && renderStatusPage({ name: 'x' }).includes('--magenta'));
  run('version', () => /^\d+\.\d+\.\d+$/.test(BOT_CORE_VERSION));
  return checks;
}

const route = createRouter({
  commands: {
    start: adminOnly(errorBoundary((ctx) => reply(ctx.env, ctx.message, fmtSuccess('canary alive', 'on Cloudflare Workers'))))
  }
});

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    if (pathname === '/healthz') {
      return healthz(env, { checks: selfCheck(), extra: { webhook: Boolean(env.BOT_TOKEN && env.WEBHOOK_SECRET) } });
    }
    if (pathname === '/') {
      const checks = selfCheck();
      return statusPage(env, {
        name: 'bot-core canary',
        icon: '🐤',
        description: 'Deploys first whenever bot-core changes. If this is unhealthy, the fleet-wide update is blocked.',
        ok: Object.values(checks).every((v) => v === 'ok'),
        metrics: { 'bot-core': BOT_CORE_VERSION, 'Self-checks': `${Object.values(checks).filter((v) => v === 'ok').length}/${Object.keys(checks).length}` }
      });
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

  async scheduled(event, env) {
    const checks = selfCheck();
    const failed = Object.entries(checks).filter(([, v]) => v !== 'ok');
    if (failed.length) log.error('self-check failed', { cron: event.cron, checks });
    else log.info('heartbeat', { cron: event.cron, bot_core: BOT_CORE_VERSION });
  }
};
