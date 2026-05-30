import { NavLink, Link } from 'react-router-dom'

const tabs = [
  { to: '/', label: 'Home', icon: '🏠', end: true },
  { to: '/activities', label: 'Browse', icon: '🔍' },
  { to: '/about', label: 'About', icon: '💬' },
]

export default function Layout({ children }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-rose-50/40">
      {/* Top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-rose-100 bg-white/90 px-4 py-3 backdrop-blur">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-2xl">🧸</span>
          <span className="text-xl font-extrabold tracking-tight text-brand-600">KidGo</span>
        </Link>
        <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-brand-600">📍 Maastricht</span>
      </header>

      <main className="flex-1 pb-24">{children}</main>

      {/* Bottom tab bar (mobile-first) */}
      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-rose-100 bg-white/95 backdrop-blur">
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
