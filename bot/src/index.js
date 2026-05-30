// KidGo WhatsApp bot — Baileys socket + message router (PRD §5.1).
//
// ⚠️ Baileys is unofficial and violates WhatsApp's ToS. Use a DEDICATED number
// and plan to migrate to the official Business API as we scale.
import {
  default as makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from '@whiskeysockets/baileys'
import pino from 'pino'
import qrcode from 'qrcode-terminal'
import { handleMessage } from './flows.js'

const logger = pino({ level: process.env.LOG_LEVEL || 'silent' })
const AUTH_DIR = process.env.KIDGO_AUTH_DIR || './auth'

// Extract a digits-only phone id from a WhatsApp jid (e.g. 316...@s.whatsapp.net).
const phoneOf = (jid) => (jid || '').split('@')[0].split(':')[0]

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({ version, auth: state, logger, printQRInTerminal: false })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (u) => {
    const { connection, lastDisconnect, qr } = u
    if (qr) {
      console.log('\n📱 Scan this QR with the KidGo WhatsApp number:\n')
      qrcode.generate(qr, { small: true })
    }
    if (connection === 'open') console.log('✅ KidGo bot connected.')
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      const loggedOut = code === DisconnectReason.loggedOut
      console.log(`Connection closed (code ${code}).`, loggedOut ? 'Logged out.' : 'Reconnecting…')
      if (!loggedOut) start()
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const m of messages) {
      try {
        if (!m.message || m.key.fromMe) continue
        const jid = m.key.remoteJid
        if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') continue // 1:1 only

        const text =
          m.message.conversation ||
          m.message.extendedTextMessage?.text ||
          m.message.buttonsResponseMessage?.selectedDisplayText ||
          m.message.listResponseMessage?.title ||
          ''
        if (!text.trim()) continue

        await sock.sendPresenceUpdate('composing', jid)
        await handleMessage(phoneOf(jid), text, (reply) =>
          sock.sendMessage(jid, { text: reply }),
        )
      } catch (err) {
        console.error('handler error:', err)
        try {
          await sock.sendMessage(m.key.remoteJid, {
            text: 'Oops, something went wrong. Type *menu* to start over.',
          })
        } catch {
          /* ignore */
        }
      }
    }
  })
}

start().catch((e) => {
  console.error('fatal:', e)
  process.exit(1)
})
