import { HugeiconsIcon } from '@hugeicons/react'
import { PencilEdit02Icon, Delete02Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '../ui/Dialog'
import { formatDate, formatCurrency } from '../lib/format'
import type { Transaction } from './transactionsApi'

interface TransactionDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: Transaction | null
  onEdit: (transaction: Transaction) => void
  onDelete: (transaction: Transaction) => void
}

export function TransactionDetailDialog({
  open,
  onOpenChange,
  transaction,
  onEdit,
  onDelete,
}: TransactionDetailDialogProps) {
  if (!transaction) return null

  const isTransfer = transaction.type === 'transfer'

  return (
    <Dialog open={open} title="Transaction Details" onOpenChange={onOpenChange}>
      <div className="flex flex-col gap-6">
        {/* Type and Amount */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Amount</span>
            <span
              className={`text-2xl font-bold tabular-nums ${
                transaction.type === 'income'
                  ? 'text-green-600 dark:text-green-400'
                  : transaction.type === 'expense'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-foreground'
              }`}
            >
              {transaction.type === 'income' && '+'}
              {transaction.type === 'expense' && '−'}
              {formatCurrency(transaction.amount)}
            </span>
          </div>
          <Badge
            variant={
              transaction.type === 'income'
                ? 'default'
                : transaction.type === 'expense'
                  ? 'destructive'
                  : 'secondary'
            }
            className="capitalize"
          >
            {transaction.type}
          </Badge>
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Description</span>
          <span className="text-base font-medium">{transaction.description}</span>
        </div>

        {/* Account */}
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Account</span>
          {isTransfer && transaction.destination_account_name ? (
            <div className="flex items-center gap-2">
              <span className="text-base">{transaction.account_name}</span>
              <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" strokeWidth={2} />
              <span className="text-base">{transaction.destination_account_name}</span>
            </div>
          ) : (
            <span className="text-base">{transaction.account_name}</span>
          )}
        </div>

        {/* Category */}
        {!isTransfer && (
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Category</span>
            {transaction.category_name ? (
              <Badge variant="outline" className="w-fit gap-1.5">
                {transaction.category_color && (
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: transaction.category_color }}
                  />
                )}
                <span>{transaction.category_name}</span>
              </Badge>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        )}

        {/* Date */}
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Date</span>
          <span className="text-base">{formatDate(transaction.date)}</span>
        </div>

        {/* Notes */}
        {transaction.notes && (
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Notes</span>
            <span className="text-base text-muted-foreground whitespace-pre-wrap">
              {transaction.notes}
            </span>
          </div>
        )}

        {/* Debt Payment Badge */}
        {transaction.debt_payment_id && transaction.debt_name && (
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Debt Payment</span>
            <Badge variant="secondary" className="w-fit">
              {transaction.debt_name}
            </Badge>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              onEdit(transaction)
              onOpenChange(false)
            }}
          >
            <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
            Edit
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            onClick={() => {
              onDelete(transaction)
              onOpenChange(false)
            }}
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            Delete
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
