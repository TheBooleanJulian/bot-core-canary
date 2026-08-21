<div align="center">

# bot-core-canary

**The first thing that redeploys when `thebooleanjulian-bot-core` changes.**

</div>

---

## What this is

A throwaway service with no real users and no real data. Its only job
is to import bot-core's `main` branch, run a self-check against the
non-network surface of every module (`admin`, `branding`,
`error_handling`), and start a status server.

It exists purely as a deploy-time gate: the fleet-wide auto-redeploy
pipeline (see `thebooleanjulian-bot-core/.github/workflows/`) redeploys
this service first whenever bot-core's `main` branch changes, polls its
`/healthz`, and only fans out redeploys to the rest of the fleet
(clawsune, openclaw, ...) if this comes up healthy. If bot-core ships a
breaking change, it breaks here first — loudly, in a service nobody
depends on — instead of silently breaking a real bot on its next deploy.

## Running

```bash
pip install -r requirements.txt
python main.py   # BOT_TOKEN/OWNER_TELEGRAM_ID optional — without them it's just the status server
```

`GET /healthz` → `{"status": "ok"}` if the self-check passed and the
process is alive. That's the only endpoint the redeploy pipeline reads.

## Config

| Variable | Required | Description |
|---|---|---|
| `BOT_TOKEN` | — | If set, also runs a minimal `/start`-only polling bot as a deeper smoke test of the python-telegram-bot integration surface. Omit it and this is just a status server. |
| `OWNER_TELEGRAM_ID` | — | Only relevant if `BOT_TOKEN` is set. |
| `PORT` | — | Status server port, default `8080`. |

## Deployment

Zeabur, same shape as every other bot in the fleet (`Dockerfile` +
`Procfile` + `zbpack.json`). Pin the instance count to 1.
