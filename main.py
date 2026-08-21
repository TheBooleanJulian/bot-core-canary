"""
bot-core-canary
================
Throwaway service with exactly one job: import the current bot-core
`main` branch, boot, and stay healthy. No real users, no real data,
nothing to break. This is the first thing that redeploys whenever
bot-core changes — the auto-redeploy pipeline waits for this to come
up healthy before touching any real bot or webapp.

If this bot is down, the fleet-wide redeploy is blocked. That's the
point: it fails here, loudly, instead of on clawsune/openclaw/etc.

Not conversational — no real BOT_TOKEN required to exercise the parts
that matter (imports + status server). If BOT_TOKEN is set, it also
runs a trivial /start-only polling bot as a deeper smoke test of the
python-telegram-bot integration surface.
"""

import os

from thebooleanjulian_bot_core.logging_setup import setup_logging
from thebooleanjulian_bot_core.admin import admin_only, is_admin
from thebooleanjulian_bot_core.error_handling import make_error_handler, error_boundary
from thebooleanjulian_bot_core.ratelimit import rate_limit
from thebooleanjulian_bot_core.health import StatusServer
from thebooleanjulian_bot_core.branding import fmt_success
from thebooleanjulian_bot_core.utils import mark_start, fmt_uptime

setup_logging(buffer=True)
logger = __import__("logging").getLogger(__name__)

OWNER_ID = int(os.environ.get("OWNER_TELEGRAM_ID", "0"))
BOT_TOKEN = os.environ.get("BOT_TOKEN")


def _self_check() -> dict:
    """Exercise the non-network parts of every bot-core module at import/call time.
    Any exception here means bot-core is broken in a way that would break real bots too."""
    checks = {}
    try:
        assert is_admin(1, [1, 2])
        checks["admin"] = "ok"
    except Exception as e:
        checks["admin"] = f"FAIL: {e}"

    try:
        assert fmt_success("ok")
        checks["branding"] = "ok"
    except Exception as e:
        checks["branding"] = f"FAIL: {e}"

    try:
        make_error_handler(exit_on_conflict=True)
        checks["error_handling"] = "ok"
    except Exception as e:
        checks["error_handling"] = f"FAIL: {e}"

    return checks


def main():
    mark_start()
    results = _self_check()
    failed = [k for k, v in results.items() if v != "ok"]
    if failed:
        logger.critical("bot-core self-check FAILED: %s", results)
        # Non-zero exit -> Zeabur reports the deploy unhealthy -> pipeline blocks the cascade
        raise SystemExit(1)
    logger.info("bot-core self-check passed: %s", results)

    server = StatusServer(
        bot_name="bot-core canary",
        bot_username="@botcorecanarybot",
        bot_description="Throwaway service that redeploys first when bot-core changes. If this is unhealthy, the fleet-wide update is blocked.",
        commands=[],
        get_metrics=lambda: {"Self-check": "pass", "Uptime": fmt_uptime()},
        icon_emoji="🐤",
    )
    server.start()

    if not BOT_TOKEN:
        logger.info("No BOT_TOKEN set — status server is the only smoke test. Idling.")
        import time
        while True:
            time.sleep(3600)

    from telegram import Update
    from telegram.ext import Application, CommandHandler, ContextTypes

    @admin_only(OWNER_ID, reply=None)
    @error_boundary()
    @rate_limit(calls=5, period=10)
    async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
        await update.message.reply_text(fmt_success("canary alive", fmt_uptime()), parse_mode="HTML")

    app = Application.builder().token(BOT_TOKEN).build()
    app.add_error_handler(make_error_handler(exit_on_conflict=True))
    app.add_handler(CommandHandler("start", start))
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
