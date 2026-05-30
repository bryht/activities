# bot

KidGo WhatsApp bot (PRD §5.1) — **Baileys** (Node.js), the main entry point.

Connects directly to the WhatsApp WebSocket protocol (no headless browser, ~50–120MB).
Hybrid interaction: natural-language posting + numbered quick-reply menus.

> ⚠️ Baileys is unofficial and violates WhatsApp's ToS — use a dedicated number and plan
> to migrate to the official Business API (Meta Cloud / 360dialog) as we scale.

## Run
```sh
npm install
cp .env.example .env          # set KIDGO_API_BASE (e.g. https://api.bryht.net/kid-go)
npm start                     # prints a QR — scan it with the dedicated KidGo number
```
Auth/session is persisted under `KIDGO_AUTH_DIR` (default `./auth`); back it up and keep
it private. Re-pairing is only needed if the session is lost.

## Flows (`src/flows.js`)
- **Registration** (PRD §4.1) — new contact → nickname → developmental stage → `POST /users`.
- **Post** (Scenario A) — free-text sentence → `/nlu/parse` → confirm → `POST /activities`.
- **Browse / join** (Scenario B/D) — numbered list → reply a number → `POST /activities/:id/join`.
- **My activities / profile** — menu options.

Everything is driven through the REST API (`src/api.js`); the bot holds no business logic
of its own beyond conversation state.
