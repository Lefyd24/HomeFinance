import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { MoneyAdd01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'
import { useAccounts } from '../accounts/useAccounts'
import { useCategories } from '../categories/useCategories'
import { todayIsoDate } from '../lib/format'
import { useAddTrackerTransaction } from './useTrackers'
import type { Tracker } from './trackersApi'

const NO_CATEGORY = '__none__'

function createSchema(t: (key: string) => string) {
  return z.object({
    type: z.enum(['expense', 'income']),
    amount: z.preprocess(
      (value) => (typeof value === 'string' ? value.replace(',', '.') : value),
      z.coerce.number<number>().positive(t('transactionForm.validation.amountPositive')),
    ),
    account_id: z.string().min(1, t('transactionForm.validation.accountRequired')),
    category_id: z.string().optional(),
    description: z.string().min(1, t('transactionForm.validation.descriptionRequired')).max(500),
    date: z.string().min(1, t('transactionForm.validation.dateRequired')),
    notes: z.string().optional(),
  })
}

type TrackerTransactionForm = z.infer<ReturnType<typeof createSchema>>

interface TrackerTransactionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tracker: Tracker | null
}

/**
 * Records real spending straight from the tracker page — it creates an actual
 * transaction (moving the account balance, exactly like the debts flow) and
 * files it under the tracker in one step.
 */
export function TrackerTransactionDialog({
  open,
  onOpenChange,
  tracker,
}: TrackerTransactionDialogProps) {
  const { t } = useTranslation(['trackers', 'common'])
  const schema = useMemo(() => createSchema(t), [t])
  const addTransaction = useAddTrackerTransaction()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TrackerTransactionForm>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      type: 'expense',
      amount: 0,
      account_id: '',
      category_id: NO_CATEGORY,
      description: '',
      date: todayIsoDate(),
      notes: '',
    },
  })

  useEffect(() => {
    if (!open) return
    reset({
      type: 'expense',
      amount: 0,
      account_id: '',
      category_id: NO_CATEGORY,
      description: tracker ? tracker.name : '',
      date: todayIsoDate(),
      notes: '',
    })
  }, [open, tracker, reset])

  const selectedType = watch('type')

  // Bank-linked accounts are read-only, and the API rejects them — leaving them
  // out of the list is friendlier than a 400 after the user has filled the form.
  const accountOptions = accounts
    .filter((account) => !account.is_linked)
    .map((account) => ({ value: String(account.id), label: account.name }))

  const categoryOptions = [
    { value: NO_CATEGORY, label: t('transactionForm.category.none') },
    ...categories
      .filter((category) => category.type === selectedType || category.type === 'transfer')
      .map((category) => ({ value: String(category.id), label: category.name })),
  ]

  const onSubmit = handleSubmit(async (data) => {
    if (!tracker) return
    try {
      await addTransaction.mutateAsync({
        id: tracker.id,
        input: {
          account_id: Number(data.account_id),
          amount: data.amount,
          type: data.type,
          description: data.description.trim(),
          date: data.date,
          category_id:
            data.category_id && data.category_id !== NO_CATEGORY
              ? Number(data.category_id)
              : null,
          notes: data.notes?.trim() || null,
        },
      })
      toast.success(t('transactionForm.toasts.added'))
      onOpenChange(false)
    } catch {
      toast.error(t('transactionForm.toasts.failed'))
    }
  })

  const isPending = isSubmitting || addTransaction.isPending
  const formId = 'tracker-transaction-form'

  return (
    <Dialog
      open={open}
      title={t('transactionForm.title')}
      description={
        tracker
          ? t('transactionForm.description', { name: tracker.name })
          : t('transactionForm.descriptionNoTracker')
      }
      icon={MoneyAdd01Icon}
      tone={selectedType === 'income' ? 'in' : 'out'}
      size="lg"
      onOpenChange={onOpenChange}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('common:actions.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={isPending || !tracker}>
            {isPending && <Spinner data-icon="inline-start" />}
            {t('transactionForm.submit')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label>{t('transactionForm.type.label')}</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            value={selectedType}
            onValueChange={(value) =>
              value && setValue('type', value as TrackerTransactionForm['type'])
            }
            className="w-full [&>button]:flex-1"
          >
            <ToggleGroupItem
              value="expense"
              className="data-[state=on]:border-flow-out/40 data-[state=on]:bg-flow-out/10 data-[state=on]:text-flow-out"
            >
              {t('transactionForm.type.expense')}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="income"
              className="data-[state=on]:border-flow-in/40 data-[state=on]:bg-flow-in/10 data-[state=on]:text-flow-in"
            >
              {t('transactionForm.type.income')}
            </ToggleGroupItem>
          </ToggleGroup>
          <p className="text-xs text-muted-foreground">{t('transactionForm.type.hint')}</p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="tracker-tx-amount">
            {t('transactionForm.amount.label')} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="tracker-tx-amount"
            type="text"
            inputMode="decimal"
            className="text-lg font-semibold tabular-nums"
            aria-invalid={!!errors.amount}
            disabled={isPending}
            {...register('amount')}
          />
          {errors.amount && <p className="text-destructive text-sm">{errors.amount.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="tracker-tx-description">
            {t('transactionForm.descriptionField.label')}{' '}
            <span className="text-destructive">*</span>
          </Label>
          <Input
            id="tracker-tx-description"
            placeholder={t('transactionForm.descriptionField.placeholder')}
            aria-invalid={!!errors.description}
            disabled={isPending}
            {...register('description')}
          />
          {errors.description && (
            <p className="text-destructive text-sm">{errors.description.message}</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>
              {t('transactionForm.account.label')} <span className="text-destructive">*</span>
            </Label>
            <Controller
              name="account_id"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  options={accountOptions}
                  placeholder={t('transactionForm.account.placeholder')}
                />
              )}
            />
            {errors.account_id && (
              <p className="text-destructive text-sm">{errors.account_id.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t('transactionForm.category.label')}</Label>
            <Controller
              name="category_id"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value || NO_CATEGORY}
                  onValueChange={field.onChange}
                  options={categoryOptions}
                  placeholder={t('transactionForm.category.none')}
                />
              )}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="tracker-tx-date">
            {t('transactionForm.date.label')} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="tracker-tx-date"
            type="date"
            aria-invalid={!!errors.date}
            disabled={isPending}
            {...register('date')}
          />
          {errors.date && <p className="text-destructive text-sm">{errors.date.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="tracker-tx-notes">{t('transactionForm.notes.label')}</Label>
          <Textarea
            id="tracker-tx-notes"
            rows={2}
            placeholder={t('transactionForm.notes.placeholder')}
            disabled={isPending}
            {...register('notes')}
          />
        </div>
      </form>
    </Dialog>
  )
}
