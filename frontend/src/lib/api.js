import { useEffect, useState } from 'react'

// The API base is injected at build time. Defaults to a local dev server.
export const API_BASE =
  import.meta.env.VITE_API_BASE?.replace(/\/$/, '') || 'http://localhost:8080'

export async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

/** Generic data hook. `path` of `null` skips the fetch. */
export function useApi(path) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(!!path)

  useEffect(() => {
    if (!path) return
    let alive = true
    setLoading(true)
    apiGet(path)
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e) => alive && setError(e))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [path])

  return { data, error, loading }
}

/** Build `/api/activities?…` from the UI filter state. */
export function activitiesQuery({ group, area, date, sort } = {}) {
  const p = new URLSearchParams()
  if (group && group !== 'all') p.set('group', group)
  if (area && area !== 'all') p.set('area', area)
  if (date && date !== 'all') p.set('date', date)
  if (sort) p.set('sort', sort)
  const qs = p.toString()
  return `/api/activities${qs ? `?${qs}` : ''}`
}
