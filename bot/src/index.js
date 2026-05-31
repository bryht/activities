// KidGo Telegram bot — grammY long-polling transport + message router (PRD §5.1).
//
// Replaces the former WhatsApp/Baileys transport. The conversation logic lives
// in flows.js and is transport-agnostic — it only needs (identity, text, reply) —
// so this file is a thin adapter: it turns Telegram updates into handleMessage()
// calls and sends the replies back. Identity is the Telegram numeric user id,
// which the backend stores in its `phone` field as an opaque key (so other chat
// platforms can be added later without a schema change).
import { Bot } from 'grammy'
import pino from 'pino'
import { handleMessage } from './flows.js'
import { api } from './api.js'

const logger = pino({ level: process.env.LOG_LEVEL || 'silent' })
const TOKEN = process.env.TELEGRAM_BOT_TOKEN
if (!TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN is required — create a bot with @BotFather and set it in .env.')
  process.exit(1)
}

const bot = new Bot(TOKEN)

// Send a reply, preferring the *bold*/_italic_ Markdown the flows already use
// (it doubles as Telegram's legacy Markdown). If user-supplied content (e.g. an
// activity title with a stray * or _) makes Telegram reject the markup, fall
// back to plain text so the message still lands instead of being dropped.
const replyTo = (ctx) => async (text) => {
  try {
    await ctx.reply(text, { parse_mode: 'Markdown' })
  } catch {
    await ctx.reply(text)
  }
}

// /start carries website deep-link payloads (t.me/<bot>?start=<payload>):
//   ref_<uuid>     → join that exact activity (PRD §3.B)
//   manage_<uuid>  → re-issue a fresh manage link
//   post / mine    → jump straight into a menu action
// We translate the payload into the text the flows already understand, so
// flows.js needs no Telegram-specific knowledge.
bot.command('start', (ctx) => {
  const payload = (ctx.match || '').trim()
  const ref = payload.match(/^ref_([0-9a-f-]{36})$/i)
  const manage = payload.match(/^manage_([0-9a-f-]{36})$/i)
  let text = 'menu'
  if (ref) text = `[ref:${ref[1]}]`
  else if (manage) text = `[manage:${manage[1]}]`
  else if (payload === 'post') text = '1'
  else if (payload === 'mine') text = '3'
  return dispatch(ctx, text)
})

// Slash shortcuts shown in Telegram's command menu.
bot.command('menu', (ctx) => dispatch(ctx, 'menu'))
bot.command('help', (ctx) => dispatch(ctx, 'help'))

bot.on('message:text', (ctx) => dispatch(ctx, ctx.message.text))
bot.on('message:photo', (ctx) => dispatchMedia(ctx, 'image'))
bot.on(['message:voice', 'message:audio'], (ctx) => dispatchMedia(ctx, 'audio'))

// Run one inbound message through the conversation flow.
async function dispatch(ctx, text) {
  if (!text || !text.trim()) return
  try {
    await ctx.replyWithChatAction('typing').catch(() => {})
    await handleMessage(String(ctx.from.id), text, replyTo(ctx))
  } catch (err) {
    console.error('handler error:', err)
    await ctx
      .reply('Oops, something went wrong. Type *menu* to start over.', { parse_mode: 'Markdown' })
      .catch(() => {})
  }
}

// A captionless photo or a voice note: download it, turn it into text via the
// API's vision/audio model, then run that text through the normal flow. A photo
// caption is handled as plain text. Returns a friendly nudge if anything fails.
async function dispatchMedia(ctx, kind) {
  const caption = ctx.message.caption
  if (caption && caption.trim()) return dispatch(ctx, caption)
  try {
    await ctx.replyWithChatAction('typing').catch(() => {})
    const file = await ctx.getFile()
    const res = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`)
    const buffer = Buffer.from(await res.arrayBuffer())
    const mime =
      kind === 'image'
        ? 'image/jpeg'
        : ctx.message.voice?.mime_type || ctx.message.audio?.mime_type || 'audio/ogg'
    const { text } = await api.media(kind, buffer.toString('base64'), mime)
    await dispatch(ctx, (text || '').trim())
  } catch (err) {
    console.error('media error:', err)
    const note =
      kind === 'image'
        ? "I couldn't read that image — could you type the details instead?"
        : "I couldn't understand that voice note — could you type it instead?"
    await ctx.reply(note).catch(() => {})
  }
}

bot.catch((err) => {
  console.error('bot error:', err?.error || err)
})

// Best-effort command hints in Telegram's UI; never block startup on it.
bot.api
  .setMyCommands([
    { command: 'menu', description: 'Show the KidGo menu' },
    { command: 'help', description: 'How KidGo works' },
  ])
  .catch(() => {})

console.log('📡 KidGo Telegram bot starting (long polling)…')
bot.start({ onStart: () => console.log('✅ KidGo bot connected.') })
