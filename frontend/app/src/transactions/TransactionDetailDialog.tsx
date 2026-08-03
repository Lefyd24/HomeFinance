import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDownLeft01Icon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  Delete02Icon,
  Exchange01Icon,
  PencilEdit02Icon,
  Undo02Icon,
} from '@hugeicons/core-free-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '../ui/Dialog'
import { Amount, CategoryChip, flowOfType } from '../ui/money'
import { formatDate } from '../lib/format'
import { cn } from '@/lib/utils'
import { useUnmarkTransfer } from './useTransactions'
import type { Transaction } from './transactionsApi'

interface TransactionDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: Transaction | null
  onEdit: (transaction: Transaction) => void
  onDelete: (transaction: Transaction) => void
  onMarkTransfer: (transaction: Transaction) => void
}

const FLOW_ICON = {
  in: ArrowDownLeft01Icon,
  out: ArrowUpRight01Icon,
  move: Exchange01Icon,
} as const

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2.5 last:border-b-0">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <div className="min-w-0 text-end text-sm font-medium">{children}</div>
    </div>
  )
}

export function TransactionDetailDialog({
  open,
  onOpenChange,
  transaction,
  onEdit,
  onDelete,
  onMarkTransfer,
}: TransactionDetailDialogProps) {
  const { t } = useTranslation('transactions')
  const unmarkTransfer = useUnmarkTransfer()

  if (!transaction) return null

  const isTransfer = transaction.type === 'transfer'
  // Was retagged/paired via MarkTransferDialog (as opposed to a manually
  // created transfer, which the normal edit form already handles).
  const isRetaggedTransfer = Boolean(transaction.original_type)
  const canMarkAsTransfer = transaction.is_bank_synced && !isTransfer
  const flow = flowOfType(transaction.type)
  const FLOW_TITLE = {
    in: t('detail.flowTitle.in'),
    out: t('detail.flowTitle.out'),
    move: t('detail.flowTitle.move'),
  } as const

  async function handleUnmarkTransfer() {
    try {
      await unmarkTransfer.mutateAsync(transaction!.id)
      toast.success(t('markTransfer.toast.unmarked'))
      onOpenChange(false)
    } catch {
      toast.error(t('markTransfer.toast.error'))
    }
  }

  return (
    <Dialog
      open={open}
      title={FLOW_TITLE[flow]}
      description={transaction.description}
      icon={FLOW_ICON[flow]}
      tone={flow}
      size="lg"
      onOpenChange={onOpenChange}
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => {
              onDelete(transaction)
              onOpenChange(false)
            }}
            className="text-destructive hover:text-destructive"
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} data-icon="inline-start" />
            {t('common:actions.delete')}
          </Button>
          {canMarkAsTransfer && (
            <Button
              variant="outline"
              onClick={() => {
                onMarkTransfer(transaction)
                onOpenChange(false)
              }}
            >
              <HugeiconsIcon icon={Exchange01Icon} strokeWidth={2} data-icon="inline-start" />
              {t('markTransfer.action')}
            </Button>
          )}
          {isRetaggedTransfer && (
            <Button
              variant="outline"
              onClick={() => void handleUnmarkTransfer()}
              disabled={unmarkTransfer.isPending}
            >
              <HugeiconsIcon icon={Undo02Icon} strokeWidth={2} data-icon="inline-start" />
              {t('markTransfer.undo')}
            </Button>
          )}
          <Button
            onClick={() => {
              onEdit(transaction)
              onOpenChange(false)
            }}
          >
            <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} data-icon="inline-start" />
            {t('common:actions.edit')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div
          className={cn(
            'rounded-xl border p-4 text-center',
            flow === 'in' && 'border-flow-in/25 bg-flow-in/8',
            flow === 'out' && 'border-flow-out/25 bg-flow-out/8',
            flow === 'move' && 'border-flow-move/25 bg-flow-move/8',
          )}
        >
          <Amount
            value={transaction.amount}
            flow={flow}
            className="font-heading text-3xl font-bold tracking-tight"
          />
          <p className="mt-1 text-xs text-muted-foreground">{formatDate(transaction.date)}</p>
        </div>

        <div className="flex flex-col">
          <Row label={isTransfer ? t('detail.rows.route') : t('detail.rows.account')}>
            {isTransfer && transaction.destination_account_name ? (
              <span className="inline-flex items-center gap-1.5">
                <span>{transaction.account_name}</span>
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  className="size-3.5 text-flow-move"
                  strokeWidth={2}
                />
                <span>{transaction.destination_account_name}</span>
              </span>
            ) : (
              transaction.account_name
            )}
          </Row>

          {!isTransfer && (
            <Row label={t('detail.rows.category')}>
              <CategoryChip
                name={transaction.category_name}
                color={transaction.category_color}
              />
            </Row>
          )}

          {transaction.debt_payment_id && transaction.debt_name && (
            <Row label={t('detail.rows.paysDown')}>
              <Badge variant="secondary">{transaction.debt_name}</Badge>
            </Row>
          )}

          {transaction.recurring_payment_id && transaction.recurring_expense_name && (
            <Row label={t('detail.rows.recurringPayment')}>
              <Badge variant="secondary">{transaction.recurring_expense_name}</Badge>
            </Row>
          )}

          {transaction.is_imported && (
            <Row label={t('detail.rows.source')}>
              <span className="text-muted-foreground">
                {transaction.source_file
                  ? t('detail.rows.importedFrom', { file: transaction.source_file })
                  : t('detail.rows.imported')}
              </span>
            </Row>
          )}

          {transaction.notes && (
            <Row label={t('detail.rows.notes')}>
              <span className="whitespace-pre-wrap text-muted-foreground">
                {transaction.notes}
              </span>
            </Row>
          )}
        </div>
      </div>
    </Dialog>
  )
}
