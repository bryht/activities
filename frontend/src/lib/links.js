// External links for an activity: a Google Maps search for the spot, and the
// backend's downloadable .ics calendar file. Spots have no stored street
// address, so Maps is searched by name. The calendar file is served by the API
// (Content-Type: text/calendar, inline) rather than built as a data: URL — iOS
// Safari only opens the native "Add to Calendar" sheet for a real served file.
import { API_BASE } from './api'

/** Google Maps search link for a spot, biased to Maastricht. */
export function mapsUrl(spot, area) {
  const query = [spot?.name, area, 'Maastricht'].filter(Boolean).join(', ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

/** API endpoint that serves the activity as an .ics calendar file. */
export function calendarUrl(activity) {
  return `${API_BASE}/api/activities/${activity.id}/calendar.ics`
}
