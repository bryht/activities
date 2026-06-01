// Telegram adapter — grammY long polling (no public URL needed).
//
// Identity is the Telegram numeric user id: { platform: 'telegram', id }.
// Replies use legacy Markdown (which matches the flows' *bold*/_italic_), with a
// plain-text retry so a stray * or _ in user content can't drop a message.
import { Bot } from 'grammy'
import { handleMessage, understandMedia, mediaFallback } from '../core.js'

export function startTelegram({ token, logger }) {
  const bot = new Bot(token)

  const replyTo = (ctx) => async (text) => {
    try {
      await ctx.reply(text, { parse_mode: 'Markdown' })
    } catch {
      await ctx.reply(text)
    }
  }

  const identityOf = (ctx) => ({ platform: 'telegram', id: String(ctx.from.id) })

  async function dispatch(ctx, text) {
    if (!text || !text.trim()) return
    try {
      await ctx.replyWithChatAction('typing').catch(() => {})
      await handleMessage(identityOf(ctx), text, replyTo(ctx))
    } catch (err) {
      logger?.error?.({ err }, 'telegram handler error')
      await ctx
        .reply('Oops, something went wrong. Type *menu* to start over.', { parse_mode: 'Markdown' })
        .catch(() => {})
    }
  }

  // A captionless photo or a voice note: download it, turn it into text, then run
  // that text through the normal flow.
  async function dispatchMedia(ctx, kind) {
    const caption = ctx.message.caption
    if (caption && caption.trim()) return dispatch(ctx, caption)
    try {
      await ctx.replyWithChatAction('typing').catch(() => {})
      const file = await ctx.getFile()
      const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`)
      const buffer = Buffer.from(await res.arrayBuffer())
      const mime =
        kind === 'image'
          ? 'image/jpeg'
          : ctx.message.voice?.mime_type || ctx.message.audio?.mime_type || 'audio/ogg'
      await dispatch(ctx, await understandMedia(kind, buffer, mime))
    } catch (err) {
      logger?.error?.({ err }, 'telegram media error')
      await ctx.reply(mediaFallback(kind)).catch(() => {})
    }
  }

  // /start carries website deep-link payloads (t.me/<bot>?start=<payload>):
  //   ref_<uuid> / manage_<uuid> → join / refresh; post / mine → menu shortcuts.
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
  bot.command('menu', (ctx) => dispatch(ctx, 'menu'))
  bot.command('help', (ctx) => dispatch(ctx, 'help'))

  bot.on('message:text', (ctx) => dispatch(ctx, ctx.message.text))
  bot.on('message:photo', (ctx) => dispatchMedia(ctx, 'image'))
  bot.on(['message:voice', 'message:audio'], (ctx) => dispatchMedia(ctx, 'audio'))

  bot.catch((err) => logger?.error?.({ err: err?.error || err }, 'telegram bot error'))

  bot.api
    .setMyCommands([
      { command: 'menu', description: 'Show the KidGo menu' },
      { command: 'help', description: 'How KidGo works' },
    ])
    .catch(() => {})

  bot.start({ onStart: () => console.log('✅ Telegram connected (long polling).') })
  return bot
}
