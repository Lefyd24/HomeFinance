import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'
import { useAccounts } from '../accounts/useAccounts'
import { useCategories } from '../categories/useCategories'
import { useCreateTransaction } from './useTransactions'

const transactionSchema = z.object({
  type: z.enum(['income', 'expense', 'transfer']),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  account_id: z.string().min(1, 'Account is required'),
  category_id: z.string().optional(),
  description: z.string().min(1, 'Description is required'),
  date: z.string().min(1, 'Date is required'),
})

type TransactionForm = z.infer<typeof transactionSchema>

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
]

interface TransactionFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TransactionFormDialog({ open, onOpenChange }: TransactionFormDialogProps) {
  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories()
  const createTransaction = useCreateTransaction()

  const {
    register,
    control,
    watch,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TransactionForm>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      type: 'expense',
      amount: 0,
      account_id: '',
      category_id: '',
      description: '',
      date: new Date().toISOString().split('T')[0],
    },
  })

  const txType = watch('type')
  const accountOptions =
    accounts?.map((a) => ({ value: String(a.id), label: a.name })) ?? []
  const categoryOptions =
    categories
      ?.filter((c) => (txType === 'income' ? c.type === 'income' : c.type === 'expense'))
      .map((c) => ({ value: String(c.id), label: c.name })) ?? []

  const onSubmit = handleSubmit(async (data) => {
    const dateIso = data.date.includes('T') ? data.date : `${data.date}T12:00:00`
    await createTransaction.mutateAsync({
      type: data.type,
      amount: data.amount,
      account_id: Number(data.account_id),
      category_id: data.category_id ? Number(data.category_id) : null,
      description: data.description,
      date: dateIso,
    })
    onOpenChange(false)
  })

  return (
    <Dialog open={open} title="Add Transaction" onOpenChange={onOpenChange}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="space-y-2">
          <Label>Type</Label>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                options={TYPE_OPTIONS}
                placeholder="Select type"
              />
            )}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="amount">Amount</Label>
          <Input id="amount" type="number" step="0.01" {...register('amount')} />
          {errors.amount && <p className="text-destructive text-sm">{errors.amount.message}</p>}
        </div>

        <div className="space-y-2">
          <Label>Account</Label>
          <Controller
            control={control}
            name="account_id"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                options={accountOptions}
                placeholder="Select account"
              />
            )}
          />
          {errors.account_id && (
            <p className="text-destructive text-sm">{errors.account_id.message}</p>
          )}
        </div>

        {txType !== 'transfer' && (
          <div className="space-y-2">
            <Label>Category</Label>
            <Controller
              control={control}
              name="category_id"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  options={categoryOptions}
                  placeholder="Select category"
                />
              )}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Input id="description" {...register('description')} />
          {errors.description && (
            <p className="text-destructive text-sm">{errors.description.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="date">Date</Label>
          <Input id="date" type="date" {...register('date')} />
          {errors.date && <p className="text-destructive text-sm">{errors.date.message}</p>}
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          Save
        </Button>
      </form>
    </Dialog>
  )
}
