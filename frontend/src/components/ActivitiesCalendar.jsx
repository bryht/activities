import { useMemo, useState } from 'react'
import ActivityCard from './ActivityCard'
import { dayLabel, monthMatrix, sameDay, ymdKey } from '../lib/datetime'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_FMT = { month: 'long', year: 'numeric' }

/**
 * Calendar view of the (already filtered) activities.
 *  - Desktop (md+): a month grid; days with activities show a count, and
 *    clicking a day lists its activities beneath the grid.
 *  - Mobile: a scrollable agenda grouped by day (simpler to scan on a phone).
 */
export default function ActivitiesCalendar({ activities }) {
  // Group activities by local day once; every view reads from this map.
  const byDay = useMemo(() => {
    const m = new Map()
    for (const a of activities) {
      const key = ymdKey(a.when)
      if (!m.has(key)) m.set(key, [])
      m.get(key).push(a)
    }
    for (const list of m.values()) list.sort((x, y) => new Date(x.when) - new Date(y.when))
    return m
  }, [activities])

  // The earliest activity anchors the default month + selected day, so the
  // calendar opens on something with content rather than an empty page.
  const earliest = useMemo(() => {
    if (!activities.length) return new Date()
    return activities.reduce((min, a) => (new Date(a.when) < min ? new Date(a.when) : min), new Date(activities[0].when))
  }, [activities])

  const [cursor, setCursor] = useState(() => new Date(earliest.getFullYear(), earliest.getMonth(), 1))
  const [selected, setSelected] = useState(() => new Date(earliest))

  const weeks = monthMatrix(cursor.getFullYear(), cursor.getMonth())
  const today = new Date()
  const selectedList = byDay.get(ymdKey(selected)) || []

  const shiftMonth = (delta) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1))

  return (
    <div>
      {/* ---------- Desktop: month grid ---------- */}
      <div className="hidden md:block">
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() => shiftMonth(-1)}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-200 transition hover:ring-brand-200 dark:text-slate-300 dark:ring-slate-700 dark:hover:ring-brand-400"
          >
            ← Prev
          </button>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {cursor.toLocaleDateString('en-US', MONTH_FMT)}
          </h2>
          <button
            onClick={() => shiftMonth(1)}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-200 transition hover:ring-brand-200 dark:text-slate-300 dark:ring-slate-700 dark:hover:ring-brand-400"
          >
            Next →
          </button>
        </div>

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl bg-slate-200 ring-1 ring-slate-200 dark:bg-slate-700 dark:ring-slate-700">
          {WEEKDAYS.map((w) => (
            <div key={w} className="bg-rose-50 py-2 text-center text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {w}
            </div>
          ))}
          {weeks.flat().map((day) => {
            const inMonth = day.getMonth() === cursor.getMonth()
            const list = byDay.get(ymdKey(day)) || []
            const isSelected = sameDay(day, selected)
            const isToday = sameDay(day, today)
            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelected(day)}
                className={`flex min-h-[84px] flex-col items-start gap-1 p-2 text-left transition ${
                  inMonth ? 'bg-white dark:bg-slate-800' : 'bg-slate-50 dark:bg-slate-900'
                } ${isSelected ? 'ring-2 ring-inset ring-brand-400' : 'hover:bg-brand-50/50 dark:hover:bg-brand-500/10'}`}
              >
                <span
                  className={`grid h-6 w-6 place-items-center rounded-full text-sm ${
                    isToday
                      ? 'bg-brand-500 font-bold text-white'
                      : inMonth
                        ? 'text-slate-700 dark:text-slate-200'
                        : 'text-slate-300 dark:text-slate-600'
                  }`}
                >
                  {day.getDate()}
                </span>
                {list.length > 0 && (
                  <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-500/20 dark:text-brand-200">
                    {list.length} {list.length === 1 ? 'activity' : 'activities'}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Selected day's activities */}
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
            {selected.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </h3>
          {selectedList.length === 0 ? (
            <p className="rounded-2xl bg-white p-6 text-center text-sm text-slate-400 ring-1 ring-slate-100 dark:bg-slate-800 dark:text-slate-500 dark:ring-slate-700">
              No activities on this day.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {selectedList.map((a) => (
                <ActivityCard key={a.id} activity={a} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---------- Mobile: agenda ---------- */}
      <div className="space-y-5 md:hidden">
        {[...byDay.entries()]
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([key, list]) => (
            <div key={key}>
              <h3 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                {dayLabel(list[0].when)}
                <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
                  {new Date(list[0].when).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </h3>
              <div className="grid grid-cols-1 gap-3">
                {list.map((a) => (
                  <ActivityCard key={a.id} activity={a} />
                ))}
              </div>
            </div>
          ))}
        {byDay.size === 0 && (
          <p className="rounded-2xl bg-white p-6 text-center text-sm text-slate-400 ring-1 ring-slate-100 dark:bg-slate-800 dark:text-slate-500 dark:ring-slate-700">
            No activities match these filters yet.
          </p>
        )}
      </div>
    </div>
  )
}
