import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'
import { useAccounts } from '../accounts/useAccounts'
import { useBudgets } from '../budgets/useBudgets'
import {
  useCreateNotificationRule,
  useUpdateNotificationRule,
} from './useNotificationSettings'
import type { NotificationRule, NotificationRuleType } from './notificationsApi'

const ruleSchema = z.object({
  type: z.enum(['balance_below', 'budget_percent', 'scheduled_report']),
  name: z.string().min(1, 'Name is required').max(200),
  target_id: z.string().optional(),
  threshold: z.string().optional(),
  report_type: z.enum(['spending', 'cashflow', 'income']),
  schedule_kind: z.enum(['every_n_days', 'weekly', 'monthly']),
  schedule_value: z.coerce.number<number>().int().min(1),
  channel_email: z.boolean(),
  channel_push: z.boolean(),
  is_active: z.boolean(),
})

type RuleForm = z.infer<typeof ruleSchema>

const TYPE_OPTIONS = [
  { value: 'balance_below', label: 'Balance below threshold' },
  { value: 'budget_percent', label: 'Budget usage percent' },
  { value: 'scheduled_report', label: 'Scheduled report' },
]

const REPORT_TYPE_OPTIONS = [
  { value: 'spending', label: 'Spending' },
  { value: 'cashflow', label: 'Cashflow' },
  { value: 'income', label: 'Income' },
]

const SCHEDULE_KIND_OPTIONS = [
  { value: 'every_n_days', label: 'Every N days' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

function emptyDefaults(): RuleForm {
  return {
    type: 'balance_below',
    name: '',
    target_id: '',
    threshold: '',
    report_type: 'spending',
    schedule_kind: 'every_n_days',
    schedule_value: 7,
    channel_email: true,
    channel_push: false,
    is_active: true,
  }
}

function fromRule(rule: NotificationRule): RuleForm {
  const channels = (rule.channels || 'email').split(',').map((c) => c.trim())
  return {
    type: rule.type,
    name: rule.name,
    target_id: rule.target_id != null ? String(rule.target_id) : '',
    threshold: rule.threshold != null ? String(rule.threshold) : '',
    report_type: rule.report_type ?? 'spending',
    schedule_kind: rule.schedule_kind ?? 'every_n_days',
    schedule_value: rule.schedule_value ?? 7,
    channel_email: channels.includes('email'),
    channel_push: channels.includes('push'),
    is_active: rule.is_active,
  }
}

interface RuleFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rule?: NotificationRule | null
}

export function RuleFormDialog({ open, onOpenChange, rule }: RuleFormDialogProps) {
  const isEdit = !!rule
  const createRule = useCreateNotificationRule()
  const updateRule = useUpdateNotificationRule()
  const { data: accounts = [] } = useAccounts()
  const { data: budgets = [] } = useBudgets(false)

  const {
    register,
    control,
    watch,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RuleForm>({
    resolver: zodResolver(ruleSchema),
    defaultValues: emptyDefaults(),
  })

  useEffect(() => {
    if (!open) return
    reset(rule ? fromRule(rule) : emptyDefaults())
  }, [open, rule, reset])

  const type = watch('type') as NotificationRuleType
  const scheduleKind = watch('schedule_kind')

  const accountOptions = accounts.map((a) => ({ value: String(a.id), label: a.name }))
  const budgetOptions = budgets.map((b) => ({ value: String(b.id), label: b.name }))

  const onSubmit = handleSubmit(async (data) => {
    const channels = [data.channel_email && 'email', data.channel_push && 'push']
      .filter(Boolean)
      .join(',')

    const payload = {
      type: data.type,
      name: data.name.trim(),
      channels: channels || 'email',
      is_active: data.is_active,
      target_id: null as number | null,
      threshold: null as number | null,
      report_type: null as RuleForm['report_type'] | null,
      schedule_kind: null as RuleForm['schedule_kind'] | null,
      schedule_value: null as number | null,
    }

    if (data.type === 'balance_below' || data.type === 'budget_percent') {
      if (!data.target_id) {
        toast.error('Please select a target')
        return
      }
      const threshold = Number.parseFloat(data.threshold ?? '')
      if (Number.isNaN(threshold)) {
        toast.error('Please enter a valid threshold')
        return
      }
      payload.target_id = Number(data.target_id)
      payload.threshold = threshold
    }

    if (data.type === 'scheduled_report') {
      payload.report_type = data.report_type
      payload.schedule_kind = data.schedule_kind
      if (data.schedule_kind === 'every_n_days') {
        payload.schedule_value = data.schedule_value
      }
    }

    try {
      if (isEdit && rule) {
        await updateRule.mutateAsync({ id: rule.id, payload })
        toast.success('Rule updated')
      } else {
        await createRule.mutateAsync(payload)
        toast.success('Rule created')
      }
      onOpenChange(false)
    } catch {
      toast.error(isEdit ? 'Failed to update rule' : 'Failed to create rule')
    }
  })

  return (
    <Dialog
      open={open}
      title={isEdit ? 'Edit notification rule' : 'Add notification rule'}
      onOpenChange={onOpenChange}
      className="sm:max-w-lg"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label>Rule type</Label>
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

        <div className="flex flex-col gap-2">
          <Label htmlFor="rule-name">Name</Label>
          <Input
            id="rule-name"
            maxLength={200}
            placeholder="e.g. Checking account low balance"
            {...register('name')}
          />
          {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
        </div>

        {(type === 'balance_below' || type === 'budget_percent') && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>{type === 'balance_below' ? 'Account' : 'Budget'}</Label>
              <Controller
                control={control}
                name="target_id"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    options={type === 'balance_below' ? accountOptions : budgetOptions}
                    placeholder="Select…"
                  />
                )}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="rule-threshold">
                {type === 'balance_below' ? 'Balance threshold' : 'Usage threshold (%)'}
              </Label>
              <Input
                id="rule-threshold"
                type="number"
                step="0.01"
                min="0"
                {...register('threshold')}
              />
            </div>
          </div>
        )}

        {type === 'scheduled_report' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Report type</Label>
              <Controller
                control={control}
                name="report_type"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    options={REPORT_TYPE_OPTIONS}
                    placeholder="Select report"
                  />
                )}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Schedule</Label>
                <Controller
                  control={control}
                  name="schedule_kind"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      options={SCHEDULE_KIND_OPTIONS}
                      placeholder="Select schedule"
                    />
                  )}
                />
              </div>
              {scheduleKind === 'every_n_days' && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="rule-schedule-value">Every (days)</Label>
                  <Input
                    id="rule-schedule-value"
                    type="number"
                    min={1}
                    {...register('schedule_value')}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label>Channels</Label>
          <div className="flex flex-wrap gap-4">
            <label className="flex cursor-pointer items-center gap-2">
              <Controller
                control={control}
                name="channel_email"
                render={({ field }) => (
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(v) => field.onChange(v === true)}
                  />
                )}
              />
              <span className="text-sm">Email</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <Controller
                control={control}
                name="channel_push"
                render={({ field }) => (
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(v) => field.onChange(v === true)}
                  />
                )}
              />
              <span className="text-sm">Push</span>
            </label>
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-3">
          <Controller
            control={control}
            name="is_active"
            render={({ field }) => <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />}
          />
          <span className="text-sm">Rule active</span>
        </label>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isEdit ? 'Update rule' : 'Save rule'}
        </Button>
      </form>
    </Dialog>
  )
}
