// Build external links for an activity: a Google Maps search for the spot, and
// a downloadable .ics calendar file. Activities store only a start time
// (`when`) and an embedded spot (no street address), so we search Maps by name
// and assume a default duration for the calendar event. An .ics file is used
// (rather than a Google-only link) so it imports into Apple Calendar, Outlook
// and Google alike.
const DEFAULT_DURATION_HOURS = 2

/** Google Maps search link for a spot, biased to Maastricht. */
export function mapsUrl(spot, area) {
  const query = [spot?.name, area, 'Maastricht'].filter(Boolean).join(', ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

// iCalendar expects compact UTC timestamps: YYYYMMDDTHHMMSSZ.
function toCalendarDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

// Escape text for an iCalendar value per RFC 5545 (backslash, comma,
// semicolon and newlines are special).
function escapeIcs(text = '') {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** Build the raw .ics file contents for an activity. */
export function buildIcs(activity, spot) {
  const start = new Date(activity.when)
  const end = new Date(start.getTime() + DEFAULT_DURATION_HOURS * 60 * 60 * 1000)
  const location = [spot?.name, activity.area, 'Maastricht'].filter(Boolean).join(', ')
  const description = activity.notes || `A KidGo activity at ${spot?.name || activity.area}.`

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KidGo//Activities//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${activity.id}@kidgo`,
    `DTSTAMP:${toCalendarDate(new Date())}`,
    `DTSTART:${toCalendarDate(start)}`,
    `DTEND:${toCalendarDate(end)}`,
    `SUMMARY:${escapeIcs(`KidGo · ${activity.title}`)}`,
    `LOCATION:${escapeIcs(location)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
  ]
  if (activity.recurring) lines.push('RRULE:FREQ=WEEKLY')
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n')
}

/** A data: URL that downloads the activity as an .ics calendar file. */
export function icsDataUrl(activity, spot) {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(buildIcs(activity, spot))}`
}

/** Suggested filename for the downloaded .ics file. */
export function icsFileName(activity) {
  const slug = String(activity.title || 'activity')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `kidgo-${slug || activity.id}.ics`
}
