import { useEffect, useMemo } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
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
import { formatCurrency, todayIsoDate } from '../lib/format'
import { useAccounts } from '../accounts/useAccounts'
import { useCreateDebt, useUpdateDebt } from './useDebts'
import type { Debt, DebtInput } from './debtsApi'

function createDebtSchema(t: (key: string) => string) {
  return z
    .object({
      name: z.string().min(1, t('form.validation.nameRequired')).max(200),
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
      original_balance: z.coerce
        .number<number>()
        .positive(t('form.validation.originalBalancePositive')),
      current_balance: z.coerce
        .number<number>()
        .min(0, t('form.validation.currentBalanceNonNegative')),
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
          message: t('form.validation.customTypeRequired'),
          path: ['custom_type'],
        })
      }
    })
}

type DebtForm = z.infer<ReturnType<typeof createDebtSchema>>

const NONE = '__none__'

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
  const { t } = useTranslation('debts')
  const debtSchema = useMemo(() => createDebtSchema(t), [t])
  const isEdit = !!debt
  const createDebt = useCreateDebt()
  const updateDebt = useUpdateDebt()
  const { data: accounts = [] } = useAccounts()

  const TYPE_OPTIONS = useMemo(
    () => [
      { value: 'credit_card', label: t('form.type.options.creditCard') },
      { value: 'personal_loan', label: t('form.type.options.personalLoan') },
      { value: 'student_loan', label: t('form.type.options.studentLoan') },
      { value: 'mortgage', label: t('form.type.options.mortgage') },
      { value: 'car_loan', label: t('form.type.options.carLoan') },
      { value: 'informal', label: t('form.type.options.informal') },
      { value: 'utilities', label: t('form.type.options.utilities') },
      { value: 'subscription', label: t('form.type.options.subscription') },
      { value: 'medical', label: t('form.type.options.medical') },
      { value: 'tax', label: t('form.type.options.tax') },
      { value: 'legal', label: t('form.type.options.legal') },
      { value: 'other', label: t('form.type.options.other') },
      { value: 'custom', label: t('form.type.options.custom') },
    ],
    [t],
  )

  const RECURRENCE_OPTIONS = useMemo(
    () => [
      { value: NONE, label: t('form.schedule.recurrence.notRecurring') },
      { value: 'days', label: t('form.schedule.recurrence.days') },
      { value: 'weeks', label: t('form.schedule.recurrence.weeks') },
      { value: 'months', label: t('form.schedule.recurrence.months') },
    ],
    [t],
  )

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
      ? preview.custom_type?.trim() || t('types.custom')
      : (TYPE_OPTIONS.find((o) => o.value === preview.type)?.label ?? preview.type)

  const accountOptions = [
    { value: NONE, label: t('form.linkedAccount.none') },
    ...accounts.map((a) => ({ value: String(a.id), label: `${a.name} (${a.type})` })),
  ]

  const onSubmit = handleSubmit(async (data) => {
    const input = toApiInput(data)
    try {
      if (isEdit && debt) {
        await updateDebt.mutateAsync({ id: debt.id, input })
        toast.success(t('form.toasts.updated'))
      } else {
        await createDebt.mutateAsync(input)
        toast.success(t('form.toasts.created'))
      }
      onOpenChange(false)
    } catch {
      toast.error(isEdit ? t('form.toasts.updateFailed') : t('form.toasts.createFailed'))
    }
  })

  const isPending = isSubmitting || createDebt.isPending || updateDebt.isPending

  return (
    <Dialog
      open={open}
      title={isEdit ? t('form.titleEdit') : t('form.titleCreate')}
      description={t('form.description')}
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
            {t('form.cancel')}
          </Button>
          <Button type="submit" form="debt-form" disabled={isPending}>
            {isPending ? t('form.saving') : isEdit ? t('form.saveChanges') : t('form.addDebt')}
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
                {preview.name.trim() || t('form.newDebt')}
              </p>
              <p className="text-xs text-muted-foreground">{typeLabel}</p>
            </div>
            <p className="shrink-0 font-heading text-xl font-bold tabular-nums">
              {formatCurrency(Number(preview.current_balance) || 0)}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="debt-name">{t('form.name.label')}</Label>
          <Input
            id="debt-name"
            placeholder={t('form.name.placeholder')}
            aria-invalid={!!errors.name}
            {...register('name')}
          />
          {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="debt-creditor">{t('form.creditor.label')}</Label>
          <Input
            id="debt-creditor"
            placeholder={t('form.creditor.placeholder')}
            {...register('creditor')}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label>{t('form.type.label')}</Label>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  options={TYPE_OPTIONS}
                  placeholder={t('form.type.placeholder')}
                />
              )}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="debt-priority">{t('form.priority.label')}</Label>
            <Input id="debt-priority" type="number" min={0} {...register('priority')} />
          </div>
        </div>

        {preview.type === 'custom' && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="debt-custom-type">{t('form.customType.label')}</Label>
            <Input
              id="debt-custom-type"
              placeholder={t('form.customType.placeholder')}
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
            <Label htmlFor="original_balance">{t('form.originalBalance.label')}</Label>
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
            <Label htmlFor="current_balance">{t('form.currentBalance.label')}</Label>
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
            <Label htmlFor="interest_rate_pct">{t('form.interestRate.label')}</Label>
            <Input
              id="interest_rate_pct"
              type="number"
              step="0.01"
              min={0}
              max={100}
              placeholder={t('form.interestRate.placeholder')}
              {...register('interest_rate_pct')}
            />
            <p className="text-xs text-muted-foreground">{t('form.interestRate.hint')}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="minimum_payment">{t('form.minimumPayment.label')}</Label>
            <Input
              id="minimum_payment"
              type="number"
              step="0.01"
              min={0}
              placeholder={t('form.minimumPayment.placeholder')}
              {...register('minimum_payment')}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="opened_date">{t('form.openedDate.label')}</Label>
            <Input id="opened_date" type="date" {...register('opened_date')} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="maturity_date">{t('form.maturityDate.label')}</Label>
            <Input id="maturity_date" type="date" {...register('maturity_date')} />
          </div>
        </div>

        <Separator />
        <p className="text-sm font-medium text-foreground">{t('form.status.title')}</p>

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
                      setValue('paid_off_date', todayIsoDate())
                    }
                  }}
                />
              )}
            />
            <span className="text-sm font-medium">{t('form.status.markPaidOff')}</span>
          </label>
          {preview.is_paid_off && (
            <div className="flex flex-col gap-2 ps-7">
              <Label htmlFor="paid_off_date">{t('form.status.paidOffDate')}</Label>
              <Input id="paid_off_date" type="date" {...register('paid_off_date')} />
            </div>
          )}
        </div>

        <Separator />
        <p className="text-sm font-medium text-foreground">{t('form.schedule.title')}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label>{t('form.schedule.paymentEvery')}</Label>
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
                    placeholder={t('form.schedule.frequencyPlaceholder')}
                    triggerClassName="flex-1"
                  />
                )}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="recurrence_day">{t('form.schedule.dayOfMonth')}</Label>
            <Input
              id="recurrence_day"
              type="number"
              min={1}
              max={31}
              placeholder={t('form.schedule.dayOfMonthPlaceholder')}
              {...register('recurrence_day_of_month')}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label>{t('form.linkedAccount.label')}</Label>
            <Controller
              control={control}
              name="linked_account_id"
              render={({ field }) => (
                <Select
                  value={field.value || NONE}
                  onValueChange={field.onChange}
                  options={accountOptions}
                  placeholder={t('form.linkedAccount.placeholder')}
                />
              )}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="next_payment_date">{t('form.nextPaymentDate.label')}</Label>
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
            <span className="text-sm font-medium">{t('form.notify.label')}</span>
          </label>
          {preview.notify_enabled && (
            <div className="flex flex-col gap-2 ps-7">
              <Label htmlFor="notify_days_before">{t('form.notify.daysBefore')}</Label>
              <Input
                id="notify_days_before"
                type="number"
                min={1}
                max={90}
                placeholder={t('form.notify.daysBeforePlaceholder')}
                {...register('notify_days_before')}
              />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="debt-notes">{t('form.notes.label')}</Label>
          <Textarea
            id="debt-notes"
            rows={2}
            placeholder={t('form.notes.placeholder')}
            {...register('notes')}
          />
        </div>

      </form>
    </Dialog>
  )
}
