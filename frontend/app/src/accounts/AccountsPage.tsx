import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  ArchiveIcon,
  MoreVerticalIcon,
  PencilEdit02Icon,
  Delete02Icon,
  RefreshIcon,
  ArrowDataTransferHorizontalIcon,
  Wallet01Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { PageContainer } from '../ui/PageContainer'
import { PageHeader, PageHeaderActionLabel } from '../ui/PageHeader'
import { useConfirm } from '../ui/useConfirm'
import { formatCurrency } from '../lib/format'
import { cn } from '@/lib/utils'
import { useAccounts, useDeleteAccount, useSetAccountActive } from './useAccounts'
import { AccountFormDialog } from './AccountFormDialog'
import { AccountIcon, getAccountTypeMeta, ACCOUNT_TYPE_ORDER } from './bankIcons'
import type { Account, AccountType } from './accountsApi'

/** Credit balances are liabilities; everything else is money you hold. */
function isLiability(type: AccountType) {
  return type === 'credit'
}

export function AccountsPage() {
  const { t } = useTranslation('accounts')
  const { data: accounts = [], isLoading } = useAccounts()
  const deleteAccount = useDeleteAccount()
  const setAccountActive = useSetAccountActive()
  const { confirm, confirmDialog } = useConfirm()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [showRetired, setShowRetired] = useState(false)

  // This page is the one place that shows retired accounts at all, and even
  // here they are kept out of the arithmetic: a closed account's last balance
  // is a historical fact, not part of what you hold today.
  const active = useMemo(() => accounts.filter((a) => a.is_active), [accounts])
  const retired = useMemo(() => accounts.filter((a) => !a.is_active), [accounts])

  const summary = useMemo(() => {
    const held = active
      .filter((a) => !isLiability(a.type))
      .reduce((sum, a) => sum + Math.max(a.balance ?? 0, 0), 0)
    const owed = active
      .filter((a) => isLiability(a.type))
      .reduce((sum, a) => sum + Math.abs(a.balance ?? 0), 0)
    const liquid = active
      .filter((a) => a.type === 'checking' || a.type === 'savings' || a.type === 'cash')
      .reduce((sum, a) => sum + Math.max(a.balance ?? 0, 0), 0)

    const allocation = ACCOUNT_TYPE_ORDER.filter((type) => !isLiability(type))
      .map((type) => ({
        type,
        amount: active
          .filter((a) => a.type === type)
          .reduce((sum, a) => sum + Math.max(a.balance ?? 0, 0), 0),
      }))
      .filter((slice) => slice.amount > 0)

    return { held, owed, liquid, net: held - owed, allocation }
  }, [active])

  const groups = useMemo(() => {
    return ACCOUNT_TYPE_ORDER.map((type) => ({
      type,
      accounts: active.filter((a) => a.type === type),
    })).filter((group) => group.accounts.length > 0)
  }, [active])

  const handleAdd = () => {
    setEditingAccount(null)
    setDialogOpen(true)
  }

  const handleEdit = (account: Account) => {
    setEditingAccount(account)
    setDialogOpen(true)
  }

  const handleToggleActive = async (account: Account) => {
    if (account.is_active) {
      const ok = await confirm({
        title: t('deactivateDialog.title', { name: account.name }),
        description: t('deactivateDialog.description'),
        confirmLabel: t('deactivateDialog.confirmLabel'),
      })
      if (!ok) return
    }
    try {
      await setAccountActive.mutateAsync({ id: account.id, isActive: !account.is_active })
      toast.success(account.is_active ? t('toasts.deactivated') : t('toasts.reactivated'))
      // Nothing is hidden without saying where it went — the retired section is
      // collapsed by default, so a card vanishing from the grid is otherwise
      // indistinguishable from a deletion.
      if (account.is_active) setShowRetired(true)
    } catch {
      toast.error(t('toasts.activeChangeFailed'))
    }
  }

  const handleDelete = async (account: Account) => {
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
    <PageContainer wide className="flex flex-col gap-6">
      <PageHeader
        title={t('page.title')}
        description={t('page.description')}
        className="mb-0"
        action={
          <Button size="sm" onClick={handleAdd}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
            <PageHeaderActionLabel>{t('page.addAccount')}</PageHeaderActionLabel>
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-14 w-full rounded-lg" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 w-full rounded-xl" />
            ))}
          </div>
        </div>
      ) : accounts.length === 0 ? (
        <Empty className="border border-dashed py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Wallet01Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>{t('empty.title')}</EmptyTitle>
            <EmptyDescription>{t('empty.description')}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={handleAdd}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              {t('page.addAccount')}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <AllocationBand summary={summary} />

          <div className="flex flex-col gap-7">
            {groups.map((group) => {
              const meta = getAccountTypeMeta(group.type, t)
              const groupTotal = group.accounts.reduce((sum, a) => sum + (a.balance ?? 0), 0)
              return (
                <section key={group.type} className="flex flex-col gap-3">
                  <div className="flex items-baseline gap-3">
                    <span className={cn('size-2 rounded-full', meta.fill)} aria-hidden />
                    <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {meta.plural}
                    </h2>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {group.accounts.length}
                    </span>
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-xs font-medium tabular-nums text-muted-foreground">
                      {formatCurrency(groupTotal)}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {group.accounts.map((account) => (
                      <AccountCard
                        key={account.id}
                        account={account}
                        shareOf={summary.held}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onToggleActive={handleToggleActive}
                      />
                    ))}
                  </div>
                </section>
              )
            })}

            {retired.length > 0 && (
              <section className="flex flex-col gap-3">
                {/* Below the fold and behind a click: these are accounts the
                    user has finished with. Present, findable, and out of the
                    way of the ones that still matter. */}
                <button
                  type="button"
                  onClick={() => setShowRetired((open) => !open)}
                  aria-expanded={showRetired}
                  className="flex items-baseline gap-3 text-left"
                >
                  <span className="size-2 rounded-full bg-muted-foreground/40" aria-hidden />
                  <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {t('retired.heading')}
                  </h2>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {retired.length}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-xs font-medium text-muted-foreground">
                    {showRetired ? t('retired.hide') : t('retired.show')}
                  </span>
                </button>
                {showRetired && (
                  <>
                    <p className="text-xs text-muted-foreground">{t('retired.description')}</p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {retired.map((account) => (
                        <AccountCard
                          key={account.id}
                          account={account}
                          shareOf={0}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                          onToggleActive={handleToggleActive}
                        />
                      ))}
                    </div>
                  </>
                )}
              </section>
            )}
          </div>
        </>
      )}

      <AccountFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        account={editingAccount}
      />
      {confirmDialog}
    </PageContainer>
  )
}

/**
 * The page's one big idea: not just how much you have, but how it is spread.
 * A single bar answers "am I over-concentrated in one place?" at a glance.
 */
function AllocationBand({
  summary,
}: {
  summary: {
    held: number
    owed: number
    liquid: number
    net: number
    allocation: Array<{ type: AccountType; amount: number }>
  }
}) {
  const { t } = useTranslation('accounts')
  const total = Math.max(summary.held, 0.01)

  return (
    <section aria-label={t('allocationLabel')} className="flex flex-col gap-3 pb-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t('summary.totalHeld')}
          </span>
          <span className="font-heading text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">
            {formatCurrency(summary.held)}
          </span>
        </div>
        <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
          <InlineStat label={t('summary.liquid')} value={formatCurrency(summary.liquid)} />
          <InlineStat
            label={t('summary.credit')}
            value={formatCurrency(summary.owed)}
            tone={summary.owed > 0 ? 'out' : 'plain'}
          />
          <InlineStat
            label={t('summary.net')}
            value={formatCurrency(summary.net)}
            tone={summary.net >= 0 ? 'in' : 'out'}
          />
        </dl>
      </div>

      {summary.allocation.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex h-1 w-full overflow-hidden rounded-full bg-muted/80 shadow-inner">
            {summary.allocation.map((slice) => (
              <div
                key={slice.type}
                className={cn('h-full', getAccountTypeMeta(slice.type, t).fill)}
                style={{ width: `${(slice.amount / total) * 100}%` }}
                title={`${getAccountTypeMeta(slice.type, t).label}: ${formatCurrency(slice.amount)}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {summary.allocation.map((slice) => {
              const meta = getAccountTypeMeta(slice.type, t)
              return (
                <span key={slice.type} className="flex items-center gap-1.5 text-[0.7rem]">
                  <span className={cn('size-1.5 rounded-full', meta.fill)} aria-hidden />
                  <span className="text-muted-foreground">{meta.label}</span>
                  <span className="font-medium tabular-nums text-foreground/80">
                    {Math.round((slice.amount / total) * 100)}%
                  </span>
                </span>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

function InlineStat({
  label,
  value,
  tone = 'plain',
}: {
  label: string
  value: string
  tone?: 'plain' | 'in' | 'out'
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'font-medium tabular-nums',
          tone === 'in' && 'text-flow-in',
          tone === 'out' && 'text-flow-out',
          tone === 'plain' && 'text-foreground',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function AccountCard({
  account,
  shareOf,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  account: Account
  shareOf: number
  onEdit: (account: Account) => void
  onDelete: (account: Account) => void
  onToggleActive: (account: Account) => void
}) {
  const { t } = useTranslation('accounts')
  const meta = getAccountTypeMeta(account.type, t)
  const balance = account.balance ?? 0
  const liability = isLiability(account.type)
  const share = shareOf > 0 && !liability ? Math.max(balance, 0) / shareOf : 0

  const sharePct = Math.round(share * 100)

  return (
    <article
      className={cn(
        'glass-panel flex h-full flex-col rounded-xl border',
        // Legible, but visibly not part of the working set.
        !account.is_active && 'opacity-65 saturate-50',
      )}
    >
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="flex items-center gap-2.5">
          <AccountIcon
            icon={account.icon ?? (account.provider === 'freedom24' ? 'freedom24.svg' : null)}
            type={account.type}
            className="size-10 rounded-lg shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7)] ring-1 ring-white/45 dark:ring-white/12"
            imageClassName="size-7"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium leading-tight tracking-tight" title={account.name}>
              {account.name}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              <span className={cn('text-[0.65rem] font-medium', meta.text)}>{meta.label}</span>
              <span className="text-[0.65rem] text-muted-foreground/80">·</span>
              <span className="text-[0.65rem] font-medium tabular-nums text-muted-foreground">
                {account.currency}
              </span>
              {account.provider && (
                <>
                  <span className="text-[0.65rem] text-muted-foreground/80">·</span>
                  <span className="text-[0.65rem] font-medium text-flow-move">{t('card.synced')}</span>
                </>
              )}
              {!account.is_active && (
                <>
                  <span className="text-[0.65rem] text-muted-foreground/80">·</span>
                  <span className="text-[0.65rem] text-muted-foreground">{t('card.inactive')}</span>
                </>
              )}
              {account.is_linked && (
                <>
                  <span className="text-[0.65rem] text-muted-foreground/80">·</span>
                  <span
                    className="text-[0.65rem] font-medium text-flow-in"
                    title={
                      account.last_synced_at
                        ? t('card.lastSyncedAt', {
                            when: new Date(account.last_synced_at).toLocaleString(),
                          })
                        : t('card.neverSynced')
                    }
                  >
                    {t('card.bankSynced')}
                  </span>
                </>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="-mr-1 size-7 shrink-0 opacity-70"
                aria-label={t('card.actionsLabel')}
              >
                <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2} className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => onEdit(account)}>
                  <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
                  {t('card.edit')}
                </DropdownMenuItem>
                {account.is_linked && (
                  <DropdownMenuItem asChild>
                    <Link to="/connections">
                      <HugeiconsIcon icon={ArrowDataTransferHorizontalIcon} strokeWidth={2} />
                      {t('card.manageConnection')}
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link to={`/transactions?account_id=${account.id}`}>
                    <HugeiconsIcon icon={ArrowDataTransferHorizontalIcon} strokeWidth={2} />
                    {t('card.transactions')}
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                {/* Offered above delete, and deliberately: retiring an account
                    is what most people actually want when they reach for
                    delete, and it keeps the history the rest of the app is
                    built on. */}
                <DropdownMenuItem onClick={() => onToggleActive(account)}>
                  <HugeiconsIcon
                    icon={account.is_active ? ArchiveIcon : RefreshIcon}
                    strokeWidth={2}
                  />
                  {account.is_active ? t('card.deactivate') : t('card.reactivate')}
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                {/* A linked account must be removed from the Connections page
                    so the bank consent is revoked too; the API rejects it here. */}
                <DropdownMenuItem
                  variant="destructive"
                  disabled={account.is_linked}
                  onClick={() => onDelete(account)}
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                  {account.is_linked ? t('card.deleteLinked') : t('card.delete')}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {liability ? t('card.outstanding') : t('card.balance')}
            </p>
            <p
              className={cn(
                'font-heading text-2xl font-semibold leading-none tabular-nums tracking-tight',
                liability ? 'text-flow-out' : balance >= 0 ? 'text-foreground' : 'text-destructive',
              )}
            >
              {formatCurrency(balance, account.currency)}
            </p>
          </div>
          {!liability && shareOf > 0 && (
            <span className="shrink-0 text-[0.65rem] font-medium tabular-nums text-muted-foreground">
              {t('card.sharePct', { percent: sharePct })}
            </span>
          )}
        </div>

        {!liability && shareOf > 0 && (
          <div className="h-0.5 w-full overflow-hidden rounded-full bg-foreground/[0.06] shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] dark:bg-white/[0.08]">
            <div
              className={cn('h-full rounded-full opacity-90', meta.fill)}
              style={{ width: `${Math.max(share * 100, 2)}%` }}
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-0.5">
          {account.description ? (
            <p className="line-clamp-1 min-w-0 text-xs text-muted-foreground">{account.description}</p>
          ) : (
            <span className="min-w-0 flex-1" aria-hidden />
          )}
          <Link
            to={`/transactions?account_id=${account.id}`}
            className="shrink-0 text-[0.65rem] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('card.transactions')}
          </Link>
        </div>
      </div>
    </article>
  )
}
