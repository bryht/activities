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

## Deploy
The bot runs as a `systemd` service (`/opt/kidgo-bot`) on the same host as the API. Pushes
to `main` touching `bot/**` auto-deploy via
[`.github/workflows/deploy-bot.yml`](../.github/workflows/deploy-bot.yml): it rsyncs the
source, runs `npm ci` on the box, and restarts the service. The paired `auth/` session and
the server `.env` are **never** overwritten by a deploy.

### First-time server setup
```sh
# Node 20+ required (src/api.js uses global fetch).
sudo mkdir -p /opt/kidgo-bot && sudo chown "$USER" /opt/kidgo-bot
cat > /opt/kidgo-bot/.env <<'EOF'
KIDGO_API_BASE=http://127.0.0.1:8090   # talk to the API directly, skip nginx/TLS
KIDGO_AUTH_DIR=./auth
LOG_LEVEL=silent
EOF
sudo cp deploy/kidgo-bot.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable kidgo-bot
```

### Pairing the WhatsApp number (manual, one-time)
The bot prints a QR that the dedicated number must scan. Once scanned, the saved `auth/`
session persists and survives every deploy — you only do this again if it logs out.

**Option A — from your local machine (recommended).** The service is already running and
the QR is in its journal; just tail the log over SSH and the QR renders in your own
terminal, ready to scan:
```sh
ssh -p 27338 root@api.bryht.net "journalctl -u kidgo-bot -f"
# Scan the QR shown in the terminal with the KidGo WhatsApp number.
# It logs "✅ KidGo bot connected." once paired — then Ctrl-C to stop tailing.
```
If the QR has already scrolled away, refresh it first, then tail again:
```sh
ssh -p 27338 root@api.bryht.net "systemctl restart kidgo-bot && journalctl -u kidgo-bot -f"
```
The QR refreshes every ~20s, so don't worry if you catch it mid-rotation — wait for the
next one.

**Option B — on the server, before the service runs.** Run the bot in the foreground so the
QR is interactive, then hand it to systemd:
```sh
cd /opt/kidgo-bot && npm ci --omit=dev
node src/index.js              # scan the QR with the KidGo number, then Ctrl-C
sudo systemctl start kidgo-bot
```

Re-run either option to re-pair if the session ever logs out. Live logs:
`ssh -p 27338 root@api.bryht.net "journalctl -u kidgo-bot -f"`.
