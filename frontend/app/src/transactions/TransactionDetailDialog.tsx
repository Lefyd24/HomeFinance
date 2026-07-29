import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDownLeft01Icon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  Delete02Icon,
  Exchange01Icon,
  PencilEdit02Icon,
} from '@hugeicons/core-free-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '../ui/Dialog'
import { Amount, CategoryChip, flowOfType } from '../ui/money'
import { formatDate } from '../lib/format'
import { cn } from '@/lib/utils'
import type { Transaction } from './transactionsApi'

interface TransactionDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: Transaction | null
  onEdit: (transaction: Transaction) => void
  onDelete: (transaction: Transaction) => void
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
}: TransactionDetailDialogProps) {
  const { t } = useTranslation('transactions')

  if (!transaction) return null

  const isTransfer = transaction.type === 'transfer'
  const flow = flowOfType(transaction.type)
  const FLOW_TITLE = {
    in: t('detail.flowTitle.in'),
    out: t('detail.flowTitle.out'),
    move: t('detail.flowTitle.move'),
  } as const

  return (
    <Dialog
      open={open}
      title={FLOW_TITLE[flow]}
      description={transaction.description}
      icon={FLOW_ICON[flow]}
      tone={flow}
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
