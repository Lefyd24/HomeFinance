import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})

type LoginForm = z.infer<typeof loginSchema>

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  const onSubmit = handleSubmit(async (data) => {
    setServerError(null)
    try {
      await login(data.email, data.password)
      navigate('/dashboard')
    } catch {
      setServerError('Invalid email or password.')
    }
  })

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm">
        <h2 className="text-2xl font-bold text-foreground mb-6">Welcome back</h2>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <div className="relative">
              <Mail size={16} className="absolute start-2.5 top-1/2 -translate-y-1/2 opacity-40" />
              <Input
                id="email"
                type="email"
                className="ps-8"
                placeholder="name@example.com"
                {...register('email')}
              />
            </div>
            {errors.email && <p className="text-destructive text-sm">{errors.email.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock size={16} className="absolute start-2.5 top-1/2 -translate-y-1/2 opacity-40" />
              <Input
                id="password"
                type="password"
                className="ps-8"
                placeholder="Enter your password"
                {...register('password')}
              />
            </div>
            {errors.password && <p className="text-destructive text-sm">{errors.password.message}</p>}
          </div>

          {serverError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-sm p-3">
              {serverError}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="text-sm text-center mt-6 text-muted-foreground">
          Don't have an account?{' '}
          <Link to="/register" className="text-primary font-semibold">
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}
