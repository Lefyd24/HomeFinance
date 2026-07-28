import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { TargetIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'
import { useCreateGoal, useUpdateGoal } from './useGoals'
import {
  CATEGORY_OPTIONS,
  CURRENCY_OPTIONS,
  ICON_OPTIONS,
  NONE_CATEGORY,
} from './goalMeta'
import type { Goal } from './goalsApi'
import { cn } from '@/lib/utils'
import { formatCurrency } from '../lib/format'

const goalSchema = z.object({
  name: z.string().min(1, 'Goal name is required').max(200),
  description: z.string().max(1000).optional(),
  target_amount: z.number().positive('Target amount must be greater than 0'),
  currency: z.enum(['EUR', 'USD', 'GBP']),
  category: z.string(),
  target_date: z.string().optional(),
  icon: z.string(),
  color: z.string(),
  is_primary: z.boolean(),
})

type GoalForm = z.infer<typeof goalSchema>

interface GoalFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  goal?: Goal | null
}

export function GoalFormDialog({ open, onOpenChange, goal }: GoalFormDialogProps) {
  const isEdit = !!goal
  const createGoal = useCreateGoal()
  const updateGoal = useUpdateGoal()

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<GoalForm>({
    resolver: zodResolver(goalSchema),
    defaultValues: {
      name: '',
      description: '',
      target_amount: 0,
      currency: 'EUR',
      category: NONE_CATEGORY,
      target_date: '',
      icon: '🎯',
      color: '#3B82F6',
      is_primary: false,
    },
  })

  useEffect(() => {
    if (!open) return
    if (goal) {
      reset({
        name: goal.name,
        description: goal.description ?? '',
        target_amount: goal.target_amount,
        currency: (['EUR', 'USD', 'GBP'].includes(goal.currency)
          ? goal.currency
          : 'EUR') as GoalForm['currency'],
        category: goal.category || NONE_CATEGORY,
        target_date: goal.target_date ?? '',
        icon: goal.icon || '🎯',
        color: goal.color || '#3B82F6',
        is_primary: goal.is_primary,
      })
    } else {
      reset({
        name: '',
        description: '',
        target_amount: 0,
        currency: 'EUR',
        category: NONE_CATEGORY,
        target_date: '',
        icon: '🎯',
        color: '#3B82F6',
        is_primary: false,
      })
    }
  }, [open, goal, reset])

  const preview = watch()

  const onSubmit = handleSubmit(async (data) => {
    const input = {
      name: data.name.trim(),
      description: data.description?.trim() || null,
      target_amount: data.target_amount,
      currency: data.currency,
      category: data.category === NONE_CATEGORY ? null : data.category,
      target_date: data.target_date || null,
      icon: data.icon || null,
      color: data.color || null,
      is_primary: data.is_primary,
    }

    try {
      if (isEdit && goal) {
        await updateGoal.mutateAsync({ id: goal.id, input })
        toast.success('Goal updated')
      } else {
        await createGoal.mutateAsync(input)
        toast.success('Goal created')
      }
      onOpenChange(false)
    } catch {
      toast.error(isEdit ? 'Failed to update goal' : 'Failed to create goal')
    }
  })

  const isPending = isSubmitting || createGoal.isPending || updateGoal.isPending
  const categoryOptions = [
    { value: NONE_CATEGORY, label: 'Select category' },
    ...CATEGORY_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
  ]

  return (
    <Dialog
      open={open}
      title={isEdit ? 'Edit goal' : 'Create goal'}
      onOpenChange={onOpenChange}
      className="sm:max-w-xl"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div
          className={cn(
            'rounded-xl border p-4',
            'bg-primary text-primary-foreground border-transparent',
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex size-12 shrink-0 items-center justify-center rounded-full text-2xl bg-primary-foreground/15"
              style={
                preview.color
                  ? { backgroundColor: `${preview.color}33` }
                  : undefined
              }
              aria-hidden
            >
              {preview.icon || (
                <HugeiconsIcon icon={TargetIcon} strokeWidth={2} />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm text-primary-foreground/80">
                {isEdit ? 'Updating' : 'New savings target'}
              </p>
              <p className="font-heading text-lg font-semibold truncate">
                {preview.name.trim() || 'Untitled goal'}
              </p>
              <p className="text-sm tabular-nums text-primary-foreground/90">
                {formatCurrency(Number(preview.target_amount) || 0, preview.currency)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="goal-name">
            Goal name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="goal-name"
            placeholder="e.g. Emergency fund"
            aria-invalid={!!errors.name}
            disabled={isPending}
            {...register('name')}
          />
          {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="goal-description">Description</Label>
          <Textarea
            id="goal-description"
            rows={2}
            placeholder="Optional notes"
            disabled={isPending}
            {...register('description')}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="goal-target">
              Target amount <span className="text-destructive">*</span>
            </Label>
            <Input
              id="goal-target"
              type="number"
              step="0.01"
              placeholder="0.00"
              aria-invalid={!!errors.target_amount}
              disabled={isPending}
              {...register('target_amount', { valueAsNumber: true })}
            />
            {errors.target_amount && (
              <p className="text-destructive text-sm">{errors.target_amount.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label>Currency</Label>
            <Controller
              name="currency"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  options={[...CURRENCY_OPTIONS]}
                  placeholder="Currency"
                />
              )}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label>Category</Label>
            <Controller
              name="category"
              control={control}
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
          <div className="flex flex-col gap-2">
            <Label htmlFor="goal-target-date">Target date</Label>
            <Input
              id="goal-target-date"
              type="date"
              disabled={isPending}
              {...register('target_date')}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label>Icon</Label>
            <Controller
              name="icon"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  options={ICON_OPTIONS.map((o) => ({
                    value: o.value,
                    label: `${o.value} ${o.label}`,
                  }))}
                  placeholder="Icon"
                />
              )}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="goal-color">Color</Label>
            <Input
              id="goal-color"
              type="color"
              className="h-10 p-1"
              disabled={isPending}
              {...register('color')}
            />
          </div>
        </div>

        <Controller
          name="is_primary"
          control={control}
          render={({ field }) => (
            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
                disabled={isPending}
              />
              <span className="text-sm">Set as primary goal</span>
            </label>
          )}
        />

        <Separator />
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isEdit ? 'Save changes' : 'Save goal'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
