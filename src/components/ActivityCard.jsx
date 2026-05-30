import { Link } from 'react-router-dom'
import GroupBadge from './GroupBadge'
import { dayLabel, timeLabel } from '../lib/datetime'
import { groupById } from '../data/groups'
import { SPOTS } from '../data/spots'

export default function ActivityCard({ activity }) {
  const spot = SPOTS.find((s) => s.id === activity.spotId)
  return (
    <Link
      to={`/activities/${activity.id}`}
      className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 transition active:scale-[0.99] hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <GroupBadge groupId={activity.group} />
        {activity.recurring && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-600">
            🔁 Weekly
          </span>
        )}
      </div>

      <h3 className="mt-2 text-lg font-bold text-slate-900">{activity.title}</h3>

      <div className="mt-1 flex items-center gap-2 text-sm font-medium text-slate-600">
        <span className="text-brand-600">{dayLabel(activity.when)} · {timeLabel(activity.when)}</span>
        <span className="text-slate-300">•</span>
        <span>{spot?.name}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">📍 {activity.area}</span>
        {activity.tags.map((t) => (
          <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">#{t}</span>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
            {activity.host.name[0]}
          </span>
          <span>
            Hosted by <span className="font-semibold text-slate-700">{activity.host.name}</span>
          </span>
        </div>
        <span className="text-sm font-medium text-slate-500">
          👨‍👩‍👧 {activity.going.length}/{activity.capacity}
        </span>
      </div>
    </Link>
  )
}
