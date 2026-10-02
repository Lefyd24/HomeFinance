import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon, ChartIncreaseIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { useConfirm } from '../ui/useConfirm'
import { useMediaQuery } from '../ui/useMediaQuery'
import {
  useDeleteInvestmentAccount,
  useInvestmentAccounts,
  useSyncInvestmentAccount,
} from './useInvestments'
import { aggregateTotals, type PortfolioScope } from './portfolioInsights'
import { usePortfolioView, type HistoryRangeKey } from './usePortfolioView'
import { ConnectInvestmentAccountDialog } from './ConnectInvestmentAccountDialog'
import { EditInvestmentAccountDialog } from './EditInvestmentAccountDialog'
import { RotateApiKeysDialog } from './RotateApiKeysDialog'
import { AccountScopeRail } from './widgets/AccountScopeRail'
import { ActivityTile } from './widgets/ActivityTile'
import { CashFlowTile } from './widgets/CashFlowTile'
import { CurrencyExposureTile } from './widgets/CurrencyExposureTile'
import { DailyReturnsTile } from './widgets/DailyReturnsTile'
import { EarnPositionsTile } from './widgets/EarnPositionsTile'
import { HoldingsList } from './widgets/HoldingsList'
import { MoversTile } from './widgets/MoversTile'
import { PortfolioHeadline } from './widgets/PortfolioHeadline'
import { PortfolioTicker } from './widgets/PortfolioTicker'
import { TradingCostsTile } from './widgets/TradingCostsTile'
import type { InvestmentAccount } from './investmentsApi'

/** A broker will refuse a second sync immediately after the first anyway. */
const SYNC_COOLDOWN_MS = 60_000

function isOnCooldown(lastSyncedAt: string | null): boolean {
  if (!lastSyncedAt) return false
  return Date.now() - new Date(lastSyncedAt).getTime() < SYNC_COOLDOWN_MS
}

/**
 * The investments workspace.
 *
 * A monitoring surface rather than a page of sections: a scope rail across the
 * top, and below it a grid of small tiles that each answer one question about
 * whatever the rail has selected. Picking an account re-points every tile at
 * it, so there is no separate detail panel restating the same figures — the
 * page has one subject at a time.
 *
 * Market news, ticker search and company research describe the market rather
 * than this portfolio, so they are their own pages, reached from the section
 * sidebar. This page stays about the money.
 */
export function InvestmentsPage() {
  const { t } = useTranslation('investments')
  const { data: accounts = [], isLoading } = useInvestmentAccounts()
  const deleteAccount = useDeleteInvestmentAccount()
  const syncAccount = useSyncInvestmentAccount()
  const { confirm, confirmDialog } = useConfirm()
  // The rail is a different tree, not a different stylesheet, so the layout
  // decision has to be made in JS — see `holdings` below.
  const wide = useMediaQuery('(min-width: 1024px)')

  const [dialogOpen, setDialogOpen] = useState(false)
  // A dashboard account row links here with `?account=<id>` so the workspace
  // opens already scoped to the account that was clicked, rather than
  // defaulting to the first one and making the user re-pick it.
  const [searchParams] = useSearchParams()
  const initialAccountId = Number(searchParams.get('account'))
  const [requestedScope, setRequestedScope] = useState<PortfolioScope | null>(
    Number.isInteger(initialAccountId) && initialAccountId > 0
      ? { kind: 'account', id: initialAccountId }
      : null,
  )
  const [range, setRange] = useState<HistoryRangeKey>('30d')
  const [editingAccount, setEditingAccount] = useState<InvestmentAccount | null>(null)
  const [rotatingAccount, setRotatingAccount] = useState<InvestmentAccount | null>(null)

  /**
   * The portfolio-wide figure for the header. Null when the accounts are held
   * in different currencies — the app never invents an exchange rate, so there
   * is simply no grand total to show.
   */
  const aggregate = useMemo(() => aggregateTotals(accounts), [accounts])

  /**
   * Which account the workspace is showing. Resolved at render rather than
   * synced through an effect, so connecting the first account or deleting the
   * selected one lands on something valid without an extra render.
   */
  const scope: PortfolioScope = useMemo(() => {
    const fallback: PortfolioScope = { kind: 'account', id: accounts[0]?.id }
    if (requestedScope?.kind !== 'account') return fallback
    return accounts.some((a) => a.id === requestedScope.id) ? requestedScope : fallback
  }, [accounts, requestedScope])

  const view = usePortfolioView(accounts, scope, range)

  const scopeLabel = view.accounts[0]?.name ?? ''

  /**
   * Which broker's tiles to show below the common ones. Only defined when
   * exactly one account is in scope — a mix of providers has no single
   * broker's data to be specific about, so the provider tiles disappear
   * rather than picking one arbitrarily.
   */
  const providerScope = view.accounts.length === 1 ? view.accounts[0].provider : null

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

  const handleSync = async (account: InvestmentAccount) => {
    try {
      await syncAccount.mutateAsync(account.id)
      toast.success(t('detail.toasts.synced'))
    } catch {
      toast.error(t('detail.toasts.syncFailed'))
    }
  }

  /** The scoped accounts that a "sync" from the header should actually refresh. */
  const syncable = view.accounts.filter((account) => !isOnCooldown(account.last_synced_at))

  /**
   * The holdings panel, in whichever of its two homes this viewport has.
   *
   * One instance rather than two hidden by CSS: it owns the open-holding
   * dialog, and two mounted copies would be two dialogs.
   */
  const holdings = accounts.length > 0 && (
    <HoldingsList
      positions={view.positions}
      currency={view.totals?.currency ?? ''}
      accounts={view.accounts}
      loading={view.isLoading}
      // In the rail it *is* the rail: no card edges, no shadow, and the full
      // height of the well, with only its own rows scrolling.
      className={wide ? 'h-full rounded-none bg-transparent p-4 shadow-none' : undefined}
    />
  )

  return (
    /*
      A terminal's frame rather than a page that happens to be tall: the well
      is exactly the height between the top bar and the footer, the left
      column scrolls inside it, and the holdings rail does not move at all.
      That is the point of a rail — "what am I actually holding" is the one
      question on this page that should never require scrolling back to.

      Below `lg` there is no room for a column beside anything, so the rail
      disappears and the panel rejoins the stack directly under the headline
      figures: on a phone the holdings are what the page is for, and burying
      them under the activity feed put them two screens down.
    */
    <div className="lg:flex lg:h-[calc(100dvh-6rem)] lg:overflow-hidden">
      <div className="min-w-0 flex-1 lg:overflow-y-auto lg:overscroll-contain">
        <PageContainer wide className="flex flex-col gap-2.5">
          <PageHeader
            title={t('page.title')}
            description={t('page.description')}
            className="mb-0"
            // The grand total, not a button: connecting an account is already
            // offered by the rail below, and the header is the one place a
            // portfolio-wide figure belongs now that everything else is scoped to
            // a single account.
            action={aggregate ? <PortfolioHeadline totals={aggregate} /> : undefined}
          />

          {isLoading ? (
            <LoadingWorkspace />
          ) : accounts.length === 0 ? (
            <Empty className="rounded-xl border border-dashed bg-card py-14 shadow-sm">
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
          ) : (
            <>
              <AccountScopeRail
                accounts={accounts}
                scope={scope}
                onScopeChange={setRequestedScope}
                onConnect={() => setDialogOpen(true)}
                onEdit={setEditingAccount}
                onRotateKeys={setRotatingAccount}
                onDelete={(account) => void handleDelete(account)}
                onSync={(account) => void handleSync(account)}
                syncingId={syncAccount.isPending ? syncAccount.variables : null}
              />

              {view.totals && (
                <PortfolioTicker
                  totals={view.totals}
                  scopeLabel={scopeLabel}
                  accounts={view.accounts}
                  onSync={() => syncable.forEach((account) => void handleSync(account))}
                  syncing={syncAccount.isPending}
                  syncDisabled={syncable.length === 0}
                />
              )}

              {/*
              The holdings panel is the page's fixed point, the way the order
              book is in a trading terminal: it stays put in the right column
              while everything else scrolls past it, so "what am I actually
              holding" never needs scrolling back to. It sticks and scrolls
              internally rather than growing with the page, which is why the
              grid is `items-start` — a stretched item fills its row and has
              nothing left to stick within.

              Below `lg` there is no room for a column beside anything, so the
              three blocks stack in DOM order: headline figures, then holdings,
              then the slower-moving detail. Holdings sit second rather than
              last because on a phone they are what the page is for, and the
              explicit row/column placement above only applies from `lg` up.
            */}
              <div className="flex flex-col gap-2.5">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <DailyReturnsTile
                    history={view.history}
                    range={range}
                    onRangeChange={setRange}
                    loading={view.isHistoryLoading}
                    className="sm:col-span-2"
                  />
                  <MoversTile positions={view.positions} loading={view.isLoading} />
                </div>

                {/* Only here when there is no rail to be in. */}
                {!wide && holdings}

                <div className="flex flex-col gap-2.5">
                  {/* Activity needs more width per line than a cost figure does,
                    so the 5-column split gives it three and the broker tile
                    two — and all five when there is no broker tile to sit
                    beside. */}
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-5">
                    <ActivityTile
                      transactions={view.transactions}
                      loading={view.isLoading}
                      className={providerScope ? 'sm:col-span-3' : 'sm:col-span-5'}
                    />
                    {providerScope === 'freedom24' && (
                      <TradingCostsTile
                        transactions={view.transactions}
                        currency={view.totals?.currency ?? ''}
                        loading={view.isLoading}
                        className="sm:col-span-2"
                      />
                    )}
                    {providerScope === 'binance' && (
                      <CashFlowTile
                        transactions={view.transactions}
                        loading={view.isLoading}
                        className="sm:col-span-2"
                      />
                    )}
                  </div>

                  {/* Provider-specific: what's distinctive about *this* broker's
                    data, as a full-width band rather than squeezed into the
                    shape shared above. */}
                  {providerScope === 'freedom24' && (
                    <CurrencyExposureTile
                      positions={view.positions}
                      currency={view.totals?.currency ?? ''}
                      loading={view.isLoading}
                    />
                  )}
                  {providerScope === 'binance' && (
                    <EarnPositionsTile accountId={view.accounts[0].id} />
                  )}
                </div>
              </div>
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
      </div>

      {/* The rail itself. Rendered only when there is a portfolio to list,
          and only wide enough to hold a symbol, a weight and two returns —
          it is a reference column, not a second content area. */}
      {wide && holdings && (
        <aside className="hidden w-[21rem] shrink-0 border-s border-border/60 bg-card lg:block">
          {holdings}
        </aside>
      )}
    </div>
  )
}

/** Mirrors the real grid so the page doesn't reflow once the data lands. */
function LoadingWorkspace() {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex gap-2.5 overflow-hidden">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-[7.5rem] w-[17rem] shrink-0 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-[16rem] w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}
