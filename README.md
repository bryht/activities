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
| `bot/`      | WhatsApp bot | Node.js (Baileys) | ✅ Runs; needs a dedicated number to pair |
| `design/`   | Original prototype | React (mock data) | 📦 Superseded by `frontend/` |

## Run everything locally

```sh
# 1. API + Postgres
docker compose up --build            # API → http://localhost:8080

# 2. Frontend
cd frontend && npm install && cp .env.example .env && npm run dev   # http://localhost:5173

# 3. Bot (optional — needs a WhatsApp number to scan the QR)
cd bot && npm install && cp .env.example .env && npm start
```

The three runtimes talk over the REST API; the prototype's data shapes
(`design/src/data/*.js`) are the contract, promoted into the schema and typed responses.

## Architecture

```
WhatsApp bot (Baileys) ─┐
                        ├─► API server (Rust: NLU · Matching · Notify) ─► PostgreSQL
Website (React static) ─┘
```

- **NLU** — LLM (with a deterministic fallback) parses a sentence into date/time/spot/tags.
- **Matching** — Smart Match scoring on day · age-group · area · activity-type (PRD §4.5).
- Tables are prefixed `kidgo_` so the API shares the server's Postgres without touching
  other apps' data.

## Deployment

- **API** runs as a `systemd` service (`/opt/kidgo`) on the Linux host behind nginx at
  `api.bryht.net/kid-go`, against the shared PostgreSQL. Build/ship steps: see
  [`backend/README.md`](backend/README.md).
- **Website** auto-deploys to GitHub Pages on push to `main`.
