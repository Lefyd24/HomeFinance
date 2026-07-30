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
  ChartIncreaseIcon,
  Idea01Icon,
  Notification03Icon,
  News01Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'

export type HugeIcon = typeof DashboardSquare01Icon

export interface NavItem {
  /** Translation key within the `nav` namespace, e.g. "items.dashboard". */
  labelKey: string
  /** Translation key for the short mobile-dock label, if different from `labelKey`. */
  dockLabelKey?: string
  to: string
  icon: HugeIcon
  /** Renders as a collapsible parent. The parent's own `to` is used for matching only. */
  children?: NavItem[]
}

export interface NavGroup {
  /** Translation key within the `nav` namespace, e.g. "groups.overview". */
  groupKey: string
  items: NavItem[]
}

/** First 4 are the mobile bottom-bar items; the 5th slot is always "More". */
export const PRIMARY_NAV_ITEMS: NavItem[] = [
  {
    labelKey: 'items.dashboard',
    dockLabelKey: 'dock.home',
    to: '/dashboard',
    icon: DashboardSquare01Icon,
  },
  {
    labelKey: 'items.transactions',
    dockLabelKey: 'dock.transactions',
    to: '/transactions',
    icon: ArrowDataTransferHorizontalIcon,
  },
  { labelKey: 'items.accounts', to: '/accounts', icon: WalletIcon },
  { labelKey: 'items.budgets', to: '/budgets', icon: PiggyBankIcon },
]

/**
 * Kept deliberately short. Anything reachable from the page it belongs to
 * (Import lives on Transactions) or from the account menu (API keys, admin)
 * is not repeated here.
 */
export const NOTIFICATIONS_NAV_ITEM: NavItem = {
  labelKey: 'items.notifications',
  to: '/notifications',
  icon: Notification03Icon,
}

export const NAV_GROUPS: NavGroup[] = [
  {
    groupKey: 'groups.overview',
    items: [
      ...PRIMARY_NAV_ITEMS,
      NOTIFICATIONS_NAV_ITEM,
    ],
  },
  {
    groupKey: 'groups.planning',
    items: [
      { labelKey: 'items.categories', to: '/categories', icon: TagIcon },
      { labelKey: 'items.debts', to: '/debts', icon: BankIcon },
      { labelKey: 'items.goals', to: '/goals', icon: TargetIcon },
      { labelKey: 'items.recurring', to: '/recurring', icon: RepeatIcon },
    ],
  },
  {
    groupKey: 'groups.insights',
    items: [
      { labelKey: 'items.reports', to: '/reports', icon: Analytics01Icon },
      {
        labelKey: 'items.advice',
        to: '/advisor',
        icon: Idea01Icon,
        children: [
          { labelKey: 'items.analysis', to: '/advisor', icon: ChartLineData01Icon },
          { labelKey: 'items.askAi', to: '/ai-advisor', icon: SparklesIcon },
        ],
      },
      { labelKey: 'items.documents', to: '/documents', icon: File01Icon },
      { labelKey: 'items.investments', to: '/investments', icon: ChartIncreaseIcon },
    ],
  },
]

function flatten(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => (item.children ? item.children : [item]))
}

/** Destinations only available from the mobile More sheet (not the primary dock). */
export const MORE_NAV_GROUPS: NavGroup[] = [
  { groupKey: 'groups.overview', items: [NOTIFICATIONS_NAV_ITEM] },
  ...NAV_GROUPS.slice(1),
]

export const SECONDARY_NAV_ITEMS: NavItem[] = [
  NOTIFICATIONS_NAV_ITEM,
  ...NAV_GROUPS.slice(1).flatMap((group) => flatten(group.items)),
]

export const MORE_NAV_ICON = MoreHorizontalCircleIcon

/**
 * Every routable destination, including ones no longer shown in the sidebar.
 *
 * Resolved by prefix match, first hit wins, so nested routes have to come
 * before the parent they sit under — otherwise `/investments` would claim
 * `/investments/news` and the header would name the wrong page.
 */
export const ALL_NAV_ITEMS: NavItem[] = [
  { labelKey: 'items.marketNews', to: '/investments/news', icon: News01Icon },
  { labelKey: 'items.tickerSearch', to: '/investments/search', icon: Search01Icon },
  { labelKey: 'items.companyResearch', to: '/investments/research', icon: ChartLineData01Icon },
  ...PRIMARY_NAV_ITEMS,
  NOTIFICATIONS_NAV_ITEM,
  ...NAV_GROUPS.slice(1).flatMap((group) => flatten(group.items)),
  { labelKey: 'items.import', to: '/import', icon: ArrowDataTransferHorizontalIcon },
]
