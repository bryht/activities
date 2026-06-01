// Shared, platform-agnostic glue between the per-platform adapters and the
// conversation flow. Adapters convert their inbound events into a call to
// handleMessage(identity, text, reply) and provide a reply function; the helpers
// here cover the bits every adapter needs (media → text, markdown stripping).
import { handleMessage } from './flows.js'
import { api } from './api.js'

export { handleMessage }

// Turn a downloaded media buffer into text via the API's vision/audio model.
// Returns '' on failure so the adapter can nudge the user to type instead.
export async function understandMedia(kind, buffer, mime) {
  const { text } = await api.media(kind, buffer.toString('base64'), mime)
  return (text || '').trim()
}

// The flows speak WhatsApp/Telegram-style *bold*/_italic_ markup. Telegram and
// WhatsApp render it natively; Signal (and any plain channel) does not, so strip
// the pairs to avoid showing literal * and _ characters.
export function stripMarkdown(t) {
  return String(t)
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')
}

// Friendly fallback when we can't read a photo / voice note.
export const mediaFallback = (kind) =>
  kind === 'image'
    ? "I couldn't read that image — could you type the details instead?"
    : "I couldn't understand that voice note — could you type it instead?"
