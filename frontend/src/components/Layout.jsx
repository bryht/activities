import { NavLink, Link } from 'react-router-dom'
import KidGoMark from './KidGoMark'

const tabs = [
  { to: '/', label: 'Home', icon: '🏠', end: true },
  { to: '/activities', label: 'Browse', icon: '🔍' },
  { to: '/about', label: 'About', icon: '💬' },
]

export default function Layout({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-rose-50/40">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-rose-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <KidGoMark className="h-8 w-8" />
            <span className="text-xl font-extrabold tracking-tight">
              <span className="text-slate-800">Kid</span>
              <span className="text-brand-600">Go</span>
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
                      ? 'bg-brand-50 text-brand-600'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                  }`
                }
              >
                <span className="mr-1">{t.icon}</span>
                {t.label}
              </NavLink>
            ))}
          </nav>

          <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-brand-600">📍 Maastricht</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 pb-24 md:pb-12">{children}</main>

      {/* Bottom tab bar (mobile only) */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-rose-100 bg-white/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-3">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition ${
                  isActive ? 'text-brand-600' : 'text-slate-400'
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
