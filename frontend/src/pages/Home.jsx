import { Link } from 'react-router-dom'
import { useApi, activitiesQuery } from '../lib/api'
import { useReference } from '../context/Reference'
import ActivityCard from '../components/ActivityCard'
import WhatsAppButton from '../components/WhatsAppButton'
import KidGoMark from '../components/KidGoMark'

export default function Home() {
  const { groups } = useReference()
  const { data: activities, loading, error } = useApi(activitiesQuery({ sort: 'date' }))
  const upcoming = (activities || []).slice(0, 3)

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-brand-100 to-rose-50/40 px-4 pb-6 pt-8 text-center">
        <KidGoMark className="mx-auto mb-4 h-20 w-20 drop-shadow-sm" />
        <h1 className="text-2xl font-extrabold leading-tight text-slate-900">
          Find playmates for your little one
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-slate-600">
          Post “I want to go play” in one sentence — KidGo matches families nearby, at a similar time, in the same stage.
        </p>
        <div className="mx-auto mt-5 max-w-xs">
          <WhatsAppButton label="Post an activity" message="Hi KidGo! I'd like to post an activity." />
          <Link
            to="/activities"
            className="mt-2 inline-block w-full rounded-full bg-white px-5 py-3 font-semibold text-brand-600 shadow-sm ring-1 ring-brand-100"
          >
            Browse activities
          </Link>
        </div>
      </section>

      {/* Stage chips */}
      <section className="px-4 py-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">Find by stage</h2>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 no-scrollbar">
          {groups.map((g) => (
            <Link
              key={g.id}
              to={`/activities?group=${g.id}`}
              className="flex min-w-[88px] flex-col items-center gap-1 rounded-2xl bg-white p-3 text-center shadow-sm ring-1 ring-slate-100"
            >
              <span className="text-2xl">{g.emoji}</span>
              <span className="text-sm font-bold text-slate-800">{g.name}</span>
              <span className="text-[11px] text-slate-400">{g.range}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Upcoming */}
      <section className="px-4 pb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Upcoming nearby</h2>
          <Link to="/activities" className="text-sm font-semibold text-brand-600">
            See all →
          </Link>
        </div>
        {loading && <p className="text-sm text-slate-400">Loading…</p>}
        {error && <p className="text-sm text-slate-400">Couldn’t load activities.</p>}
        <div className="space-y-3">
          {upcoming.map((a) => (
            <ActivityCard key={a.id} activity={a} />
          ))}
          {!loading && !error && upcoming.length === 0 && (
            <p className="text-sm text-slate-400">No activities yet — be the first to post one!</p>
          )}
        </div>
      </section>
    </div>
  )
}
