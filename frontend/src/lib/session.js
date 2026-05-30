// A lightweight "magic-link session": the bot's manage link carries a 1-hour,
// user-scoped token. We stash it so the whole site recognises the parent for
// that hour — not just the one activity page they opened.
//
// The token is `<userId>.<expiryUnix>.<sig>`, so we read the expiry straight
// out of it (no separate bookkeeping) and never send an expired one.
const KEY = 'kidgo.token'

/** Milliseconds-since-epoch when this token expires (0 if unparseable). */
function expiryMs(token) {
  const exp = Number(token?.split('.')[1])
  return Number.isFinite(exp) ? exp * 1000 : 0
}

/** Persist a token captured from a `?token=` link. */
export function saveToken(token) {
  if (token) localStorage.setItem(KEY, token)
}

/** The current token if it exists and hasn't expired, else `null`. */
export function getToken() {
  const t = localStorage.getItem(KEY)
  return t && expiryMs(t) > Date.now() ? t : null
}

/**
 * A stored-but-expired token, if any — used to show the "get a fresh link"
 * prompt instead of silently dropping the parent back to the public view.
 */
export function getExpiredToken() {
  const t = localStorage.getItem(KEY)
  return t && expiryMs(t) <= Date.now() ? t : null
}

/** The signed-in user's id, when a valid token is present. */
export function currentUserId() {
  return getToken()?.split('.')[0] || null
}

export function clearToken() {
  localStorage.removeItem(KEY)
}

/**
 * On a fresh page load, capture a `?token=` from the URL into storage and strip
 * it from the address bar — so the link isn't accidentally re-shared and the
 * URL stays clean. Call once, before the app renders.
 */
export function captureTokenFromUrl() {
  const url = new URL(window.location.href)
  const token = url.searchParams.get('token')
  if (!token) return
  saveToken(token)
  url.searchParams.delete('token')
  window.history.replaceState({}, '', url.pathname + url.search + url.hash)
}
