import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'
import { useCreateAccount } from './useAccounts'
import type { Account } from './accountsApi'

const accountSchema = z.object({
  name: z.string().min(1, 'Account name is required').max(100),
  type: z.enum(['checking', 'savings', 'credit', 'cash', 'investment']),
  currency: z.string().length(3, 'Use a 3-letter currency code'),
  balance: z.coerce.number(),
})

type AccountForm = z.infer<typeof accountSchema>

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit', label: 'Credit' },
  { value: 'cash', label: 'Cash' },
  { value: 'investment', label: 'Investment' },
]

interface AccountFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: Account
}

export function AccountFormDialog({ open, onOpenChange, initial }: AccountFormDialogProps) {
  const createAccount = useCreateAccount()
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AccountForm>({
    resolver: zodResolver(accountSchema),
    defaultValues: initial
      ? { name: initial.name, type: initial.type, currency: initial.currency, balance: initial.balance }
      : { name: '', type: 'checking', currency: 'EUR', balance: 0 },
  })

  const onSubmit = handleSubmit(async (data) => {
    await createAccount.mutateAsync(data)
    onOpenChange(false)
  })

  return (
    <Dialog open={open} title={initial ? 'Edit account' : 'Add account'} onOpenChange={onOpenChange}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="name">Account name</Label>
          <Input id="name" {...register('name')} />
          {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
        </div>

        <div className="space-y-2">
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

        <div className="space-y-2">
          <Label htmlFor="balance">Starting balance</Label>
          <Input id="balance" type="number" step="0.01" {...register('balance')} />
          {errors.balance && <p className="text-destructive text-sm">{errors.balance.message}</p>}
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          Save
        </Button>
      </form>
    </Dialog>
  )
}
