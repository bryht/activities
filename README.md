# KidGo

Help parents find playmates and activities for same-age kids in Maastricht.
Post "I want to go play" in one sentence; the system matches families nearby, at a
similar time, in the same developmental stage.

See [`doc/PRD.md`](doc/PRD.md) and [`doc/PLAN.md`](doc/PLAN.md).

## Layout

| Dir | What | Stack | Status |
|-----|------|-------|--------|
| `backend/`  | API server | Rust (Axum) + PostgreSQL | ✅ Deployed — https://api.bryht.net/kid-go |
| `frontend/` | Browse website | React + Vite + Tailwind | ✅ Builds; deploys to kidgo.bryht.net |
| `bot/`      | Telegram bot | Node.js (grammY) | ✅ Runs; needs a BotFather token |
| `design/`   | Original prototype | React (mock data) | 📦 Superseded by `frontend/` |

## Run everything locally

```sh
# 1. API + Postgres
docker compose up --build            # API → http://localhost:8080

# 2. Frontend
cd frontend && npm install && cp .env.example .env && npm run dev   # http://localhost:5173

# 3. Bot (optional — needs a Telegram bot token from @BotFather)
cd bot && npm install && cp .env.example .env && npm start
```

The three runtimes talk over the REST API; the prototype's data shapes
(`design/src/data/*.js`) are the contract, promoted into the schema and typed responses.

## Architecture

```
Telegram bot (grammY) ─┐
                       ├─► API server (Rust: NLU · Matching · Notify) ─► PostgreSQL
Website (React static) ┘
```

- **NLU** — LLM (with a deterministic fallback) parses a sentence into date/time/spot/tags.
- **Matching** — Smart Match scoring on day · age-group · area · activity-type (PRD §4.5).
- Tables are prefixed `kidgo_` so the API shares the server's Postgres without touching
  other apps' data.

## Deployment

All three runtimes deploy from `main` via GitHub Actions:

| Component | Workflow | Target |
|-----------|----------|--------|
| **Website** | [`deploy.yml`](.github/workflows/deploy.yml) | GitHub Pages → kidgo.bryht.net |
| **API** | [`deploy-backend.yml`](.github/workflows/deploy-backend.yml) | `systemd` `kidgo-api` at `/opt/kidgo`, behind nginx at `api.bryht.net/kid-go` |
| **Bot** | [`deploy-bot.yml`](.github/workflows/deploy-bot.yml) | `systemd` `kidgo-bot` at `/opt/kidgo-bot` (same host) |

The API workflow cross-builds a glibc binary in an Ubuntu 20.04 container (the box is
too small to compile Rust) and scp's it over; the bot workflow rsyncs source and runs
`npm ci` on the box, preserving the server `.env` (which holds the bot token). Both run
only when their own directory changes. Manual one-time setup is in
[`backend/README.md`](backend/README.md) and [`bot/README.md`](bot/README.md).

### CI secrets & variables
Deploys reuse one SSH key for the shared host. Set these in the repo's
**Settings → Secrets and variables → Actions**:

| Secret | What |
|--------|------|
| `DEPLOY_SSH_KEY` | Private key whose public half is in the deploy user's `authorized_keys` |
| `DEPLOY_SSH_HOST` | Server hostname (e.g. `bryht.net`) |
| `DEPLOY_SSH_USER` | Deploy user — needs passwordless `sudo` for `install`/`systemctl restart` |
| `TELEGRAM_BOT_TOKEN` | BotFather token; upserted into the bot's server `.env` on each deploy |

| Variable (optional) | Default |
|---------------------|---------|
| `DEPLOY_SSH_PORT` | `22` |
| `KIDGO_DEPLOY_PATH` | `/opt/kidgo` |
| `KIDGO_BOT_PATH` | `/opt/kidgo-bot` |
| `KIDGO_BOT_USERNAME` | `kidgo_bot` (website deep links → `t.me/<username>`) |
| `KIDGO_BOT_LINK` | `https://t.me/kidgo_bot` (About-page QR) |
