import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Alert01Icon,
  BankIcon,
  Link01Icon,
  RefreshIcon,
  Unlink01Icon,
} from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { ListCard } from '../ui/ListCard'
import { useConfirm } from '../ui/useConfirm'
import { ConnectBankDialog } from './ConnectBankDialog'
import { DisconnectChoiceDialog } from './DisconnectChoiceDialog'
import type { DisconnectChoice, DisconnectTarget } from './DisconnectChoiceDialog'
import {
  useBankConnections,
  useDeleteConnection,
  useSyncConnection,
  useUnlinkAccount,
} from './useBankSync'
import type { BankConnection, ConnectionStatus, LinkedAccount } from './bankSyncApi'

const STATUS_STYLES: Record<ConnectionStatus, string> = {
  active: 'bg-flow-in/15 text-flow-in',
  pending: 'bg-muted text-muted-foreground',
  expired: 'bg-warning/20 text-warning',
  revoked: 'bg-muted text-muted-foreground',
  error: 'bg-destructive/15 text-destructive',
}

function formatDate(value: string | null): string | null {
  if (!value) return null
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function daysUntil(value: string | null): number | null {
  if (!value) return null
  const ms = new Date(value).getTime() - Date.now()
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

export function BankSyncPage() {
  const { t, i18n } = useTranslation('bankSync')
  const [searchParams, setSearchParams] = useSearchParams()
  const [connectOpen, setConnectOpen] = useState(false)
  const [syncingId, setSyncingId] = useState<number | null>(null)
  // Set once the user has confirmed; the choice dialog then decides the fate
  // of the account(s) and their transactions. Covers both scopes.
  const [disconnecting, setDisconnecting] = useState<DisconnectTarget | null>(null)

  const { data: connections = [], isLoading } = useBankConnections()
  const syncConnection = useSyncConnection()
  const deleteConnection = useDeleteConnection()
  const unlinkAccount = useUnlinkAccount()
  const { confirm, confirmDialog } = useConfirm()

  // The backend handles the bank's callback server-side, then redirects here
  // with a short result. Report it, then scrub the params so a refresh doesn't
  // replay the toast.
  useEffect(() => {
    const linked = searchParams.get('linked')
    const error = searchParams.get('error')
    if (!linked && !error) return

    if (linked === '1') {
      const count = searchParams.get('accounts')
      toast.success(
        count
          ? t('toasts.connectedWithAccounts', { count: Number(count) })
          : t('toasts.connected'),
      )
    } else if (error) {
      // The backend may add error codes this build has no copy for; show the
      // generic message rather than a raw translation key.
      const key = `callbackErrors.${error}`
      toast.error(i18n.exists(`bankSync:${key}`) ? t(key) : t('callbackErrors.generic'))
    }

    const next = new URLSearchParams(searchParams)
    next.delete('linked')
    next.delete('error')
    next.delete('accounts')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams, t, i18n])

  async function handleSync(connection: BankConnection) {
    setSyncingId(connection.id)
    try {
      const result = await syncConnection.mutateAsync(connection.id)
      toast.success(
        result.imported > 0
          ? t('toasts.imported', { count: result.imported })
          : t('toasts.upToDate'),
      )
      if (result.errors.length > 0) {
        toast.warning(t('toasts.partialFailure', { count: result.errors.length }))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toasts.syncFailed'))
    } finally {
      setSyncingId(null)
    }
  }

  async function handleDisconnect(connection: BankConnection) {
    const ok = await confirm({
      title: t('disconnectDialog.title', { bank: connection.aspsp_name }),
      description: t('disconnectDialog.description'),
      confirmLabel: t('disconnectDialog.confirmLabel'),
      icon: Unlink01Icon,
    })
    if (!ok) return
    // Confirmed the disconnect; now ask what happens to the data.
    setDisconnecting({
      kind: 'bank',
      connectionId: connection.id,
      name: connection.aspsp_name,
      accountCount: connection.accounts.length,
    })
  }

  async function handleUnlinkAccount(connection: BankConnection, account: LinkedAccount) {
    const ok = await confirm({
      title: t('unlinkAccountDialog.title', { account: account.name }),
      description: t('unlinkAccountDialog.description', { bank: connection.aspsp_name }),
      confirmLabel: t('unlinkAccountDialog.confirmLabel'),
      icon: Unlink01Icon,
    })
    if (!ok) return
    setDisconnecting({ kind: 'account', accountId: account.id, name: account.name })
  }

  async function handleDisconnectChoice(choice: DisconnectChoice) {
    const target = disconnecting
    if (!target) return
    setDisconnecting(null)
    const remove = choice === 'delete'

    try {
      if (target.kind === 'bank') {
        const result = await deleteConnection.mutateAsync({
          id: target.connectionId,
          deleteAccounts: remove,
        })
        toast.success(
          remove
            ? t('toasts.disconnectedAndDeleted', {
                bank: target.name,
                count: result?.transactions_deleted ?? 0,
              })
            : t('toasts.disconnectedAndKept', { bank: target.name }),
        )
        return
      }

      const result = await unlinkAccount.mutateAsync({
        accountId: target.accountId,
        deleteAccount: remove,
      })
      toast.success(
        remove
          ? t('toasts.accountDeleted', {
              account: target.name,
              count: result?.transactions_deleted ?? 0,
            })
          : t('toasts.accountUnlinked', { account: target.name }),
      )
      // Unlinking the bank's last account takes the connection with it.
      if (result?.connection_removed) {
        toast.info(t('toasts.connectionRemoved'))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toasts.disconnectFailed'))
    }
  }

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        title={t('page.title')}
        description={t('page.description')}
        action={
          <Button onClick={() => setConnectOpen(true)}>
            <HugeiconsIcon icon={Link01Icon} strokeWidth={2} data-icon="inline-start" />
            {t('page.connect')}
          </Button>
        }
      />

      {isLoading && (
        <div className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && connections.length === 0 && (
        <ListCard as="div" className="flex flex-col items-center gap-3 py-10 text-center">
          <HugeiconsIcon
            icon={BankIcon}
            strokeWidth={1.5}
            className="size-10 text-muted-foreground"
          />
          <div>
            <p className="font-heading text-foreground">{t('empty.title')}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('empty.description')}
            </p>
          </div>
          <Button onClick={() => setConnectOpen(true)}>{t('page.connect')}</Button>
        </ListCard>
      )}

      {connections.map((connection) => {
        const expiresIn = daysUntil(connection.consent_valid_until)
        const expiringSoon =
          connection.status === 'active' && expiresIn !== null && expiresIn <= 7

        return (
          <ListCard as="div" key={connection.id} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-heading text-foreground">{connection.aspsp_name}</span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      STATUS_STYLES[connection.status],
                    )}
                  >
                    {t(`status.${connection.status}`)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                  {t('connection.lastSynced', {
                    when: formatDate(connection.last_sync_at) ?? t('connection.never'),
                  })}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={connection.status !== 'active' || syncingId === connection.id}
                  onClick={() => void handleSync(connection)}
                >
                  <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} data-icon="inline-start" />
                  {syncingId === connection.id
                    ? t('connection.syncing')
                    : t('connection.syncNow')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleDisconnect(connection)}
                >
                  {t('connection.disconnect')}
                </Button>
              </div>
            </div>

            {(expiringSoon || connection.status === 'expired') && (
              <div className="flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-sm text-warning">
                <HugeiconsIcon
                  icon={Alert01Icon}
                  strokeWidth={2}
                  className="mt-0.5 size-4 shrink-0"
                />
                <span>
                  {connection.status === 'expired'
                    ? t('connection.expiredNotice')
                    : t('connection.expiringNotice', { days: expiresIn })}
                </span>
              </div>
            )}

            {connection.last_sync_error && connection.status !== 'expired' && (
              <p className="text-sm text-destructive">{connection.last_sync_error}</p>
            )}

            {connection.accounts.length > 0 ? (
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {connection.accounts.map((account) => (
                  <li
                    key={account.id}
                    className="flex items-center justify-between gap-2 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {account.name}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      {account.balance.toLocaleString(undefined, {
                        style: 'currency',
                        currency: account.currency || 'EUR',
                      })}
                    </span>
                    {/* One authorisation often exposes several accounts, and
                        wanting only some of them synced is normal. */}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 opacity-70 hover:opacity-100"
                      title={t('connection.unlinkAccount')}
                      aria-label={t('connection.unlinkAccountFor', { account: account.name })}
                      onClick={() => void handleUnlinkAccount(connection, account)}
                    >
                      <HugeiconsIcon icon={Unlink01Icon} strokeWidth={2} className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                {t('connection.noAccounts')}
              </p>
            )}
          </ListCard>
        )
      })}

      <ConnectBankDialog open={connectOpen} onOpenChange={setConnectOpen} />
      <DisconnectChoiceDialog
        target={disconnecting}
        onChoose={(choice) => void handleDisconnectChoice(choice)}
        onCancel={() => setDisconnecting(null)}
      />
      {confirmDialog}
    </PageContainer>
  )
}
