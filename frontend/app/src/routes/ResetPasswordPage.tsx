import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as authApi from '../auth/authApi'

const schema = z.object({ password: z.string().min(8, 'Password must be at least 8 characters') })
type Form = z.infer<typeof schema>

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) })

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
    <div className="min-h-screen flex items-center justify-center p-6 bg-base-100">
      <form onSubmit={onSubmit} className="w-full max-w-sm flex flex-col gap-4" noValidate>
        <h2 className="text-2xl font-bold text-base-content">Choose a new password</h2>
        <div>
          <label htmlFor="password" className="label"><span className="label-text">New password</span></label>
          <input id="password" type="password" className="input input-bordered w-full" {...register('password')} />
          {errors.password && <p className="text-error text-sm mt-1">{errors.password.message}</p>}
        </div>
        {serverError && <div className="alert alert-error text-sm"><span>{serverError}</span></div>}
        <button type="submit" className="btn btn-primary w-full" disabled={isSubmitting}>Reset password</button>
      </form>
    </div>
  )
}
