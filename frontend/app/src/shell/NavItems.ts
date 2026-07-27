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
  FileImportIcon,
  File01Icon,
  SparklesIcon,
  ChartLineData01Icon,
  Notification03Icon,
  Key01Icon,
  Shield01Icon,
} from '@hugeicons/core-free-icons'

export type HugeIcon = typeof DashboardSquare01Icon

export interface NavItem {
  label: string
  to: string
  icon: HugeIcon
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

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: PRIMARY_NAV_ITEMS,
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
      { label: 'Advisor', to: '/advisor', icon: ChartLineData01Icon },
      { label: 'AI Advisor', to: '/ai-advisor', icon: SparklesIcon },
    ],
  },
  {
    label: 'Tools',
    items: [
      { label: 'Import', to: '/import', icon: FileImportIcon },
      { label: 'Documents', to: '/documents', icon: File01Icon },
      { label: 'Notifications', to: '/notifications', icon: Notification03Icon },
    ],
  },
  {
    label: 'Account',
    items: [
      { label: 'API Keys', to: '/api-keys', icon: Key01Icon },
      { label: 'Admin', to: '/admin', icon: Shield01Icon },
    ],
  },
]

export const SECONDARY_NAV_ITEMS: NavItem[] = NAV_GROUPS.slice(1).flatMap(
  (group) => group.items,
)

export const MORE_NAV_ICON = MoreHorizontalCircleIcon

export const ALL_NAV_ITEMS: NavItem[] = [
  ...PRIMARY_NAV_ITEMS,
  ...SECONDARY_NAV_ITEMS,
]
