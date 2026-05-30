// Build external links for an activity: a Google Maps search for the spot, and
// a "add to Google Calendar" template link. Activities store only a start time
// (`when`) and an embedded spot (no street address), so we search Maps by name
// and assume a default duration for the calendar event.
const DEFAULT_DURATION_HOURS = 2

/** Google Maps search link for a spot, biased to Maastricht. */
export function mapsUrl(spot, area) {
  const query = [spot?.name, area, 'Maastricht'].filter(Boolean).join(', ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

// Google Calendar expects compact UTC timestamps: YYYYMMDDTHHMMSSZ.
function toCalendarDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** "Add to Google Calendar" template link for an activity. */
export function googleCalendarUrl(activity, spot) {
  const start = new Date(activity.when)
  const end = new Date(start.getTime() + DEFAULT_DURATION_HOURS * 60 * 60 * 1000)
  const location = [spot?.name, activity.area, 'Maastricht'].filter(Boolean).join(', ')
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `KidGo · ${activity.title}`,
    dates: `${toCalendarDate(start)}/${toCalendarDate(end)}`,
    location,
    details: activity.notes || `A KidGo activity at ${spot?.name || activity.area}.`,
  })
  if (activity.recurring) params.set('recur', 'RRULE:FREQ=WEEKLY')
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
