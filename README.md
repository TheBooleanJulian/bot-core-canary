<div align="center">

# bot-core-canary

**The first thing that redeploys when `thebooleanjulian-bot-core` changes.**

![Python](https://img.shields.io/badge/-Python-3776AB?logo=python&logoColor=white)
![Telegram](https://img.shields.io/badge/-Telegram-26A5E4?logo=telegram&logoColor=white)
![Zeabur](https://img.shields.io/badge/-Zeabur-6C5CE7)
![License](https://img.shields.io/badge/license-AGPLv3%20%2B%20Commercial-00D4C8.svg)

</div>

---

## What it does

bot-core-canary is a throwaway service with no real users and no real data. Its only job is to import the current `main` branch of `thebooleanjulian-bot-core`, run a self-check against the non-network surface of every module (`admin`, `branding`, `error_handling`), and start a status server.

It exists purely as a deploy-time gate: the fleet-wide auto-redeploy pipeline (see `thebooleanjulian-bot-core/.github/workflows/`) redeploys this service first whenever bot-core's `main` branch changes, polls its `/healthz`, and only fans out redeploys to the rest of the fleet (clawsune, openclaw, ...) if this comes up healthy. If bot-core ships a breaking change, it breaks here first — loudly, in a service nobody depends on — instead of silently breaking a real bot on its next deploy.

## Features

- Self-check against bot-core's `admin`, `branding`, and `error_handling` modules on every boot
- Non-zero exit on self-check failure, so the deploy platform reports the canary unhealthy and blocks the cascade
- Optional minimal `/start`-only polling bot (only runs if `BOT_TOKEN` is set) as a deeper smoke test of the python-telegram-bot integration surface
- `GET /healthz` status endpoint — the only thing the redeploy pipeline reads
- Runs with zero bot credentials configured — it's just a status server without `BOT_TOKEN`

## Tech Stack

| Layer | Choice |
|---|---|
| Bot | python-telegram-bot 21.6 (polling, optional) |
| Bot core | thebooleanjulian-bot-core (private package, installed from its `main` branch) |
| Status server | `thebooleanjulian_bot_core.health.StatusServer` |
| Hosting | Zeabur (Dockerfile + Procfile + zbpack.json) |

## Screenshots

_Not applicable — this is a headless deploy-gate service with no user-facing UI beyond a JSON health endpoint._

## Quick Start

```bash
git clone https://github.com/TheBooleanJulian/bot-core-canary
cd bot-core-canary
pip install -r requirements.txt
python main.py   # BOT_TOKEN/OWNER_TELEGRAM_ID optional — without them it's just the status server
```

`GET /healthz` → `{"status": "ok"}` if the self-check passed and the process is alive. That's the only endpoint the redeploy pipeline reads.

## Configuration

| Variable | Required | Description |
|---|---|---|
| `BOT_TOKEN` | — | If set, also runs a minimal `/start`-only polling bot as a deeper smoke test of the python-telegram-bot integration surface. Omit it and this is just a status server. |
| `OWNER_TELEGRAM_ID` | — | Only relevant if `BOT_TOKEN` is set. |
| `PORT` | — | Status server port, default `8080`. |

## Deployment

Zeabur, same shape as every other bot in the fleet (`Dockerfile` + `Procfile` + `zbpack.json`). Pin the instance count to 1.

## Status / Roadmap

- [x] Self-check against bot-core's `admin`, `branding`, `error_handling` modules
- [x] Fail loudly (non-zero exit) on self-check failure to block the fleet-wide redeploy cascade
- [x] `/healthz` status endpoint for the redeploy pipeline
- [x] Optional `/start`-only bot smoke test when `BOT_TOKEN` is set
- [ ] Expand self-check coverage to additional bot-core modules as they're added
- [ ] Surface last self-check result/timestamp on the status page, not just pass/fail at boot

## Changelog

- **2026-08-21** — Initial commit: bot-core canary service (self-check, status server, optional smoke-test bot, Zeabur deploy config)

## License

This project is dual licensed.

- Community Edition — [GNU Affero General Public License v3 (AGPLv3)](LICENSE). Free to use, modify, and self-host. If you distribute a modified version or run it as a network service, you must make the corresponding source available.
- Commercial License — for organisations that want to embed, modify, or distribute this software without AGPLv3's obligations. See [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md).

---

<div align="center">
<sub>Built by <a href="https://github.com/TheBooleanJulian">@TheBooleanJulian</a></sub>
</div>
