const DAY = 24 * 60 * 60 * 1000

export function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export function dayLabel(iso) {
  const d = new Date(iso)
  const today = startOfToday()
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - today) / DAY)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff > 1 && diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' })
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function timeLabel(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function isToday(iso) {
  return dayLabel(iso) === 'Today'
}

export function isThisWeek(iso) {
  const today = startOfToday()
  const diff = (new Date(new Date(iso).setHours(0, 0, 0, 0)) - today) / DAY
  return diff >= 0 && diff < 7
}
