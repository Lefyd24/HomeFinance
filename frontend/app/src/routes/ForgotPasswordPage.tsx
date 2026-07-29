import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import * as authApi from '../auth/authApi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const schema = z.object({ email: z.string().email('Enter a valid email') })
type Form = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const { t } = useTranslation('auth')
  const [sent, setSent] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) })

  const onSubmit = handleSubmit(async (data) => {
    await authApi.forgotPassword(data.email)
    setSent(true)
  })

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <p className="text-foreground">{t('forgotPassword.sentMessage')}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <form onSubmit={onSubmit} className="w-full max-w-sm flex flex-col gap-4" noValidate>
        <h2 className="text-2xl font-bold text-foreground">{t('forgotPassword.heading')}</h2>
        <div className="space-y-2">
          <Label htmlFor="email">{t('forgotPassword.emailLabel')}</Label>
          <Input id="email" type="email" {...register('email')} />
          {errors.email && <p className="text-destructive text-sm">{errors.email.message}</p>}
        </div>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {t('forgotPassword.submit')}
        </Button>
      </form>
    </div>
  )
}
