import { useEffect, useMemo } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { RepeatIcon } from '@hugeicons/core-free-icons'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'
import { useAccounts } from '../accounts/useAccounts'
import { useCategories } from '../categories/useCategories'
import { useCreateRecurringExpense, useUpdateRecurringExpense } from './useRecurring'
import type { RecurringExpense } from './recurringApi'
import { todayIsoDate } from '../lib/format'

const today = () => todayIsoDate()
const NONE = '__none__'

function createRecurringSchema(t: (key: string) => string) {
  return z.object({
    name: z.string().min(1, t('form.validation.nameRequired')).max(200),
    amount: z.coerce.number<number>().positive(t('form.validation.amountPositive')),
    account_id: z.string(),
    category_id: z.string(),
    recurrence_interval: z.coerce.number<number>().int().min(1),
    recurrence_unit: z.enum(['days', 'weeks', 'months']),
    start_date: z.string().min(1, t('form.validation.startDateRequired')),
    next_due_date: z.string().min(1, t('form.validation.nextDueDateRequired')),
    notes: z.string().optional(),
    notify_enabled: z.boolean(),
    notify_days_before: z.string().optional(),
  })
}

type RecurringForm = z.infer<ReturnType<typeof createRecurringSchema>>

function emptyDefaults(): RecurringForm {
  return {
    name: '',
    amount: 0,
    account_id: NONE,
    category_id: NONE,
    recurrence_interval: 1,
    recurrence_unit: 'months',
    start_date: today(),
    next_due_date: today(),
    notes: '',
    notify_enabled: false,
    notify_days_before: '',
  }
}

function fromExpense(expense: RecurringExpense): RecurringForm {
  return {
    name: expense.name,
    amount: expense.amount,
    account_id: expense.account_id != null ? String(expense.account_id) : NONE,
    category_id: expense.category_id != null ? String(expense.category_id) : NONE,
    recurrence_interval: expense.recurrence_interval,
    recurrence_unit: expense.recurrence_unit,
    start_date: expense.start_date.slice(0, 10),
    next_due_date: expense.next_due_date.slice(0, 10),
    notes: expense.notes ?? '',
    notify_enabled: !!expense.notify_enabled,
    notify_days_before:
      expense.notify_days_before != null ? String(expense.notify_days_before) : '',
  }
}

export function RecurringFormDialog({
  open,
  onOpenChange,
  expense = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  expense?: RecurringExpense | null
}) {
  const { t } = useTranslation(['recurring', 'common'])
  const recurringSchema = useMemo(() => createRecurringSchema(t), [t])
  const createRecurring = useCreateRecurringExpense()
  const updateRecurring = useUpdateRecurringExpense()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const isEditing = expense != null

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RecurringForm>({
    resolver: zodResolver(recurringSchema) as never,
    defaultValues: emptyDefaults(),
  })

  const notifyEnabled = watch('notify_enabled')

  useEffect(() => {
    if (!open) return
    reset(expense ? fromExpense(expense) : emptyDefaults())
  }, [open, expense, reset])

  const unitOptions = useMemo(
    () => [
      { value: 'days', label: t('form.units.days') },
      { value: 'weeks', label: t('form.units.weeks') },
      { value: 'months', label: t('form.units.months') },
    ],
    [t],
  )

  const accountOptions = [
    { value: NONE, label: t('form.none') },
    ...accounts.map((a) => ({ value: String(a.id), label: a.name })),
  ]

  const expenseCats = categories
    .filter((c) => c.type === 'expense')
    .sort((a, b) => a.name.localeCompare(b.name))
  const incomeCats = categories
    .filter((c) => c.type === 'income')
    .sort((a, b) => a.name.localeCompare(b.name))
  const categoryOptions = [
    { value: NONE, label: t('form.none') },
    ...expenseCats.map((c) => ({
      value: String(c.id),
      label: `${t('form.categoryPrefix.expense')} · ${c.name}`,
    })),
    ...incomeCats.map((c) => ({
      value: String(c.id),
      label: `${t('form.categoryPrefix.income')} · ${c.name}`,
    })),
  ]

  const onSubmit = handleSubmit(async (data) => {
    const notifyDays =
      data.notify_enabled && data.notify_days_before
        ? Number.parseInt(data.notify_days_before, 10)
        : null
    const input = {
      name: data.name,
      amount: data.amount,
      account_id: data.account_id === NONE ? null : Number(data.account_id),
      category_id: data.category_id === NONE ? null : Number(data.category_id),
      recurrence_interval: data.recurrence_interval,
      recurrence_unit: data.recurrence_unit,
      start_date: data.start_date,
      next_due_date: data.next_due_date,
      notes: data.notes?.trim() ? data.notes.trim() : null,
      notify_enabled: data.notify_enabled,
      notify_days_before:
        data.notify_enabled && notifyDays != null && !Number.isNaN(notifyDays)
          ? notifyDays
          : null,
      is_active: expense?.is_active ?? true,
    }

    try {
      if (isEditing && expense) {
        await updateRecurring.mutateAsync({ id: expense.id, input })
        toast.success(t('toast.updated'))
      } else {
        await createRecurring.mutateAsync(input)
        toast.success(t('toast.created'))
      }
      onOpenChange(false)
    } catch {
      toast.error(isEditing ? t('toast.updateError') : t('toast.createError'))
    }
  })

  const isPending = isSubmitting || createRecurring.isPending || updateRecurring.isPending

  return (
    <Dialog
      open={open}
      title={isEditing ? t('form.titleEdit') : t('form.titleCreate')}
      description={t('form.description')}
      icon={RepeatIcon}
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
            {t('common:actions.cancel')}
          </Button>
          <Button type="submit" form="recurring-form" disabled={isPending}>
            {isPending
              ? t('form.saving')
              : isEditing
                ? t('form.saveChanges')
                : t('form.addIt')}
          </Button>
        </>
      }
    >
      <form id="recurring-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="recurring-name">{t('form.fields.name')}</Label>
          <Input
            id="recurring-name"
            placeholder={t('form.fields.namePlaceholder')}
            {...register('name')}
          />
          {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="recurring-amount">{t('form.fields.amount')}</Label>
            <Input
              id="recurring-amount"
              type="number"
              step="0.01"
              min="0.01"
              {...register('amount')}
            />
            {errors.amount && <p className="text-destructive text-sm">{errors.amount.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t('form.fields.account')}</Label>
            <Controller
              control={control}
              name="account_id"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  options={accountOptions}
                  placeholder={t('form.fields.accountPlaceholder')}
                />
              )}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label>{t('form.fields.category')}</Label>
          <Controller
            control={control}
            name="category_id"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                options={categoryOptions}
                placeholder={t('form.fields.categoryPlaceholder')}
              />
            )}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="recurring-start">{t('form.fields.startDate')}</Label>
            <Input id="recurring-start" type="date" {...register('start_date')} />
            {errors.start_date && (
              <p className="text-destructive text-sm">{errors.start_date.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="recurring-next-due">{t('form.fields.nextDueDate')}</Label>
            <Input id="recurring-next-due" type="date" {...register('next_due_date')} />
            {errors.next_due_date && (
              <p className="text-destructive text-sm">{errors.next_due_date.message}</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label>{t('form.fields.repeatsEvery')}</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              min={1}
              className="w-24"
              {...register('recurrence_interval')}
            />
            <Controller
              control={control}
              name="recurrence_unit"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  options={unitOptions}
                  placeholder={t('form.fields.unitPlaceholder')}
                />
              )}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Controller
              control={control}
              name="notify_enabled"
              render={({ field }) => (
                <Checkbox
                  id="recurring-notify"
                  checked={field.value}
                  onCheckedChange={(checked) => {
                    const on = checked === true
                    field.onChange(on)
                    if (!on) setValue('notify_days_before', '')
                  }}
                />
              )}
            />
            <Label htmlFor="recurring-notify" className="font-medium">
              {t('form.fields.notifyBeforeDue')}
            </Label>
          </div>
          {notifyEnabled && (
            <div className="flex flex-col gap-2 ps-7">
              <Label htmlFor="recurring-notify-days" className="text-sm">
                {t('form.fields.daysBefore')}
              </Label>
              <Input
                id="recurring-notify-days"
                type="number"
                min={1}
                max={90}
                placeholder={t('form.fields.notifyDaysPlaceholder')}
                {...register('notify_days_before')}
              />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="recurring-notes">{t('form.fields.notes')}</Label>
          <Textarea id="recurring-notes" rows={2} {...register('notes')} />
        </div>
      </form>
    </Dialog>
  )
}
