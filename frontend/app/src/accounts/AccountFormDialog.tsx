import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'
import { useCreateAccount, useUpdateAccount } from './useAccounts'
import { AccountIcon, BANK_ICONS } from './bankIcons'
import { cn } from '@/lib/utils'
import { formatCurrency } from '../lib/format'
import type { Account } from './accountsApi'

const accountSchema = z.object({
  name: z.string().min(1, 'Account name is required').max(100),
  type: z.enum(['checking', 'savings', 'credit', 'cash', 'investment']),
  currency: z.enum(['EUR', 'USD', 'GBP']),
  balance: z.coerce.number(),
  description: z.string().max(500).optional(),
  icon: z.string().optional(),
})

type AccountForm = z.infer<typeof accountSchema>

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit', label: 'Credit Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'investment', label: 'Investment' },
]

const CURRENCY_OPTIONS = [
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'GBP', label: 'GBP — British Pound' },
]

interface AccountFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  account?: Account | null
}

export function AccountFormDialog({ open, onOpenChange, account }: AccountFormDialogProps) {
  const isEdit = !!account
  const createAccount = useCreateAccount()
  const updateAccount = useUpdateAccount()

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
    const input = {
      name: data.name.trim(),
      type: data.type,
      currency: data.currency,
      balance: data.balance,
      description: data.description?.trim() || undefined,
      icon: data.icon || undefined,
    }

    try {
      if (isEdit && account) {
        await updateAccount.mutateAsync({ id: account.id, input })
        toast.success('Account updated')
      } else {
        await createAccount.mutateAsync(input)
        toast.success('Account created')
      }
      onOpenChange(false)
    } catch {
      toast.error(isEdit ? 'Failed to update account' : 'Failed to create account')
    }
  })

  const isPending = isSubmitting || createAccount.isPending || updateAccount.isPending

  return (
    <Dialog
      open={open}
      title={isEdit ? 'Edit account' : 'Add account'}
      onOpenChange={onOpenChange}
      className="sm:max-w-xl"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="rounded-xl border border-border bg-primary text-primary-foreground p-4">
          <div className="flex items-center gap-3">
            <AccountIcon
              icon={preview.icon || null}
              type={preview.type}
              className="size-14 bg-white/15 text-primary-foreground ring-white/20"
              imageClassName="size-10"
            />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-base truncate">
                {preview.name.trim() || 'New Account'}
              </p>
              <p className="text-xs opacity-80 capitalize">
                {preview.type} · {preview.currency}
              </p>
            </div>
            <p className="text-xl font-bold font-heading tabular-nums shrink-0">
              {formatCurrency(Number(preview.balance) || 0, preview.currency)}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Account name</Label>
          <Input id="name" placeholder="e.g., Eurobank Checking" {...register('name')} />
          {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label>Account type</Label>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  options={ACCOUNT_TYPE_OPTIONS}
                  placeholder="Choose a type"
                />
              )}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Currency</Label>
            <Controller
              control={control}
              name="currency"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  options={CURRENCY_OPTIONS}
                  placeholder="Currency"
                />
              )}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="balance">Current balance</Label>
          <Input id="balance" type="number" step="0.01" {...register('balance')} />
          <p className="text-xs text-muted-foreground">
            Use a negative value for credit cards with outstanding balance.
          </p>
          {errors.balance && <p className="text-destructive text-sm">{errors.balance.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label>Account icon</Label>
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
                    <span className="text-[10px] font-medium">Default</span>
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
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            placeholder="Optional notes about this account"
            rows={3}
            {...register('description')}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create account'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}