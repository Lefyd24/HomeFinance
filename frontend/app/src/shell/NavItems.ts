import type { LucideIcon } from 'lucide-react'
import { LayoutDashboard, ArrowLeftRight, Wallet, PiggyBank, MoreHorizontal } from 'lucide-react'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
}

// First 4 are the mobile bottom-bar items; the 5th slot is always "More".
export const PRIMARY_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Transactions', to: '/transactions', icon: ArrowLeftRight },
  { label: 'Accounts', to: '/accounts', icon: Wallet },
  { label: 'Budgets', to: '/budgets', icon: PiggyBank },
]

export const MORE_NAV_ICON = MoreHorizontal
