import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Key01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog } from '../ui/Dialog'
import { useUpdateInvestmentCredentials } from './useInvestments'
import type { InvestmentAccount } from './investmentsApi'

const rotateSchema = z.object({
  public_key: z.string().min(1, 'Public key is required'),
  private_key: z.string().min(1, 'Private key is required'),
})

type RotateForm = z.infer<typeof rotateSchema>

interface RotateApiKeysDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: InvestmentAccount
}

export function RotateApiKeysDialog({ open, onOpenChange, account }: RotateApiKeysDialogProps) {
  const { t } = useTranslation('investments')
  const rotateCredentials = useUpdateInvestmentCredentials()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RotateForm>({
    resolver: zodResolver(rotateSchema),
    defaultValues: { public_key: '', private_key: '' },
  })

  useEffect(() => {
    if (!open) return
    reset({ public_key: '', private_key: '' })
  }, [open, reset])

  const onSubmit = handleSubmit(async (data) => {
    try {
      await rotateCredentials.mutateAsync({
        id: account.id,
        input: { public_key: data.public_key.trim(), private_key: data.private_key.trim() },
      })
      toast.success(t('edit.rotateDialog.toasts.rotated'))
      onOpenChange(false)
    } catch {
      toast.error(t('edit.rotateDialog.toasts.rotateFailed'))
    }
  })

  const isPending = isSubmitting || rotateCredentials.isPending

  return (
    <Dialog
      open={open}
      title={t('edit.rotateDialog.title')}
      description={t('edit.rotateDialog.description')}
      icon={Key01Icon}
      tone="warning"
      onOpenChange={onOpenChange}
      className="sm:max-w-lg"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="submit" form="rotate-keys-form" disabled={isPending}>
            {isPending ? t('edit.rotateDialog.rotating') : t('edit.rotateDialog.rotate')}
          </Button>
        </>
      }
    >
      <form id="rotate-keys-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="rotate-public-key">{t('connect.publicKeyLabel')}</Label>
          <Input id="rotate-public-key" autoComplete="off" {...register('public_key')} />
          {errors.public_key && <p className="text-destructive text-sm">{errors.public_key.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="rotate-private-key">{t('connect.privateKeyLabel')}</Label>
          <Input id="rotate-private-key" type="password" autoComplete="off" {...register('private_key')} />
          {errors.private_key && <p className="text-destructive text-sm">{errors.private_key.message}</p>}
        </div>
      </form>
    </Dialog>
  )
}
