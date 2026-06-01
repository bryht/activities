// Signal adapter — talks JSON-RPC to a local signal-cli daemon over TCP.
//
// Signal has no official bot API. We run signal-cli (the GraalVM *native* build —
// no Docker, no JVM, tiny footprint) as a daemon on a dedicated registered
// number, e.g.:
//   signal-cli -a +<number> daemon --tcp 127.0.0.1:7583
// The daemon streams inbound messages as newline-delimited JSON-RPC `receive`
// notifications and accepts `send` requests. Identity is the sender's number:
// { platform: 'signal', id: '+31…' }. Signal shows markup literally, so we strip
// the *bold*/_italic_ before sending. Text only for now (no attachment download).
import net from 'node:net'
import { handleMessage, stripMarkdown } from '../core.js'

export function startSignal({ host, port, account, logger }) {
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
    const text = data?.message
    if (!from) return
    if (!text || !text.trim()) {
      // Attachment-only message: we can't read media on Signal yet.
      if (data?.attachments?.length) {
        send(from, 'I can only read text on Signal for now — could you type the details?')
      }
      return
    }
    handleMessage({ platform: 'signal', id: from }, text, (t) => send(from, t)).catch((err) =>
      logger?.error?.({ err }, 'signal handler error'),
    )
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
