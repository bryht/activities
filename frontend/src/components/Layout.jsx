import { NavLink, Link } from 'react-router-dom'
import KidGoMark from './KidGoMark'
import ThemeToggle from './ThemeToggle'

const tabs = [
  { to: '/', label: 'Home', icon: '🏠', end: true },
  { to: '/activities', label: 'Browse', icon: '🔍' },
  { to: '/about', label: 'About', icon: '💬' },
]

export default function Layout({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-rose-50/40 dark:bg-slate-900">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-rose-100 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <KidGoMark className="h-8 w-8" />
            <span className="text-xl font-extrabold tracking-tight">
              <span className="text-slate-800 dark:text-slate-100">Kid</span>
              <span className="text-brand-600 dark:text-brand-400">Go</span>
            </span>
          </Link>

          {/* Inline nav (tablet + desktop) */}
          <nav className="hidden items-center gap-1 md:flex">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  `rounded-full px-4 py-2 text-sm font-semibold transition ${
                    isActive
                      ? 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                  }`
                }
              >
                <span className="mr-1">{t.icon}</span>
                {t.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <span className="hidden rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-brand-600 dark:bg-brand-500/15 dark:text-brand-300 min-[400px]:inline-flex">📍 Maastricht</span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 pb-24 md:pb-12">{children}</main>

      {/* Bottom tab bar (mobile only) */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-rose-100 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 md:hidden">
        <div className="grid grid-cols-3">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition ${
                  isActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400 dark:text-slate-500'
                }`
              }
            >
              <span className="text-lg">{t.icon}</span>
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
