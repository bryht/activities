import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { dayLabel, timeLabel } from '../lib/datetime'

// Maastricht city centre — the map opens here so the whole pin cluster is visible.
const MAASTRICHT = [50.851, 5.69]

// A branded pin showing how many activities sit at this spot. We build it as a
// divIcon (HTML) instead of an image marker to dodge the well-known Leaflet +
// bundler broken-marker-image problem, and to match KidGo's rounded style.
function countIcon(count) {
  return L.divIcon({
    className: '',
    html: `<div style="
      display:grid;place-items:center;width:32px;height:32px;
      border-radius:9999px;background:#e11d72;color:#fff;
      font:700 13px/1 ui-rounded,Nunito,sans-serif;
      box-shadow:0 1px 4px rgba(0,0,0,.35);border:2px solid #fff;
    ">${count}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  })
}

/**
 * Map view of the (already filtered) activities. Activities are grouped by spot
 * so each location gets a single pin; clicking it lists that spot's activities.
 */
export default function ActivitiesMap({ activities }) {
  // Group by spot, keeping only spots that have coordinates to plot.
  const pins = useMemo(() => {
    const bySpot = new Map()
    for (const a of activities) {
      const { lat, lon } = a.spot || {}
      if (typeof lat !== 'number' || typeof lon !== 'number') continue
      if (!bySpot.has(a.spotId)) bySpot.set(a.spotId, { spot: a.spot, items: [] })
      bySpot.get(a.spotId).items.push(a)
    }
    return [...bySpot.values()]
  }, [activities])

  const plotted = pins.reduce((n, p) => n + p.items.length, 0)
  const hidden = activities.length - plotted

  return (
    <div>
      <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
        <MapContainer
          center={MAASTRICHT}
          zoom={13}
          scrollWheelZoom={false}
          style={{ height: '70vh', minHeight: 360, width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {pins.map(({ spot, items }) => (
            <Marker key={spot.id} position={[spot.lat, spot.lon]} icon={countIcon(items.length)}>
              <Popup>
                <p className="text-sm font-bold text-slate-900">📍 {spot.name}</p>
                <p className="mb-2 text-xs text-slate-500">{spot.area}</p>
                <ul className="space-y-1.5">
                  {items.map((a) => (
                    <li key={a.id}>
                      <Link
                        to={`/activities/${a.id}`}
                        className="block rounded-lg px-1 py-0.5 text-sm text-brand-600 hover:bg-brand-50"
                      >
                        <span className="font-semibold">{a.title}</span>
                        <span className="block text-xs text-slate-500">
                          {dayLabel(a.when)} · {timeLabel(a.when)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      {hidden > 0 && (
        <p className="mt-2 text-xs text-slate-400">
          {hidden} {hidden === 1 ? 'activity is' : 'activities are'} at a spot without a map
          location and aren’t shown here.
        </p>
      )}
      {plotted === 0 && (
        <p className="mt-3 text-center text-sm text-slate-400">
          No activities to place on the map for these filters.
        </p>
      )}
    </div>
  )
}
