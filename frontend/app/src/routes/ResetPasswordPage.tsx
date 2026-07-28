import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as authApi from '../auth/authApi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const schema = z.object({ password: z.string().min(8, 'Password must be at least 8 characters') })
type Form = z.infer<typeof schema>

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) })

  const onSubmit = handleSubmit(async (data) => {
    setServerError(null)
    try {
      await authApi.resetPassword(token, data.password)
      navigate('/login')
    } catch {
      setServerError('This reset link is invalid or has expired.')
    }
  })

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <form onSubmit={onSubmit} className="w-full max-w-sm flex flex-col gap-4" noValidate>
        <h2 className="text-2xl font-bold text-foreground">Choose a new password</h2>
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input id="password" type="password" {...register('password')} />
          {errors.password && <p className="text-destructive text-sm">{errors.password.message}</p>}
        </div>
        {serverError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-sm p-3">
            {serverError}
          </div>
        )}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          Reset password
        </Button>
      </form>
    </div>
  )
}
