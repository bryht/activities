// Renders a "reach the KidGo bot" button for each configured chat platform.
// With a single platform it shows the action label (unchanged UX); with several
// it shows the platform names so the user picks their app. Deep links carry the
// intent where the platform allows: Telegram via ?start=<payload>, WhatsApp via a
// prefilled message mirroring the [ref:]/[manage:] tokens the bot parses. Signal
// has no prefill, so its button just opens a chat with the bot.
const TG_USER = import.meta.env.VITE_BOT_USERNAME || 'kidgo_bot'
const WA_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER || ''
const SIGNAL_NUMBER = import.meta.env.VITE_SIGNAL_NUMBER || ''

function waText(payload) {
  const ref = /^ref_([0-9a-f-]{36})$/i.exec(payload || '')
  if (ref) return `Hi KidGo! I'd like to join this activity. [ref:${ref[1]}]`
  const manage = /^manage_([0-9a-f-]{36})$/i.exec(payload || '')
  if (manage) return `Hi KidGo! Can I get a fresh manage link? [manage:${manage[1]}]`
  if (payload === 'post') return "Hi KidGo! I'd like to post an activity."
  if (payload === 'mine') return 'Hi KidGo! Show me my activities.'
  return 'Hi KidGo!'
}

function platforms(payload) {
  const out = [
    {
      key: 'telegram',
      name: 'Telegram',
      color: 'bg-sky-500 hover:bg-sky-600',
      href: `https://t.me/${TG_USER}${payload ? `?start=${encodeURIComponent(payload)}` : ''}`,
    },
  ]
  if (WA_NUMBER)
    out.push({
      key: 'whatsapp',
      name: 'WhatsApp',
      color: 'bg-emerald-500 hover:bg-emerald-600',
      href: `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(waText(payload))}`,
    })
  if (SIGNAL_NUMBER)
    out.push({
      key: 'signal',
      name: 'Signal',
      color: 'bg-indigo-500 hover:bg-indigo-600',
      href: `https://signal.me/#p/${SIGNAL_NUMBER}`,
    })
  return out
}

const PATHS = {
  telegram:
    'M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z',
  whatsapp:
    'M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zM6.6 20.013c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.518 5.26l-.999 3.648 3.97-.617zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z',
  signal:
    'M12 2C6.48 2 2 6.04 2 11c0 2.7 1.34 5.12 3.47 6.77L4.5 22l4.6-1.83c1.03.3 2.13.46 3.4.46 5.52 0 10-4.04 10-9S17.52 2 12 2z',
}

export default function PlatformButtons({ label = 'I want to come', payload, className = '', full = true }) {
  const list = platforms(payload)
  const multi = list.length > 1
  return (
    <div className={`flex ${full ? 'flex-col' : 'flex-wrap'} gap-2 ${className}`}>
      {list.map((p) => (
        <a
          key={p.key}
          href={p.href}
          target="_blank"
          rel="noreferrer"
          className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold text-white shadow-sm transition active:scale-[0.98] ${
            p.color
          } ${full ? 'w-full px-5 py-3' : 'px-4 py-2 text-sm'}`}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
            <path d={PATHS[p.key]} />
          </svg>
          {multi ? p.name : label}
        </a>
      ))}
    </div>
  )
}
