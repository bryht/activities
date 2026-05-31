// Thin client over the KidGo REST API. Node 20+ has global fetch.
const BASE = (process.env.KIDGO_API_BASE || 'http://localhost:8080').replace(/\/$/, '')

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 404) return null
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${method} ${path} → ${res.status} ${text}`)
  }
  return res.status === 204 ? null : res.json()
}

export const api = {
  groups: () => req('GET', '/api/groups'),
  spots: () => req('GET', '/api/spots'),
  userByPhone: (phone) => req('GET', `/api/users/by-phone/${phone}`),
  upsertUser: (user) => req('POST', '/api/users', user),
  listActivities: (qs = '') => req('GET', `/api/activities${qs}`),
  activity: (id) => req('GET', `/api/activities/${id}`),
  myActivities: (userId) => req('GET', `/api/users/${userId}/activities`),
  createActivity: (a) => req('POST', '/api/activities', a),
  join: (id, userId) => req('POST', `/api/activities/${id}/join`, { userId }),
  createLinks: (userId, activityIds) => req('POST', '/api/links', { userId, activityIds }),
  intent: (text) => req('POST', '/api/nlu/intent', { text }),
  postFill: (draft, message) => req('POST', '/api/nlu/post-fill', { draft, message }),
}
