import { useEffect, useMemo, useState } from 'react'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
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
import { useCategories } from '../categories/useCategories'
import { useAccounts } from '../accounts/useAccounts'
import { useCreateRule, usePreviewRule, useUpdateRule } from './useRules'
import type { CategoryRule, RuleField, RuleOperator } from './rulesApi'
import { formatCurrency } from '../lib/format'

const TEXT_OPS: RuleOperator[] = [
  'contains',
  'not_contains',
  'equals',
  'starts_with',
  'ends_with',
  'regex',
]
const AMOUNT_OPS: RuleOperator[] = ['eq', 'lt', 'lte', 'gt', 'gte', 'between']
const ACCOUNT_OPS: RuleOperator[] = ['eq', 'not_eq']
const TYPE_OPS: RuleOperator[] = ['eq']

function opsForField(field: RuleField): RuleOperator[] {
  if (field === 'amount') return AMOUNT_OPS
  if (field === 'account_id') return ACCOUNT_OPS
  if (field === 'type') return TYPE_OPS
  return TEXT_OPS
}

function createSchema(t: (key: string) => string) {
  return z.object({
    name: z.string().min(1, t('form.validation.nameRequired')).max(200),
    category_id: z.string().min(1, t('form.validation.categoryRequired')),
    match_type: z.enum(['all', 'any']),
    is_active: z.boolean(),
    apply_to_existing: z.boolean(),
    include_categorised: z.boolean(),
    conditions: z
      .array(
        z.object({
          field: z.enum(['description', 'amount', 'account_id', 'type', 'counterparty']),
          operator: z.string(),
          value: z.string().optional(),
          value_to: z.string().optional(),
        }),
      )
      .min(1, t('form.validation.conditionRequired')),
  })
}

type RuleForm = z.infer<ReturnType<typeof createSchema>>

function emptyDefaults(): RuleForm {
  return {
    name: '',
    category_id: '',
    match_type: 'all',
    is_active: true,
    apply_to_existing: false,
    include_categorised: false,
    conditions: [{ field: 'description', operator: 'contains', value: '', value_to: '' }],
  }
}

function fromRule(rule: CategoryRule): RuleForm {
  const conditions =
    rule.conditions.length > 0
      ? rule.conditions
      : [{ field: 'description' as const, operator: 'contains', value: '', value_to: '' }]
  return {
    name: rule.name,
    category_id: String(rule.category_id),
    match_type: rule.match_type,
    is_active: rule.is_active,
    apply_to_existing: false,
    include_categorised: false,
    conditions: conditions.map((c) => ({
      field: c.field as RuleField,
      operator: c.operator,
      value: c.value ?? '',
      value_to: c.value_to ?? '',
    })),
  }
}

interface RuleFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rule?: CategoryRule | null
  /** Prefill when creating a rule from a transaction. */
  prefill?: Partial<RuleForm> | null
}

export function RuleFormDialog({ open, onOpenChange, rule, prefill }: RuleFormDialogProps) {
  const { t } = useTranslation('rules')
  const { data: categories = [] } = useCategories()
  const { data: accounts = [] } = useAccounts()
  const createRule = useCreateRule()
  const updateRule = useUpdateRule()
  const preview = usePreviewRule()
  const [previewResult, setPreviewResult] = useState<{
    match_count: number
    sample: Array<{ id: number; description: string; amount: number; date: string | null }>
  } | null>(null)

  const schema = useMemo(() => createSchema((k) => t(k as 'form.validation.nameRequired')), [t])

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RuleForm>({
    resolver: zodResolver(schema) as never,
    defaultValues: emptyDefaults(),
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'conditions' })
  const matchType = watch('match_type')
  const conditions = watch('conditions')
  const applyToExisting = watch('apply_to_existing')

  useEffect(() => {
    if (!open) return
    setPreviewResult(null)
    if (rule) {
      reset(fromRule(rule))
    } else if (prefill) {
      reset({ ...emptyDefaults(), ...prefill })
    } else {
      reset(emptyDefaults())
    }
  }, [open, rule, prefill, reset])

  const categoryOptions = categories.map((c) => ({ value: String(c.id), label: c.name }))
  const accountOptions = accounts.map((a) => ({ value: String(a.id), label: a.name }))

  async function runPreview() {
    try {
      const result = await preview.mutateAsync({
        match_type: matchType,
        conditions: conditions.map((c) => ({
          field: c.field,
          operator: c.operator as RuleOperator,
          value: c.value || null,
          value_to: c.value_to || null,
        })),
      })
      setPreviewResult(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toast.createError'))
    }
  }

  const onSubmit = handleSubmit(async (data) => {
    const payload = {
      name: data.name,
      category_id: Number(data.category_id),
      match_type: data.match_type,
      is_active: data.is_active,
      conditions: data.conditions.map((c) => ({
        field: c.field,
        operator: c.operator as RuleOperator,
        value: c.value || null,
        value_to: c.value_to || null,
      })),
      apply_to_existing: !rule && data.apply_to_existing,
      include_categorised: !rule && data.apply_to_existing && data.include_categorised,
    }
    try {
      if (rule) {
        await updateRule.mutateAsync({ id: rule.id, payload })
        toast.success(t('toast.updated'))
      } else {
        await createRule.mutateAsync(payload)
        toast.success(t('toast.created'))
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : rule
            ? t('toast.updateError')
            : t('toast.createError'),
      )
    }
  })

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={rule ? t('form.titleEdit') : t('form.titleCreate')}
      size="lg"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void runPreview()}>
            {t('actions.preview')}
          </Button>
          <Button type="submit" form="category-rule-form" disabled={isSubmitting}>
            {t('form.save')}
          </Button>
        </>
      }
    >
      <form id="category-rule-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="rule-name">{t('form.name')}</Label>
          <Input id="rule-name" placeholder={t('form.namePlaceholder')} {...register('name')} />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>

        <div className="space-y-2">
          <Label>{t('form.category')}</Label>
          <Controller
            control={control}
            name="category_id"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                options={categoryOptions}
                placeholder={t('form.category')}
              />
            )}
          />
          {errors.category_id && (
            <p className="text-sm text-destructive">{errors.category_id.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>{t('form.matchType')}</Label>
          <Controller
            control={control}
            name="match_type"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                placeholder={t('form.matchType')}
                options={[
                  { value: 'all', label: t('form.matchAll') },
                  { value: 'any', label: t('form.matchAny') },
                ]}
              />
            )}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>{t('form.conditions')}</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                append({ field: 'description', operator: 'contains', value: '', value_to: '' })
              }
            >
              {t('form.addCondition')}
            </Button>
          </div>
          {fields.map((field, index) => {
            const currentField = conditions[index]?.field ?? 'description'
            const operators = opsForField(currentField)
            return (
              <div
                key={field.id}
                className="grid gap-2 rounded-lg border border-border/60 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
              >
                <Controller
                  control={control}
                  name={`conditions.${index}.field`}
                  render={({ field: f }) => (
                    <Select
                      value={f.value}
                      onValueChange={(value) => {
                        f.onChange(value)
                        setValue(`conditions.${index}.operator`, opsForField(value as RuleField)[0])
                      }}
                      placeholder={t('form.field')}
                      options={[
                        { value: 'description', label: t('summary.fields.description') },
                        { value: 'counterparty', label: t('summary.fields.counterparty') },
                        { value: 'amount', label: t('summary.fields.amount') },
                        { value: 'account_id', label: t('summary.fields.account_id') },
                        { value: 'type', label: t('summary.fields.type') },
                      ]}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name={`conditions.${index}.operator`}
                  render={({ field: f }) => (
                    <Select
                      value={f.value}
                      onValueChange={f.onChange}
                      placeholder={t('form.operator')}
                      options={operators.map((op) => ({ value: op, label: op }))}
                    />
                  )}
                />
                {currentField === 'account_id' ? (
                  <Controller
                    control={control}
                    name={`conditions.${index}.value`}
                    render={({ field: f }) => (
                      <Select
                        value={f.value || ''}
                        onValueChange={f.onChange}
                        placeholder={t('form.value')}
                        options={accountOptions}
                      />
                    )}
                  />
                ) : currentField === 'type' ? (
                  <Controller
                    control={control}
                    name={`conditions.${index}.value`}
                    render={({ field: f }) => (
                      <Select
                        value={f.value || ''}
                        onValueChange={f.onChange}
                        placeholder={t('form.value')}
                        options={[
                          { value: 'expense', label: 'expense' },
                          { value: 'income', label: 'income' },
                          { value: 'transfer', label: 'transfer' },
                        ]}
                      />
                    )}
                  />
                ) : (
                  <Input placeholder={t('form.value')} {...register(`conditions.${index}.value`)} />
                )}
                {conditions[index]?.operator === 'between' && (
                  <Input
                    placeholder={t('form.valueTo')}
                    {...register(`conditions.${index}.value_to`)}
                  />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={fields.length === 1}
                  onClick={() => remove(index)}
                >
                  {t('form.removeCondition')}
                </Button>
              </div>
            )
          })}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Controller
            control={control}
            name="is_active"
            render={({ field }) => (
              <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(Boolean(v))} />
            )}
          />
          {t('form.active')}
        </label>

        {!rule && (
          <div className="space-y-2 rounded-lg border border-border/60 p-3">
            <label className="flex items-center gap-2 text-sm">
              <Controller
                control={control}
                name="apply_to_existing"
                render={({ field }) => (
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(v) => field.onChange(Boolean(v))}
                  />
                )}
              />
              {t('form.applyToExisting')}
            </label>
            {applyToExisting && (
              <label className="flex items-center gap-2 text-sm pl-6">
                <Controller
                  control={control}
                  name="include_categorised"
                  render={({ field }) => (
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(v) => field.onChange(Boolean(v))}
                    />
                  )}
                />
                {t('form.includeCategorised')}
              </label>
            )}
          </div>
        )}

        {previewResult && (
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm space-y-2">
            <p className="font-medium">
              {t('form.previewCount', { count: previewResult.match_count })}
            </p>
            {previewResult.sample.length > 0 && (
              <ul className="space-y-1 text-muted-foreground">
                {previewResult.sample.map((row) => (
                  <li key={row.id} className="flex justify-between gap-2">
                    <span className="truncate">
                      {row.date} · {row.description}
                    </span>
                    <span className="shrink-0">{formatCurrency(row.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </form>
    </Dialog>
  )
}
