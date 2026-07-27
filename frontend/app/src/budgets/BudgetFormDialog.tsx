import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'
import { useCategories } from '../categories/useCategories'
import { useCreateBudget, useUpdateBudget } from './useBudgets'
import type { Budget } from './budgetsApi'

const budgetSchema = z.object({
  name: z.string().min(1, 'Budget name is required').max(100),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  period: z.enum(['monthly', 'yearly', 'custom']),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  category_ids: z.array(z.number()),
})

type BudgetForm = z.infer<typeof budgetSchema>

const PERIOD_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom' },
]

function toDateInput(value: string | null | undefined): string {
  if (!value) return ''
  return value.includes('T') ? value.split('T')[0]! : value.slice(0, 10)
}

interface BudgetFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  budget?: Budget | null
}

export function BudgetFormDialog({ open, onOpenChange, budget }: BudgetFormDialogProps) {
  const isEdit = !!budget
  const createBudget = useCreateBudget()
  const updateBudget = useUpdateBudget()
  const { data: categories = [] } = useCategories()
  const expenseCategories = categories.filter((c) => c.type === 'expense')

  const {
    register,
    control,
    watch,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<BudgetForm>({
    resolver: zodResolver(budgetSchema),
    defaultValues: {
      name: '',
      amount: 0,
      period: 'monthly',
      start_date: '',
      end_date: '',
      category_ids: [],
    },
  })

  useEffect(() => {
    if (!open) return
    if (budget) {
      reset({
        name: budget.name,
        amount: budget.amount,
        period: budget.period,
        start_date: toDateInput(budget.start_date),
        end_date: toDateInput(budget.end_date),
        category_ids: budget.category_ids ?? [],
      })
    } else {
      reset({
        name: '',
        amount: 0,
        period: 'monthly',
        start_date: '',
        end_date: '',
        category_ids: [],
      })
    }
  }, [open, budget, reset])

  const categoryIds = watch('category_ids')

  const toggleCategory = (id: number, checked: boolean) => {
    const next = checked ? [...categoryIds, id] : categoryIds.filter((c) => c !== id)
    setValue('category_ids', next, { shouldDirty: true })
  }

  const onSubmit = handleSubmit(async (data) => {
    const payload = {
      name: data.name,
      amount: data.amount,
      period: data.period,
      start_date: data.start_date || null,
      end_date: data.end_date || null,
      category_ids: data.category_ids,
    }
    try {
      if (isEdit && budget) {
        await updateBudget.mutateAsync({ id: budget.id, input: payload })
        toast.success('Budget updated')
      } else {
        await createBudget.mutateAsync(payload)
        toast.success('Budget created')
      }
      onOpenChange(false)
    } catch {
      toast.error(isEdit ? 'Failed to update budget' : 'Failed to create budget')
    }
  })

  return (
    <Dialog
      open={open}
      title={isEdit ? 'Edit Budget' : 'Create Budget'}
      onOpenChange={onOpenChange}
      className="sm:max-w-lg"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="budget-name">Budget Name</Label>
          <Input id="budget-name" {...register('name')} />
          {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="budget-amount">Amount</Label>
            <Input id="budget-amount" type="number" step="0.01" inputMode="decimal" {...register('amount')} />
            {errors.amount && <p className="text-destructive text-sm">{errors.amount.message}</p>}
          </div>

          <div className="flex flex-col gap-2">
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
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="start-date">Start Date</Label>
            <Input id="start-date" type="date" {...register('start_date')} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="end-date">End Date</Label>
            <Input id="end-date" type="date" {...register('end_date')} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Categories</Label>
          {expenseCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expense categories available.</p>
          ) : (
            <ScrollArea className="h-40 rounded-lg border border-border">
              <div className="flex flex-col gap-1 p-2">
                {expenseCategories.map((cat) => {
                  const checked = categoryIds.includes(cat.id)
                  return (
                    <label
                      key={cat.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => toggleCategory(cat.id, value === true)}
                        aria-label={cat.name}
                      />
                      <span className="text-sm">{cat.name}</span>
                    </label>
                  )
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isEdit ? 'Update Budget' : 'Create Budget'}
        </Button>
      </form>
    </Dialog>
  )
}
