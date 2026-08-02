import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
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
import { useBankConnections, useDeleteConnection, useSyncConnection } from './useBankSync'
import type { BankConnection, ConnectionStatus } from './bankSyncApi'

/** Why a callback failed, in the user's terms rather than the API's. */
const CALLBACK_ERRORS: Record<string, string> = {
  missing_state: 'The bank did not send back enough information. Please try again.',
  invalid_state: 'That connection attempt is no longer valid. Please start again.',
  state_expired: 'The connection attempt timed out. Please try again.',
  state_already_used: 'That connection link was already used. Start a new one.',
  bank_declined: 'Your bank declined the request or the approval was cancelled.',
  session_failed: 'We could not complete the connection with your bank. Please try again.',
  no_accounts:
    'Your bank approved access but returned no accounts. They likely still need to be linked in the Enable Banking Control Panel.',
}

const STATUS_STYLES: Record<ConnectionStatus, string> = {
  active: 'bg-flow-in/15 text-flow-in',
  pending: 'bg-muted text-muted-foreground',
  expired: 'bg-warning/20 text-warning',
  revoked: 'bg-muted text-muted-foreground',
  error: 'bg-destructive/15 text-destructive',
}

function formatDate(value: string | null): string {
  if (!value) return 'never'
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
  const [searchParams, setSearchParams] = useSearchParams()
  const [connectOpen, setConnectOpen] = useState(false)
  const [syncingId, setSyncingId] = useState<number | null>(null)

  const { data: connections = [], isLoading } = useBankConnections()
  const syncConnection = useSyncConnection()
  const deleteConnection = useDeleteConnection()
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
        count ? `Bank connected — ${count} account(s) linked` : 'Bank connected',
      )
    } else if (error) {
      toast.error(CALLBACK_ERRORS[error] ?? 'The bank connection could not be completed.')
    }

    const next = new URLSearchParams(searchParams)
    next.delete('linked')
    next.delete('error')
    next.delete('accounts')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  async function handleSync(connection: BankConnection) {
    setSyncingId(connection.id)
    try {
      const result = await syncConnection.mutateAsync(connection.id)
      toast.success(
        result.imported > 0
          ? `Imported ${result.imported} new transaction(s)`
          : 'Already up to date',
      )
      if (result.errors.length > 0) {
        toast.warning(`${result.errors.length} account(s) could not be synced`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncingId(null)
    }
  }

  async function handleDisconnect(connection: BankConnection) {
    const ok = await confirm({
      title: `Disconnect ${connection.aspsp_name}?`,
      description:
        'Syncing stops and the bank consent is revoked. The accounts and their transactions are kept, and become editable again.',
      confirmLabel: 'Disconnect',
      icon: Unlink01Icon,
    })
    if (!ok) return

    try {
      await deleteConnection.mutateAsync({ id: connection.id, deleteAccounts: false })
      toast.success(`${connection.aspsp_name} disconnected`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not disconnect')
    }
  }

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        title="Bank connections"
        description="Sync transactions straight from your bank instead of entering them by hand."
        action={
          <Button onClick={() => setConnectOpen(true)}>
            <HugeiconsIcon icon={Link01Icon} strokeWidth={2} data-icon="inline-start" />
            Connect a bank
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
            <p className="font-heading text-foreground">No banks connected</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect a bank to import transactions automatically. You can keep entering cash
              and other accounts by hand.
            </p>
          </div>
          <Button onClick={() => setConnectOpen(true)}>Connect a bank</Button>
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
                    {connection.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                  Last synced {formatDate(connection.last_sync_at)}
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
                  {syncingId === connection.id ? 'Syncing…' : 'Sync now'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleDisconnect(connection)}
                >
                  Disconnect
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
                    ? 'This connection has expired and is no longer syncing. Reconnect the bank to resume.'
                    : `Access expires in ${expiresIn} day(s). Reconnect to keep transactions syncing.`}
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
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm text-foreground">
                      {account.name}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      {account.balance.toLocaleString(undefined, {
                        style: 'currency',
                        currency: account.currency || 'EUR',
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                No accounts are linked to this connection. They need to be whitelisted in the
                Enable Banking Control Panel before they will appear here.
              </p>
            )}
          </ListCard>
        )
      })}

      <ConnectBankDialog open={connectOpen} onOpenChange={setConnectOpen} />
      {confirmDialog}
    </PageContainer>
  )
}
