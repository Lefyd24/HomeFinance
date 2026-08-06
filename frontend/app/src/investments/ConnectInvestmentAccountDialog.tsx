import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { ChartIncreaseIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'
import { useConnectInvestmentAccount } from './useInvestments'

const connectSchema = z.object({
  name: z.string().min(1, 'Account name is required').max(100),
  provider: z.enum(['freedom24', 'binance']),
  currency: z.enum(['USD', 'EUR', 'GBP']),
  public_key: z.string().min(1, 'Public key is required'),
  private_key: z.string().min(1, 'Private key is required'),
})

type ConnectForm = z.infer<typeof connectSchema>

interface ConnectInvestmentAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ConnectInvestmentAccountDialog({
  open,
  onOpenChange,
}: ConnectInvestmentAccountDialogProps) {
  const { t } = useTranslation('investments')
  const connectAccount = useConnectInvestmentAccount()

  const PROVIDER_OPTIONS = [
    { value: 'freedom24', label: t('connect.providerFreedom24') },
    { value: 'binance', label: t('connect.providerBinance') },
  ]
  const CURRENCY_OPTIONS = [
    { value: 'USD', label: t('connect.currencyOptions.usd') },
    { value: 'EUR', label: t('connect.currencyOptions.eur') },
    { value: 'GBP', label: t('connect.currencyOptions.gbp') },
  ]

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ConnectForm>({
    resolver: zodResolver(connectSchema),
    defaultValues: {
      name: '',
      provider: 'freedom24',
      currency: 'USD',
      public_key: '',
      private_key: '',
    },
  })

  useEffect(() => {
    if (!open) return
    reset({ name: '', provider: 'freedom24', currency: 'USD', public_key: '', private_key: '' })
  }, [open, reset])

  const onSubmit = handleSubmit(async (data) => {
    try {
      await connectAccount.mutateAsync({
        name: data.name.trim(),
        provider: data.provider,
        currency: data.currency,
        public_key: data.public_key.trim(),
        private_key: data.private_key.trim(),
        icon: data.provider === 'freedom24' || data.provider === 'binance'
          ? `${data.provider}.svg`
          : undefined,
      })
      toast.success(t('connect.toasts.connected'))
      onOpenChange(false)
    } catch {
      toast.error(t('connect.toasts.connectFailed'))
    }
  })

  const isPending = isSubmitting || connectAccount.isPending
  const selectedProvider = watch('provider')
  const isBinance = selectedProvider === 'binance'

  return (
    <Dialog
      open={open}
      title={t('connect.title')}
      description={t('connect.description')}
      icon={ChartIncreaseIcon}
      tone="primary"
      onOpenChange={onOpenChange}
      className="sm:max-w-xl"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {t('common:actions.cancel')}
          </Button>
          <Button type="submit" form="connect-investment-form" disabled={isPending}>
            {isPending ? t('connect.connecting') : t('connect.connect')}
          </Button>
        </>
      }
    >
      <form id="connect-investment-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">{t('connect.nameLabel')}</Label>
          <Input id="name" placeholder={t('connect.namePlaceholder')} {...register('name')} />
          {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label>{t('connect.providerLabel')}</Label>
            <Controller
              control={control}
              name="provider"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  options={PROVIDER_OPTIONS}
                  placeholder={t('connect.providerLabel')}
                />
              )}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t('connect.currencyLabel')}</Label>
            <Controller
              control={control}
              name="currency"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  options={CURRENCY_OPTIONS}
                  placeholder={t('connect.currencyLabel')}
                />
              )}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="public_key">
            {isBinance ? t('connect.apiKeyLabel') : t('connect.publicKeyLabel')}
          </Label>
          <Input
            id="public_key"
            autoComplete="off"
            placeholder={
              isBinance ? t('connect.apiKeyPlaceholder') : t('connect.publicKeyPlaceholder')
            }
            {...register('public_key')}
          />
          {errors.public_key && (
            <p className="text-destructive text-sm">{errors.public_key.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="private_key">
            {isBinance ? t('connect.secretKeyLabel') : t('connect.privateKeyLabel')}
          </Label>
          <Input
            id="private_key"
            type="password"
            autoComplete="off"
            placeholder={
              isBinance ? t('connect.secretKeyPlaceholder') : t('connect.privateKeyPlaceholder')
            }
            {...register('private_key')}
          />
          {errors.private_key && (
            <p className="text-destructive text-sm">{errors.private_key.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {isBinance ? t('connect.keysHintBinance') : t('connect.keysHint')}
          </p>
        </div>
      </form>
    </Dialog>
  )
}
