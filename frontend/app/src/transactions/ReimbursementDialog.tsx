import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { MoneyReceiveSquareIcon, Search01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Dialog } from '../ui/Dialog'
import { Amount, flowOfType } from '../ui/money'
import { ApiError } from '../lib/apiClient'
import { formatCurrency, formatDate } from '../lib/format'
import { toCents } from './SplitFields'
import { useLinkReimbursement, useReimbursementCandidates } from './useTransactions'
import type { ReimbursementCandidate, Transaction } from './transactionsApi'

interface ReimbursementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: Transaction | null
}

/**
 * Links a shared expense to the incomes in which friends paid the user back.
 *
 * It opens from either side: an expense picks the incomes that repaid it, an
 * income picks the expenses it repaid. Each link carries an amount, so one
 * expense can be repaid by several people and one transfer can cover several
 * expenses. Linked amounts leave both sides of every total (a 100 euro dinner
 * repaid 66 counts as 34), but account balances are untouched because the
 * cash really moved. The dialog stays open after a link so the next repayment
 * can be added straight away.
 */
export function ReimbursementDialog({ open, onOpenChange, transaction }: ReimbursementDialogProps) {
  const { t } = useTranslation('transactions')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [candidate, setCandidate] = useState<ReimbursementCandidate | null>(null)
  const [amount, setAmount] = useState('')
  const link = useLinkReimbursement()

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  const remainingCents = transaction
    ? Math.round(transaction.amount * 100) - Math.round(transaction.reimbursed_amount * 100)
    : 0
  const { data: candidates = [], isFetching } = useReimbursementCandidates(
    transaction?.id ?? 0,
    debouncedSearch,
    { enabled: open && Boolean(transaction) && remainingCents > 0 },
  )

  const maxCents = candidate ? Math.min(remainingCents, Math.round(candidate.remaining * 100)) : 0
  const amountCents = toCents(amount)
  const amountValid = amountCents > 0 && amountCents <= maxCents

  function pick(next: ReimbursementCandidate) {
    setCandidate(next)
    const max = Math.min(remainingCents, Math.round(next.remaining * 100))
    setAmount((max / 100).toFixed(2))
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setSearch('')
      setCandidate(null)
      setAmount('')
    }
    onOpenChange(next)
  }

  async function handleConfirm() {
    if (!transaction || !candidate || !amountValid) return
    try {
      await link.mutateAsync({
        id: transaction.id,
        counterpartId: candidate.id,
        amount: amountCents / 100,
      })
      toast.success(t('reimbursement.toast.linked'))
      setCandidate(null)
      setAmount('')
    } catch (error) {
      toast.error(error instanceof ApiError && error.detail ? error.detail : t('reimbursement.toast.error'))
    }
  }

  if (!transaction) return null

  const kind = transaction.type === 'income' ? 'income' : 'expense'
  const flow = flowOfType(transaction.type)

  return (
    <Dialog
      open={open}
      title={t(`reimbursement.title.${kind}`)}
      description={t(`reimbursement.description.${kind}`)}
      icon={MoneyReceiveSquareIcon}
      tone="move"
      size="lg"
      onOpenChange={handleOpenChange}
      footer={
        <>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t('reimbursement.done')}
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={!amountValid || link.isPending}>
            {link.isPending && <Spinner className="size-4" data-icon="inline-start" />}
            {t('reimbursement.confirm')}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <div className="rounded-lg border p-3 text-sm">
          <p className="truncate font-medium">{transaction.description}</p>
          <p className="text-xs text-muted-foreground">{formatDate(transaction.date)}</p>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
            <div>
              <dt>{t('reimbursement.header.total')}</dt>
              <dd>
                <Amount value={transaction.amount} flow={flow} signed={false} />
              </dd>
            </div>
            <div>
              <dt>{t('reimbursement.header.linked')}</dt>
              <dd>
                <Amount value={transaction.reimbursed_amount} signed={false} />
              </dd>
            </div>
            <div>
              <dt>{t('reimbursement.header.remaining')}</dt>
              <dd>
                <Amount value={remainingCents / 100} signed={false} />
              </dd>
            </div>
          </dl>
        </div>

        {remainingCents <= 0 ? (
          <p className="text-sm text-muted-foreground">{t('reimbursement.fullyLinked')}</p>
        ) : (
          <>
            <div className="relative">
              <HugeiconsIcon
                icon={Search01Icon}
                strokeWidth={2}
                className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('reimbursement.searchPlaceholder')}
                aria-label={t('reimbursement.searchPlaceholder')}
                className="ps-8"
              />
            </div>

            {isFetching && candidates.length === 0 ? (
              <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                <Spinner className="size-4" />
                {t('reimbursement.candidatesLoading')}
              </div>
            ) : candidates.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">{t('reimbursement.noCandidates')}</p>
            ) : (
              <div className="flex max-h-60 flex-col gap-1.5 overflow-y-auto">
                {candidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => pick(c)}
                    className={`flex items-center justify-between gap-3 rounded-lg border p-2.5 text-start text-sm transition-colors ${
                      candidate?.id === c.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{c.description}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {[formatDate(c.date), c.account_name].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {t('reimbursement.candidateRemaining', { amount: formatCurrency(c.remaining) })}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {candidate && (
              <Field>
                <FieldLabel htmlFor="reimbursement-amount">{t('reimbursement.amountLabel')}</FieldLabel>
                <Input
                  id="reimbursement-amount"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  aria-invalid={!amountValid}
                />
                <FieldDescription className={amountValid ? undefined : 'text-destructive'}>
                  {amountValid
                    ? t('reimbursement.amountHint', { max: formatCurrency(maxCents / 100) })
                    : t('reimbursement.amountInvalid', { max: formatCurrency(maxCents / 100) })}
                </FieldDescription>
              </Field>
            )}
          </>
        )}
      </FieldGroup>
    </Dialog>
  )
}
