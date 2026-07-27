import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckmarkCircle02Icon } from '@hugeicons/core-free-icons'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'
import { formatCurrency, formatDate } from '../lib/format'
import { listTransactions } from '../transactions/transactionsApi'
import { useRecordRecurringPayment } from './useRecurring'
import type { RecurringExpense } from './recurringApi'

const NONE = '__none__'
const today = () => new Date().toISOString().slice(0, 10)

const paySchema = z.object({
  amount: z.coerce.number<number>().positive('Amount must be greater than 0'),
  payment_date: z.string().min(1, 'Payment date is required'),
  transaction_id: z.string(),
  notes: z.string().optional(),
})

type PayForm = z.infer<typeof paySchema>

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function MarkPaidDialog({
  open,
  onOpenChange,
  expense,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  expense: RecurringExpense | null
}) {
  const recordPayment = useRecordRecurringPayment()
  const { data: txnList } = useQuery({
    queryKey: ['transactions', { forRecurringPay: true }],
    queryFn: () => listTransactions({ per_page: 200, page: 1, type: 'expense' }),
    enabled: open,
  })

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PayForm>({
    resolver: zodResolver(paySchema) as never,
    defaultValues: {
      amount: 0,
      payment_date: today(),
      transaction_id: NONE,
      notes: '',
    },
  })

  useEffect(() => {
    if (!open || !expense) return
    reset({
      amount: expense.amount,
      payment_date: today(),
      transaction_id: NONE,
      notes: '',
    })
  }, [open, expense, reset])

  const txnOptions = [
    { value: NONE, label: 'No transaction link' },
    ...(txnList?.items ?? []).slice(0, 60).map((t) => ({
      value: String(t.id),
      label: `${formatDate(parseLocalDate(t.date.slice(0, 10)))} — ${t.description} (${formatCurrency(t.amount)})`,
    })),
  ]

  const onSubmit = handleSubmit(async (data) => {
    if (!expense) return
    try {
      await recordPayment.mutateAsync({
        id: expense.id,
        input: {
          amount: data.amount,
          payment_date: data.payment_date,
          transaction_id: data.transaction_id === NONE ? null : Number(data.transaction_id),
          notes: data.notes?.trim() ? data.notes.trim() : null,
        },
      })
      toast.success('Payment recorded — next due date advanced')
      onOpenChange(false)
    } catch {
      toast.error('Failed to record payment')
    }
  })

  const isPending = isSubmitting || recordPayment.isPending

  return (
    <Dialog
      open={open}
      title="Mark as paid"
      description={
        expense
          ? `Records a payment for ${expense.name} and rolls its next due date forward.`
          : 'Records a payment and rolls the next due date forward.'
      }
      icon={CheckmarkCircle02Icon}
      tone="in"
      onOpenChange={onOpenChange}
      className="sm:max-w-md"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="submit" form="mark-paid-form" disabled={isPending || !expense}>
            {isPending ? 'Saving…' : 'Mark as paid'}
          </Button>
        </>
      }
    >
      <form id="mark-paid-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="pay-amount">Amount paid (€)</Label>
          <Input id="pay-amount" type="number" step="0.01" min="0.01" {...register('amount')} />
          {errors.amount && <p className="text-destructive text-sm">{errors.amount.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="pay-date">Payment date</Label>
          <Input id="pay-date" type="date" {...register('payment_date')} />
          {errors.payment_date && (
            <p className="text-destructive text-sm">{errors.payment_date.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label>Link to existing transaction (optional)</Label>
          <Controller
            control={control}
            name="transaction_id"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                options={txnOptions}
                placeholder="No transaction link"
              />
            )}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="pay-notes">Notes</Label>
          <Input id="pay-notes" placeholder="Optional" {...register('notes')} />
        </div>

      </form>
    </Dialog>
  )
}
