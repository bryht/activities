// Signal adapter — talks JSON-RPC to a local signal-cli daemon over TCP.
//
// Signal has no official bot API. We run signal-cli (the GraalVM *native* build —
// no Docker, no JVM, tiny footprint) as a daemon on a dedicated registered
// number, e.g.:
//   signal-cli -a +<number> daemon --tcp 127.0.0.1:7583
// The daemon streams inbound messages as newline-delimited JSON-RPC `receive`
// notifications and accepts `send` requests. Identity is the sender's number:
// { platform: 'signal', id: '+31…' }. Signal shows markup literally, so we strip
// the *bold*/_italic_ before sending.
//
// Media: a `receive` notification does not carry the bytes — signal-cli saves
// each incoming attachment to its data dir and reports an `id` (the filename) and
// `contentType`. signal-cli and the bot run on the same host, so we read the file
// from `attachmentsDir` and run it through the vision/audio model like the other
// platforms.
import net from 'node:net'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { handleMessage, understandMedia, stripMarkdown, mediaFallback } from '../core.js'

export function startSignal({ host, port, account, attachmentsDir, logger }) {
  let sock = null
  let buf = ''
  let nextId = 1

  function send(recipient, text) {
    if (!sock || sock.destroyed) return
    sock.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: String(nextId++),
        method: 'send',
        params: { account, recipient: [recipient], message: stripMarkdown(text) },
      }) + '\n',
    )
  }

  const reply = (from) => (text) => send(from, text)

  async function dispatch(from, text) {
    if (!text || !text.trim()) return
    await handleMessage({ platform: 'signal', id: from }, text, reply(from))
  }

  // Classify a Signal attachment by its MIME type; null = unsupported kind.
  const kindOf = (ct = '') =>
    ct.startsWith('image/') ? 'image' : ct.startsWith('audio/') ? 'audio' : null

  // Read the saved attachment and turn it into text, then run that through the
  // flow. The `id` is the filename signal-cli wrote under attachmentsDir.
  async function dispatchMedia(from, att) {
    const kind = kindOf(att.contentType)
    if (!kind) return send(from, mediaFallback('image'))
    try {
      const buffer = await readFile(join(attachmentsDir, att.id))
      const mime = att.contentType || (kind === 'image' ? 'image/jpeg' : 'audio/aac')
      const text = await understandMedia(kind, buffer, mime)
      if (text) return dispatch(from, text)
      send(from, mediaFallback(kind))
    } catch (err) {
      logger?.error?.({ err }, 'signal media error')
      send(from, mediaFallback(kind))
    }
  }

  function onLine(line) {
    if (!line.trim()) return
    let obj
    try {
      obj = JSON.parse(line)
    } catch {
      return
    }
    if (obj.method !== 'receive') return
    const env = obj.params?.envelope
    const data = env?.dataMessage
    const from = env?.sourceNumber || env?.source
    if (!from || !data) return

    const text = data.message
    if (text && text.trim()) {
      dispatch(from, text).catch((err) => logger?.error?.({ err }, 'signal handler error'))
      return
    }

    // No text: try the first image/audio attachment.
    const media = (data.attachments || []).find((a) => kindOf(a.contentType))
    if (media) {
      dispatchMedia(from, media).catch((err) => logger?.error?.({ err }, 'signal media error'))
    } else if (data.attachments?.length) {
      send(from, "I couldn't read that attachment — could you type the details instead?")
    }
  }

  function connect() {
    sock = net.connect({ host, port }, () =>
      console.log(`✅ Signal connected (json-rpc ${host}:${port}).`),
    )
    sock.setEncoding('utf8')
    sock.on('data', (chunk) => {
      buf += chunk
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i)
        buf = buf.slice(i + 1)
        onLine(line)
      }
    })
    sock.on('error', (err) => logger?.error?.({ err }, 'signal socket error'))
    sock.on('close', () => {
      logger?.warn?.('signal socket closed; reconnecting in 5s')
      setTimeout(connect, 5000)
    })
  }

  connect()
  return { send }
}
