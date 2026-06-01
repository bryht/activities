# bot

KidGo chat bot (PRD §5.1) — **Node.js**, one process that drives any of
**Telegram**, **WhatsApp Business**, and **Signal**. Each platform is an adapter
under `src/adapters/`; an adapter runs only when its env vars are present, so the
same binary is a Telegram-only bot or a three-platform bot depending on config.

The conversation logic in `src/flows.js` is transport-agnostic — it works on an
`identity` of `{ platform, id }` and a `reply` callback. The backend stores
identity as `(platform, phone)` so a Telegram numeric id and a real
WhatsApp/Signal phone number never collide.

## Run
```sh
npm install
cp .env.example .env           # set at least one platform + KIDGO_API_BASE
npm start
```

## Platforms

### Telegram (grammY, long polling)
Create a bot with [@BotFather](https://t.me/BotFather) (`/newbot`), set
`TELEGRAM_BOT_TOKEN`. No public URL needed. The bot's username must match the
website's `VITE_BOT_USERNAME` for deep links to resolve.

### WhatsApp Business (Meta Cloud API, webhook)
In the [Meta for Developers](https://developers.facebook.com) app add WhatsApp,
then set `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TOKEN` (a system-user token), and
`WHATSAPP_VERIFY_TOKEN` (any string you choose). Point the app's webhook at
`https://<host>/webhook/whatsapp` using the same verify token and subscribe to
`messages`. The bot serves that webhook on `PORT` (default 8099) — front it with
nginx/TLS. Inbound and outbound both use the Graph API; WhatsApp renders the
`*bold*`/`_italic_` markup natively.

### Signal (signal-cli native daemon, JSON-RPC)
Signal has no official bot API. Use the **GraalVM native** build of
[signal-cli](https://github.com/AsamK/signal-cli) — no Docker, no JVM, tiny
footprint (important on the ~300 MB host). Register a dedicated number once, then
run it as a daemon:
```sh
signal-cli -a +<number> daemon --tcp 127.0.0.1:7583
```
Set `SIGNAL_JSONRPC=127.0.0.1:7583` and `SIGNAL_NUMBER=+<number>`. The bot speaks
JSON-RPC over that socket. Photos and voice notes work too: signal-cli saves each
incoming attachment to its data dir and the bot reads it from there
(`SIGNAL_ATTACHMENTS_DIR`, default `~/.local/share/signal-cli/attachments`) and
runs it through the vision/audio model — so signal-cli must run on the same host
as the bot. Run signal-cli as its own `systemd` service alongside the bot.

## Flows (`src/flows.js`)
- **Registration** (PRD §4.1) — new identity → nickname → stage → `POST /users` (with `platform`).
- **Post / Browse / My activities / Profile** — unchanged; driven through `src/api.js`.

Website deep links: Telegram uses `/start <payload>`; WhatsApp uses a prefilled
`wa.me?text=…[ref:…]` message — both reduce to the `[ref:]`/`[manage:]` tokens the
flow already parses. Signal can't prefill, so its button just opens a chat.

## Deploy
Runs as `systemd` `kidgo-bot` at `/opt/kidgo-bot`, same host as the API. Pushes to
`main` touching `bot/**` auto-deploy via
[`.github/workflows/deploy-bot.yml`](../.github/workflows/deploy-bot.yml): rsync
source, merge the CI-managed platform secrets into the server `.env`, `npm ci`,
restart. Add these as repo **secrets** (each optional; unset ones are skipped):
`TELEGRAM_BOT_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TOKEN`,
`WHATSAPP_VERIFY_TOKEN`, `SIGNAL_NUMBER`. Hand-managed keys in the server `.env`
(`KIDGO_API_BASE`, `LOG_LEVEL`, `PORT`, `SIGNAL_JSONRPC`) are preserved.

### First-time server setup
```sh
# Node 20+ required (global fetch). signal-cli native + a registered number if
# you want Signal; nginx location for /webhook/whatsapp if you want WhatsApp.
sudo mkdir -p /opt/kidgo-bot && sudo chown "$USER" /opt/kidgo-bot
cat > /opt/kidgo-bot/.env <<'EOF'
KIDGO_API_BASE=http://127.0.0.1:8090
PORT=8099
SIGNAL_JSONRPC=127.0.0.1:7583
LOG_LEVEL=silent
EOF
# Platform secrets arrive from the GitHub Actions secrets on deploy.
sudo cp deploy/kidgo-bot.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now kidgo-bot
```

Live logs: `ssh -p 27338 root@api.bryht.net "journalctl -u kidgo-bot -f"`
(look for `✅ KidGo bot starting — platforms: …`).
