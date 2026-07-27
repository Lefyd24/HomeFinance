import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { BankIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'
import { formatCurrency } from '../lib/format'
import { useAccounts } from '../accounts/useAccounts'
import { useCreateDebt, useUpdateDebt } from './useDebts'
import type { Debt, DebtInput } from './debtsApi'

const debtSchema = z
  .object({
    name: z.string().min(1, 'Debt name is required').max(200),
    creditor: z.string().max(200).optional(),
    type: z.enum([
      'credit_card',
      'student_loan',
      'mortgage',
      'car_loan',
      'personal_loan',
      'utilities',
      'subscription',
      'medical',
      'tax',
      'informal',
      'legal',
      'other',
      'custom',
    ]),
    custom_type: z.string().max(200).optional(),
    original_balance: z.coerce.number<number>().positive('Original balance must be greater than 0'),
    current_balance: z.coerce.number<number>().min(0, 'Current balance cannot be negative'),
    interest_rate_pct: z.coerce.number<number>().min(0).max(100).optional().or(z.literal('')),
    minimum_payment: z.coerce.number<number>().min(0).optional().or(z.literal('')),
    priority: z.coerce.number<number>().int().min(0).optional().or(z.literal('')),
    opened_date: z.string().optional(),
    maturity_date: z.string().optional(),
    is_paid_off: z.boolean(),
    paid_off_date: z.string().optional(),
    recurrence_interval: z.coerce.number<number>().int().min(1).optional().or(z.literal('')),
    recurrence_unit: z.enum(['__none__', 'days', 'weeks', 'months']),
    recurrence_day_of_month: z.coerce.number<number>().int().min(1).max(31).optional().or(z.literal('')),
    linked_account_id: z.string().optional(),
    next_payment_date: z.string().optional(),
    notify_enabled: z.boolean(),
    notify_days_before: z.coerce.number<number>().int().min(1).max(90).optional().or(z.literal('')),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'custom' && !data.custom_type?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Custom type name is required',
        path: ['custom_type'],
      })
    }
  })

type DebtForm = z.infer<typeof debtSchema>

const NONE = '__none__'

const TYPE_OPTIONS = [
  { value: 'credit_card', label: 'Credit card' },
  { value: 'personal_loan', label: 'Personal loan' },
  { value: 'student_loan', label: 'Student loan' },
  { value: 'mortgage', label: 'Mortgage' },
  { value: 'car_loan', label: 'Car loan' },
  { value: 'informal', label: 'Personal / Informal' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'medical', label: 'Medical' },
  { value: 'tax', label: 'Tax' },
  { value: 'legal', label: 'Legal' },
  { value: 'other', label: 'Other' },
  { value: 'custom', label: 'Custom…' },
]

const RECURRENCE_OPTIONS = [
  { value: NONE, label: 'Not recurring' },
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
  { value: 'months', label: 'Months' },
]

function emptyToNullNumber(value: number | '' | undefined): number | null {
  if (value === '' || value == null || Number.isNaN(Number(value))) return null
  return Number(value)
}

function emptyToNullString(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function aprToPercent(rate: number | null | undefined): number | '' {
  if (rate == null) return ''
  return rate <= 1 ? Number((rate * 100).toFixed(4)) : rate
}

function percentToApr(pct: number | '' | undefined): number | null {
  const n = emptyToNullNumber(pct)
  if (n == null) return null
  return n / 100
}

function toFormValues(debt?: Debt | null): DebtForm {
  if (!debt) {
    return {
      name: '',
      creditor: '',
      type: 'credit_card',
      custom_type: '',
      original_balance: 0,
      current_balance: 0,
      interest_rate_pct: '',
      minimum_payment: '',
      priority: 0,
      opened_date: '',
      maturity_date: '',
      is_paid_off: false,
      paid_off_date: '',
      recurrence_interval: 1,
      recurrence_unit: 'months',
      recurrence_day_of_month: '',
      linked_account_id: NONE,
      next_payment_date: '',
      notify_enabled: false,
      notify_days_before: '',
      notes: '',
    }
  }

  return {
    name: debt.name,
    creditor: debt.creditor ?? '',
    type: debt.type,
    custom_type: debt.custom_type ?? '',
    original_balance: debt.original_balance,
    current_balance: debt.current_balance,
    interest_rate_pct: aprToPercent(debt.interest_rate),
    minimum_payment: debt.minimum_payment ?? '',
    priority: debt.priority ?? 0,
    opened_date: debt.opened_date ?? '',
    maturity_date: debt.maturity_date ?? '',
    is_paid_off: !!debt.is_paid_off,
    paid_off_date: debt.paid_off_date ?? '',
    recurrence_interval: debt.recurrence_interval ?? 1,
    recurrence_unit: debt.recurrence_unit ?? NONE,
    recurrence_day_of_month: debt.recurrence_day_of_month ?? '',
    linked_account_id: debt.linked_account_id != null ? String(debt.linked_account_id) : NONE,
    next_payment_date: debt.next_payment_date ?? '',
    notify_enabled: !!debt.notify_enabled,
    notify_days_before: debt.notify_days_before ?? '',
    notes: debt.notes ?? '',
  }
}

function toApiInput(data: DebtForm): DebtInput {
  const isPaidOff = data.is_paid_off
  const notifyEnabled = data.notify_enabled
  const hasRecurrence = data.recurrence_unit !== NONE
  const linkedAccountId =
    data.linked_account_id && data.linked_account_id !== NONE
      ? Number(data.linked_account_id)
      : null
  const minPayment = emptyToNullNumber(data.minimum_payment)

  return {
    name: data.name.trim(),
    creditor: emptyToNullString(data.creditor),
    type: data.type,
    custom_type: data.type === 'custom' ? emptyToNullString(data.custom_type) : null,
    original_balance: data.original_balance,
    current_balance: data.current_balance,
    interest_rate: percentToApr(data.interest_rate_pct),
    minimum_payment: minPayment != null && minPayment > 0 ? minPayment : null,
    opened_date: emptyToNullString(data.opened_date),
    maturity_date: emptyToNullString(data.maturity_date),
    priority: emptyToNullNumber(data.priority) ?? 0,
    notes: emptyToNullString(data.notes),
    is_paid_off: isPaidOff,
    paid_off_date: isPaidOff ? emptyToNullString(data.paid_off_date) : null,
    recurrence_interval: hasRecurrence ? emptyToNullNumber(data.recurrence_interval) : null,
    recurrence_unit: hasRecurrence
      ? (data.recurrence_unit as 'days' | 'weeks' | 'months')
      : null,
    recurrence_day_of_month: hasRecurrence
      ? emptyToNullNumber(data.recurrence_day_of_month)
      : null,
    linked_account_id: linkedAccountId,
    next_payment_date: emptyToNullString(data.next_payment_date),
    notify_enabled: notifyEnabled,
    notify_days_before: notifyEnabled ? emptyToNullNumber(data.notify_days_before) : null,
  }
}

export function DebtFormDialog({
  open,
  onOpenChange,
  debt,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  debt?: Debt | null
}) {
  const isEdit = !!debt
  const createDebt = useCreateDebt()
  const updateDebt = useUpdateDebt()
  const { data: accounts = [] } = useAccounts()

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<DebtForm>({
    resolver: zodResolver(debtSchema),
    defaultValues: toFormValues(null),
  })

  useEffect(() => {
    if (!open) return
    reset(toFormValues(debt))
  }, [open, debt, reset])

  const preview = watch()
  const typeLabel =
    preview.type === 'custom'
      ? preview.custom_type?.trim() || 'Custom'
      : (TYPE_OPTIONS.find((o) => o.value === preview.type)?.label ?? preview.type)

  const accountOptions = [
    { value: NONE, label: 'No linked account' },
    ...accounts.map((a) => ({ value: String(a.id), label: `${a.name} (${a.type})` })),
  ]

  const onSubmit = handleSubmit(async (data) => {
    const input = toApiInput(data)
    try {
      if (isEdit && debt) {
        await updateDebt.mutateAsync({ id: debt.id, input })
        toast.success('Debt updated')
      } else {
        await createDebt.mutateAsync(input)
        toast.success('Debt created')
      }
      onOpenChange(false)
    } catch {
      toast.error(isEdit ? 'Failed to update debt' : 'Failed to create debt')
    }
  })

  const isPending = isSubmitting || createDebt.isPending || updateDebt.isPending

  return (
    <Dialog
      open={open}
      title={isEdit ? 'Edit debt' : 'Add a debt'}
      description="Give it an APR and a minimum payment and the app can project interest and a payoff date."
      icon={BankIcon}
      tone="primary"
      onOpenChange={onOpenChange}
      className="sm:max-w-xl"
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
          <Button type="submit" form="debt-form" disabled={isPending}>
            {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Add debt'}
          </Button>
        </>
      }
    >
      <form id="debt-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="rounded-xl border border-primary/20 bg-primary/6 p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
              <HugeiconsIcon icon={BankIcon} strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold">
                {preview.name.trim() || 'New debt'}
              </p>
              <p className="text-xs text-muted-foreground">{typeLabel}</p>
            </div>
            <p className="shrink-0 font-heading text-xl font-bold tabular-nums">
              {formatCurrency(Number(preview.current_balance) || 0)}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="debt-name">Debt name</Label>
          <Input
            id="debt-name"
            placeholder="e.g., Credit Card, Car Loan"
            aria-invalid={!!errors.name}
            {...register('name')}
          />
          {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="debt-creditor">Creditor</Label>
          <Input
            id="debt-creditor"
            placeholder="e.g., Bank of America"
            {...register('creditor')}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label>Debt type</Label>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  options={TYPE_OPTIONS}
                  placeholder="Choose a type"
                />
              )}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="debt-priority">Priority</Label>
            <Input id="debt-priority" type="number" min={0} {...register('priority')} />
          </div>
        </div>

        {preview.type === 'custom' && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="debt-custom-type">Custom type name</Label>
            <Input
              id="debt-custom-type"
              placeholder="e.g., Insurance, Rent, HOA Fee"
              aria-invalid={!!errors.custom_type}
              {...register('custom_type')}
            />
            {errors.custom_type && (
              <p className="text-destructive text-sm">{errors.custom_type.message}</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="original_balance">Original balance</Label>
            <Input
              id="original_balance"
              type="number"
              step="0.01"
              aria-invalid={!!errors.original_balance}
              {...register('original_balance')}
            />
            {errors.original_balance && (
              <p className="text-destructive text-sm">{errors.original_balance.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="current_balance">Current balance</Label>
            <Input
              id="current_balance"
              type="number"
              step="0.01"
              aria-invalid={!!errors.current_balance}
              {...register('current_balance')}
            />
            {errors.current_balance && (
              <p className="text-destructive text-sm">{errors.current_balance.message}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="interest_rate_pct">Interest rate (APR %)</Label>
            <Input
              id="interest_rate_pct"
              type="number"
              step="0.01"
              min={0}
              max={100}
              placeholder="e.g., 15.99"
              {...register('interest_rate_pct')}
            />
            <p className="text-xs text-muted-foreground">
              Annual rate; payoff math compounds monthly.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="minimum_payment">Minimum payment</Label>
            <Input
              id="minimum_payment"
              type="number"
              step="0.01"
              min={0}
              placeholder="Required for interest projections"
              {...register('minimum_payment')}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="opened_date">Opened date</Label>
            <Input id="opened_date" type="date" {...register('opened_date')} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="maturity_date">Maturity date</Label>
            <Input id="maturity_date" type="date" {...register('maturity_date')} />
          </div>
        </div>

        <Separator />
        <p className="text-sm font-medium text-foreground">Status</p>

        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <Controller
              control={control}
              name="is_paid_off"
              render={({ field }) => (
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(checked) => {
                    const on = checked === true
                    field.onChange(on)
                    if (on && !watch('paid_off_date')) {
                      setValue('paid_off_date', new Date().toISOString().slice(0, 10))
                    }
                  }}
                />
              )}
            />
            <span className="text-sm font-medium">Mark as paid off</span>
          </label>
          {preview.is_paid_off && (
            <div className="flex flex-col gap-2 ps-7">
              <Label htmlFor="paid_off_date">Paid off date</Label>
              <Input id="paid_off_date" type="date" {...register('paid_off_date')} />
            </div>
          )}
        </div>

        <Separator />
        <p className="text-sm font-medium text-foreground">Payment schedule</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label>Payment every</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                className="w-20"
                {...register('recurrence_interval')}
              />
              <Controller
                control={control}
                name="recurrence_unit"
                render={({ field }) => (
                  <Select
                    value={field.value || NONE}
                    onValueChange={field.onChange}
                    options={RECURRENCE_OPTIONS}
                    placeholder="Frequency"
                    triggerClassName="flex-1"
                  />
                )}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="recurrence_day">Day of month</Label>
            <Input
              id="recurrence_day"
              type="number"
              min={1}
              max={31}
              placeholder="For monthly"
              {...register('recurrence_day_of_month')}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label>Linked account</Label>
            <Controller
              control={control}
              name="linked_account_id"
              render={({ field }) => (
                <Select
                  value={field.value || NONE}
                  onValueChange={field.onChange}
                  options={accountOptions}
                  placeholder="Select account…"
                />
              )}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="next_payment_date">Next payment date</Label>
            <Input id="next_payment_date" type="date" {...register('next_payment_date')} />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <Controller
              control={control}
              name="notify_enabled"
              render={({ field }) => (
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
              )}
            />
            <span className="text-sm font-medium">Notify me before due</span>
          </label>
          {preview.notify_enabled && (
            <div className="flex flex-col gap-2 ps-7">
              <Label htmlFor="notify_days_before">Days before</Label>
              <Input
                id="notify_days_before"
                type="number"
                min={1}
                max={90}
                placeholder="Uses default if empty"
                {...register('notify_days_before')}
              />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="debt-notes">Notes</Label>
          <Textarea
            id="debt-notes"
            rows={2}
            placeholder="Any additional notes about this debt"
            {...register('notes')}
          />
        </div>

      </form>
    </Dialog>
  )
}
