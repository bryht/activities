// WhatsApp adapter — Meta WhatsApp Cloud API.
//
// Inbound is an HTTPS webhook (mounted on the shared HTTP server in index.js):
//   GET  /webhook/whatsapp  → Meta's verify-token handshake
//   POST /webhook/whatsapp  → message notifications
// Outbound posts to the Graph API. Identity is the sender's WhatsApp number
// (digits, no +): { platform: 'whatsapp', id }. WhatsApp renders *bold*/_italic_
// natively, so replies go out unchanged.
import { handleMessage, understandMedia, mediaFallback } from '../core.js'

const GRAPH = 'https://graph.facebook.com/v20.0'

function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => resolve(data))
    req.on('error', () => resolve(''))
  })
}

export function createWhatsApp({ phoneNumberId, token, verifyToken, logger }) {
  async function send(to, text) {
    await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
    })
  }

  // Two-step media fetch: media id → a short-lived URL → the bytes.
  async function downloadMedia(mediaId) {
    const meta = await (await fetch(`${GRAPH}/${mediaId}`, {
      headers: { authorization: `Bearer ${token}` },
    })).json()
    const bin = await fetch(meta.url, { headers: { authorization: `Bearer ${token}` } })
    return { buffer: Buffer.from(await bin.arrayBuffer()), mime: meta.mime_type }
  }

  async function handleOne(m) {
    const reply = (text) => send(m.from, text)
    let text = m.text?.body || ''
    const node = m.image || m.audio || m.voice
    if (!text.trim() && node) {
      const kind = m.image ? 'image' : 'audio'
      try {
        const { buffer, mime } = await downloadMedia(node.id)
        text = await understandMedia(kind, buffer, mime || (kind === 'image' ? 'image/jpeg' : 'audio/ogg'))
      } catch (err) {
        logger?.error?.({ err }, 'whatsapp media error')
        return reply(mediaFallback(kind)).catch(() => {})
      }
    }
    if (!text.trim()) return
    await handleMessage({ platform: 'whatsapp', id: m.from }, text, reply)
  }

  // Meta's subscription handshake: echo hub.challenge when the token matches.
  function verify(req, res, url) {
    const p = url.searchParams
    if (p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === verifyToken) {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end(p.get('hub.challenge') || '')
    } else {
      res.writeHead(403)
      res.end()
    }
  }

  async function receive(req, res) {
    const raw = await readBody(req)
    res.writeHead(200) // ack immediately; Meta retries on non-2xx
    res.end()
    let body
    try {
      body = JSON.parse(raw)
    } catch {
      return
    }
    for (const e of body.entry || []) {
      for (const ch of e.changes || []) {
        for (const m of ch.value?.messages || []) {
          handleOne(m).catch((err) => logger?.error?.({ err }, 'whatsapp handler error'))
        }
      }
    }
  }

  console.log('✅ WhatsApp Cloud API webhook ready (mount /webhook/whatsapp).')
  return { verify, receive }
}
