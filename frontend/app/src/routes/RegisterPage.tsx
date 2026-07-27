import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import * as authApi from '../auth/authApi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const registerSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  invite_code: z.string().min(1, 'Invite code is required'),
})

type RegisterForm = z.infer<typeof registerSchema>

export function RegisterPage() {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register: registerField,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) })

  const onSubmit = handleSubmit(async (data) => {
    setServerError(null)
    try {
      await authApi.register(data)
      navigate('/login')
    } catch {
      setServerError(
        'Could not create your account. The email may already be registered, or the invite code is invalid.',
      )
    }
  })

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm">
        <h2 className="text-2xl font-bold text-foreground mb-6">Create your account</h2>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input id="email" type="email" {...registerField('email')} />
            {errors.email && <p className="text-destructive text-sm">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" {...registerField('password')} />
            {errors.password && <p className="text-destructive text-sm">{errors.password.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite_code">Invite code</Label>
            <Input id="invite_code" type="text" {...registerField('invite_code')} />
            {errors.invite_code && (
              <p className="text-destructive text-sm">{errors.invite_code.message}</p>
            )}
          </div>
          {serverError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-sm p-3">
              {serverError}
            </div>
          )}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Create account'}
          </Button>
        </form>
        <p className="text-sm text-center mt-6 text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="text-primary font-semibold">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
