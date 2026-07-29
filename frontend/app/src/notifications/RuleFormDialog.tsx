import { useEffect, useMemo } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
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

function createRuleSchema(t: (key: string) => string) {
  return z.object({
    type: z.enum(['balance_below', 'budget_percent', 'scheduled_report']),
    name: z.string().min(1, t('ruleForm.validation.nameRequired')).max(200),
    target_id: z.string().optional(),
    threshold: z.string().optional(),
    report_type: z.enum(['spending', 'cashflow', 'income']),
    schedule_kind: z.enum(['every_n_days', 'weekly', 'monthly']),
    schedule_value: z.coerce.number<number>().int().min(1),
    channel_email: z.boolean(),
    channel_push: z.boolean(),
    is_active: z.boolean(),
  })
}

type RuleForm = z.infer<ReturnType<typeof createRuleSchema>>

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
  const { t } = useTranslation('notifications')
  const ruleSchema = useMemo(() => createRuleSchema(t), [t])
  const isEdit = !!rule
  const createRule = useCreateNotificationRule()
  const updateRule = useUpdateNotificationRule()
  const { data: accounts = [] } = useAccounts()
  const { data: budgets = [] } = useBudgets(false)

  const typeOptions = useMemo(
    () => [
      { value: 'balance_below', label: t('ruleForm.typeOptions.balance_below') },
      { value: 'budget_percent', label: t('ruleForm.typeOptions.budget_percent') },
      { value: 'scheduled_report', label: t('ruleForm.typeOptions.scheduled_report') },
    ],
    [t],
  )

  const reportTypeOptions = useMemo(
    () => [
      { value: 'spending', label: t('ruleForm.reportTypes.spending') },
      { value: 'cashflow', label: t('ruleForm.reportTypes.cashflow') },
      { value: 'income', label: t('ruleForm.reportTypes.income') },
    ],
    [t],
  )

  const scheduleKindOptions = useMemo(
    () => [
      { value: 'every_n_days', label: t('ruleForm.scheduleKinds.every_n_days') },
      { value: 'weekly', label: t('ruleForm.scheduleKinds.weekly') },
      { value: 'monthly', label: t('ruleForm.scheduleKinds.monthly') },
    ],
    [t],
  )

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
        toast.error(t('ruleForm.validation.selectTarget'))
        return
      }
      const threshold = Number.parseFloat(data.threshold ?? '')
      if (Number.isNaN(threshold)) {
        toast.error(t('ruleForm.validation.validThreshold'))
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
        toast.success(t('toasts.ruleUpdated'))
      } else {
        await createRule.mutateAsync(payload)
        toast.success(t('toasts.ruleCreated'))
      }
      onOpenChange(false)
    } catch {
      toast.error(isEdit ? t('toasts.ruleUpdateFailed') : t('toasts.ruleCreateFailed'))
    }
  })

  return (
    <Dialog
      open={open}
      title={isEdit ? t('ruleForm.titleEdit') : t('ruleForm.titleCreate')}
      onOpenChange={onOpenChange}
      className="sm:max-w-lg"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label>{t('ruleForm.ruleType')}</Label>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                options={typeOptions}
                placeholder={t('ruleForm.selectType')}
              />
            )}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="rule-name">{t('ruleForm.name')}</Label>
          <Input
            id="rule-name"
            maxLength={200}
            placeholder={t('ruleForm.namePlaceholder')}
            {...register('name')}
          />
          {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
        </div>

        {(type === 'balance_below' || type === 'budget_percent') && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>{type === 'balance_below' ? t('ruleForm.account') : t('ruleForm.budget')}</Label>
              <Controller
                control={control}
                name="target_id"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    options={type === 'balance_below' ? accountOptions : budgetOptions}
                    placeholder={t('ruleForm.selectTarget')}
                  />
                )}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="rule-threshold">
                {type === 'balance_below'
                  ? t('ruleForm.balanceThreshold')
                  : t('ruleForm.usageThreshold')}
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
              <Label>{t('ruleForm.reportType')}</Label>
              <Controller
                control={control}
                name="report_type"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    options={reportTypeOptions}
                    placeholder={t('ruleForm.selectReport')}
                  />
                )}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>{t('ruleForm.schedule')}</Label>
                <Controller
                  control={control}
                  name="schedule_kind"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      options={scheduleKindOptions}
                      placeholder={t('ruleForm.selectSchedule')}
                    />
                  )}
                />
              </div>
              {scheduleKind === 'every_n_days' && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="rule-schedule-value">{t('ruleForm.everyDays')}</Label>
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
          <Label>{t('ruleForm.channels')}</Label>
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
              <span className="text-sm">{t('ruleForm.channelEmail')}</span>
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
              <span className="text-sm">{t('ruleForm.channelPush')}</span>
            </label>
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-3">
          <Controller
            control={control}
            name="is_active"
            render={({ field }) => (
              <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
            )}
          />
          <span className="text-sm">{t('ruleForm.ruleActive')}</span>
        </label>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isEdit ? t('ruleForm.updateRule') : t('ruleForm.saveRule')}
        </Button>
      </form>
    </Dialog>
  )
}
