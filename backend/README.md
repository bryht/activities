# backend

KidGo API server (PRD §6) — **Rust** (Axum + sqlx) backed by **PostgreSQL**.

Live: **https://api.bryht.net/kid-go**

## Modules
- **Core** — users, activities, join, messages (`src/api.rs`)
- **NLU** (`src/nlu.rs`) — sentence → `{ when, spotId, tags, title }`. LLM (OpenAI-compatible)
  when `KIDGO_LLM_*` is set, with a deterministic rule-based fallback.
- **Matching** (`src/matching.rs`) — Smart Match scoring (PRD §4.5): same-day > age-group >
  area > activity-type. Persists top suggestions to `kidgo_match_suggestions`.
- **Seed** (`src/seed.rs`) — developmental-stage groups + Maastricht spots (PRD §4.1, §7).

## Schema
All tables are prefixed `kidgo_` and created with `IF NOT EXISTS`
(`migrations/0001_kidgo_init.sql`), so the API safely shares a Postgres instance with
other apps — it never touches non-`kidgo_` tables. UUIDs are app-generated (no DB
extensions needed; works on Postgres 12+).

## Run locally
```sh
cp .env.example .env          # point DATABASE_URL at your Postgres
cargo run                     # serves http://localhost:8080
```
Or from the repo root: `docker compose up --build`.

## Endpoints
```
GET  /health
GET  /api/groups
GET  /api/spots
GET  /api/activities            ?group=&area=&tag=&date=today|week|all&sort=date|area
POST /api/activities            { hostId, spotId, when, tags?, title?, group?, capacity?, notes? }
GET  /api/activities/:id        ?userId=   (userId sets the `mine` flag on messages)
GET  /api/activities/:id/calendar.ics       (text/calendar; add-to-calendar file)
POST /api/activities/:id/join   { userId }
POST /api/activities/:id/messages { userId, body }   (host/participants only — PRD §4.4)
POST /api/users                 { nickname, phone, city?, childStage?, interests? }  (upsert by phone)
GET  /api/users/by-phone/:phone
GET  /api/users/:id/activities
POST /api/nlu/parse             { text }
```

## Build & deploy
The server has ~512MB RAM, so we cross-build a glibc binary in an Ubuntu 20.04 container
(matching the host) rather than compiling on the box:
```sh
docker build -t kidgo-api-build -f Dockerfile.ubuntu20 .
cid=$(docker create kidgo-api-build); docker cp $cid:/app/target/release/kidgo-api ./kidgo-api; docker rm $cid
```
Then ship `kidgo-api` + `.env` to `/opt/kidgo`, install `deploy/kidgo-api.service`
(systemd), and add `deploy/nginx-kid-go.conf` to the `api.bryht.net` server block.
The nginx `/kid-go/` location strips the prefix, so the app serves plain paths.
```sh
systemctl enable --now kidgo-api
```
