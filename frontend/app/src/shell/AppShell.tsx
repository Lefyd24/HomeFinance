import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { PRIMARY_NAV_ITEMS, MORE_NAV_ICON as MoreIcon } from './NavItems'

export function AppShell() {
  const { logout } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row bg-base-100">
      {/* Desktop sidebar — lg and up */}
      <aside className="hidden lg:flex lg:w-60 lg:flex-col border-r border-base-200 p-4 gap-1">
        <span className="font-bold text-lg mb-4 px-2">Home Finance</span>
        {PRIMARY_NAV_ITEMS.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg ${isActive ? 'bg-primary text-primary-content' : 'hover:bg-base-200'}`
            }
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
        <button onClick={() => void logout()} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-base-200 mt-auto">
          <LogOut size={18} />
          <span>Log out</span>
        </button>
      </aside>

      {/* Routed page content */}
      <main className="flex-1 min-w-0 overflow-y-auto pb-16 lg:pb-0">
        <Outlet />
      </main>

      {/* Mobile bottom tab bar — below lg */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 h-16 bg-base-100 border-t border-base-200 flex items-stretch z-40">
        {PRIMARY_NAV_ITEMS.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-1 text-xs ${isActive ? 'text-primary' : 'text-base-content opacity-60'}`
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
        <button
          onClick={() => setMoreOpen((open) => !open)}
          className="flex-1 flex flex-col items-center justify-center gap-1 text-xs text-base-content opacity-60"
        >
          <MoreIcon size={20} />
          More
        </button>
      </nav>

      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/40 flex items-end" onClick={() => setMoreOpen(false)}>
          <div className="bg-base-100 w-full rounded-t-2xl p-4" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => void logout()} className="flex items-center gap-3 px-3 py-3 w-full rounded-lg hover:bg-base-200">
              <LogOut size={18} />
              <span>Log out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
