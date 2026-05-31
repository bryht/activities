import { Link } from 'react-router-dom'
import { useApi, activitiesQuery } from '../lib/api'
import { useReference } from '../context/Reference'
import ActivityCard from '../components/ActivityCard'
import TelegramButton from '../components/TelegramButton'
import KidGoMark from '../components/KidGoMark'

export default function Home() {
  const { groups } = useReference()
  const { data: activities, loading, error } = useApi(activitiesQuery({ sort: 'date' }))
  const upcoming = (activities || []).slice(0, 6)

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-brand-100 to-rose-50/40 px-4 pb-8 pt-8 text-center dark:from-slate-800 dark:to-slate-900 sm:px-6 md:pb-12 md:pt-14">
        <KidGoMark className="mx-auto mb-4 h-20 w-20 drop-shadow-sm md:h-24 md:w-24" />
        <h1 className="text-2xl font-extrabold leading-tight text-slate-900 dark:text-slate-50 sm:text-3xl md:text-4xl">
          Find playmates for your little one
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-slate-600 dark:text-slate-300 sm:max-w-md sm:text-base md:mt-4 md:max-w-xl md:text-lg">
          Post “I want to go play” in one sentence — KidGo matches families nearby, at a similar time, in the same stage.
        </p>
        <div className="mx-auto mt-5 flex max-w-xs flex-col gap-2 sm:mt-7 sm:max-w-md sm:flex-row sm:justify-center">
          <div className="sm:flex-1">
            <TelegramButton label="Post an activity" payload="post" />
          </div>
          <Link
            to="/activities"
            className="inline-block w-full rounded-full bg-white px-5 py-3 font-semibold text-brand-600 shadow-sm ring-1 ring-brand-100 transition hover:shadow-md dark:bg-slate-800 dark:text-brand-300 dark:ring-slate-700 sm:flex-1"
          >
            Browse activities
          </Link>
        </div>
      </section>

      {/* Stage chips */}
      <section className="px-4 py-5 sm:px-6 md:py-8">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Find by stage</h2>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 no-scrollbar sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-6">
          {groups.map((g) => (
            <Link
              key={g.id}
              to={`/activities?group=${g.id}`}
              className="flex min-w-[88px] flex-col items-center gap-1 rounded-2xl bg-white p-3 text-center shadow-sm ring-1 ring-slate-100 transition hover:shadow-md dark:bg-slate-800 dark:ring-slate-700 sm:min-w-0"
            >
              <span className="text-2xl">{g.emoji}</span>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{g.name}</span>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">{g.range}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Upcoming */}
      <section className="px-4 pb-6 sm:px-6 md:pb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Upcoming nearby</h2>
          <Link to="/activities" className="text-sm font-semibold text-brand-600 dark:text-brand-400">
            See all →
          </Link>
        </div>
        {loading && <p className="text-sm text-slate-400 dark:text-slate-500">Loading…</p>}
        {error && <p className="text-sm text-slate-400 dark:text-slate-500">Couldn’t load activities.</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {upcoming.map((a) => (
            <ActivityCard key={a.id} activity={a} />
          ))}
          {!loading && !error && upcoming.length === 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-500">No activities yet — be the first to post one!</p>
          )}
        </div>
      </section>
    </div>
  )
}
