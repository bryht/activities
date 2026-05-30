import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApi, activitiesQuery } from '../lib/api'
import { useReference } from '../context/Reference'
import ActivityCard from '../components/ActivityCard'
import ActivitiesMap from '../components/ActivitiesMap'
import ActivitiesCalendar from '../components/ActivitiesCalendar'

const DATE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
]

const VIEWS = [
  { id: 'list', label: '☰ List' },
  { id: 'map', label: '🗺️ Map' },
  { id: 'calendar', label: '📅 Calendar' },
]

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition ${
        active
          ? 'bg-brand-500 text-white ring-brand-500'
          : 'bg-white text-slate-600 ring-slate-200 hover:ring-brand-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:hover:ring-brand-400'
      }`}
    >
      {children}
    </button>
  )
}

export default function Activities() {
  const [params, setParams] = useSearchParams()
  const { groups, areas } = useReference()
  const [dateFilter, setDateFilter] = useState('all')
  const [group, setGroup] = useState(params.get('group') || 'all') // auto-highlight from query
  const [area, setArea] = useState('all')
  const [sort, setSort] = useState('date')
  const [view, setView] = useState(params.get('view') || 'list')

  // Calendar view is desktop-only — it's cramped on a phone. Track the viewport
  // so we can hide the toggle and fall back to the list on small screens.
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)') // matches Tailwind's < sm
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  const availableViews = isMobile ? VIEWS.filter((v) => v.id !== 'calendar') : VIEWS
  const effectiveView = isMobile && view === 'calendar' ? 'list' : view

  // keep the URL in sync so links like /activities?group=toddler&view=map stay shareable
  useEffect(() => {
    const next = {}
    if (group !== 'all') next.group = group
    if (effectiveView !== 'list') next.view = effectiveView
    setParams(next, { replace: true })
  }, [group, effectiveView, setParams])

  // Filtering and sorting happen server-side via query params.
  const { data, loading, error } = useApi(
    activitiesQuery({ group, area, date: dateFilter, sort }),
  )
  const results = data || []

  return (
    <div>
      <div className="sticky top-[57px] z-10 space-y-3 border-b border-rose-100 bg-rose-50/80 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 sm:px-6">
        {/* View switcher: List / Map / Calendar */}
        <div className="flex gap-1 rounded-full bg-white p-1 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700 sm:w-fit">
          {availableViews.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`flex-1 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition sm:flex-none ${
                effectiveView === v.id
                  ? 'bg-brand-500 text-white'
                  : 'text-slate-600 hover:text-brand-600 dark:text-slate-300 dark:hover:text-brand-300'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Date */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar md:flex-wrap md:overflow-visible">
          {DATE_FILTERS.map((d) => (
            <Chip key={d.id} active={dateFilter === d.id} onClick={() => setDateFilter(d.id)}>
              {d.label}
            </Chip>
          ))}
          <span className="mx-1 w-px self-stretch bg-slate-200 dark:bg-slate-700" />
          <Chip active={sort === 'area'} onClick={() => setSort(sort === 'date' ? 'area' : 'date')}>
            {sort === 'date' ? '↕ By date' : '↕ By area'}
          </Chip>
        </div>

        {/* Group */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar md:flex-wrap md:overflow-visible">
          <Chip active={group === 'all'} onClick={() => setGroup('all')}>
            All stages
          </Chip>
          {groups.map((g) => (
            <Chip key={g.id} active={group === g.id} onClick={() => setGroup(g.id)}>
              {g.emoji} {g.name}
            </Chip>
          ))}
        </div>

        {/* Area */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar md:flex-wrap md:overflow-visible">
          <Chip active={area === 'all'} onClick={() => setArea('all')}>
            All areas
          </Chip>
          {areas.map((ar) => (
            <Chip key={ar} active={area === ar} onClick={() => setArea(ar)}>
              📍 {ar}
            </Chip>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 sm:px-6">
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          {loading ? 'Loading…' : `${results.length} ${results.length === 1 ? 'activity' : 'activities'}`}
        </p>

        {!loading && error ? (
          <div className="rounded-2xl bg-white p-8 text-center text-slate-400 ring-1 ring-slate-100 dark:bg-slate-800 dark:text-slate-500 dark:ring-slate-700">
            <p className="text-3xl">🔍</p>
            <p className="mt-2 text-sm">Couldn’t load activities.</p>
          </div>
        ) : effectiveView === 'map' ? (
          <ActivitiesMap activities={results} />
        ) : effectiveView === 'calendar' ? (
          <ActivitiesCalendar activities={results} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((a) => (
              <ActivityCard key={a.id} activity={a} />
            ))}
            {!loading && results.length === 0 && (
              <div className="rounded-2xl bg-white p-8 text-center text-slate-400 ring-1 ring-slate-100 dark:bg-slate-800 dark:text-slate-500 dark:ring-slate-700 sm:col-span-2 lg:col-span-3">
                <p className="text-3xl">🔍</p>
                <p className="mt-2 text-sm">No activities match these filters yet.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
