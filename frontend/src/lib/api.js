import { useEffect, useState } from 'react'
import { getToken } from './session'

// The API base is injected at build time. Defaults to a local dev server.
export const API_BASE =
  import.meta.env.VITE_API_BASE?.replace(/\/$/, '') || 'http://localhost:8080'

/** Bearer header for the current session token, or `{}` when signed out. */
function authHeaders() {
  const token = getToken()
  return token ? { authorization: `Bearer ${token}` } : {}
}

export async function apiGet(path) {
  // Sending the session token lets the API annotate responses with the viewer's
  // role (owner/participant), so lists and detail pages reflect "you".
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

/**
 * Authenticated write (PATCH/POST). Uses the session token unless one is passed
 * explicitly. Throws an Error whose message is the API's JSON `error`, if any.
 */
export async function apiSend(method, path, { body, token } = {}) {
  const headers = { ...authHeaders() }
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const msg = await res.json().then((j) => j.error).catch(() => null)
    throw new Error(msg || `${res.status} ${res.statusText}`)
  }
  return res.status === 204 ? null : res.json()
}

/**
 * Exchange a short manage code for a session token + target activity.
 * Returns `null` for an unknown code (404); the body otherwise (which may carry
 * `{ expired: true }`).
 */
export async function resolveLink(code) {
  const res = await fetch(`${API_BASE}/api/links/${encodeURIComponent(code)}`)
  if (res.status === 404) return null
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
