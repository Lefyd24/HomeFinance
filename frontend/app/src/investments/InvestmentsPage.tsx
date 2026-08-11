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
import { EarnPositionsTile } from './widgets/EarnPositionsTile'
import { HoldingsList } from './widgets/HoldingsList'
import { MoversTile } from './widgets/MoversTile'
import { PlainEnglishTile } from './widgets/PlainEnglishTile'
import { PortfolioHeadline } from './widgets/PortfolioHeadline'
import { PortfolioTicker } from './widgets/PortfolioTicker'
import { PortfolioValueTile } from './widgets/PortfolioValueTile'
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
  const [range, setRange] = useState<HistoryRangeKey>('6m')
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

  return (
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
            Two columns on desktop: the main column stacks the summary tiles,
            the holdings sidebar runs the full height of whatever the main
            column comes out to — a persistent "here's exactly what's in it"
            panel rather than one tile competing for space with the rest.
            Grid's default `align-items: stretch` is what makes the sidebar
            match the main column's height with no explicit sizing needed.
            Below `lg` there's no room for a sidebar, so it collapses to a
            single stack with holdings last — the overview before the detail.
          */}
          <div className="grid grid-cols-1 items-stretch gap-2.5 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="flex flex-col gap-2.5">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <PortfolioValueTile
                  history={view.history}
                  currency={view.totals?.currency ?? ''}
                  range={range}
                  onRangeChange={setRange}
                  loading={view.isHistoryLoading}
                  className="sm:col-span-2"
                />
                <MoversTile positions={view.positions} loading={view.isLoading} />
              </div>

              {/* `ActivityTile`'s row-span-2 makes it match the combined
                  height of the plain-English read and whichever
                  provider-specific tile sits under it, per column. A 5-column
                  split (3:2) gives activity a bit more room than a plain
                  half-and-half would, since a transaction row needs more
                  width per line than a sentence or a cost figure does. */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-5 sm:grid-rows-2">
                <PlainEnglishTile
                  insights={view.insights}
                  loading={view.isLoading}
                  className="sm:col-span-3"
                />
                <ActivityTile
                  transactions={view.transactions}
                  loading={view.isLoading}
                  className="sm:col-span-2 sm:row-span-2"
                />
                {providerScope === 'freedom24' && (
                  <TradingCostsTile
                    transactions={view.transactions}
                    currency={view.totals?.currency ?? ''}
                    loading={view.isLoading}
                    className="sm:col-span-3"
                  />
                )}
                {providerScope === 'binance' && (
                  <CashFlowTile
                    transactions={view.transactions}
                    loading={view.isLoading}
                    className="sm:col-span-3"
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

            <HoldingsList
              positions={view.positions}
              currency={view.totals?.currency ?? ''}
              accounts={view.accounts}
              loading={view.isLoading}
              className="h-full"
            />
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
      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-[16rem] w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
        <Skeleton className="h-[32rem] w-full rounded-xl" />
      </div>
    </div>
  )
}
