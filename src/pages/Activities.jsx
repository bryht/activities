import { useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ACTIVITIES } from '../data/activities'
import { GROUPS } from '../data/groups'
import { AREAS } from '../data/spots'
import { isToday, isThisWeek } from '../lib/datetime'
import ActivityCard from '../components/ActivityCard'

const DATE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
]

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition ${
        active
          ? 'bg-brand-500 text-white ring-brand-500'
          : 'bg-white text-slate-600 ring-slate-200 hover:ring-brand-200'
      }`}
    >
      {children}
    </button>
  )
}

export default function Activities() {
  const [params, setParams] = useSearchParams()
  const [dateFilter, setDateFilter] = useState('all')
  const [group, setGroup] = useState(params.get('group') || 'all') // auto-highlight from query
  const [area, setArea] = useState('all')
  const [sort, setSort] = useState('date')

  // keep the URL in sync so links like /activities?group=toddler stay shareable
  useEffect(() => {
    setParams(group === 'all' ? {} : { group }, { replace: true })
  }, [group, setParams])

  const results = useMemo(() => {
    let list = ACTIVITIES.filter((a) => {
      if (group !== 'all' && a.group !== group) return false
      if (area !== 'all' && a.area !== area) return false
      if (dateFilter === 'today' && !isToday(a.when)) return false
      if (dateFilter === 'week' && !isThisWeek(a.when)) return false
      return true
    })
    list = [...list].sort((a, b) =>
      sort === 'date' ? new Date(a.when) - new Date(b.when) : a.area.localeCompare(b.area),
    )
    return list
  }, [group, area, dateFilter, sort])

  return (
    <div>
      <div className="sticky top-[57px] z-10 space-y-3 border-b border-rose-100 bg-rose-50/80 px-4 py-3 backdrop-blur">
        {/* Date */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {DATE_FILTERS.map((d) => (
            <Chip key={d.id} active={dateFilter === d.id} onClick={() => setDateFilter(d.id)}>
              {d.label}
            </Chip>
          ))}
          <span className="mx-1 w-px self-stretch bg-slate-200" />
          <Chip active={sort === 'distance'} onClick={() => setSort(sort === 'date' ? 'distance' : 'date')}>
            {sort === 'date' ? '↕ By date' : '↕ By area'}
          </Chip>
        </div>

        {/* Group */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          <Chip active={group === 'all'} onClick={() => setGroup('all')}>
            All stages
          </Chip>
          {GROUPS.map((g) => (
            <Chip key={g.id} active={group === g.id} onClick={() => setGroup(g.id)}>
              {g.emoji} {g.name}
            </Chip>
          ))}
        </div>

        {/* Area */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          <Chip active={area === 'all'} onClick={() => setArea('all')}>
            All areas
          </Chip>
          {AREAS.map((ar) => (
            <Chip key={ar} active={area === ar} onClick={() => setArea(ar)}>
              📍 {ar}
            </Chip>
          ))}
        </div>
      </div>

      <div className="px-4 py-4">
        <p className="mb-3 text-sm text-slate-500">
          {results.length} {results.length === 1 ? 'activity' : 'activities'}
        </p>
        <div className="space-y-3">
          {results.map((a) => (
            <ActivityCard key={a.id} activity={a} />
          ))}
          {results.length === 0 && (
            <div className="rounded-2xl bg-white p-8 text-center text-slate-400 ring-1 ring-slate-100">
              <p className="text-3xl">🔍</p>
              <p className="mt-2 text-sm">No activities match these filters yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
