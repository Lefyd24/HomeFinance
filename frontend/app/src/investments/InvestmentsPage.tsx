import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { AllocationTile } from './widgets/AllocationTile'
import { HoldingsList } from './widgets/HoldingsList'
import { MoversTile } from './widgets/MoversTile'
import { PlainEnglishTile } from './widgets/PlainEnglishTile'
import { PortfolioHeadline } from './widgets/PortfolioHeadline'
import { PortfolioTicker } from './widgets/PortfolioTicker'
import { PortfolioValueTile } from './widgets/PortfolioValueTile'
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
  const [requestedScope, setRequestedScope] = useState<PortfolioScope | null>(null)
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
            The bento. One column on a phone, two once there's room to pair
            tiles, twelve on a desktop so the value chart can take half a row
            while allocation and movers split the rest.

            The order is the mobile reading order, and it is deliberate: the
            plain-English read comes second on a phone (right after the chart)
            because on a small screen someone is glancing, not auditing — the
            sentence is more use than the tables. `lg:order-*` restores the
            desktop arrangement, where everything is visible at once anyway.
          */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-12">
            <PortfolioValueTile
              history={view.history}
              currency={view.totals?.currency ?? ''}
              range={range}
              onRangeChange={setRange}
              loading={view.isHistoryLoading}
              className="sm:col-span-2 lg:order-1 lg:col-span-6"
            />
            
            {/* Second in the mobile reading order, right after the chart: on a
                small screen someone is glancing, not auditing, so the sentence
                is more use than the list. On desktop `order-5` puts it back
                beside the holdings, to the right of them. */}
            <PlainEnglishTile
              insights={view.insights}
              loading={view.isLoading}
              className="sm:col-span-2 lg:order-5 lg:col-span-4"
            />
            <AllocationTile
              positions={view.positions}
              currency={view.totals?.currency ?? ''}
              loading={view.isLoading}
              className="lg:order-2 lg:col-span-3"
            />
            <MoversTile
              positions={view.positions}
              loading={view.isLoading}
              className="lg:order-3 lg:col-span-3"
            />
            {/* `order-4` places it before the plain-English tile, so on desktop
                the holdings sit on the left and the read-out beside them. */}
            <HoldingsList
              positions={view.positions}
              currency={view.totals?.currency ?? ''}
              loading={view.isLoading}
              className="sm:col-span-2 lg:order-4 lg:col-span-8"
            />
            <ActivityTile
              transactions={view.transactions}
              loading={view.isLoading}
              className="sm:col-span-2 lg:order-6 lg:col-span-6 xl:col-span-12"
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
      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-12">
        <Skeleton className="h-[16rem] w-full rounded-xl lg:col-span-6" />
        <Skeleton className="h-[16rem] w-full rounded-xl lg:col-span-3" />
        <Skeleton className="h-[16rem] w-full rounded-xl lg:col-span-3" />
        <Skeleton className="h-64 w-full rounded-xl lg:col-span-8" />
        <Skeleton className="h-64 w-full rounded-xl lg:col-span-4" />
      </div>
    </div>
  )
}
