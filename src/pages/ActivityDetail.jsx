import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { activityById, ACTIVITIES } from '../data/activities'
import { SPOTS } from '../data/spots'
import { dayLabel, timeLabel } from '../lib/datetime'
import GroupBadge from '../components/GroupBadge'
import WhatsAppButton from '../components/WhatsAppButton'
import ActivityCard from '../components/ActivityCard'

export default function ActivityDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const activity = activityById(id)

  const [joined, setJoined] = useState(false)
  const [messages, setMessages] = useState(activity?.messages ?? [])
  const [draft, setDraft] = useState('')

  if (!activity) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p className="text-3xl">🤷</p>
        <p className="mt-2">Activity not found.</p>
        <Link to="/activities" className="mt-3 inline-block font-semibold text-brand-600">
          ← Back to browse
        </Link>
      </div>
    )
  }

  const spot = SPOTS.find((s) => s.id === activity.spotId)

  // Smart match (PRD §4.5): same city, similar time/area/stage, excluding this one.
  const suggestions = ACTIVITIES.filter(
    (a) => a.id !== activity.id && (a.area === activity.area || a.group === activity.group),
  ).slice(0, 2)

  const sendMessage = () => {
    if (!draft.trim()) return
    setMessages([...messages, { from: 'You', text: draft.trim(), mine: true }])
    setDraft('')
  }

  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-3">
        <button onClick={() => navigate(-1)} className="text-sm font-semibold text-brand-600">
          ← Back
        </button>
      </div>

      {/* Header card */}
      <div className="px-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <div className="flex items-center justify-between">
            <GroupBadge groupId={activity.group} showRange size="lg" />
            {activity.recurring && (
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-600">
                🔁 Weekly
              </span>
            )}
          </div>
          <h1 className="mt-3 text-2xl font-extrabold text-slate-900">{activity.title}</h1>

          <dl className="mt-4 space-y-2 text-sm">
            <Row icon="🗓️" label={`${dayLabel(activity.when)} · ${timeLabel(activity.when)}`} />
            <Row icon="📍" label={`${spot?.name} — ${activity.area} (${spot?.type})`} />
            <Row icon="👨‍👩‍👧" label={`${activity.going.length} of ${activity.capacity} families going`} />
          </dl>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {activity.tags.map((t) => (
              <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                #{t}
              </span>
            ))}
          </div>

          {activity.notes && (
            <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-slate-600">{activity.notes}</p>
          )}
        </div>
      </div>

      {/* Host */}
      <section className="px-4 pt-4">
        <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-100 text-lg font-bold text-brand-700">
            {activity.host.name[0]}
          </span>
          <div>
            <p className="font-bold text-slate-800">{activity.host.name}</p>
            <p className="text-sm text-slate-500">
              Host · child {activity.host.child} <GroupBadge groupId={activity.host.childGroup} />
            </p>
          </div>
        </div>
      </section>

      {/* Going */}
      <section className="px-4 pt-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Who's going</h2>
        <div className="flex flex-wrap gap-2">
          {activity.going.map((n) => (
            <span key={n} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm text-slate-600 ring-1 ring-slate-100">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700">
                {n[0]}
              </span>
              {n}
            </span>
          ))}
          {joined && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-semibold text-emerald-700">
              ✓ You
            </span>
          )}
        </div>
      </section>

      {/* Messages (PRD §4.4) */}
      <section className="px-4 pt-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Messages</h2>
        <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
          {messages.length === 0 && <p className="text-sm text-slate-400">No messages yet — say hi 👋</p>}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  m.mine ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {!m.mine && <span className="mb-0.5 block text-xs font-semibold opacity-70">{m.from}</span>}
                {m.text}
              </div>
            </div>
          ))}

          {joined ? (
            <div className="mt-2 flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Leave a message…"
                className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm outline-none focus:border-brand-400"
              />
              <button
                onClick={sendMessage}
                className="rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white"
              >
                Send
              </button>
            </div>
          ) : (
            <p className="pt-1 text-xs text-slate-400">Join the activity to leave a message.</p>
          )}
        </div>
      </section>

      {/* Smart match */}
      {suggestions.length > 0 && (
        <section className="px-4 pt-5">
          <h2 className="mb-2 flex items-center gap-1 text-sm font-bold uppercase tracking-wide text-slate-400">
            ⚡ You might also like
          </h2>
          <div className="space-y-3">
            {suggestions.map((a) => (
              <ActivityCard key={a.id} activity={a} />
            ))}
          </div>
        </section>
      )}

      {/* Sticky join CTA */}
      <div className="fixed inset-x-0 bottom-[57px] z-10 mx-auto max-w-md border-t border-rose-100 bg-white/95 p-3 backdrop-blur">
        {joined ? (
          <WhatsAppButton
            label="Continue in WhatsApp"
            message={`Hi KidGo! I joined "${activity.title}" at ${spot?.name}.`}
          />
        ) : (
          <button
            onClick={() => setJoined(true)}
            className="w-full rounded-full bg-brand-500 px-5 py-3 font-semibold text-white shadow-sm transition active:scale-[0.98] hover:bg-brand-600"
          >
            I want to come 🙋
          </button>
        )}
      </div>
    </div>
  )
}

function Row({ icon, label }) {
  return (
    <div className="flex items-start gap-2 text-slate-600">
      <span>{icon}</span>
      <span className="font-medium">{label}</span>
    </div>
  )
}
