import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useApi, apiSend } from '../lib/api'
import { getExpiredToken } from '../lib/session'
import { dayLabel, timeLabel } from '../lib/datetime'
import { mapsUrl, calendarUrl } from '../lib/links'
import GroupBadge from '../components/GroupBadge'
import PlatformButtons from '../components/PlatformButtons'

export default function ActivityDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  // The session token (from a manage link) is attached automatically by apiGet,
  // so the response already carries our viewer role — no token in the URL.
  const expiredToken = getExpiredToken()

  const { data: fetched, loading, error } = useApi(`/api/activities/${id}`)

  // Keep a local copy so edits / new messages / cancel reflect without a refetch.
  const [activity, setActivity] = useState(null)
  useEffect(() => setActivity(fetched), [fetched])

  if (loading && !activity) {
    return <div className="p-8 text-center text-slate-400 dark:text-slate-500">Loading…</div>
  }
  if (error || !activity) {
    return (
      <div className="p-8 text-center text-slate-500 dark:text-slate-400">
        <p className="text-3xl">🤷</p>
        <p className="mt-2">Activity not found.</p>
        <Link to="/activities" className="mt-3 inline-block font-semibold text-brand-600 dark:text-brand-400">
          ← Back to browse
        </Link>
      </div>
    )
  }

  const spot = activity.spot
  const messages = activity.messages || []

  // viewer is set by the backend only when a valid token was supplied.
  const role = activity.viewer?.role || null
  const isOwner = role === 'owner'
  const joined = role === 'owner' || role === 'participant'
  const cancelled = activity.status === 'cancelled'

  return (
    <div className="px-4 sm:px-6">
      <div className="flex items-center gap-2 py-3">
        <button onClick={() => navigate(-1)} className="text-sm font-semibold text-brand-600 dark:text-brand-400">
          ← Back
        </button>
      </div>

      {cancelled && (
        <div className="mb-4 rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30">
          ⚠️ This activity has been cancelled.
        </div>
      )}

      {/* Expired manage link: offer a one-tap refresh via the bot instead of
          silently dropping the parent to the public view. */}
      {expiredToken && !joined && (
        <div className="mb-4 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/30">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            ⏰ Your manage link expired
          </p>
          <p className="mt-1 text-sm text-amber-700/90 dark:text-amber-200/80">
            Tap below and the KidGo bot will send you a fresh one for this activity.
          </p>
          <div className="mt-3">
            <PlatformButtons
              full={false}
              label="Get a fresh link 🔑"
              payload={`manage_${activity.id}`}
            />
          </div>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-3 lg:gap-6">
        {/* Main column */}
        <div className="space-y-4 lg:col-span-2">
          {/* Header card */}
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:ring-slate-700">
            <div className="flex items-center justify-between">
              <GroupBadge groupId={activity.group} showRange size="lg" />
              {activity.recurring && (
                <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                  🔁 Weekly
                </span>
              )}
            </div>
            <h1 className="mt-3 text-2xl font-extrabold text-slate-900 dark:text-slate-100 sm:text-3xl">{activity.title}</h1>

            <dl className="mt-4 space-y-2 text-sm">
              <Row icon="🗓️" label={`${dayLabel(activity.when)} · ${timeLabel(activity.when)}`} />
              <Row
                icon="📍"
                label={`${spot?.name} — ${activity.area} (${spot?.type})`}
                href={mapsUrl(spot, activity.area)}
              />
              <Row icon="👨‍👩‍👧" label={`${activity.going.length} of ${activity.capacity} families going`} />
            </dl>

            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={calendarUrl(activity)}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              >
                🗓️ Add to calendar
              </a>
              <a
                href={mapsUrl(spot, activity.area)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              >
                📍 Open in Maps
              </a>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {activity.tags.map((t) => (
                <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  #{t}
                </span>
              ))}
            </div>

            {activity.notes && (
              <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-slate-600 dark:bg-slate-700/50 dark:text-slate-300">{activity.notes}</p>
            )}
          </div>

          {/* Owner manage panel — edit / cancel (PRD §4.4) */}
          {isOwner && !cancelled && <OwnerPanel activity={activity} onChange={setActivity} />}

          {/* Participant panel — leave the activity */}
          {role === 'participant' && !cancelled && (
            <ParticipantPanel activity={activity} onLeft={() => navigate('/activities')} />
          )}

          {/* Host */}
          <section>
            <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:ring-slate-700">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-100 text-lg font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-200">
                {activity.host.name[0]}
              </span>
              <div>
                <p className="font-bold text-slate-800 dark:text-slate-100">{activity.host.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Host{activity.host.child ? ` · child ${activity.host.child}` : ''}{' '}
                  <GroupBadge groupId={activity.host.childGroup} />
                </p>
              </div>
            </div>
          </section>

          {/* Going */}
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Who's going</h2>
            <div className="flex flex-wrap gap-2">
              {activity.going.map((n) => (
                <span key={n} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm text-slate-600 ring-1 ring-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-200">
                    {n[0]}
                  </span>
                  {n}
                </span>
              ))}
            </div>
          </section>

          {/* Messages (PRD §4.4) — owners & participants can post via their token. */}
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Messages</h2>
            <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:ring-slate-700">
              {messages.length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500">No messages yet — say hi 👋</p>}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      m.mine
                        ? 'bg-brand-500 text-white'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {!m.mine && <span className="mb-0.5 block text-xs font-semibold opacity-70">{m.from}</span>}
                    {m.text}
                  </div>
                </div>
              ))}

              {joined ? (
                <MessageComposer activity={activity} onChange={setActivity} />
              ) : (
                <p className="pt-1 text-xs text-slate-400 dark:text-slate-500">Join in Telegram to leave a message.</p>
              )}
            </div>
          </section>
        </div>

        {/* Sidebar (tablet/desktop) — CTA */}
        <aside className="mt-4 lg:col-span-1 lg:mt-0">
          <div className="space-y-4 lg:sticky lg:top-[73px]">
            {/* Desktop CTA card */}
            <div className="hidden rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:ring-slate-700 lg:block">
              <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-700 dark:text-slate-200">{activity.going.length} of {activity.capacity}</span> families going
              </p>
              {joined ? <JoinedNote role={role} /> : <PlatformButtons label="I want to come 🙋" payload={`ref_${activity.id}`} />}
            </div>
          </div>
        </aside>
      </div>

      {/* The fixed bottom CTA is only for people who haven't joined yet. */}
      {!joined && (
        <>
          <div className="h-20 lg:hidden" aria-hidden="true" />
          <div className="fixed inset-x-0 bottom-[57px] z-10 mx-auto max-w-2xl border-t border-rose-100 bg-white/95 p-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 md:bottom-0 lg:hidden">
            <PlatformButtons label="I want to come 🙋" payload={`ref_${activity.id}`} />
          </div>
        </>
      )}
    </div>
  )
}

/** Small chip telling a joined user their role (replaces the join button). */
function JoinedNote({ role }) {
  return (
    <div className="rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
      {role === 'owner' ? "✅ You're hosting this" : "✅ You're going"}
    </div>
  )
}

/** Participant control: leave an activity you've joined. */
function ParticipantPanel({ activity, onLeft }) {
  const [leaving, setLeaving] = useState(false)

  async function leave() {
    if (!window.confirm('Leave this activity? You can rejoin later from Telegram.')) return
    setLeaving(true)
    try {
      await apiSend('POST', `/api/activities/${activity.id}/leave`)
      onLeft()
    } catch (e) {
      window.alert(e.message)
      setLeaving(false)
    }
  }

  return (
    <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:ring-slate-700">
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">✅ You're going to this</p>
      <button
        onClick={leave}
        disabled={leaving}
        className="rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold text-rose-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-rose-50 disabled:opacity-60 dark:bg-slate-800 dark:text-rose-400 dark:ring-slate-600 dark:hover:bg-slate-700"
      >
        {leaving ? 'Leaving…' : '🚪 Leave'}
      </button>
    </div>
  )
}

/** Owner-only edit + cancel controls. */
function OwnerPanel({ activity, onChange }) {
  const [editing, setEditing] = useState(false)

  async function cancelActivity() {
    if (!window.confirm('Cancel this activity? Everyone going will lose it from browse.')) return
    try {
      await apiSend('POST', `/api/activities/${activity.id}/cancel`)
      onChange({ ...activity, status: 'cancelled' })
    } catch (e) {
      window.alert(e.message)
    }
  }

  return (
    <div className="rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-100 dark:bg-brand-500/10 dark:ring-brand-500/20">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-brand-700 dark:text-brand-300">🛠️ You host this activity</p>
        {!editing && (
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(true)}
              className="rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold text-brand-700 shadow-sm transition hover:bg-brand-100 dark:bg-slate-800 dark:text-brand-300 dark:hover:bg-slate-700"
            >
              ✏️ Edit
            </button>
            <button
              onClick={cancelActivity}
              className="rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold text-rose-600 shadow-sm transition hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              🗑️ Cancel
            </button>
          </div>
        )}
      </div>
      {editing && (
        <EditForm
          activity={activity}
          onDone={(updated) => {
            if (updated) onChange(updated)
            setEditing(false)
          }}
        />
      )}
    </div>
  )
}

/** The inline edit form. Sends only changed fields as a PATCH. */
function EditForm({ activity, onDone }) {
  const { data: spots } = useApi('/api/spots')
  const [form, setForm] = useState({
    title: activity.title,
    when: toLocalInput(activity.when),
    spotId: activity.spotId,
    capacity: activity.capacity,
    tags: (activity.tags || []).join(', '),
    notes: activity.notes || '',
    recurring: activity.recurring,
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function save() {
    setSaving(true)
    setErr(null)
    try {
      const body = {
        title: form.title.trim(),
        when: new Date(form.when).toISOString(),
        spotId: form.spotId,
        capacity: Number(form.capacity),
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        notes: form.notes.trim(),
        recurring: form.recurring,
      }
      const updated = await apiSend('PATCH', `/api/activities/${activity.id}`, { body })
      onDone(updated)
    } catch (e) {
      setErr(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 space-y-3">
      <Field label="Title">
        <input className={inputClass} value={form.title} onChange={set('title')} />
      </Field>
      <Field label="Date & time">
        <input type="datetime-local" className={inputClass} value={form.when} onChange={set('when')} />
      </Field>
      <Field label="Spot">
        <select className={inputClass} value={form.spotId} onChange={set('spotId')}>
          {(spots || []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} — {s.area}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Capacity">
          <input type="number" min="1" className={inputClass} value={form.capacity} onChange={set('capacity')} />
        </Field>
        <Field label="Weekly?">
          <label className="flex h-[42px] items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={form.recurring} onChange={set('recurring')} className="h-4 w-4" />
            Repeats weekly
          </label>
        </Field>
      </div>
      <Field label="Tags (comma-separated)">
        <input className={inputClass} value={form.tags} onChange={set('tags')} placeholder="sandbox, outdoor" />
      </Field>
      <Field label="Notes">
        <textarea rows="2" className={inputClass} value={form.notes} onChange={set('notes')} />
      </Field>

      {err && <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{err}</p>}

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button
          onClick={() => onDone(null)}
          disabled={saving}
          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          Discard
        </button>
      </div>
    </div>
  )
}

/** Message input for owners & participants. */
function MessageComposer({ activity, onChange }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState(null)

  async function send(e) {
    e.preventDefault()
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    setErr(null)
    try {
      const messages = await apiSend('POST', `/api/activities/${activity.id}/messages`, {
        body: { body },
      })
      onChange({ ...activity, messages })
      setText('')
    } catch (e) {
      setErr(e.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={send} className="pt-2">
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a message…"
          className="flex-1 rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-700 outline-none ring-1 ring-transparent focus:ring-brand-300 dark:bg-slate-700 dark:text-slate-100"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
        >
          Send
        </button>
      </div>
      {err && <p className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-400">{err}</p>}
    </form>
  )
}

const inputClass =
  'w-full rounded-xl bg-white px-3 py-2.5 text-sm text-slate-800 outline-none ring-1 ring-slate-200 focus:ring-brand-400 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-600'

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</span>
      {children}
    </label>
  )
}

/** ISO → `YYYY-MM-DDTHH:mm` in local time, for a `datetime-local` input. */
function toLocalInput(iso) {
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function Row({ icon, label, href }) {
  const inner = (
    <>
      <span>{icon}</span>
      <span className="font-medium">{label}</span>
    </>
  )
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="flex items-start gap-2 text-slate-600 underline-offset-2 transition hover:text-brand-600 hover:underline dark:text-slate-300 dark:hover:text-brand-400"
      >
        {inner}
      </a>
    )
  }
  return <div className="flex items-start gap-2 text-slate-600 dark:text-slate-300">{inner}</div>
}
