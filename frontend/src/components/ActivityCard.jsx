import { Link } from 'react-router-dom'
import GroupBadge from './GroupBadge'
import { dayLabel, timeLabel } from '../lib/datetime'

// The API embeds `spot` and `host` in each activity, so the card needs no lookups.
export default function ActivityCard({ activity }) {
  const spotName = activity.spot?.name || ''
  return (
    <Link
      to={`/activities/${activity.id}`}
      className="flex h-full flex-col rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 transition active:scale-[0.99] hover:shadow-md dark:bg-slate-800 dark:ring-slate-700 dark:hover:shadow-black/40"
    >
      <div className="flex items-center justify-between">
        <GroupBadge groupId={activity.group} />
        <div className="flex items-center gap-1.5">
          {/* Set when the browse list is fetched with a valid session token. */}
          {activity.viewer && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
              {activity.viewer.role === 'owner' ? '🛠️ Hosting' : '✅ Going'}
            </span>
          )}
          {activity.recurring && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
              🔁 Weekly
            </span>
          )}
        </div>
      </div>

      <h3 className="mt-2 text-lg font-bold text-slate-900 dark:text-slate-100">{activity.title}</h3>

      <div className="mt-1 flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
        <span className="text-brand-600 dark:text-brand-400">{dayLabel(activity.when)} · {timeLabel(activity.when)}</span>
        <span className="text-slate-300 dark:text-slate-600">•</span>
        <span>{spotName}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">📍 {activity.area}</span>
        {activity.tags.map((t) => (
          <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">#{t}</span>
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-700">
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-200">
            {activity.host.name[0]}
          </span>
          <span>
            Hosted by <span className="font-semibold text-slate-700 dark:text-slate-200">{activity.host.name}</span>
          </span>
        </div>
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
          👨‍👩‍👧 {activity.going.length}/{activity.capacity}
        </span>
      </div>
    </Link>
  )
}
