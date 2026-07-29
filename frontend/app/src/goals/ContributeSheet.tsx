import { useEffect, useMemo } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { MoneyReceive01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Select } from '../ui/Select'
import { formatCurrency } from '../lib/format'
import { useAddGoalTransaction } from './useGoals'
import { remainingAmount, todayISO } from './goalMeta'
import type { Goal } from './goalsApi'

function createContributeSchema(t: (key: string) => string) {
  return z.object({
    amount: z.number().positive(t('contribute.validation.amountPositive')),
    type: z.enum(['contribution', 'withdrawal']),
    description: z.string().max(500).optional(),
    date: z.string().min(1, t('contribute.validation.dateRequired')),
  })
}

type ContributeForm = z.infer<ReturnType<typeof createContributeSchema>>

interface ContributeSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  goal: Goal | null
}

export function ContributeSheet({ open, onOpenChange, goal }: ContributeSheetProps) {
  const { t } = useTranslation('goals')
  const contributeSchema = useMemo(() => createContributeSchema(t), [t])
  const addTx = useAddGoalTransaction()
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ContributeForm>({
    resolver: zodResolver(contributeSchema),
    defaultValues: {
      amount: 0,
      type: 'contribution',
      description: '',
      date: todayISO(),
    },
  })

  useEffect(() => {
    if (!open) return
    reset({
      amount: 0,
      type: 'contribution',
      description: '',
      date: todayISO(),
    })
  }, [open, goal?.id, reset])

  const type = watch('type')

  const onSubmit = handleSubmit(async (data) => {
    if (!goal) return
    try {
      await addTx.mutateAsync({
        id: goal.id,
        input: {
          amount: data.amount,
          type: data.type,
          description: data.description?.trim() || null,
          date: data.date,
        },
      })
      toast.success(
        data.type === 'contribution'
          ? t('contribute.toasts.contributionAdded')
          : t('contribute.toasts.withdrawalRecorded'),
      )
      onOpenChange(false)
    } catch {
      toast.error(t('contribute.toasts.failed'))
    }
  })

  const isPending = isSubmitting || addTx.isPending
  const remaining = goal ? remainingAmount(goal) : 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={MoneyReceive01Icon} strokeWidth={2} />
            {t('contribute.title')}
          </SheetTitle>
          <SheetDescription>
            {goal
              ? t('contribute.descriptionWithGoal', {
                  name: goal.name,
                  amount: formatCurrency(remaining, goal.currency),
                })
              : t('contribute.descriptionNoGoal')}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-4 p-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="contribute-amount">
              {t('contribute.amount.label')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="contribute-amount"
              type="number"
              step="0.01"
              placeholder="0.00"
              aria-invalid={!!errors.amount}
              disabled={isPending}
              {...register('amount', { valueAsNumber: true })}
            />
            {errors.amount && (
              <p className="text-destructive text-sm">{errors.amount.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t('contribute.type.label')}</Label>
            <Controller
              name="type"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  options={[
                    { value: 'contribution', label: t('contribute.type.contribution') },
                    { value: 'withdrawal', label: t('contribute.type.withdrawal') },
                  ]}
                  placeholder={t('contribute.type.label')}
                />
              )}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="contribute-description">{t('contribute.description.label')}</Label>
            <Input
              id="contribute-description"
              placeholder={t('contribute.description.placeholder')}
              disabled={isPending}
              {...register('description')}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="contribute-date">
              {t('contribute.date.label')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="contribute-date"
              type="date"
              aria-invalid={!!errors.date}
              disabled={isPending}
              {...register('date')}
            />
            {errors.date && <p className="text-destructive text-sm">{errors.date.message}</p>}
          </div>

          <SheetFooter className="mt-auto px-0 pb-0">
            <Button type="submit" disabled={isPending || !goal} className="w-full">
              {type === 'withdrawal'
                ? t('contribute.submitWithdrawal')
                : t('contribute.submitContribution')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
