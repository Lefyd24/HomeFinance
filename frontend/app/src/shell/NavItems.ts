import {
  DashboardSquare01Icon,
  ArrowDataTransferHorizontalIcon,
  WalletIcon,
  PiggyBankIcon,
  MoreHorizontalCircleIcon,
  TagIcon,
  BankIcon,
  TargetIcon,
  RepeatIcon,
  Analytics01Icon,
  File01Icon,
  SparklesIcon,
  ChartLineData01Icon,
  Idea01Icon,
  Notification03Icon,
} from '@hugeicons/core-free-icons'

export type HugeIcon = typeof DashboardSquare01Icon

export interface NavItem {
  label: string
  to: string
  icon: HugeIcon
  /** Renders as a collapsible parent. The parent's own `to` is used for matching only. */
  children?: NavItem[]
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

/** First 4 are the mobile bottom-bar items; the 5th slot is always "More". */
export const PRIMARY_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: DashboardSquare01Icon },
  { label: 'Transactions', to: '/transactions', icon: ArrowDataTransferHorizontalIcon },
  { label: 'Accounts', to: '/accounts', icon: WalletIcon },
  { label: 'Budgets', to: '/budgets', icon: PiggyBankIcon },
]

/**
 * Kept deliberately short. Anything reachable from the page it belongs to
 * (Import lives on Transactions) or from the account menu (API keys, admin)
 * is not repeated here.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      ...PRIMARY_NAV_ITEMS,
      { label: 'Notifications', to: '/notifications', icon: Notification03Icon },
    ],
  },
  {
    label: 'Planning',
    items: [
      { label: 'Categories', to: '/categories', icon: TagIcon },
      { label: 'Debts', to: '/debts', icon: BankIcon },
      { label: 'Goals', to: '/goals', icon: TargetIcon },
      { label: 'Recurring', to: '/recurring', icon: RepeatIcon },
    ],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Reports', to: '/reports', icon: Analytics01Icon },
      {
        label: 'Advice',
        to: '/advisor',
        icon: Idea01Icon,
        children: [
          { label: 'Analysis', to: '/advisor', icon: ChartLineData01Icon },
          { label: 'Ask AI', to: '/ai-advisor', icon: SparklesIcon },
        ],
      },
      { label: 'Documents', to: '/documents', icon: File01Icon },
    ],
  },
]

function flatten(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => (item.children ? item.children : [item]))
}

export const SECONDARY_NAV_ITEMS: NavItem[] = NAV_GROUPS.slice(1).flatMap((group) =>
  flatten(group.items),
)

export const MORE_NAV_ICON = MoreHorizontalCircleIcon

/** Every routable destination, including ones no longer shown in the sidebar. */
export const ALL_NAV_ITEMS: NavItem[] = [
  ...PRIMARY_NAV_ITEMS,
  { label: 'Notifications', to: '/notifications', icon: Notification03Icon },
  ...SECONDARY_NAV_ITEMS,
  { label: 'Import', to: '/import', icon: ArrowDataTransferHorizontalIcon },
]
