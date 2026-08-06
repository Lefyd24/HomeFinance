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
  Route01Icon,
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

export const BUDGETS_NAV_ITEM: NavItem = {
  labelKey: 'items.budgets',
  to: '/budgets',
  icon: PiggyBankIcon,
}

/**
 * Not part of the sidebar/dock nav at all — rendered as its own accented
 * button in the top bar (see `InvestmentsNavButton`), since investments is a
 * distinct section of the app (a separate module with its own accounts,
 * sync, and market data) rather than another everyday destination. Still
 * listed in `ALL_NAV_ITEMS` so the top bar's page title resolves correctly
 * while on an investments page.
 */
export const INVESTMENTS_NAV_ITEM: NavItem = {
  labelKey: 'items.investments',
  to: '/investments',
  icon: ChartIncreaseIcon,
}

/** The top-level destinations, in the order the desktop sidebar lists them. */
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
  BUDGETS_NAV_ITEM,
]

/**
 * The mobile dock, which holds three items plus a fixed "More" slot. Kept at
 * three deliberately: five cramped 10px labels read worse than three legible
 * ones, and Budgets is a "sit down and plan" destination rather than something
 * tapped in passing, so it lives in the More sheet.
 */
export const DOCK_NAV_ITEMS: NavItem[] = PRIMARY_NAV_ITEMS.filter(
  (item) => item.to !== BUDGETS_NAV_ITEM.to,
)

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
      { labelKey: 'items.recurring', to: '/recurring', icon: RepeatIcon },
      { labelKey: 'items.trackers', to: '/trackers', icon: Route01Icon },
      { labelKey: 'items.goals', to: '/goals', icon: TargetIcon },
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
    ],
  },
]

function flatten(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => (item.children ? item.children : [item]))
}

/** Destinations only available from the mobile More sheet (not the dock). */
export const MORE_NAV_GROUPS: NavGroup[] = [
  { groupKey: 'groups.overview', items: [BUDGETS_NAV_ITEM, NOTIFICATIONS_NAV_ITEM] },
  ...NAV_GROUPS.slice(1),
]

/** Everything the dock does not show — used to light up "More" by route. */
export const SECONDARY_NAV_ITEMS: NavItem[] = [
  BUDGETS_NAV_ITEM,
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
  INVESTMENTS_NAV_ITEM,
  { labelKey: 'items.import', to: '/import', icon: ArrowDataTransferHorizontalIcon },
]
