import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Route01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Spinner } from '@/components/ui/spinner'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'
import { formatCurrency } from '../lib/format'
import { useCreateTracker, useUpdateTracker } from './useTrackers'
import { CategoryIcon } from '../categories/categoryIcons'
import { IconPicker } from '../categories/IconPicker'
import {
  DEFAULT_TRACKER_COLOR,
  DEFAULT_TRACKER_ICON,
  TRACKER_CURRENCY_OPTIONS,
} from './trackerMeta'
import type { Tracker } from './trackersApi'

function createTrackerSchema(t: (key: string) => string) {
  return z.object({
    name: z.string().min(1, t('form.validation.nameRequired')).max(200),
    description: z.string().max(1000).optional(),
    // Empty string is the "no target" answer, and it is the common one — the
    // field is optional by design, so it must not fail validation when blank.
    target_amount: z
      .union([z.literal(''), z.coerce.number<number>().positive(t('form.validation.targetPositive'))])
      .optional(),
    currency: z.enum(['EUR', 'USD', 'GBP']),
    icon: z.string(),
    color: z.string(),
    is_active: z.boolean(),
  })
}

type TrackerForm = z.infer<ReturnType<typeof createTrackerSchema>>

const emptyForm: TrackerForm = {
  name: '',
  description: '',
  target_amount: '',
  currency: 'EUR',
  icon: DEFAULT_TRACKER_ICON,
  color: DEFAULT_TRACKER_COLOR,
  is_active: true,
}

interface TrackerFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tracker?: Tracker | null
}

export function TrackerFormDialog({ open, onOpenChange, tracker }: TrackerFormDialogProps) {
  const { t } = useTranslation(['trackers', 'common'])
  const schema = useMemo(() => createTrackerSchema(t), [t])
  const isEdit = !!tracker
  const createTracker = useCreateTracker()
  const updateTracker = useUpdateTracker()

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TrackerForm>({
    resolver: zodResolver(schema) as never,
    defaultValues: emptyForm,
  })

  useEffect(() => {
    if (!open) return
    if (tracker) {
      reset({
        name: tracker.name,
        description: tracker.description ?? '',
        target_amount: tracker.target_amount ?? '',
        currency: (['EUR', 'USD', 'GBP'].includes(tracker.currency)
          ? tracker.currency
          : 'EUR') as TrackerForm['currency'],
        icon: tracker.icon || DEFAULT_TRACKER_ICON,
        color: tracker.color || DEFAULT_TRACKER_COLOR,
        is_active: tracker.is_active,
      })
    } else {
      reset(emptyForm)
    }
  }, [open, tracker, reset])

  const preview = watch()

  const onSubmit = handleSubmit(async (data) => {
    const input = {
      name: data.name.trim(),
      description: data.description?.trim() || null,
      target_amount:
        data.target_amount === '' || data.target_amount == null
          ? null
          : Number(data.target_amount),
      currency: data.currency,
      icon: data.icon || null,
      color: data.color || null,
      is_active: data.is_active,
    }

    try {
      if (isEdit && tracker) {
        await updateTracker.mutateAsync({ id: tracker.id, input })
        toast.success(t('form.toasts.updated'))
      } else {
        await createTracker.mutateAsync(input)
        toast.success(t('form.toasts.created'))
      }
      onOpenChange(false)
    } catch {
      toast.error(isEdit ? t('form.toasts.updateFailed') : t('form.toasts.createFailed'))
    }
  })

  const isPending = isSubmitting || createTracker.isPending || updateTracker.isPending
  const formId = 'tracker-form'

  return (
    <Dialog
      open={open}
      title={isEdit ? t('form.titleEdit') : t('form.titleCreate')}
      description={t('form.description')}
      icon={Route01Icon}
      tone="primary"
      size="lg"
      onOpenChange={onOpenChange}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('common:actions.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={isPending}>
            {isPending && <Spinner data-icon="inline-start" />}
            {isEdit ? t('form.saveChanges') : t('form.create')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex items-center gap-3 rounded-xl border p-3">
          <CategoryIcon
            icon={preview.icon || DEFAULT_TRACKER_ICON}
            color={preview.color || DEFAULT_TRACKER_COLOR}
            className="size-11 shrink-0"
            size={22}
          />
          <div className="min-w-0">
            <p className="font-heading font-semibold truncate">
              {preview.name?.trim() || t('form.untitled')}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {preview.target_amount === '' || preview.target_amount == null
                ? t('form.noTarget')
                : t('form.targetPreview', {
                    amount: formatCurrency(Number(preview.target_amount), preview.currency),
                  })}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="tracker-name">
            {t('form.name.label')} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="tracker-name"
            placeholder={t('form.name.placeholder')}
            aria-invalid={!!errors.name}
            disabled={isPending}
            {...register('name')}
          />
          {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="tracker-description">{t('form.descriptionField.label')}</Label>
          <Textarea
            id="tracker-description"
            rows={2}
            placeholder={t('form.descriptionField.placeholder')}
            disabled={isPending}
            {...register('description')}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="tracker-target">{t('form.target.label')}</Label>
            <Input
              id="tracker-target"
              type="number"
              step="0.01"
              min={0}
              placeholder={t('form.target.placeholder')}
              aria-invalid={!!errors.target_amount}
              disabled={isPending}
              {...register('target_amount')}
            />
            <p className="text-xs text-muted-foreground">{t('form.target.hint')}</p>
            {errors.target_amount && (
              <p className="text-destructive text-sm">{errors.target_amount.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t('form.currency.label')}</Label>
            <Controller
              name="currency"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  options={[...TRACKER_CURRENCY_OPTIONS]}
                  placeholder={t('form.currency.label')}
                />
              )}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-2">
            <Label>{t('form.icon.label')}</Label>
            {/* The same HugeIcons picker categories use — one icon vocabulary
                across the app beats a second, emoji-only one here. */}
            <Controller
              name="icon"
              control={control}
              render={({ field }) => (
                <IconPicker
                  value={field.value}
                  onChange={field.onChange}
                  color={preview.color || DEFAULT_TRACKER_COLOR}
                  disabled={isPending}
                />
              )}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tracker-color">{t('form.color.label')}</Label>
            <Input
              id="tracker-color"
              type="color"
              className="h-11 w-full p-1 sm:w-20"
              disabled={isPending}
              {...register('color')}
            />
          </div>
        </div>

        <Controller
          name="is_active"
          control={control}
          render={({ field }) => (
            <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border/60 px-3 py-2.5">
              <span>
                <span className="text-sm font-medium">{t('form.active.label')}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {t('form.active.hint')}
                </span>
              </span>
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={isPending}
              />
            </label>
          )}
        />
      </form>
    </Dialog>
  )
}
