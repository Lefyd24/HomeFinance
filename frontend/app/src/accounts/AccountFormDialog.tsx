import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Wallet01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'
import { useCreateAccount, useUpdateAccount } from './useAccounts'
import { AccountIcon, BANK_ICONS, getAccountTypeMeta } from './bankIcons'
import { cn } from '@/lib/utils'
import { formatCurrency } from '../lib/format'
import type { Account } from './accountsApi'

const accountSchema = z.object({
  name: z.string().min(1, 'Account name is required').max(100),
  type: z.enum(['checking', 'savings', 'credit', 'cash', 'investment']),
  currency: z.enum(['EUR', 'USD', 'GBP']),
  balance: z.coerce.number<number>(),
  description: z.string().max(500).optional(),
  icon: z.string().optional(),
})

type AccountForm = z.infer<typeof accountSchema>

interface AccountFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  account?: Account | null
}

export function AccountFormDialog({ open, onOpenChange, account }: AccountFormDialogProps) {
  const { t } = useTranslation('accounts')
  const isEdit = !!account
  const isProviderSynced = !!account?.provider
  const createAccount = useCreateAccount()
  const updateAccount = useUpdateAccount()

  const ACCOUNT_TYPE_OPTIONS = [
    { value: 'checking', label: t('form.typeOptions.checking') },
    { value: 'savings', label: t('form.typeOptions.savings') },
    { value: 'credit', label: t('form.typeOptions.credit') },
    { value: 'cash', label: t('form.typeOptions.cash') },
    { value: 'investment', label: t('form.typeOptions.investment') },
  ]

  const CURRENCY_OPTIONS = [
    { value: 'EUR', label: t('form.currencyOptions.eur') },
    { value: 'USD', label: t('form.currencyOptions.usd') },
    { value: 'GBP', label: t('form.currencyOptions.gbp') },
  ]

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AccountForm>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: '',
      type: 'checking',
      currency: 'EUR',
      balance: 0,
      description: '',
      icon: '',
    },
  })

  useEffect(() => {
    if (!open) return
    if (account) {
      reset({
        name: account.name,
        type: account.type,
        currency: (['EUR', 'USD', 'GBP'].includes(account.currency)
          ? account.currency
          : 'EUR') as AccountForm['currency'],
        balance: account.balance,
        description: account.description ?? '',
        icon: account.icon ?? '',
      })
    } else {
      reset({
        name: '',
        type: 'checking',
        currency: 'EUR',
        balance: 0,
        description: '',
        icon: '',
      })
    }
  }, [open, account, reset])

  const preview = watch()

  const onSubmit = handleSubmit(async (data) => {
    const common = {
      name: data.name.trim(),
      description: data.description?.trim() || undefined,
      icon: data.icon || undefined,
    }

    try {
      if (isEdit && account) {
        // Balance/type/currency are set by the brokerage sync for provider-linked
        // accounts (see backend/app/routers/accounts.py) — sending them (even
        // unchanged) is rejected, so they're only included for manual accounts.
        const input = isProviderSynced
          ? common
          : { ...common, type: data.type, currency: data.currency, balance: data.balance }
        await updateAccount.mutateAsync({ id: account.id, input })
        toast.success(t('toasts.updated'))
      } else {
        await createAccount.mutateAsync({
          ...common,
          type: data.type,
          currency: data.currency,
          balance: data.balance,
        })
        toast.success(t('toasts.created'))
      }
      onOpenChange(false)
    } catch {
      toast.error(isEdit ? t('toasts.updateFailed') : t('toasts.createFailed'))
    }
  })

  const isPending = isSubmitting || createAccount.isPending || updateAccount.isPending
  const typeMeta = getAccountTypeMeta(preview.type, t)

  return (
    <Dialog
      open={open}
      title={isEdit ? t('form.titleEdit') : t('form.titleAdd')}
      description={t('form.description')}
      icon={Wallet01Icon}
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
          <Button type="submit" form="account-form" disabled={isPending}>
            {isPending ? t('form.saving') : isEdit ? t('form.saveChanges') : t('form.createAccount')}
          </Button>
        </>
      }
    >
      <form id="account-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {/* Live preview, carrying the same type rule the real card uses. */}
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className={cn('h-1 w-full', typeMeta.fill)} aria-hidden />
          <div className="flex items-center gap-3 p-4">
            <AccountIcon
              icon={preview.icon || null}
              type={preview.type}
              className="size-12"
              imageClassName="size-9"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold">
                {preview.name.trim() || t('form.newAccountPreview')}
              </p>
              <p className="text-xs text-muted-foreground">
                {typeMeta.label} · {preview.currency}
              </p>
            </div>
            <p className="shrink-0 font-heading text-xl font-bold tabular-nums">
              {formatCurrency(Number(preview.balance) || 0, preview.currency)}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="name">{t('form.nameLabel')}</Label>
          <Input id="name" placeholder={t('form.namePlaceholder')} {...register('name')} />
          {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
        </div>

        {isProviderSynced && (
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {t('form.providerSyncedNote', { provider: account?.provider })}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label>{t('form.typeLabel')}</Label>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  options={ACCOUNT_TYPE_OPTIONS}
                  placeholder={t('form.typePlaceholder')}
                  disabled={isProviderSynced}
                />
              )}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t('form.currencyLabel')}</Label>
            <Controller
              control={control}
              name="currency"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  options={CURRENCY_OPTIONS}
                  placeholder={t('form.currencyPlaceholder')}
                  disabled={isProviderSynced}
                />
              )}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="balance">{t('form.balanceLabel')}</Label>
          <Input id="balance" type="number" step="0.01" disabled={isProviderSynced} {...register('balance')} />
          <p className="text-xs text-muted-foreground">{t('form.balanceHint')}</p>
          {errors.balance && <p className="text-destructive text-sm">{errors.balance.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label>{t('form.iconLabel')}</Label>
          <Controller
            control={control}
            name="icon"
            render={({ field }) => (
              <ScrollArea className="h-44 rounded-xl border border-border bg-muted/30">
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 p-3">
                  <button
                    type="button"
                    onClick={() => field.onChange('')}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-colors',
                      !field.value
                        ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                        : 'border-transparent hover:bg-muted',
                    )}
                  >
                    <AccountIcon icon={null} type={preview.type} className="size-11" />
                    <span className="text-[10px] font-medium">{t('form.iconDefault')}</span>
                  </button>
                  {BANK_ICONS.map((bank) => {
                    const selected = field.value === bank.value
                    return (
                      <button
                        key={bank.value}
                        type="button"
                        onClick={() => field.onChange(bank.value)}
                        className={cn(
                          'flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-colors',
                          selected
                            ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                            : 'border-transparent hover:bg-muted',
                        )}
                      >
                        <AccountIcon
                          icon={bank.value}
                          type={preview.type}
                          className="size-11"
                          imageClassName="size-8"
                        />
                        <span className="text-[10px] font-medium">{bank.label}</span>
                      </button>
                    )
                  })}
                </div>
              </ScrollArea>
            )}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="description">{t('form.descriptionLabel')}</Label>
          <Textarea
            id="description"
            placeholder={t('form.descriptionPlaceholder')}
            rows={3}
            {...register('description')}
          />
        </div>

      </form>
    </Dialog>
  )
}