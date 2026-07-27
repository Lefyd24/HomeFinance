import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import * as authApi from '../auth/authApi'

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>(token ? 'pending' : 'error')

  useEffect(() => {
    if (!token) return
    authApi
      .verifyEmail(token)
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'))
  }, [token])

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-base-100 text-center">
      <div className="max-w-sm">
        {status === 'pending' && <p>Verifying your email…</p>}
        {status === 'success' && (
          <>
            <p className="mb-4">Your email has been verified.</p>
            <Link to="/login" className="btn btn-primary">Sign in</Link>
          </>
        )}
        {status === 'error' && <p>This verification link is invalid or has expired.</p>}
      </div>
    </div>
  )
}
