import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog } from '../ui/Dialog'
import { useUpdateRecurringPayment } from './useRecurring'
import type { LinkedTransactionRow } from './recurringApi'

function createSchema(t: (key: string) => string) {
  return z.object({
    amount: z.coerce.number<number>().positive(t('paymentEdit.validation.amountRequired')),
    payment_date: z.string().min(1, t('paymentEdit.validation.dateRequired')),
    notes: z.string().optional(),
  })
}

type FormValues = z.infer<ReturnType<typeof createSchema>>

export function RecurringPaymentEditDialog({
  open,
  onOpenChange,
  expenseId,
  payment,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  expenseId: number | null
  payment: LinkedTransactionRow | null
}) {
  const { t } = useTranslation(['recurring', 'common'])
  const schema = useMemo(() => createSchema(t), [t])
  const updatePayment = useUpdateRecurringPayment()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { amount: 0, payment_date: '', notes: '' },
  })

  useEffect(() => {
    if (!open || !payment) return
    reset({
      amount: payment.amount,
      payment_date: (payment.payment_date || payment.transaction_date || '').slice(0, 10),
      notes: payment.notes ?? '',
    })
  }, [open, payment, reset])

  const onSubmit = handleSubmit(async (data) => {
    if (expenseId == null || !payment) return
    try {
      await updatePayment.mutateAsync({
        expenseId,
        paymentId: payment.payment_id,
        input: {
          amount: data.amount,
          payment_date: data.payment_date,
          notes: data.notes?.trim() || null,
        },
      })
      toast.success(t('paymentEdit.toasts.updated'))
      onOpenChange(false)
    } catch {
      toast.error(t('paymentEdit.toasts.failed'))
    }
  })

  const isPending = isSubmitting || updatePayment.isPending

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('paymentEdit.title')}
      description={t('paymentEdit.description')}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="submit" form="recurring-payment-edit" disabled={isPending}>
            {t('paymentEdit.save')}
          </Button>
        </>
      }
    >
      <form id="recurring-payment-edit" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="rec-pay-amount">{t('paymentEdit.amount')}</Label>
          <Input
            id="rec-pay-amount"
            type="number"
            step="0.01"
            min={0.01}
            {...register('amount')}
          />
          {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="rec-pay-date">{t('paymentEdit.date')}</Label>
          <Input id="rec-pay-date" type="date" {...register('payment_date')} />
          {errors.payment_date && (
            <p className="text-sm text-destructive">{errors.payment_date.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="rec-pay-notes">{t('paymentEdit.notes')}</Label>
          <Input id="rec-pay-notes" {...register('notes')} />
        </div>
        <p className="text-xs text-muted-foreground">{t('paymentEdit.leavesTransaction')}</p>
      </form>
    </Dialog>
  )
}
