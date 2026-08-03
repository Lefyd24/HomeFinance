import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Exchange01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'
import { Amount } from '../ui/money'
import { formatDate } from '../lib/format'
import { useAccounts } from '../accounts/useAccounts'
import { useTransactions, usePairTransfer, useRetagTransfer } from './useTransactions'
import type { Transaction } from './transactionsApi'

interface MarkTransferDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: Transaction | null
}

const OPPOSITE_TYPE = { expense: 'income', income: 'expense' } as const

/**
 * Retags a synced transaction on a linked account as one leg of a transfer.
 *
 * A linked account's balance is bank-authoritative, so the flow branches on
 * what the chosen counterpart account already has:
 * - Another linked account already carries its own synced row for the same
 *   real-world transfer — the user picks it and both rows are paired without
 *   touching either balance.
 * - A manual account has no row yet — retagging creates the balance effect
 *   there directly (the linked leg is never touched).
 */
export function MarkTransferDialog({ open, onOpenChange, transaction }: MarkTransferDialogProps) {
  const { t } = useTranslation('transactions')
  const [counterpartAccountId, setCounterpartAccountId] = useState('')
  const [selectedCandidateId, setSelectedCandidateId] = useState('')

  const { data: accounts = [] } = useAccounts()
  const pairTransfer = usePairTransfer()
  const retagTransfer = useRetagTransfer()

  const counterpartAccount = accounts.find((a) => String(a.id) === counterpartAccountId)

  const candidateType = transaction ? OPPOSITE_TYPE[transaction.type as 'income' | 'expense'] : undefined
  const shouldFetchCandidates = Boolean(counterpartAccount?.is_linked && transaction)
  const { data: candidateData, isFetching: candidatesLoading } = useTransactions(
    {
      account_id: counterpartAccount?.id,
      type: candidateType,
      per_page: 50,
    },
    { enabled: shouldFetchCandidates },
  )

  const candidates = useMemo(() => {
    if (!counterpartAccount?.is_linked || !transaction) return []
    return (candidateData?.items ?? []).filter(
      (c) => c.type !== 'transfer' && Math.abs(c.amount - transaction.amount) < 0.005,
    )
  }, [candidateData, counterpartAccount, transaction])

  const accountOptions = useMemo(
    () =>
      accounts
        .filter((a) => a.id !== transaction?.account_id)
        .map((a) => ({ value: String(a.id), label: a.name })),
    [accounts, transaction],
  )

  function reset() {
    setCounterpartAccountId('')
    setSelectedCandidateId('')
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  async function handleConfirm() {
    if (!transaction || !counterpartAccount) return

    try {
      if (counterpartAccount.is_linked) {
        if (!selectedCandidateId) return
        await pairTransfer.mutateAsync({
          id: transaction.id,
          pairedTransactionId: Number(selectedCandidateId),
        })
      } else {
        await retagTransfer.mutateAsync({
          id: transaction.id,
          destinationAccountId: counterpartAccount.id,
        })
      }
      toast.success(t('markTransfer.toast.success'))
      handleOpenChange(false)
    } catch {
      toast.error(t('markTransfer.toast.error'))
    }
  }

  if (!transaction) return null

  const isPending = pairTransfer.isPending || retagTransfer.isPending
  const canConfirm = counterpartAccount
    ? counterpartAccount.is_linked
      ? Boolean(selectedCandidateId)
      : true
    : false

  return (
    <Dialog
      open={open}
      title={t('markTransfer.title')}
      description={t('markTransfer.description')}
      icon={Exchange01Icon}
      tone="move"
      onOpenChange={handleOpenChange}
      footer={
        <>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={!canConfirm || isPending}>
            {isPending && <Spinner className="size-4" data-icon="inline-start" />}
            {t('markTransfer.confirm')}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <Field>
          <FieldLabel>{t('markTransfer.counterpartLabel')}</FieldLabel>
          <Select
            value={counterpartAccountId}
            onValueChange={(value) => {
              setCounterpartAccountId(value)
              setSelectedCandidateId('')
            }}
            options={accountOptions}
            placeholder={t('markTransfer.counterpartPlaceholder')}
          />
        </Field>

        {counterpartAccount?.is_linked && (
          <Field>
            <FieldLabel>{t('markTransfer.candidateLabel')}</FieldLabel>
            <FieldDescription>{t('markTransfer.candidateHint')}</FieldDescription>
            {candidatesLoading ? (
              <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                <Spinner className="size-4" />
                {t('markTransfer.candidatesLoading')}
              </div>
            ) : candidates.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">{t('markTransfer.noCandidates')}</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {candidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => setSelectedCandidateId(String(candidate.id))}
                    className={`flex items-center justify-between gap-3 rounded-lg border p-2.5 text-start text-sm transition-colors ${
                      selectedCandidateId === String(candidate.id)
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{candidate.description}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(candidate.date)}
                      </span>
                    </span>
                    <Amount value={candidate.amount} flow={candidate.type === 'income' ? 'in' : 'out'} />
                  </button>
                ))}
              </div>
            )}
          </Field>
        )}

        {counterpartAccount && !counterpartAccount.is_linked && (
          <p className="text-sm text-muted-foreground">
            {t('markTransfer.manualHint', { account: counterpartAccount.name })}
          </p>
        )}
      </FieldGroup>
    </Dialog>
  )
}
