import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, MoneyReceiveSquareIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Amount } from '../ui/money'
import { ApiError } from '../lib/apiClient'
import { formatCurrency, formatDate } from '../lib/format'
import { useUnlinkReimbursement } from './useTransactions'
import type { Transaction } from './transactionsApi'

/**
 * The repayments section of a transaction's details: the links with a summary
 * of how they change what it counts for and a way to undo each, or, before
 * any exist, a short hint. Either way it carries the button to add a link,
 * which lives here rather than in the already crowded dialog footer.
 */
export function ReimbursementList({
  transaction,
  onLink,
}: {
  transaction: Transaction
  onLink: () => void
}) {
  const { t } = useTranslation('transactions')
  const unlink = useUnlinkReimbursement()
  const kind = transaction.type === 'income' ? 'income' : 'expense'
  const hasLinks = transaction.reimbursements.length > 0

  async function handleUnlink(linkId: number) {
    try {
      await unlink.mutateAsync(linkId)
      toast.success(t('reimbursement.toast.unlinked'))
    } catch (error) {
      toast.error(
        error instanceof ApiError && error.detail ? error.detail : t('reimbursement.toast.error'),
      )
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <p className="text-xs font-medium text-muted-foreground">{t('reimbursement.listTitle')}</p>
      {!hasLinks && (
        <p className="text-sm text-muted-foreground">{t(`reimbursement.emptyHint.${kind}`)}</p>
      )}
      {hasLinks && (
        <>
          <p className="text-sm">
            {t(`reimbursement.summary.${kind}`, {
              total: formatCurrency(transaction.amount),
              linked: formatCurrency(transaction.reimbursed_amount),
              counted: formatCurrency(transaction.effective_amount),
            })}
          </p>
          <ul className="flex flex-col divide-y">
            {transaction.reimbursements.map((link) => (
              <li key={link.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{link.description}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(link.date)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <Amount value={link.amount} signed={false} />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={unlink.isPending}
                    aria-label={t('reimbursement.unlink', { description: link.description })}
                    onClick={() => void handleUnlink(link.id)}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <Button variant="outline" size="sm" className="self-start" onClick={onLink}>
        <HugeiconsIcon icon={MoneyReceiveSquareIcon} strokeWidth={2} data-icon="inline-start" />
        {t(`reimbursement.action.${kind}`)}
      </Button>
    </div>
  )
}
