import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDownLeft01Icon,
  ArrowUpRight01Icon,
  Exchange01Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Spinner } from '@/components/ui/spinner'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'
import { useAccounts } from '../accounts/useAccounts'
import { useCategories } from '../categories/useCategories'
import { useCreateTransaction, useUpdateTransaction } from './useTransactions'
import type { Transaction, TransactionType } from './transactionsApi'

const transactionSchema = z
  .object({
    type: z.enum(['income', 'expense', 'transfer']),
    amount: z.coerce.number<number>().positive('Amount must be greater than 0'),
    account_id: z.string().min(1, 'Account is required'),
    destination_account_id: z.string().optional(),
    category_id: z.string().optional(),
    description: z.string().min(1, 'Description is required').max(500),
    date: z.string().min(1, 'Date is required'),
    notes: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.type === 'transfer') {
        return !!data.destination_account_id && data.destination_account_id !== ''
      }
      return true
    },
    {
      message: 'Destination account is required for transfers',
      path: ['destination_account_id'],
    },
  )
  .refine(
    (data) => {
      if (data.type !== 'transfer') {
        return !!data.category_id && data.category_id !== ''
      }
      return true
    },
    {
      message: 'Category is required',
      path: ['category_id'],
    },
  )

type TransactionForm = z.infer<typeof transactionSchema>

interface TransactionFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction?: Transaction | null
}

export function TransactionFormDialog({
  open,
  onOpenChange,
  transaction,
}: TransactionFormDialogProps) {
  const { t } = useTranslation('transactions')
  const createTransaction = useCreateTransaction()
  const updateTransaction = useUpdateTransaction()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TransactionForm>({
    // zod coerce.number() widens input type; assert resolver for RHF compatibility
    resolver: zodResolver(transactionSchema) as never,
    defaultValues: {
      type: 'expense',
      amount: 0,
      account_id: '',
      destination_account_id: '',
      category_id: '',
      description: '',
      date: new Date().toISOString().slice(0, 10),
      notes: '',
    },
  })

  const selectedType = watch('type')
  const isTransfer = selectedType === 'transfer'

  // Reset form when dialog opens/closes or transaction changes
  useEffect(() => {
    if (open) {
      if (transaction) {
        // Editing existing transaction
        const dateStr = transaction.date.includes('T')
          ? transaction.date.slice(0, 10)
          : transaction.date
        reset({
          type: transaction.type,
          amount: transaction.amount,
          account_id: String(transaction.account_id),
          destination_account_id: transaction.destination_account_id
            ? String(transaction.destination_account_id)
            : '',
          category_id: transaction.category_id ? String(transaction.category_id) : '',
          description: transaction.description,
          date: dateStr,
          notes: transaction.notes || '',
        })
      } else {
        // Creating new transaction
        reset({
          type: 'expense',
          amount: 0,
          account_id: '',
          destination_account_id: '',
          category_id: '',
          description: '',
          date: new Date().toISOString().slice(0, 10),
          notes: '',
        })
      }
    }
  }, [open, transaction, reset])

  // Clear destination/category when type changes
  useEffect(() => {
    if (isTransfer) {
      setValue('category_id', '')
    } else {
      setValue('destination_account_id', '')
    }
  }, [isTransfer, setValue])

  const onSubmit = handleSubmit(async (data) => {
    try {
      // Ensure date has time component
      const dateValue = data.date.includes('T') ? data.date : `${data.date}T12:00:00`

      const input = {
        type: data.type,
        amount: data.amount,
        account_id: Number(data.account_id),
        destination_account_id: isTransfer ? Number(data.destination_account_id) : null,
        category_id: !isTransfer && data.category_id ? Number(data.category_id) : null,
        description: data.description,
        date: dateValue,
        notes: data.notes || null,
      }

      if (transaction) {
        await updateTransaction.mutateAsync({ id: transaction.id, input })
        toast.success(t('form.toast.updated'))
      } else {
        await createTransaction.mutateAsync(input)
        toast.success(t('form.toast.created'))
      }
      onOpenChange(false)
    } catch {
      toast.error(transaction ? t('form.toast.updateError') : t('form.toast.createError'))
    }
  })

  const accountOptions = accounts.map((acc) => ({
    value: String(acc.id),
    label: acc.name,
  }))

  const categoryOptions = categories
    .filter((cat) => cat.type === selectedType || cat.type === 'transfer')
    .map((cat) => ({
      value: String(cat.id),
      label: cat.name,
    }))

  const flow = selectedType === 'income' ? 'in' : selectedType === 'transfer' ? 'move' : 'out'
  const formId = 'transaction-form'

  return (
    <Dialog
      open={open}
      title={transaction ? t('form.title.edit') : t('form.title.add')}
      description={
        isTransfer
          ? t('form.description.transfer')
          : selectedType === 'income'
            ? t('form.description.income')
            : t('form.description.expense')
      }
      icon={
        isTransfer ? Exchange01Icon : selectedType === 'income' ? ArrowDownLeft01Icon : ArrowUpRight01Icon
      }
      tone={flow}
      onOpenChange={onOpenChange}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={isSubmitting}>
            {isSubmitting && <Spinner data-icon="inline-start" />}
            {transaction ? t('form.actions.save') : t('form.actions.add')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="type">{t('form.fields.direction')}</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={0}
              value={selectedType}
              onValueChange={(value) => value && setValue('type', value as TransactionType)}
              className="w-full [&>button]:flex-1"
            >
              <ToggleGroupItem
                value="expense"
                className="data-[state=on]:border-flow-out/40 data-[state=on]:bg-flow-out/10 data-[state=on]:text-flow-out"
              >
                <HugeiconsIcon icon={ArrowUpRight01Icon} strokeWidth={2} data-icon="inline-start" />
                {t('form.fields.expense')}
              </ToggleGroupItem>
              <ToggleGroupItem
                value="income"
                className="data-[state=on]:border-flow-in/40 data-[state=on]:bg-flow-in/10 data-[state=on]:text-flow-in"
              >
                <HugeiconsIcon
                  icon={ArrowDownLeft01Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t('form.fields.income')}
              </ToggleGroupItem>
              <ToggleGroupItem
                value="transfer"
                className="data-[state=on]:border-flow-move/40 data-[state=on]:bg-flow-move/10 data-[state=on]:text-flow-move"
              >
                <HugeiconsIcon icon={Exchange01Icon} strokeWidth={2} data-icon="inline-start" />
                {t('form.fields.transfer')}
              </ToggleGroupItem>
            </ToggleGroup>
            <FieldError errors={[errors.type]} />
          </Field>

          <Field data-invalid={errors.amount ? true : undefined}>
            <FieldLabel htmlFor="amount">{t('form.fields.amount')}</FieldLabel>
            <InputGroup className="h-11">
              <InputGroupInput
                id="amount"
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                placeholder={t('form.fields.amountPlaceholder')}
                aria-invalid={errors.amount ? true : undefined}
                className="text-lg font-semibold tabular-nums"
                {...register('amount')}
              />
              <InputGroupAddon align="inline-end">
                <span className="text-sm text-muted-foreground">{t('form.fields.currency')}</span>
              </InputGroupAddon>
            </InputGroup>
            <FieldError errors={[errors.amount]} />
          </Field>

          <Field data-invalid={errors.description ? true : undefined}>
            <FieldLabel htmlFor="description">{t('form.fields.description')}</FieldLabel>
            <Input
              id="description"
              placeholder={t('form.fields.descriptionPlaceholder')}
              aria-invalid={errors.description ? true : undefined}
              {...register('description')}
            />
            <FieldError errors={[errors.description]} />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field data-invalid={errors.account_id ? true : undefined}>
              <FieldLabel htmlFor="account_id">
                {isTransfer ? t('form.fields.fromAccount') : t('form.fields.account')}
              </FieldLabel>
              <Select
                value={watch('account_id')}
                onValueChange={(value) => setValue('account_id', value)}
                options={accountOptions}
                placeholder={t('form.fields.accountPlaceholder')}
              />
              <FieldError errors={[errors.account_id]} />
            </Field>

            {isTransfer ? (
              <Field data-invalid={errors.destination_account_id ? true : undefined}>
                <FieldLabel htmlFor="destination_account_id">
                  {t('form.fields.toAccount')}
                </FieldLabel>
                <Select
                  value={watch('destination_account_id') || ''}
                  onValueChange={(value) => setValue('destination_account_id', value)}
                  options={accountOptions}
                  placeholder={t('form.fields.destinationPlaceholder')}
                />
                <FieldError errors={[errors.destination_account_id]} />
              </Field>
            ) : (
              <Field data-invalid={errors.category_id ? true : undefined}>
                <FieldLabel htmlFor="category_id">{t('form.fields.category')}</FieldLabel>
                <Select
                  value={watch('category_id') || ''}
                  onValueChange={(value) => setValue('category_id', value)}
                  options={categoryOptions}
                  placeholder={t('form.fields.categoryPlaceholder')}
                />
                <FieldError errors={[errors.category_id]} />
              </Field>
            )}
          </div>

          <Field data-invalid={errors.date ? true : undefined}>
            <FieldLabel htmlFor="date">{t('form.fields.date')}</FieldLabel>
            <Input id="date" type="date" {...register('date')} />
            <FieldError errors={[errors.date]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="notes">{t('form.fields.notes')}</FieldLabel>
            <Textarea
              id="notes"
              rows={2}
              placeholder={t('form.fields.notesPlaceholder')}
              {...register('notes')}
            />
            <FieldError errors={[errors.notes]} />
          </Field>
        </FieldGroup>
      </form>
    </Dialog>
  )
}
