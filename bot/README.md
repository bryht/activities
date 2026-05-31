# bot

KidGo Telegram bot (PRD §5.1) — **grammY** (Node.js), the main entry point.

Talks to Telegram's official Bot API over **long polling** (no public webhook,
no QR pairing, no ban risk). Hybrid interaction: natural-language posting +
numbered quick-reply menus. The conversation logic in `src/flows.js` is
transport-agnostic — it only needs `(identity, text, reply)` — so the user's
Telegram numeric id is the identity, stored by the API in its `phone` field.

## Run
```sh
npm install
cp .env.example .env           # set TELEGRAM_BOT_TOKEN and KIDGO_API_BASE
npm start                      # connects via long polling
```
Create a bot with [@BotFather](https://t.me/BotFather) (`/newbot`), copy the
token into `TELEGRAM_BOT_TOKEN`, and note the bot's username — the website's
`VITE_BOT_USERNAME` must match it so the deep links resolve.

## Flows (`src/flows.js`)
- **Registration** (PRD §4.1) — new user → nickname → developmental stage → `POST /users`.
- **Post** (Scenario A) — free-text sentence → `/nlu/post-fill` → confirm → `POST /activities`.
- **Browse / join** (Scenario B/D) — numbered list → reply a number → `POST /activities/:id/join`.
- **My activities / profile** — menu options.

Website deep links arrive via Telegram's `/start <payload>` mechanism
(`t.me/<bot>?start=ref_<id>` / `?start=manage_<id>`); `src/index.js` translates
the payload into the `[ref:…]` / `[manage:…]` tokens the flows already parse.
Everything else is driven through the REST API (`src/api.js`); the bot holds no
business logic of its own beyond conversation state.

## Deploy
The bot runs as a `systemd` service (`/opt/kidgo-bot`) on the same host as the
API. Pushes to `main` touching `bot/**` auto-deploy via
[`.github/workflows/deploy-bot.yml`](../.github/workflows/deploy-bot.yml): it
rsyncs the source, runs `npm ci` on the box, and restarts the service. The
server `.env` is preserved by rsync; the deploy upserts `TELEGRAM_BOT_TOKEN`
from the GitHub Actions secret of the same name (if set), leaving any other
hand-managed keys like `KIDGO_API_BASE` intact.

The token is supplied as a repo secret — add **`TELEGRAM_BOT_TOKEN`** under
*Settings → Secrets and variables → Actions* and the next deploy writes it to
the server `.env`. (You can also set it on the server by hand; the deploy only
overwrites it when the secret is present.)

### First-time server setup
```sh
# Node 20+ required (src/api.js uses global fetch).
sudo mkdir -p /opt/kidgo-bot && sudo chown "$USER" /opt/kidgo-bot
cat > /opt/kidgo-bot/.env <<'EOF'
KIDGO_API_BASE=http://127.0.0.1:8090   # talk to the API directly, skip nginx/TLS
LOG_LEVEL=silent
EOF
# TELEGRAM_BOT_TOKEN comes from the GitHub Actions secret on deploy (or add it
# here by hand for a first manual run).
sudo cp deploy/kidgo-bot.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now kidgo-bot
```

No pairing step is needed — the bot authenticates with the token alone. Live
logs: `ssh -p 27338 root@api.bryht.net "journalctl -u kidgo-bot -f"` (look for
`✅ KidGo bot connected.`).
