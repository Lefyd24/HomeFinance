import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import * as authApi from '../auth/authApi'

const schema = z.object({ email: z.string().email('Enter a valid email') })
type Form = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) })

  const onSubmit = handleSubmit(async (data) => {
    await authApi.forgotPassword(data.email)
    setSent(true)
  })

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-base-100">
        <p className="text-base-content">If that email is registered, a reset link has been sent.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-base-100">
      <form onSubmit={onSubmit} className="w-full max-w-sm flex flex-col gap-4" noValidate>
        <h2 className="text-2xl font-bold text-base-content">Reset your password</h2>
        <div>
          <label htmlFor="email" className="label"><span className="label-text">Email address</span></label>
          <input id="email" type="email" className="input input-bordered w-full" {...register('email')} />
          {errors.email && <p className="text-error text-sm mt-1">{errors.email.message}</p>}
        </div>
        <button type="submit" className="btn btn-primary w-full" disabled={isSubmitting}>Send reset link</button>
      </form>
    </div>
  )
}
