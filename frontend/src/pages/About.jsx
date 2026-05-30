import { useReference } from '../context/Reference'
import WhatsAppButton from '../components/WhatsAppButton'
import KidGoMark from '../components/KidGoMark'

export default function About() {
  const { groups, spots } = useReference()
  return (
    <div className="px-4 py-6">
      <section className="rounded-2xl bg-gradient-to-b from-brand-100 to-white p-6 text-center shadow-sm ring-1 ring-slate-100">
        <KidGoMark className="mx-auto h-20 w-20 drop-shadow-sm" />
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight">
          <span className="text-slate-800">Kid</span>
          <span className="text-brand-600">Go</span>
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Help parents find playmates and activities for same-age kids in Maastricht.
        </p>
        <div className="mx-auto mt-5 max-w-xs">
          <WhatsAppButton label="Add the bot on WhatsApp" message="Hi KidGo! I'd like to join." />
        </div>
        {/* QR placeholder — real build would render the bot's QR (PRD §4.1, §8) */}
        <div className="mx-auto mt-4 grid h-32 w-32 place-items-center rounded-xl border-2 border-dashed border-brand-200 bg-white text-xs text-slate-400">
          Scan QR to register
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">How it works</h2>
        <div className="space-y-3">
          {[
            { icon: '✍️', title: 'Post in one sentence', body: '“Saturday 2pm, sandbox at Stadspark” — no forms.' },
            { icon: '⚡', title: 'Smart match', body: 'We find families nearby, at a similar time, in the same stage.' },
            { icon: '🔒', title: 'Safe by default', body: 'Contact details are shared only when both sides want to.' },
          ].map((s) => (
            <div key={s.title} className="flex gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
              <span className="text-2xl">{s.icon}</span>
              <div>
                <p className="font-bold text-slate-800">{s.title}</p>
                <p className="text-sm text-slate-500">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">Developmental stages</h2>
        <div className="grid grid-cols-1 gap-2">
          {groups.map((g) => (
            <div key={g.id} className={`flex items-center gap-3 rounded-xl px-4 py-3 ring-1 ${g.color}`}>
              <span className="text-xl">{g.emoji}</span>
              <span className="font-bold">{g.name}</span>
              <span className="ml-auto text-sm opacity-70">{g.range}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">Popular spots</h2>
        <div className="rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-100">
          {spots.map((s) => (
            <div key={s.id} className="flex items-center justify-between border-b border-slate-50 px-2 py-2.5 last:border-0">
              <div>
                <p className="font-semibold text-slate-800">{s.name}</p>
                <p className="text-xs text-slate-400">{s.type}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">📍 {s.area}</span>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-8 text-center text-xs text-slate-400">English · Maastricht 🇳🇱</p>
    </div>
  )
}
