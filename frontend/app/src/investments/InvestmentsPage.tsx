import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  ArrowRight01Icon,
  ChartIncreaseIcon,
  ChartLineData01Icon,
  Delete02Icon,
  Key01Icon,
  MoreVerticalIcon,
  News01Icon,
  PencilEdit02Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader, PageHeaderActionLabel } from '../ui/PageHeader'
import { useConfirm } from '../ui/useConfirm'
import { formatCurrency, formatDate } from '../lib/format'
import { AccountIcon } from '../accounts/bankIcons'
import { cn } from '@/lib/utils'
import { Sparkline } from '../reports/Sparkline'
import { computeRange } from '../reports/useReportFilters'
import {
  useDeleteInvestmentAccount,
  useInvestmentAccounts,
  useInvestmentHistory,
} from './useInvestments'
import { InvestmentAccountDetail } from './InvestmentAccountDetail'
import { ConnectInvestmentAccountDialog } from './ConnectInvestmentAccountDialog'
import { EditInvestmentAccountDialog } from './EditInvestmentAccountDialog'
import { RotateApiKeysDialog } from './RotateApiKeysDialog'
import { DeltaPct, DeltaPill, Metric, SyncStatusBadge } from './InvestmentPrimitives'
import type { InvestmentAccount } from './investmentsApi'

const MARKET_TOOLS = [
  { to: '/investments/news', icon: News01Icon, titleKey: 'news.title' },
  { to: '/investments/search', icon: Search01Icon, titleKey: 'search.title' },
  { to: '/investments/research', icon: ChartLineData01Icon, titleKey: 'research.title' },
] as const

type PortfolioTotals = {
  mixed: false
  currency: string
  value: number
  pnl: number
  returnPct: number | null
  dayChange: number | null
  dayChangePct: number | null
  invested: number
  cash: number
}

/**
 * The investments home: which accounts are connected, and everything about the
 * one that's selected.
 *
 * Market news and ticker search describe the market rather than a portfolio, so
 * they are their own pages linked from here — this page stays about the money.
 */
export function InvestmentsPage() {
  const { t } = useTranslation('investments')
  const { data: accounts = [], isLoading } = useInvestmentAccounts()
  const deleteAccount = useDeleteInvestmentAccount()
  const { confirm, confirmDialog } = useConfirm()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editingAccount, setEditingAccount] = useState<InvestmentAccount | null>(null)
  const [rotatingAccount, setRotatingAccount] = useState<InvestmentAccount | null>(null)

  // Fall back to the first account whenever the current selection is unset or
  // no longer exists (e.g. right after connecting the first account, or after
  // deleting the selected one) — computed at render time rather than synced
  // via an effect, so there's no extra render/cascading setState.
  const selectedAccount = accounts.find((a) => a.id === selectedId) ?? accounts[0] ?? null

  /**
   * Totals across accounts only mean something when the accounts agree on a
   * currency — the app never invents a cross-account exchange rate. With a mix,
   * the per-account cards carry the numbers and the ribbon steps aside.
   */
  const totals = useMemo(() => {
    if (accounts.length === 0) return null
    const currencies = new Set(accounts.map((a) => a.currency))
    if (currencies.size > 1) return { mixed: true as const }

    const currency = accounts[0].currency
    const cost = accounts.reduce((sum, a) => sum + a.total_cost_basis, 0)
    const pnl = accounts.reduce((sum, a) => sum + a.total_unrealized_pnl, 0)
    // Only accounts with a quote contribute to the day figure, so a broker
    // outage shows as a smaller sample rather than a fake 0%.
    const quoted = accounts.filter((a) => a.day_change != null)
    const dayChange = quoted.reduce((sum, a) => sum + (a.day_change ?? 0), 0)
    const dayOpen = quoted.reduce((sum, a) => sum + a.total_market_value - (a.day_change ?? 0), 0)

    return {
      mixed: false as const,
      currency,
      value: accounts.reduce((sum, a) => sum + (a.balance ?? 0), 0),
      pnl,
      returnPct: cost ? (pnl / cost) * 100 : null,
      dayChange: quoted.length > 0 ? dayChange : null,
      dayChangePct: dayOpen > 0 ? (dayChange / dayOpen) * 100 : null,
      invested: accounts.reduce((sum, a) => sum + a.total_market_value, 0),
      cash: accounts.reduce((sum, a) => sum + a.cash_balance, 0),
    } satisfies PortfolioTotals
  }, [accounts])

  const handleDelete = async (account: InvestmentAccount) => {
    const ok = await confirm({
      title: t('deleteDialog.title', { name: account.name }),
      description: t('deleteDialog.description'),
      confirmLabel: t('deleteDialog.confirmLabel'),
    })
    if (!ok) return
    try {
      await deleteAccount.mutateAsync(account.id)
      toast.success(t('toasts.deleted'))
    } catch {
      toast.error(t('toasts.deleteFailed'))
    }
  }

  return (
    <PageContainer wide className="flex flex-col gap-5">
      <PageHeader
        title={t('page.title')}
        description={t('page.description')}
        className="mb-0"
        action={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
            <PageHeaderActionLabel>{t('page.connectAccount')}</PageHeaderActionLabel>
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-start">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-40 w-full rounded-xl" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-36 w-full rounded-xl" />
              ))}
            </div>
          </div>
          <Skeleton className="h-44 w-full rounded-xl" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-start">
          <Empty className="glass-panel border border-dashed py-14">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={ChartIncreaseIcon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>{t('empty.title')}</EmptyTitle>
              <EmptyDescription>{t('empty.description')}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
                {t('page.connectAccount')}
              </Button>
            </EmptyContent>
          </Empty>
          <MarketToolsNav />
        </div>
      ) : (
        <>
          {/* Hero summary and market tools share one row; account cards get
              the full width below rather than being squeezed beside the tools
              panel too. */}
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch">
            {totals && !totals.mixed ? (
              <PortfolioHero totals={totals} accountCount={accounts.length} />
            ) : (
              <section className="glass-panel rounded-xl border border-border px-4 py-3.5">
                <p className="text-sm text-muted-foreground">
                  {totals?.mixed ? t('summary.mixedCurrencies') : t('page.description')}
                </p>
              </section>
            )}

            <MarketToolsNav />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                selected={account.id === selectedAccount?.id}
                onSelect={() => setSelectedId(account.id)}
                onEdit={() => setEditingAccount(account)}
                onRotateKeys={() => setRotatingAccount(account)}
                onDelete={() => handleDelete(account)}
              />
            ))}
          </div>

          {selectedAccount && <InvestmentAccountDetail account={selectedAccount} />}
        </>
      )}

      <ConnectInvestmentAccountDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      {editingAccount && (
        <EditInvestmentAccountDialog
          open={!!editingAccount}
          onOpenChange={(open) => !open && setEditingAccount(null)}
          account={editingAccount}
        />
      )}
      {rotatingAccount && (
        <RotateApiKeysDialog
          open={!!rotatingAccount}
          onOpenChange={(open) => !open && setRotatingAccount(null)}
          account={rotatingAccount}
        />
      )}
      {confirmDialog}
    </PageContainer>
  )
}

function PortfolioHero({
  totals,
  accountCount,
}: {
  totals: PortfolioTotals
  accountCount: number
}) {
  const { t } = useTranslation('investments')

  const investedPct =
    totals.value > 0 ? Math.min(100, Math.max(0, (totals.invested / totals.value) * 100)) : 0
  const cashPct = Math.min(100, Math.max(0, 100 - investedPct))

  return (
    <section className="glass-panel relative overflow-hidden rounded-xl border border-primary/20 bg-primary/[0.04]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -end-16 -top-20 size-56 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -start-10 size-52 rounded-full bg-secondary/12 blur-3xl"
      />

      <div className="relative flex flex-col gap-2.5 p-3 sm:gap-3 sm:p-4">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-2 sm:gap-x-8">
          <Metric
            label={t('summary.totalValue')}
            value={formatCurrency(totals.value, totals.currency)}
            size="lg"
            hint={t('summary.accountCount', { count: accountCount })}
          />
          <Metric
            label={t('summary.unrealised')}
            value={
              <span className="inline-flex items-baseline gap-2">
                <span
                  className={cn(
                    totals.pnl > 0 && 'text-flow-in',
                    totals.pnl < 0 && 'text-flow-out',
                  )}
                >
                  {totals.pnl > 0 ? '+' : ''}
                  {formatCurrency(totals.pnl, totals.currency)}
                </span>
                <DeltaPct pct={totals.returnPct} className="text-sm" />
              </span>
            }
          />
          <Metric
            label={t('summary.today')}
            value={
              totals.dayChange != null ? (
                <span className="inline-flex items-baseline gap-2">
                  <span
                    className={cn(
                      totals.dayChange > 0 && 'text-flow-in',
                      totals.dayChange < 0 && 'text-flow-out',
                    )}
                  >
                    {totals.dayChange > 0 ? '+' : ''}
                    {formatCurrency(totals.dayChange, totals.currency)}
                  </span>
                  <DeltaPct pct={totals.dayChangePct} className="text-sm" />
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )
            }
          />
        </div>

        <div className="hidden flex-col gap-1.5 sm:flex">
          <div className="flex items-center justify-between gap-2 text-[0.65rem] text-muted-foreground">
            <span className="font-semibold uppercase tracking-[0.14em]">{t('summary.allocation')}</span>
            <span className="tabular-nums">
              {investedPct.toFixed(0)}% · {cashPct.toFixed(0)}%
            </span>
          </div>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted/80">
            <div
              className="bg-primary transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${investedPct}%` }}
            />
            <div
              className="bg-chart-2/70 transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${cashPct}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden />
              {t('card.invested')}{' '}
              <span className="font-medium tabular-nums text-foreground">
                {formatCurrency(totals.invested, totals.currency)}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="size-1.5 rounded-full bg-chart-2/70" aria-hidden />
              {t('card.cash')}{' '}
              <span className="font-medium tabular-nums text-foreground">
                {formatCurrency(totals.cash, totals.currency)}
              </span>
            </span>
          </div>
        </div>

        {/* Allocation split stays visible on mobile as plain numbers — the bar
            and per-currency breakdown are desktop-only, restored above. */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground sm:hidden">
          <span>
            {t('card.invested')}{' '}
            <span className="font-medium tabular-nums text-foreground">
              {formatCurrency(totals.invested, totals.currency)}
            </span>
          </span>
          <span>
            {t('card.cash')}{' '}
            <span className="font-medium tabular-nums text-foreground">
              {formatCurrency(totals.cash, totals.currency)}
            </span>
          </span>
        </div>
      </div>
    </section>
  )
}

/** Glass stack of market subpages — sits beside the portfolio column. */
function MarketToolsNav() {
  const { t } = useTranslation('investments')

  return (
    <nav
      aria-label={t('page.marketTools')}
      className="relative order-first w-full shrink-0 lg:order-none"
    >
      {/* Mobile/tablet: three tiles that fit the full page width with no
          scrolling — a full card list per tool eats too much vertical space on
          a phone. Desktop (sidebar column) keeps the card list. */}
      <div className="grid grid-cols-3 gap-2 lg:hidden">
        {MARKET_TOOLS.map((tool) => (
          <Link
            key={tool.to}
            to={tool.to}
            className="glass-panel flex min-w-0 flex-col items-center gap-1.5 rounded-lg border border-border/70 bg-background/40 px-2 py-2.5 text-center hover:border-primary/35"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/15">
              <HugeiconsIcon icon={tool.icon} strokeWidth={2} className="size-4" />
            </span>
            <span className="w-full truncate text-xs font-medium">{t(tool.titleKey)}</span>
          </Link>
        ))}
      </div>

      <div className="glass-panel hidden h-full flex-col justify-center overflow-hidden rounded-xl border border-border p-2 lg:flex">
        <p className="relative px-2 pb-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {t('page.marketTools')}
        </p>
        <ItemGroup className="relative gap-1" data-size="sm">
          {MARKET_TOOLS.map((tool) => (
            <Item
              key={tool.to}
              asChild
              variant="outline"
              size="sm"
              className="min-h-0 glass-panel border-border/70 bg-background/40 py-1.5 hover:border-primary/35 hover:bg-background/55"
            >
              <Link to={tool.to}>
                <ItemMedia
                  variant="icon"
                  className="size-7 rounded-md bg-primary/10 text-primary ring-1 ring-primary/15"
                >
                  <HugeiconsIcon icon={tool.icon} strokeWidth={2} className="size-3.5" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle className="text-sm">{t(tool.titleKey)}</ItemTitle>
                </ItemContent>
                <ItemActions>
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    strokeWidth={2}
                    className="size-3.5 text-muted-foreground rtl:rotate-180"
                  />
                </ItemActions>
              </Link>
            </Item>
          ))}
        </ItemGroup>
      </div>
    </nav>
  )
}

function AccountCard({
  account,
  selected,
  onSelect,
  onEdit,
  onRotateKeys,
  onDelete,
}: {
  account: InvestmentAccount
  selected: boolean
  onSelect: () => void
  onEdit: () => void
  onRotateKeys: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation('investments')
  const money = (value: number) => formatCurrency(value, account.currency)
  const historyParams = useMemo(() => ({ start_date: computeRange('3m').start }), [])
  const { data: history = [] } = useInvestmentHistory(account.id, historyParams)
  const sparkValues = useMemo(() => history.map((h) => h.total_value), [history])
  const sparkColor = (account.total_return_pct ?? 0) >= 0 ? 'var(--flow-in)' : 'var(--flow-out)'

  return (
    <article
      className={cn(
        'glass-panel relative flex w-full flex-col overflow-hidden rounded-xl border transition-colors',
        selected ? 'border-primary ring-1 ring-primary/30' : 'border-border hover:border-primary/40',
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -end-8 -top-10 size-28 rounded-full bg-primary/8 blur-2xl"
      />

      {/* The card picks which account the panel below shows. A real button
          covering the card rather than a click handler on the article, so it is
          reachable by keyboard and announced as selected. Content sits above it
          via pointer-events, and the actions menu opts back in. */}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="absolute inset-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="sr-only">{t('card.selectAccount', { name: account.name })}</span>
      </button>

      {/* Trend as a backdrop rather than a caption-sized chip — it fills the
          right half of the card and fades into the left, so it reads as the
          card's own texture instead of competing with the figures over it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 end-0 w-3/5 opacity-70 [mask-image:linear-gradient(to_right,transparent,black_38%)]"
      >
        <Sparkline values={sparkValues} color={sparkColor} width={220} height={200} className="size-full" />
      </div>

      <div className="pointer-events-none relative flex flex-col gap-2.5 p-3">
        <div className="flex items-center gap-2">
          <AccountIcon
            icon={
              account.icon ??
              (account.provider === 'freedom24' || account.provider === 'binance'
                ? `${account.provider}.svg`
                : null)
            }
            type="investment"
            className="size-9 shrink-0"
            imageClassName="size-6"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2" >
              <p className="truncate text-sm font-medium leading-tight" title={account.name}>
                {account.name}
              </p>
              <SyncStatusBadge status={account.sync_status} iconOnly />
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="text-[0.65rem] font-medium capitalize text-muted-foreground">
                {account.provider}
              </span>              
            </div>
          </div>
          <div className="pointer-events-auto shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="-mr-1 size-7 opacity-70"
                  aria-label={t('card.actionsLabel')}
                >
                  <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2} className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={onEdit}>
                    <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
                    {t('card.edit')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onRotateKeys}>
                    <HugeiconsIcon icon={Key01Icon} strokeWidth={2} />
                    {t('edit.rotateKeys')}
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={onDelete}>
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                    {t('card.delete')}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="pointer-events-none flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t('card.totalValue')}
            </span>
            <span className="font-heading text-xl font-semibold leading-none tabular-nums tracking-tight">
              {money(account.balance)}
            </span>
          </div>
          <DeltaPill pct={account.total_return_pct} />
        </div>

        <dl className="pointer-events-none flex flex-wrap items-baseline gap-x-3.5 gap-y-0.5 text-xs">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-muted-foreground">{t('card.invested')}</dt>
            <dd className="font-medium tabular-nums">{money(account.total_market_value)}</dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-muted-foreground">{t('card.cash')}</dt>
            <dd className="font-medium tabular-nums">{money(account.cash_balance)}</dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-muted-foreground">{t('card.today')}</dt>
            <dd>
              <DeltaPct pct={account.day_change_pct} className="text-xs" />
            </dd>
          </div>
        </dl>

        <div className="pointer-events-none flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.65rem] text-muted-foreground">
          <Badge variant="outline" className="text-[0.65rem]">
            {t('card.holdings', { count: account.position_count })}
          </Badge>
          <span>
            {account.last_synced_at
              ? t('card.lastSynced', { date: formatDate(account.last_synced_at) })
              : t('card.neverSynced')}
          </span>
        </div>
      </div>
    </article>
  )
}
