import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { BankIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog } from '../ui/Dialog'
import { useProviderSettings, useUpdateProviderSettings } from './providerSettingsApi'
import type { InvestmentProvider } from './investmentsApi'
import type { ProviderSettings, ProviderSettingsInput } from './providerSettingsApi'

/**
 * The per-provider fee schedule, as a form.
 *
 * Every field may be left empty, and empty means `null` — "not set: the fee is
 * inferred from the broker's data". Only typed values are sent on, so clearing
 * a field really does hand the estimate back to the broker's numbers.
 */

interface FeeGroup {
  /** Form field prefix: `commission`, `deposit_fee`, `withdrawal_fee`. */
  prefix: string
  labelKey: string
}

const FEE_GROUPS: FeeGroup[] = [
  { prefix: 'commission', labelKey: 'tradeCommission' },
  { prefix: 'deposit_fee', labelKey: 'depositFee' },
  { prefix: 'withdrawal_fee', labelKey: 'withdrawalFee' },
]

/** The form is strings; `""` is "not set", numbers are parsed on submit. */
type FeeForm = {
  commission_fixed: string
  commission_pct: string
  deposit_fee_fixed: string
  deposit_fee_pct: string
  withdrawal_fee_fixed: string
  withdrawal_fee_pct: string
}

/** `Number('') === 0`, so the empty check must come before any numeric parse. */
function parseField(value: string): number | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : Number(trimmed)
}

function fieldsToForm(settings: ProviderSettings | undefined): FeeForm {
  return {
    commission_fixed: settings?.commission_fixed == null ? '' : String(settings.commission_fixed),
    commission_pct: settings?.commission_pct == null ? '' : String(settings.commission_pct),
    deposit_fee_fixed: settings?.deposit_fee_fixed == null ? '' : String(settings.deposit_fee_fixed),
    deposit_fee_pct: settings?.deposit_fee_pct == null ? '' : String(settings.deposit_fee_pct),
    withdrawal_fee_fixed: settings?.withdrawal_fee_fixed == null ? '' : String(settings.withdrawal_fee_fixed),
    withdrawal_fee_pct: settings?.withdrawal_fee_pct == null ? '' : String(settings.withdrawal_fee_pct),
  }
}

interface ProviderFeeSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  provider: InvestmentProvider
}

export function ProviderFeeSettingsDialog({
  open,
  onOpenChange,
  provider,
}: ProviderFeeSettingsDialogProps) {
  const { t } = useTranslation('investments')
  const { data: settings } = useProviderSettings(open)
  const update = useUpdateProviderSettings()

  // Mirrors the backend's `ProviderSettingsUpdate`: fixed ≥ 0, pct 0–100, or unset.
  const schema = useMemo(
    () =>
      z.object({
        commission_fixed: feeField(false, t('feeSettings.validation.number')),
        commission_pct: feeField(true, t('feeSettings.validation.number'), t('feeSettings.validation.pctRange')),
        deposit_fee_fixed: feeField(false, t('feeSettings.validation.number')),
        deposit_fee_pct: feeField(true, t('feeSettings.validation.number'), t('feeSettings.validation.pctRange')),
        withdrawal_fee_fixed: feeField(false, t('feeSettings.validation.number')),
        withdrawal_fee_pct: feeField(true, t('feeSettings.validation.number'), t('feeSettings.validation.pctRange')),
      }),
    [t],
  )

  const own = settings?.find((entry) => entry.provider === provider)
  const defaultValues = fieldsToForm(own)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FeeForm>({
    resolver: zodResolver(schema),
    defaultValues,
  })

  useEffect(() => {
    if (!open) return
    reset(fieldsToForm(own))
  }, [open, own, reset])

  const onSubmit = handleSubmit(async (data) => {
    const input: ProviderSettingsInput = {
      commission_fixed: parseField(data.commission_fixed),
      commission_pct: parseField(data.commission_pct),
      deposit_fee_fixed: parseField(data.deposit_fee_fixed),
      deposit_fee_pct: parseField(data.deposit_fee_pct),
      withdrawal_fee_fixed: parseField(data.withdrawal_fee_fixed),
      withdrawal_fee_pct: parseField(data.withdrawal_fee_pct),
    }
    try {
      await update.mutateAsync({ provider, input })
      toast.success(t('feeSettings.toasts.saved'))
      onOpenChange(false)
    } catch {
      toast.error(t('feeSettings.toasts.saveFailed'))
    }
  })

  const isPending = isSubmitting || update.isPending

  return (
    <Dialog
      open={open}
      title={t('feeSettings.title')}
      description={t('feeSettings.description', { provider })}
      icon={BankIcon}
      tone="primary"
      onOpenChange={onOpenChange}
      className="sm:max-w-md"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="submit" form="provider-fee-form" disabled={isPending}>
            {isPending ? t('feeSettings.saving') : t('feeSettings.save')}
          </Button>
        </>
      }
    >
      <form id="provider-fee-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {FEE_GROUPS.map((group) => (
          <div key={group.prefix} className="flex flex-col gap-2 rounded-xl border border-border/60 p-3">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t(`feeSettings.${group.labelKey}`)}
            </p>
            <div className="grid grid-cols-2 items-end gap-3">
              {(
                [
                  ['fixed', 'fixedLabel'],
                  ['pct', 'pctLabel'],
                ] as const
              ).map(([suffix, labelKey]) => {
                const field = `${group.prefix}_${suffix}` as keyof FeeForm
                return (
                  <div key={suffix} className="flex flex-col gap-1.5">
                    <Label htmlFor={`fee-${field}`}>{t(`feeSettings.${labelKey}`)}</Label>
                    <Input
                      id={`fee-${field}`}
                      type="text"
                      inputMode="decimal"
                      {...register(field)}
                    />
                    {errors[field] && (
                      <p className="text-destructive text-sm">{errors[field]?.message}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">{t('feeSettings.helper')}</p>
      </form>
    </Dialog>
  )
}

function feeField(isPct: boolean, numberMessage: string, rangeMessage?: string) {
  return z
    .string()
    .trim()
    .refine((value) => value === '' || Number.isFinite(Number(value)), { message: numberMessage })
    .refine(
      (value) => {
        if (value === '') return true
        const parsed = Number(value)
        return isPct ? parsed >= 0 && parsed <= 100 : parsed >= 0
      },
      { message: isPct ? (rangeMessage ?? numberMessage) : numberMessage },
    )
}
