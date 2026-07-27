import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { PRIMARY_NAV_ITEMS, MORE_NAV_ICON as MoreIcon } from './NavItems'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function AppShell() {
  const { logout } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row bg-background">
      <aside className="hidden lg:flex lg:w-60 lg:flex-col border-r border-border p-4 gap-1">
        <span className="font-bold text-lg mb-4 px-2">Home Finance</span>
        {PRIMARY_NAV_ITEMS.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg',
                isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
              )
            }
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
        <button
          onClick={() => void logout()}
          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted mt-auto"
        >
          <LogOut size={18} />
          <span>Log out</span>
        </button>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto pb-16 lg:pb-0">
        <Outlet />
      </main>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 h-16 bg-background border-t border-border flex items-stretch z-40">
        {PRIMARY_NAV_ITEMS.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex-1 flex flex-col items-center justify-center gap-1 text-xs',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
        <button
          onClick={() => setMoreOpen((open) => !open)}
          className="flex-1 flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground"
        >
          <MoreIcon size={20} />
          More
        </button>
      </nav>

      {moreOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/40 flex items-end"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="bg-background w-full rounded-t-2xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              onClick={() => void logout()}
              className="flex items-center gap-3 px-3 py-3 w-full justify-start h-auto"
            >
              <LogOut size={18} />
              <span>Log out</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
