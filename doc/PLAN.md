# KidGo — Implementation Plan

> How we get from the PRD + design prototype to a shipped product.

**Date**: 2026-05-30
**Status**: Planning
**Companion docs**: [PRD.md](./PRD.md) · prototype in [`../design`](../design)

---

## 0. Where we are today

| Piece | Location | State |
|-------|----------|-------|
| Product spec | `doc/PRD.md` | ✅ Complete |
| Brand / UI | `doc/kidgo-logo.svg`, `kidgo-wordmark.svg` | ✅ Done |
| Web prototype | `design/` (React + Vite + Tailwind) | ✅ Working, mock data, deployed to Pages |
| Production frontend | `frontend/` | 🔲 Stub (README only) |
| API server | `backend/` (Rust + PostgreSQL) | 🔲 Stub (README only) |
| WhatsApp bot | `bot/` (Baileys / Node.js) | 🔲 Stub (README only) |

The prototype already encodes the data model we'll build against: **groups**
(`design/src/data/groups.js`), **spots** (`spots.js`), and the **activity shape**
(`activities.js`). The plan treats these as the contract for the API.

### Guiding principles

- **Ship the thinnest vertical slice first.** A parent should be able to register,
  post one activity, and have a friend join it — end to end — before we polish anything.
- **The prototype's mock shapes are the API contract.** Don't redesign the data model;
  promote the existing JS shapes into a real schema and a typed API.
- **Bot first, NLU later.** Button-driven flows work without an LLM. Natural-language
  parsing is an enhancement layered on top, not a blocker.
- **Manual before automatic.** Smart Match and recurring activities come after the core
  post → browse → join loop is solid.

---

## 1. Architecture & contracts (Phase 0 — foundation)

Before feature work, lock the seams between the three runtimes (PRD §6).

1. **Define the API contract.** Write `doc/api.md` (or an OpenAPI file) describing the
   REST endpoints the frontend and bot both call. Derive request/response shapes directly
   from the prototype's `activities.js` / `groups.js` / `spots.js`.
2. **Define the database schema.** Tables: `users`, `groups` (seed), `spots` (seed from
   PRD §7), `activities`, `participants`, `messages`, `match_suggestions`. Write it as a
   migration in `backend/migrations/`.
3. **Pick the LLM + secrets story.** One provider key for NLU + Matching, read from env
   (note: `.env.local` is already gitignored). Document required env vars in each subproject.
4. **Local dev orchestration.** A `docker-compose.yml` (Postgres + API) and a root
   `README.md` "run everything locally" section.

**Exit criteria:** schema migration runs; API serves a hard-coded `/activities`; frontend
and bot can both reach it locally.

---

## 2. Backend — Rust API + PostgreSQL (`backend/`)

Build in dependency order so each step unblocks the frontend or bot.

### 2.1 Skeleton
- HTTP framework (Axum), `sqlx` for Postgres, migrations, health check, CORS, error type.
- Seed `groups` (PRD §4.1) and `spots` (PRD §7) on startup or via a seed migration.

### 2.2 Core resources (the read/write loop)
- `GET /activities` with filters: date range, group, area, tag, sort by date/distance (PRD §4.3).
- `GET /activities/:id` — detail incl. host, participants, messages.
- `POST /activities` — create from structured fields (NLU fills these later).
- `POST /activities/:id/join` — add participant, return host contact gating (PRD §4.4).
- `GET /users/:id/activities` — "my activities".

### 2.3 Messaging & privacy
- `POST /activities/:id/messages` — host + participants only (PRD §4.4 privacy rules).
- Progressive privacy: contact details exchanged only when both sides opt in (PRD §1).

### 2.4 NLU module
- `POST /nlu/parse` — sentence → `{ date, time, spotId, tags, group }`.
- LLM call + a deterministic fallback (regex for weekday/time, fuzzy match against the
  spots library). The bot calls this before `POST /activities`.

### 2.5 Matching module (PRD §4.5)
- On activity create, score open activities in the same city:
  time overlap > age-group match > location proximity (<5km) > activity-type similarity.
- Persist top suggestions to `match_suggestions`; enforce push-frequency caps
  (≤3 per activity, ≤2/day, user opt-out).

### 2.6 Notify module
- Outbound queue/webhook the bot consumes to push WhatsApp messages (join alerts, match
  suggestions, new-message pings).

**Exit criteria:** every prototype screen can be backed by a real endpoint; bot can drive
the full register → post → join → notify loop via HTTP.

---

## 3. WhatsApp bot — Baileys / Node.js (`bot/`)

The main entry point (PRD §5.1). Hybrid: quick-reply buttons + natural language.

### 3.1 Connection & session
- Baileys socket, QR pairing, persistent auth state, reconnect handling.
- **Use a dedicated number**; document the ToS risk (PRD §5.1 warning).

### 3.2 Registration flow (PRD §4.1)
- Detect new contact → collect nickname, WhatsApp number (implicit), group(s) of
  interest, city (default Maastricht) → `POST /users`.

### 3.3 Activity flows
- **Post** (Scenario A): free-text sentence → `/nlu/parse` → confirm card → `POST /activities`.
- **Browse / my activities / cancel / change time / edit profile** — button menu.
- **Join notification** (Scenario D): consume Notify queue → message host with joiner's
  child stage → "Leave a message" button.

### 3.4 Smart Match push (Scenario C)
- Consume `match_suggestions` → "⚡ X is also at … want to join?" [Join] [No thanks],
  respecting frequency caps.

**Exit criteria:** a parent can do everything in Scenarios A–D from WhatsApp alone.

---

## 4. Production frontend (`frontend/`)

Promote the `design/` prototype into the real site (PRD §5.2), swapping mock data for the API.

1. **Lift the prototype** — copy components/pages from `design/src`; keep the structure
   (`ActivityCard`, `GroupBadge`, `Layout`, pages Home/Activities/ActivityDetail/About).
2. **Data layer** — replace `data/*.js` imports with a typed API client (fetch hooks);
   groups/spots come from the API, not hard-coded.
3. **Filters & sort** — wire date / group / area / tag filters and distance sort to query params.
4. **"I want to come"** — deep-link into WhatsApp (`wa.me`) to continue the flow (PRD §5.2).
5. **Deploy** — point the existing Pages workflow (`.github/workflows/deploy.yml`) at
   `frontend/` once it reaches parity, and retire the prototype build.

**Exit criteria:** the live site at kidgo.bryht.net is served from `frontend/` against the API.

---

## 5. Milestones

| # | Milestone | Includes | Outcome |
|---|-----------|----------|---------|
| **M0** | Foundations | §1 contracts, schema, compose | Runtimes talk locally |
| **M1** | Core loop (MVP) | Backend §2.1–2.3, Bot §3.1–3.3 (buttons only), Frontend §4.1–4.4 | A parent registers, posts, and a friend joins — end to end |
| **M2** | Smart layer | NLU §2.4, Matching §2.5, Notify §2.6, Bot §3.4 | Natural-language posting + match suggestions |
| **M3** | Recurring + polish | Weekly anchor activities (PRD §4.2), privacy hardening, frequency caps | Retention features; ready for first real families |
| **M4** | Launch | Frontend §5 cutover, monitoring, dedicated WhatsApp number | Live for the Maastricht pilot |

**Critical path:** M0 → backend §2.2 → bot §3.2/3.3 → frontend §4. NLU, Matching, and
recurring activities are parallelizable once the core loop (M1) exists.

---

## 6. Open questions to resolve before M1

Carried from PRD §8 plus build-time decisions:

- [ ] **API auth** — how does the website identify the user when they tap "I want to come"?
       phone-number magic link
- [ ] **LLM provider** for NLU — which model, and the cost ceiling per parse.
       in the .env.local
- [ ] **Hosting** — where the Rust API + Postgres run (the ~200MB constraint in PRD §5.1
      is about the bot host; the API can live elsewhere).
      in the linux server in .env.local
- [ ] **Spot geocoding** — Matching's "<5km" needs lat/long on `spots`; add to the seed.
  -   no need this, user choose city at the beginning, for now it is Maastricht static, no need this for now.

---

*Living document — update as milestones land. Pairs with [PRD.md](./PRD.md).*
