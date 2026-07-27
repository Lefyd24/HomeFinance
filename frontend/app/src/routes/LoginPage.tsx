import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

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
    <div className="min-h-screen flex items-center justify-center p-6 bg-base-100">
      <div className="w-full max-w-sm">
        <h2 className="text-2xl font-bold text-base-content mb-6">Welcome back</h2>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div>
            <label htmlFor="email" className="label">
              <span className="label-text">Email address</span>
            </label>
            <label className="input input-bordered flex items-center gap-2">
              <Mail size={16} className="opacity-40" />
              <input
                id="email"
                type="email"
                className="grow"
                placeholder="name@example.com"
                {...register('email')}
              />
            </label>
            {errors.email && <p className="text-error text-sm mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label htmlFor="password" className="label">
              <span className="label-text">Password</span>
            </label>
            <label className="input input-bordered flex items-center gap-2">
              <Lock size={16} className="opacity-40" />
              <input
                id="password"
                type="password"
                className="grow"
                placeholder="Enter your password"
                {...register('password')}
              />
            </label>
            {errors.password && <p className="text-error text-sm mt-1">{errors.password.message}</p>}
          </div>

          {serverError && (
            <div className="alert alert-error text-sm">
              <span>{serverError}</span>
            </div>
          )}

          <button type="submit" className="btn btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting ? <span className="loading loading-spinner loading-sm" /> : 'Sign in'}
          </button>
        </form>

        <p className="text-sm text-center mt-6 opacity-60">
          Don't have an account? <Link to="/register" className="text-primary font-semibold">Create one</Link>
        </p>
      </div>
    </div>
  )
}
