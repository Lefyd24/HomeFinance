import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import * as authApi from '../auth/authApi'

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
      setServerError('Could not create your account. The email may already be registered, or the invite code is invalid.')
    }
  })

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-base-100">
      <div className="w-full max-w-sm">
        <h2 className="text-2xl font-bold text-base-content mb-6">Create your account</h2>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div>
            <label htmlFor="email" className="label"><span className="label-text">Email address</span></label>
            <input id="email" type="email" className="input input-bordered w-full" {...registerField('email')} />
            {errors.email && <p className="text-error text-sm mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <label htmlFor="password" className="label"><span className="label-text">Password</span></label>
            <input id="password" type="password" className="input input-bordered w-full" {...registerField('password')} />
            {errors.password && <p className="text-error text-sm mt-1">{errors.password.message}</p>}
          </div>
          <div>
            <label htmlFor="invite_code" className="label"><span className="label-text">Invite code</span></label>
            <input id="invite_code" type="text" className="input input-bordered w-full" {...registerField('invite_code')} />
            {errors.invite_code && <p className="text-error text-sm mt-1">{errors.invite_code.message}</p>}
          </div>
          {serverError && <div className="alert alert-error text-sm"><span>{serverError}</span></div>}
          <button type="submit" className="btn btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting ? <span className="loading loading-spinner loading-sm" /> : 'Create account'}
          </button>
        </form>
        <p className="text-sm text-center mt-6 opacity-60">
          Already have an account? <Link to="/login" className="text-primary font-semibold">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
