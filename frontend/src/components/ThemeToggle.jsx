import { useTheme } from '../lib/theme'

const OPTIONS = [
  { id: 'light', icon: '☀️', label: 'Light theme' },
  { id: 'system', icon: '🖥️', label: 'System theme' },
  { id: 'dark', icon: '🌙', label: 'Dark theme' },
]

// Segmented Light / System / Dark switcher shown in the header.
export default function ThemeToggle() {
  const [theme, setTheme] = useTheme()
  return (
    <div
      role="group"
      aria-label="Theme"
      className="flex items-center gap-0.5 rounded-full bg-slate-100 p-0.5 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700"
    >
      {OPTIONS.map((o) => {
        const active = theme === o.id
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => setTheme(o.id)}
            title={o.label}
            aria-pressed={active}
            className={`grid h-7 w-7 place-items-center rounded-full text-sm transition ${
              active
                ? 'bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-700 dark:ring-slate-600'
                : 'opacity-50 hover:opacity-100'
            }`}
          >
            <span aria-hidden="true">{o.icon}</span>
            <span className="sr-only">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
