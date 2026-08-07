import {
  Fragment,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { useQuery } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  Logout01Icon,
  DashboardCircleAddIcon,
  Notification03Icon,
  SidebarLeftIcon,
} from '@hugeicons/core-free-icons'
import { getNotificationLog } from '../notifications/notificationsApi'
import { useAuth } from '../auth/AuthContext'
import {
  ALL_NAV_ITEMS,
  DOCK_NAV_ITEMS,
  INVESTMENTS_DOCK_NAV_ITEMS,
  INVESTMENTS_NAV_GROUPS,
  INVESTMENTS_NAV_ITEM,
  isInvestmentsRoute,
  MORE_NAV_ICON as MoreIcon,
  MORE_NAV_GROUPS,
  NAV_GROUPS,
  PRIMARY_NAV_ITEMS,
  SECONDARY_NAV_ITEMS,
  type NavGroup,
  type NavItem,
} from './NavItems'
import { TransactionFormDialog } from '../transactions/TransactionFormDialog'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageToggle } from '@/components/LanguageToggle'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from '@/components/ui/item'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { NoiseBackground } from "@/components/ui/noise-background";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

function userInitials(name: string | null | undefined, email: string | undefined) {
  const source = name?.trim() || email?.trim() || '?'
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function BrandMark({
  compact = false,
  section,
}: {
  compact?: boolean
  /** Names the sub-app the rail is currently showing, in place of the tagline. */
  section?: string
}) {
  const { t } = useTranslation('nav')
  return (
    <div className={cn('flex items-center gap-2.5 min-w-0', compact && 'justify-center')}>
      <img
        src="/assets/icons/favicon.svg"
        alt=""
        width={32}
        height={32}
        className="size-8 shrink-0 object-contain"
        decoding="async"
      />
      {!compact && (
        <div className="min-w-0 flex flex-col">
          <span className="font-heading font-bold text-sm tracking-tight truncate">{t('brand.name')}</span>
          {/* Swaps with the nav below it, on the same beat. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={section ?? 'default'}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className={cn(
                'text-[10px] uppercase tracking-[0.14em] truncate',
                section ? 'font-semibold text-sidebar-primary' : 'text-muted-foreground',
              )}
            >
              {section ?? t('brand.tagline')}
            </motion.span>
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

function NavItemLink({
  item,
  collapsed = false,
  onNavigate,
  className,
}: {
  item: NavItem
  collapsed?: boolean
  onNavigate?: () => void
  className?: string
}) {
  const { t } = useTranslation('nav')
  const label = t(item.labelKey)
  const link = (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'group/nav relative flex items-center rounded-lg text-sm font-medium',
          'border-0 outline-none ring-0 shadow-none',
          'transition-[background-color,color,transform] duration-150 ease-out',
          'focus-visible:outline-none focus-visible:ring-0',
          collapsed
            ? 'mx-auto size-9 justify-center px-0'
            : 'gap-3 px-2.5 py-2',
          isActive
            ? cn(
                'bg-sidebar-primary/12 text-sidebar-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
                !collapsed && 'ps-3',
              )
            : cn(
                'text-sidebar-foreground/75',
                'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                !collapsed && 'hover:translate-x-0.5',
                collapsed && 'hover:bg-sidebar-accent/80',
              ),
          className,
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && !collapsed && (
            <span className="absolute inset-y-1.5 start-0 w-1 rounded-full bg-sidebar-primary" />
          )}
          <HugeiconsIcon
            icon={item.icon}
            strokeWidth={isActive ? 2.25 : 1.85}
            className={cn(
              'size-4 shrink-0 transition-colors duration-150',
              isActive
                ? 'text-sidebar-primary'
                : 'text-muted-foreground group-hover/nav:text-sidebar-accent-foreground',
            )}
          />
          {!collapsed && <span className="truncate">{label}</span>}
        </>
      )}
    </NavLink>
  )

  if (!collapsed) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" align="center">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * A parent that owns a couple of closely-related destinations. It opens itself
 * when one of its children is the current page, so the sidebar never hides
 * where you are.
 */
function NavItemGroup({
  item,
  collapsed = false,
  onNavigate,
}: {
  item: NavItem
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const { t } = useTranslation('nav')
  const location = useLocation()
  const children = item.children ?? []
  const childActive = children.some((child) => location.pathname.startsWith(child.to))
  const [open, setOpen] = useState(childActive)

  // Collapsed rail has no room for a disclosure — show the children as peers.
  if (collapsed) {
    return (
      <>
        {children.map((child) => (
          <NavItemLink key={child.to} item={child} collapsed onNavigate={onNavigate} />
        ))}
      </>
    )
  }

  return (
    <Collapsible open={open || childActive} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            'group/nav flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium',
            'transition-colors duration-150 ease-out',
            childActive
              ? 'text-sidebar-primary'
              : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          )}
        >
          <HugeiconsIcon
            icon={item.icon}
            strokeWidth={childActive ? 2.25 : 1.85}
            className={cn(
              'size-4 shrink-0',
              childActive ? 'text-sidebar-primary' : 'text-muted-foreground',
            )}
          />
          <span className="truncate">{t(item.labelKey)}</span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={2}
            className={cn(
              'ms-auto size-3.5 shrink-0 text-muted-foreground transition-transform duration-150',
              (open || childActive) && 'rotate-180',
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ms-4 mt-1 flex flex-col gap-1 border-s border-sidebar-border ps-2">
          {children.map((child) => (
            <NavItemLink key={child.to} item={child} onNavigate={onNavigate} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function NavEntry({
  item,
  collapsed = false,
  onNavigate,
  className,
}: {
  item: NavItem
  collapsed?: boolean
  onNavigate?: () => void
  className?: string
}) {
  if (item.children?.length) {
    return <NavItemGroup item={item} collapsed={collapsed} onNavigate={onNavigate} />
  }
  return (
    <NavItemLink
      item={item}
      collapsed={collapsed}
      onNavigate={onNavigate}
      className={className}
    />
  )
}

function relativeTime(iso: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const minutes = Math.round((Date.now() - then) / 60_000)
  if (minutes < 1) return t('notificationsPanel.time.justNow')
  if (minutes < 60) return t('notificationsPanel.time.minutesAgo', { count: minutes })
  const hours = Math.round(minutes / 60)
  if (hours < 24) return t('notificationsPanel.time.hoursAgo', { count: hours })
  const days = Math.round(hours / 24)
  if (days < 7) return t('notificationsPanel.time.daysAgo', { count: days })
  return new Date(iso).toLocaleDateString()
}

/**
 * Alerts live in the top bar, not on a page of their own — they are a glance,
 * not a destination. The badge counts what landed in the last day.
 */
function NotificationsMenu() {
  const { t } = useTranslation('nav')
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['notifications', 'log'],
    queryFn: getNotificationLog,
    staleTime: 60_000,
    retry: false,
  })

  const recent = useMemo(() => {
    const entries = data ?? []
    if (entries.length === 0 || dataUpdatedAt === 0) return 0
    const cutoff = dataUpdatedAt - 24 * 60 * 60 * 1000
    return entries.filter((entry) => new Date(entry.created_at).getTime() >= cutoff).length
  }, [data, dataUpdatedAt])

  const entries = data ?? []

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative size-9"
          aria-label={
            recent > 0
              ? t('notificationsPanel.ariaLabelWithCount', { count: recent })
              : t('notificationsPanel.ariaLabel')
          }
        >
          <HugeiconsIcon icon={Notification03Icon} strokeWidth={2} />
          {recent > 0 && (
            <span className="absolute end-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold tabular-nums text-primary-foreground">
              {recent > 9 ? '9+' : recent}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      {/* 22rem is wider than a small phone's viewport, so cap it against the
          screen — Radix would otherwise place a panel that runs off the edge. */}
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden p-0"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <p className="text-sm font-semibold">{t('notificationsPanel.title')}</p>
          <span className="text-xs text-muted-foreground">
            {recent > 0
              ? t('notificationsPanel.inLastDay', { count: recent })
              : t('notificationsPanel.nothingNew')}
          </span>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : entries.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-sm text-muted-foreground">{t('notificationsPanel.empty')}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('notificationsPanel.emptyHint')}
            </p>
          </div>
        ) : (
          <div className="max-h-[22rem] overflow-y-auto overscroll-contain">
            <ItemGroup className="p-1.5">
              {entries.slice(0, 20).map((entry, index) => (
                <Fragment key={entry.id}>
                  {index > 0 && <ItemSeparator />}
                  <Item size="sm" className="items-start">
                    <ItemMedia variant="icon">
                      <HugeiconsIcon icon={Notification03Icon} strokeWidth={2} />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle className="text-sm">{entry.title}</ItemTitle>
                      {entry.body && (
                        <ItemDescription className="line-clamp-2">{entry.body}</ItemDescription>
                      )}
                      <p className="mt-0.5 text-[0.7rem] text-muted-foreground">
                        {relativeTime(entry.created_at, t)}
                      </p>
                    </ItemContent>
                  </Item>
                </Fragment>
              ))}
            </ItemGroup>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function UserMenu({
  align = 'end',
  side = 'bottom',
}: {
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'bottom' | 'left' | 'right'
}) {
  const { t } = useTranslation('nav')
  const { user, logout } = useAuth()
  const initials = userInitials(user?.full_name, user?.email)
  const displayName = user?.full_name?.trim() || user?.email || t('userMenu.defaultAccountName')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="size-9 rounded-full p-0"
          aria-label={t('userMenu.accountMenu')}
        >
          <Avatar size="sm">
            <AvatarFallback className="bg-primary/15 text-primary font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align={align} side={side} sideOffset={8}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{displayName}</span>
              {user?.email && (
                <span className="text-xs text-muted-foreground truncate">{user.email}</span>
              )}
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <NavLink to="/notifications">{t('items.notifications')}</NavLink>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <NavLink to="/connections">{t('userMenu.bankConnections')}</NavLink>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <NavLink to="/rules">{t('userMenu.rules')}</NavLink>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <NavLink to="/api-keys">{t('userMenu.apiKeys')}</NavLink>
          </DropdownMenuItem>
          {user?.is_admin && (
            <DropdownMenuItem asChild>
              <NavLink to="/admin">{t('userMenu.admin')}</NavLink>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => void logout()}
          >
            <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} />
            {t('common:logout')}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function DesktopSidebar({
  collapsed,
  onToggle,
  groups,
  section,
}: {
  collapsed: boolean
  onToggle: () => void
  /** Which nav set to show — swapped wholesale when inside a sub-app. */
  groups: NavGroup[]
  section?: string
}) {
  const { t } = useTranslation('nav')
  return (
    <aside
      data-section={section ? 'investments' : undefined}
      className={cn(
        'shell-sidebar hidden lg:flex lg:flex-col h-dvh sticky top-0 shrink-0 overflow-hidden',
        'glass-bar text-sidebar-foreground',
        'transition-[width] duration-200 ease-out',
        collapsed ? 'w-[4.25rem]' : 'w-64',
      )}
    >
      <div
        className={cn(
          'shell-sidebar-header flex h-14 shrink-0 items-center gap-2 px-3',
          collapsed && 'justify-center px-2',
        )}
      >
        <BrandMark compact={collapsed} section={section} />
        {!collapsed && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="ms-auto text-muted-foreground"
            onClick={onToggle}
            aria-label={t('sidebar.collapse')}
          >
            <HugeiconsIcon icon={SidebarLeftIcon} strokeWidth={2} />
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 min-h-0">
        {/*
          Crossing into or out of a sub-app replaces the entire nav, and an
          instant swap reads as a glitch — the rail appears to flicker into a
          different sidebar. Fading the outgoing set out before the incoming one
          slides in makes it legible as one rail changing what it lists.
          `mode="wait"` is what keeps the two sets from overlapping mid-flight.
        */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.nav
            key={section ?? 'default'}
            initial={{ opacity: 0, x: section ? 10 : -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: section ? -10 : 10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={cn(
              'flex flex-col gap-4 p-2',
              collapsed && 'items-center px-1.5',
            )}
          >
            {groups.map((group, groupIndex) => (
              <div
                key={group.groupKey}
                className={cn(
                  'flex flex-col gap-1',
                  collapsed && 'w-full items-center',
                )}
              >
                {!collapsed && (
                  <p className="px-2.5 pb-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {t(group.groupKey)}
                  </p>
                )}
                {/* Collapsed hides the group headings, so a rule stands in for
                    them — between groups only, never above the first. */}
                {collapsed && groupIndex > 0 && (
                  <Separator className="my-1 w-6 bg-sidebar-border" />
                )}
                {group.items.map((item) => (
                  <NavEntry key={item.to} item={item} collapsed={collapsed} />
                ))}
              </div>
            ))}
          </motion.nav>
        </AnimatePresence>
      </ScrollArea>

      {collapsed && (
        <div className="shrink-0 border-t border-sidebar-border p-2 flex justify-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onToggle}
                aria-label={t('sidebar.expand')}
              >
                <HugeiconsIcon icon={SidebarLeftIcon} strokeWidth={2} className="rtl:rotate-180" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{t('sidebar.expandTooltip')}</TooltipContent>
          </Tooltip>
        </div>
      )}
    </aside>
  )
}

/**
 * A distinct entry point into investments, styled as a small departure from
 * the rest of the top bar (secondary accent, pill shape) rather than another
 * icon button — investments is its own module (separate accounts, sync,
 * market data), so getting there should feel like stepping into another part
 * of the app, not picking another everyday page.
 */
function InvestmentsNavButton() {
  const { t } = useTranslation('nav')
  return (
    <NavLink
      to={INVESTMENTS_NAV_ITEM.to}
      className={cn(
        'flex shrink-0 items-center rounded-full',
        'transition-transform duration-150 ease-out active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50',
      )}
    >
      {({ isActive }) => (
        <NoiseBackground
          containerClassName="w-fit p-1.5 rounded-full mx-auto"
          gradientColors={[
            'oklch(51.5% 0.126 227)',
            'oklch(67.08% 0.175 40.64)',
            'oklch(80% 0.09 205)',
          ]}
          noiseIntensity={0.08}
          speed={0.05}
        >
          {/* Selected state colours the pill itself (a dark green, like the
              neutral chrome's dark variant but tinted) rather than ringing
              the outside — the noise blob stays the constant, brand-toned
              backdrop either way. */}
          <span
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-full px-2 text-xs font-semibold',
              isActive
                ? cn(
                    'bg-linear-to-r from-emerald-950 via-emerald-900 to-emerald-950 text-emerald-50',
                    'shadow-[0px_2px_0px_0px_rgba(16,185,129,0.18)_inset,0px_0.5px_1px_0px_rgba(0,0,0,0.4)]',
                  )
                : cn(
                    'text-neutral-900 bg-linear-to-r from-white via-neutral-100 to-white',
                    'dark:from-black dark:via-black dark:to-neutral-900 dark:text-white',
                  ),
            )}
          >
            <HugeiconsIcon icon={INVESTMENTS_NAV_ITEM.icon} strokeWidth={2.25} className="size-4 shrink-0" />
            <span className="sr-only sm:not-sr-only">{t(INVESTMENTS_NAV_ITEM.labelKey)}</span>
          </span>
        </NoiseBackground>
      )}
    </NavLink>
  )
}

/**
 * The way out of the investments sub-app, and deliberately the mirror image of
 * `InvestmentsNavButton` — same noise blob, same pill, arrow reversed. One
 * control takes you in, the other takes you out, and they read as a pair.
 *
 * It sits at the *start* of the top bar rather than in `NavActions`, because
 * leaving a section is a back action, not one of the persistent tools.
 */
function BackToDashboardButton() {
  const { t } = useTranslation('nav')
  return (
    <NavLink
      to={PRIMARY_NAV_ITEMS[0].to}
      className={cn(
        'flex shrink-0 items-center rounded-full',
        'transition-transform duration-150 ease-out active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50',
      )}
    >
      <NoiseBackground
        containerClassName="w-fit p-1.5 rounded-full mx-auto"
        gradientColors={[
          'oklch(51.5% 0.126 227)',
          'oklch(67.08% 0.175 40.64)',
          'oklch(80% 0.09 205)',
        ]}
        noiseIntensity={0.08}
        speed={0.05}
      >
        <span
          className={cn(
            'flex h-7 items-center gap-1.5 rounded-full px-2 text-xs font-semibold',
            'text-neutral-900 bg-linear-to-r from-white via-neutral-100 to-white',
            'dark:from-black dark:via-black dark:to-neutral-900 dark:text-white',
          )}
        >
          <HugeiconsIcon
            icon={ArrowLeft01Icon}
            strokeWidth={2.25}
            className="size-4 shrink-0 rtl:rotate-180"
          />
          <span className="sr-only sm:not-sr-only">{t('backToDashboard')}</span>
        </span>
      </NoiseBackground>
    </NavLink>
  )
}

function NavActions({ inInvestments }: { inInvestments: boolean }) {
  return (
    <div className="ms-auto flex items-center gap-1">
      {/* Already inside investments — the way in is replaced by the way out,
          which the top bar renders at its start. */}
      {!inInvestments && <InvestmentsNavButton />}
      <NotificationsMenu />
      <LanguageToggle />
      <ThemeToggle />
      <UserMenu align="end" side="bottom" />
    </div>
  )
}

function QuickAddTransactionFab() {
  const { t } = useTranslation('nav')
  const [open, setOpen] = useState(false)

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon-xl"
            className={cn(
              'fixed z-30 size-12 rounded-full shadow-lg',
              // Clears the dock (3.5rem tall, sitting ~0.5rem above the safe
              // area) with a gap, in a browser tab and an installed PWA alike.
              'bottom-[max(4.5rem,calc(4rem+env(safe-area-inset-bottom)))] end-3',
              'lg:bottom-12 lg:end-6',
            )}
            onClick={() => setOpen(true)}
            aria-label={t('quickAdd')}
          >
            <HugeiconsIcon icon={DashboardCircleAddIcon} strokeWidth={2} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">{t('quickAdd')}</TooltipContent>
      </Tooltip>
      <TransactionFormDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

function MobileTopBar({ inInvestments }: { inInvestments: boolean }) {
  const { t } = useTranslation('nav')
  const location = useLocation()
  const current = ALL_NAV_ITEMS.find((item) => location.pathname.startsWith(item.to))

  return (
    // The padding — not a taller box — is what keeps the bar clear of the
    // status bar / notch in an installed PWA. index.html sets viewport-fit=cover,
    // so env(safe-area-inset-top) is a real value there and 0 in a browser tab.
    <header className="glass-bar lg:hidden sticky top-0 z-30 shrink-0 border-b border-border pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 items-center gap-2 px-3">
        {inInvestments && <BackToDashboardButton />}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {inInvestments ? t('investmentsSection') : t('brand.name')}
          </p>
          <h1 className="font-heading text-sm font-semibold tracking-tight truncate">
            {current ? t(current.labelKey) : t('workspace')}
          </h1>
        </div>
        <NavActions inInvestments={inInvestments} />
      </div>
    </header>
  )
}

function dockLabel(item: NavItem, t: (key: string) => string) {
  return t(item.dockLabelKey ?? item.labelKey)
}

/**
 * One dock slot. Deliberately backgroundless: the active highlight is the
 * single sliding `.liquid-dock-lens` behind the row, so a slot only ever
 * changes colour and weight.
 */
const DOCK_SLOT_CLASS = cn(
  'group/dock relative z-10 flex min-h-[2.875rem] flex-1 flex-col items-center justify-center gap-px rounded-full px-0.5',
  'transition-[color,transform] duration-200 ease-out',
  'motion-safe:active:scale-[0.94]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
)

function DockLabel({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        'max-w-full truncate px-0.5 text-[10px] leading-tight tracking-wide transition-colors duration-200',
        active ? 'font-semibold text-primary' : 'font-medium text-muted-foreground',
      )}
    >
      {children}
    </span>
  )
}

function DockIcon({ icon, active }: { icon: NavItem['icon']; active: boolean }) {
  return (
    <HugeiconsIcon
      icon={icon}
      strokeWidth={active ? 2.25 : 1.75}
      className={cn(
        'size-[1.375rem] transition-colors duration-200',
        active ? 'text-primary' : 'text-muted-foreground',
      )}
    />
  )
}

function MoreSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('nav')
  const { logout } = useAuth()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/*
       * Three bands in one clamped column: handle+header, a scrolling nav, and a
       * pinned Log out. The nav is the only thing allowed to grow, so expanding a
       * disclosure group (Advice) scrolls it instead of pushing Log out out of the
       * sheet and over the dock — which is exactly what a plain content-height
       * column used to do. min-h-0 is what lets the ScrollArea actually shrink.
       *
       * `h-[78dvh]` (not `max-h-*`) is load-bearing: an auto-height flex column
       * only hugs its content, so `flex-1` on the nav has no free space to grow
       * into and a max-height alone never gets a chance to clip anything. A
       * definite height gives the nav a real box to fill and the ScrollArea
       * viewport (percentage-sized against it) something concrete to resolve
       * against — otherwise it silently falls back to its content's natural
       * height and bleeds out past Log out with no scrollbar.
       */}
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="flex h-[78dvh] flex-col gap-0 overflow-hidden rounded-t-3xl border-border/80 p-0"
      >
        <div className="mx-auto mt-3 mb-1 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/25" />
        <SheetHeader className="shrink-0 gap-1 pb-2 pt-1">
          <SheetTitle className="tracking-tight">{t('more')}</SheetTitle>
          <SheetDescription className="text-xs">
            {t('moreSheet.description')}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <nav className="flex flex-col gap-4 px-3 pb-3">
            {MORE_NAV_GROUPS.map((group) => (
              <div key={group.groupKey} className="flex flex-col gap-1">
                <p className="px-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t(group.groupKey)}
                </p>
                {group.items.map((item) => (
                  <NavEntry
                    key={item.to}
                    item={item}
                    onNavigate={() => onOpenChange(false)}
                    className="py-2.5"
                  />
                ))}
              </div>
            ))}
          </nav>
        </ScrollArea>
        <div className="shrink-0 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button
            variant="ghost"
            className="h-11 w-full justify-start text-destructive hover:text-destructive"
            onClick={() => {
              onOpenChange(false)
              void logout()
            }}
          >
            <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} data-icon="inline-start" />
            {t('common:logout')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function MobileBottomNav({
  items,
  showMore,
  moreOpen,
  onMoreToggle,
}: {
  items: NavItem[]
  /** The investments dock shows every destination it has, so it has no More. */
  showMore: boolean
  moreOpen: boolean
  onMoreToggle: () => void
}) {
  const { t } = useTranslation('nav')
  const location = useLocation()
  const secondaryActive = useMemo(
    () =>
      showMore && SECONDARY_NAV_ITEMS.some((item) => location.pathname.startsWith(item.to)),
    [location.pathname, showMore],
  )
  const moreActive = moreOpen || secondaryActive

  const dockIndex = useMemo(() => {
    // Longest match wins, so a section root never claims its own sub-page.
    let hit = -1
    let hitLength = -1
    items.forEach((item, index) => {
      const matches = item.end
        ? location.pathname === item.to
        : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
      if (matches && item.to.length > hitLength) {
        hit = index
        hitLength = item.to.length
      }
    })
    if (hit >= 0) return hit
    // "More" is the last slot; it owns every route the dock doesn't show.
    return showMore && moreActive ? items.length : -1
  }, [items, location.pathname, moreActive, showMore])

  return (
    <nav
      aria-label={t('primaryNav')}
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 lg:hidden',
        // Sits closer to the bottom edge than a full safe-area inset would put
        // it: the inset reserves room for the home indicator, and the dock only
        // needs to clear it, not stand a full gap above it.
        'pb-[max(0.375rem,calc(env(safe-area-inset-bottom)-0.5rem))]',
      )}
    >
      <div
        className="liquid-dock pointer-events-auto relative mx-auto flex max-w-sm items-stretch rounded-full border"
        style={{ '--dock-slots': items.length + (showMore ? 1 : 0) } as CSSProperties}
      >
        <span
          aria-hidden="true"
          className="liquid-dock-lens"
          data-visible={dockIndex >= 0}
          style={{ '--dock-index': Math.max(dockIndex, 0) } as CSSProperties}
        />

        {items.map((item, index) => {
          // Drive the slot from the same longest-match result as the lens, so
          // the highlight and the icon can never disagree.
          const active = index === dockIndex
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              aria-label={t(item.labelKey)}
              className={DOCK_SLOT_CLASS}
            >
              <DockIcon icon={item.icon} active={active} />
              <DockLabel active={active}>{dockLabel(item, t)}</DockLabel>
            </NavLink>
          )
        })}

        {showMore && (
          <button
            type="button"
            className={DOCK_SLOT_CLASS}
            onClick={onMoreToggle}
            aria-label={t('moreNavigationAria')}
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
          >
            <DockIcon icon={MoreIcon} active={moreActive} />
            <DockLabel active={moreActive}>{t('more')}</DockLabel>
          </button>
        )}
      </div>
    </nav>
  )
}

function DesktopTopBar({ inInvestments }: { inInvestments: boolean }) {
  const { t } = useTranslation('nav')
  const location = useLocation()
  const current = ALL_NAV_ITEMS.find((item) => location.pathname.startsWith(item.to))

  return (
    <header className="shell-topbar glass-bar hidden lg:flex sticky top-0 z-20 h-14 shrink-0 items-center gap-3 px-4">
      {inInvestments && <BackToDashboardButton />}
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {inInvestments ? t('investmentsSection') : t('workspace')}
        </p>
        <h1 className="font-heading text-sm font-semibold tracking-tight truncate">
          {current ? t(current.labelKey) : t('brand.name')}
        </h1>
      </div>
      <NavActions inInvestments={inInvestments} />
    </header>
  )
}

function DesktopFooter() {
  const { t } = useTranslation('nav')
  return (
    <footer className="shell-footer glass-bar hidden lg:flex h-10 shrink-0 items-center justify-between gap-3 px-4 text-[11px] text-muted-foreground">
      <span className="truncate">{t('brand.name')}</span>
      <span className="tabular-nums shrink-0">© {new Date().getFullYear()}</span>
    </footer>
  )
}

/**
 * The app shell, which is section-aware rather than fixed.
 *
 * Investments is a module of its own — separate accounts, credentials, sync and
 * market data — so once you are inside it the shell re-points at it wholesale:
 * the sidebar and dock list investments destinations, the top-bar pill that got
 * you here is replaced by the way out, and `data-section` re-skins the surfaces
 * from the existing tokens. One shell, one collapse state; only the nav data
 * and the theming change.
 */
export function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()
  const inInvestments = isInvestmentsRoute(location.pathname)
  const { t } = useTranslation('nav')
  const section = inInvestments ? 'investments' : undefined

  return (
    <div className="app-canvas h-dvh flex overflow-hidden">
      <DesktopSidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        groups={inInvestments ? INVESTMENTS_NAV_GROUPS : NAV_GROUPS}
        section={inInvestments ? t('investmentsSection') : undefined}
      />

      <div
        data-section={section}
        className="shell-content-column flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden"
      >
        <MobileTopBar inInvestments={inInvestments} />
        <DesktopTopBar inInvestments={inInvestments} />

        <main className="shell-main flex-1 min-h-0">
          <div className="shell-main-bg" aria-hidden="true" />
          <div className="shell-main-scroll pb-[max(4.875rem,calc(4rem+env(safe-area-inset-bottom)))] lg:pb-0">
            <Outlet />
          </div>
        </main>

        <DesktopFooter />
      </div>

      <QuickAddTransactionFab />

      <MobileBottomNav
        items={inInvestments ? INVESTMENTS_DOCK_NAV_ITEMS : DOCK_NAV_ITEMS}
        showMore={!inInvestments}
        moreOpen={moreOpen}
        onMoreToggle={() => setMoreOpen((open) => !open)}
      />
      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} />
    </div>
  )
}
