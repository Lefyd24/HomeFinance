import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { PencilEdit02Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog } from '../ui/Dialog'
import { useUpdateInvestmentAccount } from './useInvestments'
import type { InvestmentAccount } from './investmentsApi'

const editSchema = z.object({
  name: z.string().min(1, 'Account name is required').max(100),
  description: z.string().max(500).optional(),
})

type EditForm = z.infer<typeof editSchema>

interface EditInvestmentAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: InvestmentAccount
}

export function EditInvestmentAccountDialog({
  open,
  onOpenChange,
  account,
}: EditInvestmentAccountDialogProps) {
  const { t } = useTranslation('investments')
  const updateAccount = useUpdateInvestmentAccount()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: { name: account.name, description: '' },
  })

  useEffect(() => {
    if (!open) return
    reset({ name: account.name, description: '' })
  }, [open, account, reset])

  const onSubmit = handleSubmit(async (data) => {
    try {
      await updateAccount.mutateAsync({
        id: account.id,
        input: { name: data.name.trim(), description: data.description?.trim() || undefined },
      })
      toast.success(t('edit.toasts.updated'))
      onOpenChange(false)
    } catch {
      toast.error(t('edit.toasts.updateFailed'))
    }
  })

  const isPending = isSubmitting || updateAccount.isPending

  return (
    <Dialog
      open={open}
      title={t('edit.title')}
      description={t('edit.description', { provider: account.provider })}
      icon={PencilEdit02Icon}
      tone="primary"
      onOpenChange={onOpenChange}
      className="sm:max-w-lg"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="submit" form="edit-investment-form" disabled={isPending}>
            {isPending ? t('edit.saving') : t('edit.saveChanges')}
          </Button>
        </>
      }
    >
      <form id="edit-investment-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-name">{t('edit.nameLabel')}</Label>
          <Input id="edit-name" {...register('name')} />
          {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-description">{t('edit.descriptionLabel')}</Label>
          <Textarea
            id="edit-description"
            rows={3}
            placeholder={t('edit.descriptionPlaceholder')}
            {...register('description')}
          />
        </div>
      </form>
    </Dialog>
  )
}
