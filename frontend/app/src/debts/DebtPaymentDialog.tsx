import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'
import { useAccounts } from '../accounts/useAccounts'
import { useAddDebtPayment } from './useDebts'
import type { Debt } from './debtsApi'

const NONE = '__none__'

const paymentSchema = z.object({
  amount: z.coerce.number().positive('Payment amount is required'),
  principal_amount: z.coerce.number().min(0).optional().or(z.literal('')),
  interest_amount: z.coerce.number().min(0).optional().or(z.literal('')),
  payment_date: z.string().min(1, 'Payment date is required'),
  account_id: z.string().optional(),
  create_transaction: z.boolean(),
  notes: z.string().optional(),
})

type PaymentForm = z.infer<typeof paymentSchema>

function emptyToNull(value: number | '' | undefined): number | null {
  if (value === '' || value == null || Number.isNaN(Number(value))) return null
  return Number(value)
}

export function DebtPaymentDialog({
  open,
  onOpenChange,
  debt,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  debt: Debt | null
}) {
  const addPayment = useAddDebtPayment()
  const { data: accounts = [] } = useAccounts()

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PaymentForm>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: 0,
      principal_amount: '',
      interest_amount: '',
      payment_date: new Date().toISOString().slice(0, 10),
      account_id: NONE,
      create_transaction: true,
      notes: '',
    },
  })

  useEffect(() => {
    if (!open || !debt) return
    reset({
      amount: debt.minimum_payment && debt.minimum_payment > 0 ? debt.minimum_payment : 0,
      principal_amount: '',
      interest_amount: '',
      payment_date: new Date().toISOString().slice(0, 10),
      account_id: debt.linked_account_id != null ? String(debt.linked_account_id) : NONE,
      create_transaction: true,
      notes: '',
    })
  }, [open, debt, reset])

  const accountOptions = [
    { value: NONE, label: 'No account (payment only)' },
    ...accounts.map((a) => ({ value: String(a.id), label: `${a.name} (${a.type})` })),
  ]

  const onSubmit = handleSubmit(async (data) => {
    if (!debt) return
    try {
      await addPayment.mutateAsync({
        debtId: debt.id,
        input: {
          amount: data.amount,
          payment_date: data.payment_date,
          principal_amount: emptyToNull(data.principal_amount),
          interest_amount: emptyToNull(data.interest_amount),
          notes: data.notes?.trim() || null,
          account_id:
            data.account_id && data.account_id !== NONE ? Number(data.account_id) : null,
          create_transaction: data.create_transaction,
        },
      })
      toast.success('Payment recorded')
      onOpenChange(false)
    } catch {
      toast.error('Failed to add payment')
    }
  })

  const isPending = isSubmitting || addPayment.isPending

  return (
    <Dialog
      open={open}
      title={debt ? `Add payment · ${debt.name}` : 'Add payment'}
      onOpenChange={onOpenChange}
      className="sm:max-w-lg"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="payment-amount">Payment amount</Label>
          <Input
            id="payment-amount"
            type="number"
            step="0.01"
            min={0.01}
            aria-invalid={!!errors.amount}
            {...register('amount')}
          />
          {errors.amount && <p className="text-destructive text-sm">{errors.amount.message}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="payment-principal">Principal amount</Label>
            <Input
              id="payment-principal"
              type="number"
              step="0.01"
              min={0}
              placeholder="Optional"
              {...register('principal_amount')}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="payment-interest">Interest amount</Label>
            <Input
              id="payment-interest"
              type="number"
              step="0.01"
              min={0}
              placeholder="Optional"
              {...register('interest_amount')}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="payment-date">Payment date</Label>
          <Input
            id="payment-date"
            type="date"
            aria-invalid={!!errors.payment_date}
            {...register('payment_date')}
          />
          {errors.payment_date && (
            <p className="text-destructive text-sm">{errors.payment_date.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label>Payment account</Label>
          <Controller
            control={control}
            name="account_id"
            render={({ field }) => (
                <Select
                  value={field.value || NONE}
                  onValueChange={field.onChange}
                  options={accountOptions}
                  placeholder="Select account…"
                />
            )}
          />
          <p className="text-xs text-muted-foreground">
            Selecting an account can create a linked transaction.
          </p>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <Controller
            control={control}
            name="create_transaction"
            render={({ field }) => (
              <Checkbox
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
            )}
          />
          <span className="text-sm font-medium">Create transaction record</span>
        </label>

        <div className="flex flex-col gap-2">
          <Label htmlFor="payment-notes">Notes</Label>
          <Input
            id="payment-notes"
            placeholder="e.g., Monthly payment"
            {...register('notes')}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || !debt}>
            {isPending ? 'Saving…' : 'Add payment'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
