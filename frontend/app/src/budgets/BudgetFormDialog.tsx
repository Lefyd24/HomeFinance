import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'
import { useCreateBudget } from './useBudgets'

const budgetSchema = z.object({
  name: z.string().min(1, 'Budget name is required').max(100),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  period: z.enum(['monthly', 'yearly', 'custom']),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
})

type BudgetForm = z.infer<typeof budgetSchema>

const PERIOD_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom' },
]

interface BudgetFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function BudgetFormDialog({ open, onOpenChange }: BudgetFormDialogProps) {
  const createBudget = useCreateBudget()
  const {
    register,
    control,
    watch,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BudgetForm>({
    resolver: zodResolver(budgetSchema),
    defaultValues: { name: '', amount: 0, period: 'monthly', start_date: '', end_date: '' },
  })

  const period = watch('period')

  const onSubmit = handleSubmit(async (data) => {
    await createBudget.mutateAsync({
      name: data.name,
      amount: data.amount,
      period: data.period,
      start_date: data.start_date || null,
      end_date: data.end_date || null,
      category_ids: [],
    })
    onOpenChange(false)
  })

  return (
    <Dialog open={open} title="Add Budget" onOpenChange={onOpenChange}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="budget-name">Budget Name</Label>
          <Input id="budget-name" {...register('name')} />
          {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="budget-amount">Amount</Label>
          <Input id="budget-amount" type="number" step="0.01" {...register('amount')} />
          {errors.amount && <p className="text-destructive text-sm">{errors.amount.message}</p>}
        </div>

        <div className="space-y-2">
          <Label>Period</Label>
          <Controller
            control={control}
            name="period"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                options={PERIOD_OPTIONS}
                placeholder="Select period"
              />
            )}
          />
        </div>

        {period === 'custom' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="start-date">Start Date</Label>
              <Input id="start-date" type="date" {...register('start_date')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">End Date</Label>
              <Input id="end-date" type="date" {...register('end_date')} />
            </div>
          </>
        )}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          Save
        </Button>
      </form>
    </Dialog>
  )
}
