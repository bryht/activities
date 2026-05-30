import { useCallback, useEffect, useState } from 'react'

// Theme override: 'system' follows the OS, 'light'/'dark' force a mode.
// The choice is persisted in localStorage and applied by toggling `.dark` on
// <html> (Tailwind's class strategy). An inline script in index.html applies it
// before first paint; this module keeps it in sync while the app runs.
const STORAGE_KEY = 'kidgo-theme'

export const THEMES = ['system', 'light', 'dark']

export function getStoredTheme() {
  try {
    const t = localStorage.getItem(STORAGE_KEY)
    return t === 'light' || t === 'dark' ? t : 'system'
  } catch {
    return 'system'
  }
}

function prefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Whether the given theme resolves to dark right now. */
export function resolveDark(theme) {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return prefersDark()
}

/** Toggle the `.dark` class and keep the browser chrome colour in sync. */
export function applyTheme(theme) {
  const dark = resolveDark(theme)
  document.documentElement.classList.toggle('dark', dark)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#0f172a' : '#fb7185')
}

function storeTheme(theme) {
  try {
    if (theme === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* ignore (e.g. storage disabled) */
  }
}

/** React state for the theme: persists the choice and applies it live. */
export function useTheme() {
  const [theme, setTheme] = useState(getStoredTheme)

  // Apply on change.
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // While following the system, react to OS appearance changes.
  useEffect(() => {
    if (theme !== 'system') return undefined
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  const update = useCallback((next) => {
    storeTheme(next)
    setTheme(next)
  }, [])

  return [theme, update]
}
