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

/** A stable local `YYYY-MM-DD` key for grouping activities by day. */
export function ymdKey(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

/** True when both dates fall on the same calendar day (local time). */
export function sameDay(a, b) {
  return ymdKey(a) === ymdKey(b)
}

/**
 * A 6×7 grid of Date objects covering the month containing `year`/`month`
 * (month is 0-indexed), padded to whole weeks starting on Monday. Used to lay
 * out the calendar month view.
 */
export function monthMatrix(year, month) {
  const first = new Date(year, month, 1)
  // JS getDay(): 0=Sun..6=Sat. Shift so Monday is column 0.
  const lead = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - lead)
  const weeks = []
  for (let w = 0; w < 6; w++) {
    const days = []
    for (let d = 0; d < 7; d++) {
      days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d))
    }
    weeks.push(days)
  }
  return weeks
}
