import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { SplitFields, splitRemainderCents, toCents } from './SplitFields'
import type { SplitPartDraft } from './SplitFields'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDownLeft01Icon,
  ArrowUpRight01Icon,
  Exchange01Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
} from '@/components/ui/collapsible'
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
import { useCreateRule } from '../rules/useRules'
import { useCreateTransaction, useSplitTransaction, useUpdateTransaction } from './useTransactions'
import type { Transaction, TransactionType } from './transactionsApi'

const transactionSchema = z
  .object({
    type: z.enum(['income', 'expense', 'transfer']),
    amount: z.preprocess(
      (val) => (typeof val === 'string' ? val.replace(',', '.') : val),
      z.coerce.number<number>().positive('Amount must be greater than 0'),
    ),
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
  const { t: tRules } = useTranslation('rules')
  const createTransaction = useCreateTransaction()
  const updateTransaction = useUpdateTransaction()
  const createRule = useCreateRule()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const [createRuleFromTx, setCreateRuleFromTx] = useState(false)
  const [ruleNeedle, setRuleNeedle] = useState('')

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

  // A bank-synced transaction has its amount, date, type and account fixed by
  // the bank — the next sync would overwrite any edit. Splitting is offered
  // instead so the money can still be spread across categories.
  const isBankSynced = Boolean(transaction?.is_bank_synced)
  const splitTransaction = useSplitTransaction()
  const [splitting, setSplitting] = useState(false)
  const [splitParts, setSplitParts] = useState<SplitPartDraft[]>([])
  const totalCents = transaction ? Math.round(transaction.amount * 100) : 0
  const splitBalanced = splitRemainderCents(splitParts, totalCents) === 0

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
    if (open) {
      setSplitting(false)
      setSplitParts([])
      setCreateRuleFromTx(false)
      setRuleNeedle(transaction?.description ?? '')
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

  async function handleSplit() {
    if (!transaction) return
    try {
      await splitTransaction.mutateAsync({
        id: transaction.id,
        parts: splitParts.map((part) => ({
          amount: toCents(part.amount) / 100,
          category_id: part.categoryId ? Number(part.categoryId) : null,
        })),
      })
      toast.success(t('form.split.done', { count: splitParts.length }))
      onOpenChange(false)
    } catch (err) {
      // The API explains mismatched totals precisely — show that, not a generic error.
      toast.error(err instanceof Error ? err.message : t('form.toast.updateError'))
    }
  }

  const onSubmit = handleSubmit(async (data) => {
    try {
      // Ensure date has time component
      const dateValue = data.date.includes('T') ? data.date : `${data.date}T12:00:00`

      // Fields the user may always change.
      const editable = {
        category_id: !isTransfer && data.category_id ? Number(data.category_id) : null,
        description: data.description,
        notes: data.notes || null,
      }
      // Fields the bank owns on a synced row. Sending them unchanged is
      // harmless server-side, but omitting them keeps the intent obvious.
      const input = {
        ...editable,
        type: data.type,
        amount: data.amount,
        account_id: Number(data.account_id),
        destination_account_id: isTransfer ? Number(data.destination_account_id) : null,
        date: dateValue,
      }

      if (transaction) {
        await updateTransaction.mutateAsync({
          id: transaction.id,
          input: isBankSynced ? editable : input,
        })
        toast.success(t('form.toast.updated'))
      } else {
        await createTransaction.mutateAsync(input)
        toast.success(t('form.toast.created'))
      }

      // Rule creation is best-effort: a failure must not undo the saved transaction.
      if (
        createRuleFromTx &&
        !isTransfer &&
        editable.category_id != null &&
        ruleNeedle.trim()
      ) {
        try {
          await createRule.mutateAsync({
            name: ruleNeedle.trim().slice(0, 80),
            category_id: editable.category_id,
            match_type: 'all',
            conditions: [
              {
                field: 'description',
                operator: 'contains',
                value: ruleNeedle.trim(),
              },
            ],
          })
        } catch {
          toast.error(tRules('toast.ruleFromTxFailed'))
        }
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
      // Denser than most forms: type toggle, amount, split editor, account,
      // category, description, date and notes all share the body.
      size="lg"
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
                // Locked for synced rows: the bank owns this figure and the next
                // sync would overwrite anything typed here.
                readOnly={isBankSynced}
                disabled={isBankSynced}
                {...register('amount')}
              />
              <InputGroupAddon align="inline-end">
                <span className="text-sm text-muted-foreground">{t('form.fields.currency')}</span>
              </InputGroupAddon>
            </InputGroup>
            <FieldError errors={[errors.amount]} />

            {isBankSynced && !splitting && (
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {t('form.split.lockedHint')}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSplitting(true)
                    // Seed with the whole amount plus an empty row, so the user
                    // only has to move money from the first part to the second.
                    setSplitParts([
                      {
                        amount: (totalCents / 100).toFixed(2),
                        categoryId: transaction?.category_id
                          ? String(transaction.category_id)
                          : '',
                      },
                      { amount: '', categoryId: '' },
                    ])
                  }}
                >
                  {t('form.split.start')}
                </Button>
              </div>
            )}

            {isBankSynced && splitting && (
              <div className="mt-2 flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">
                  {t('form.split.help', {
                    total: (totalCents / 100).toFixed(2),
                    currency: t('form.fields.currency'),
                  })}
                </p>
                <SplitFields
                  parts={splitParts}
                  onChange={setSplitParts}
                  totalCents={totalCents}
                  categoryOptions={categoryOptions}
                  currency={t('form.fields.currency')}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSplitting(false)}
                  >
                    {t('form.split.cancel')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!splitBalanced || splitTransaction.isPending}
                    onClick={() => void handleSplit()}
                  >
                    {t('form.split.confirm')}
                  </Button>
                </div>
              </div>
            )}
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

          {!isTransfer && (
            <Collapsible
              open={createRuleFromTx}
              onOpenChange={(open) => {
                setCreateRuleFromTx(open)
                if (open && !ruleNeedle) {
                  setRuleNeedle(watch('description') || '')
                }
              }}
            >
              <div className="rounded-lg border border-border/60 px-3 py-2">
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <Checkbox
                    checked={createRuleFromTx}
                    onCheckedChange={(v) => {
                      const next = Boolean(v)
                      setCreateRuleFromTx(next)
                      if (next && !ruleNeedle) {
                        setRuleNeedle(watch('description') || '')
                      }
                    }}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">{tRules('fromTransaction.checkbox')}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {tRules('fromTransaction.hint')}
                    </span>
                  </span>
                </label>
                <CollapsibleContent className="pt-3">
                  <Field>
                    <FieldLabel htmlFor="rule-needle">
                      {tRules('fromTransaction.containsLabel')}
                    </FieldLabel>
                    <Input
                      id="rule-needle"
                      value={ruleNeedle}
                      onChange={(e) => setRuleNeedle(e.target.value)}
                      placeholder={watch('description') || t('form.fields.descriptionPlaceholder')}
                    />
                  </Field>
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}

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
