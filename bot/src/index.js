// KidGo WhatsApp bot — Baileys socket + message router (PRD §5.1).
//
// ⚠️ Baileys is unofficial and violates WhatsApp's ToS. Use a DEDICATED number
// and plan to migrate to the official Business API as we scale.
import {
  default as makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  DisconnectReason,
} from '@whiskeysockets/baileys'
import { rm } from 'node:fs/promises'
import pino from 'pino'
import qrcode from 'qrcode-terminal'
import { handleMessage } from './flows.js'
import { api } from './api.js'

const logger = pino({ level: process.env.LOG_LEVEL || 'silent' })
const AUTH_DIR = process.env.KIDGO_AUTH_DIR || './auth'

// Extract a digits-only phone id from a WhatsApp jid (e.g. 316...@s.whatsapp.net).
const phoneOf = (jid) => (jid || '').split('@')[0].split(':')[0]

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({ version, auth: state, logger, printQRInTerminal: false })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u
    if (qr) {
      console.log('\n📱 Scan this QR with the KidGo WhatsApp number:\n')
      qrcode.generate(qr, { small: true })
    }
    if (connection === 'open') console.log('✅ KidGo bot connected.')
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      const loggedOut = code === DisconnectReason.loggedOut
      if (loggedOut) {
        // WhatsApp invalidated the session. Drop the dead credentials so the
        // next start prints a fresh QR to re-pair — never sit silently dead.
        console.log(`Connection closed (code ${code}). Logged out — clearing session, scan the new QR to re-pair.`)
        await rm(AUTH_DIR, { recursive: true, force: true }).catch(() => {})
      } else {
        console.log(`Connection closed (code ${code}). Reconnecting…`)
      }
      // Always come back up (re-pair on logout, reconnect otherwise). Exit
      // non-zero only if re-init itself fails, so systemd restarts us.
      start().catch((e) => {
        console.error('restart failed:', e)
        process.exit(1)
      })
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const m of messages) {
      const jid = m.key.remoteJid
      try {
        if (!m.message || m.key.fromMe) continue
        if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') continue // 1:1 only

        const message = m.message
        const image = message.imageMessage
        const audio = message.audioMessage

        let text =
          message.conversation ||
          message.extendedTextMessage?.text ||
          message.buttonsResponseMessage?.selectedDisplayText ||
          message.listResponseMessage?.title ||
          image?.caption ||
          ''

        // A captionless image or a voice note: understand it via the API's
        // vision/audio model, then run the resulting text through the flow.
        if (!text.trim() && (image || audio)) {
          text = await understandMedia(sock, m, image ? 'image' : 'audio', image || audio, jid)
        }
        if (!text.trim()) continue

        await sock.sendPresenceUpdate('composing', jid)
        await handleMessage(phoneOf(jid), text, (reply) =>
          sock.sendMessage(jid, { text: reply }),
        )
      } catch (err) {
        console.error('handler error:', err)
        try {
          await sock.sendMessage(jid, {
            text: 'Oops, something went wrong. Type *menu* to start over.',
          })
        } catch {
          /* ignore */
        }
      }
    }
  })
}

// Download a media message and turn it into text via the API's vision/audio
// model. Returns '' (and sends a friendly nudge) if anything goes wrong.
async function understandMedia(sock, m, kind, node, jid) {
  await sock.sendPresenceUpdate('composing', jid)
  try {
    const buffer = await downloadMediaMessage(
      m,
      'buffer',
      {},
      { logger, reuploadRequest: sock.updateMediaMessage },
    )
    const mime = node?.mimetype || (kind === 'image' ? 'image/jpeg' : 'audio/ogg')
    const { text } = await api.media(kind, buffer.toString('base64'), mime)
    return (text || '').trim()
  } catch (err) {
    console.error('media error:', err)
    const note =
      kind === 'image'
        ? "I couldn't read that image — could you type the details instead?"
        : "I couldn't understand that voice note — could you type it instead?"
    await sock.sendMessage(jid, { text: note }).catch(() => {})
    return ''
  }
}

start().catch((e) => {
  console.error('fatal:', e)
  process.exit(1)
})
