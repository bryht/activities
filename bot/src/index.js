// KidGo bot — multi-platform entry point.
//
// One process drives every chat platform whose credentials are present in the
// environment; each is an adapter under ./adapters that converts its inbound
// events into handleMessage(identity, text, reply). The business logic
// (flows.js) is transport-agnostic, so adding a platform is just adding an
// adapter. Run with only TELEGRAM_BOT_TOKEN set and it's a Telegram-only bot.
import http from 'node:http'
import os from 'node:os'
import { join } from 'node:path'
import pino from 'pino'
import { startTelegram } from './adapters/telegram.js'
import { createWhatsApp } from './adapters/whatsapp.js'
import { startSignal } from './adapters/signal.js'

const logger = pino({ level: process.env.LOG_LEVEL || 'silent' })
const enabled = []

// --- Telegram (long polling; no public URL needed) ---
if (process.env.TELEGRAM_BOT_TOKEN) {
  startTelegram({ token: process.env.TELEGRAM_BOT_TOKEN, logger })
  enabled.push('telegram')
}

// --- WhatsApp (Meta Cloud API; inbound via the webhook on the HTTP server) ---
let whatsapp = null
if (
  process.env.WHATSAPP_PHONE_NUMBER_ID &&
  process.env.WHATSAPP_TOKEN &&
  process.env.WHATSAPP_VERIFY_TOKEN
) {
  whatsapp = createWhatsApp({
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    token: process.env.WHATSAPP_TOKEN,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    logger,
  })
  enabled.push('whatsapp')
}

// --- Signal (signal-cli JSON-RPC daemon over TCP) ---
if (process.env.SIGNAL_JSONRPC && process.env.SIGNAL_NUMBER) {
  const [host, port] = process.env.SIGNAL_JSONRPC.split(':')
  startSignal({
    host: host || '127.0.0.1',
    port: Number(port) || 7583,
    account: process.env.SIGNAL_NUMBER,
    attachmentsDir:
      process.env.SIGNAL_ATTACHMENTS_DIR ||
      join(os.homedir(), '.local', 'share', 'signal-cli', 'attachments'),
    logger,
  })
  enabled.push('signal')
}

if (!enabled.length) {
  console.error(
    'No platform configured. Set TELEGRAM_BOT_TOKEN and/or WHATSAPP_* and/or SIGNAL_* in .env.',
  )
  process.exit(1)
}

// The HTTP server hosts the WhatsApp webhook (Meta needs a public URL) and a
// health check. Telegram and Signal use their own connections, but the server is
// cheap to keep on and handy for liveness probes.
const PORT = Number(process.env.PORT) || 8099
http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' })
      return res.end('ok')
    }
    if (whatsapp && url.pathname === '/webhook/whatsapp') {
      if (req.method === 'GET') return whatsapp.verify(req, res, url)
      if (req.method === 'POST') return whatsapp.receive(req, res)
    }
    res.writeHead(404)
    res.end()
  })
  .listen(PORT, () =>
    console.log(`📡 HTTP on :${PORT} (health${whatsapp ? ', /webhook/whatsapp' : ''})`),
  )

console.log(`✅ KidGo bot starting — platforms: ${enabled.join(', ')}`)
