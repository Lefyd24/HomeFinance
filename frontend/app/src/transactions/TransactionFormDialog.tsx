import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'
import { useAccounts } from '../accounts/useAccounts'
import { useCategories } from '../categories/useCategories'
import { useCreateTransaction, useUpdateTransaction } from './useTransactions'
import type { Transaction, TransactionType } from './transactionsApi'

const transactionSchema = z
  .object({
    type: z.enum(['income', 'expense', 'transfer']),
    amount: z.coerce.number().positive('Amount must be greater than 0'),
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
        toast.success('Transaction updated')
      } else {
        await createTransaction.mutateAsync(input)
        toast.success('Transaction created')
      }
      onOpenChange(false)
    } catch {
      toast.error(transaction ? 'Failed to update transaction' : 'Failed to create transaction')
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

  const typeOptions = [
    { value: 'income', label: 'Income' },
    { value: 'expense', label: 'Expense' },
    { value: 'transfer', label: 'Transfer' },
  ]

  return (
    <Dialog
      open={open}
      title={transaction ? 'Edit Transaction' : 'Add Transaction'}
      onOpenChange={onOpenChange}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="type">Type</Label>
          <Select
            value={watch('type')}
            onValueChange={(value) => setValue('type', value as TransactionType)}
            options={typeOptions}
            placeholder="Select type"
          />
          {errors.type && <p className="text-destructive text-sm">{errors.type.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="amount">Amount</Label>
          <Input id="amount" type="number" step="0.01" {...register('amount')} />
          {errors.amount && <p className="text-destructive text-sm">{errors.amount.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="account_id">Account</Label>
          <Select
            value={watch('account_id')}
            onValueChange={(value) => setValue('account_id', value)}
            options={accountOptions}
            placeholder="Select account"
          />
          {errors.account_id && (
            <p className="text-destructive text-sm">{errors.account_id.message}</p>
          )}
        </div>

        {isTransfer && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="destination_account_id">Destination Account</Label>
            <Select
              value={watch('destination_account_id') || ''}
              onValueChange={(value) => setValue('destination_account_id', value)}
              options={accountOptions}
              placeholder="Select destination account"
            />
            {errors.destination_account_id && (
              <p className="text-destructive text-sm">{errors.destination_account_id.message}</p>
            )}
          </div>
        )}

        {!isTransfer && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="category_id">Category</Label>
            <Select
              value={watch('category_id') || ''}
              onValueChange={(value) => setValue('category_id', value)}
              options={categoryOptions}
              placeholder="Select category"
            />
            {errors.category_id && (
              <p className="text-destructive text-sm">{errors.category_id.message}</p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="description">Description</Label>
          <Input id="description" {...register('description')} />
          {errors.description && (
            <p className="text-destructive text-sm">{errors.description.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="date">Date</Label>
          <Input id="date" type="date" {...register('date')} />
          {errors.date && <p className="text-destructive text-sm">{errors.date.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea id="notes" {...register('notes')} rows={3} />
          {errors.notes && <p className="text-destructive text-sm">{errors.notes.message}</p>}
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {transaction ? 'Update' : 'Save'}
        </Button>
      </form>
    </Dialog>
  )
}
