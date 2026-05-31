// "I want to come" continues the flow in Telegram (PRD §3.B, §5.2): open a
// t.me deep link to the bot. An optional `payload` rides in ?start=<payload>
// and the bot turns it back into the right action (join a [ref:], refresh a
// [manage:] link, or jump into a menu shortcut like post/mine).
const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME || 'kidgo_bot'

export default function TelegramButton({ label = 'I want to come', payload, className = '', full = true }) {
  const href = `https://t.me/${BOT_USERNAME}${payload ? `?start=${encodeURIComponent(payload)}` : ''}`
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-sky-500 font-semibold text-white shadow-sm transition active:scale-[0.98] hover:bg-sky-600 ${
        full ? 'w-full px-5 py-3' : 'px-4 py-2 text-sm'
      } ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
        <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
      </svg>
      {label}
    </a>
  )
}
