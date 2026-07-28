import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock, KeyRound, Eye, EyeOff, TriangleAlert } from 'lucide-react'
import * as authApi from '../auth/authApi'
import { AuthLayout, BrandPanelHeader, BrandPanelStep, BrandPanelTrust } from '../auth/AuthLayout'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'

const registerSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  invite_code: z.string().min(1, 'Invite code is required'),
})

type RegisterForm = z.infer<typeof registerSchema>

const STRENGTH_LABELS = ['Weak', 'Fair', 'Good', 'Strong']
const STRENGTH_COLORS = [
  'bg-destructive',
  'bg-warning',
  'bg-flow-in',
  'bg-flow-in',
]

function passwordScore(value: string) {
  let score = 0
  if (value.length >= 8) score++
  if (/[A-Z]/.test(value)) score++
  if (/[0-9]/.test(value)) score++
  if (/[^A-Za-z0-9]/.test(value)) score++
  return score
}

export function RegisterPage() {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [passwordValue, setPasswordValue] = useState('')
  const {
    register: registerField,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) })

  const score = useMemo(() => passwordScore(passwordValue), [passwordValue])

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

  const { onChange: onPasswordRhfChange, ...passwordFieldProps } = registerField('password')

  return (
    <AuthLayout
      brand={
        <>
          <BrandPanelHeader />

          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/70">
              Get started in minutes
            </p>
            <h1 className="mb-6 text-[clamp(1.875rem,3.25vw,2.5rem)] font-bold leading-tight text-white">
              Take control of
              <br />
              your finances.
            </h1>
            <p className="mb-10 max-w-[34ch] text-base leading-relaxed text-white/80">
              Join and start tracking every euro in and out — from groceries to goals.
            </p>

            <div className="flex flex-col gap-4">
              <BrandPanelStep
                index={1}
                title="Create your account"
                description="Takes under 30 seconds, no credit card needed"
              />
              <BrandPanelStep
                index={2}
                title="Add your accounts"
                description="Bank accounts, cash, savings — all in one view"
              />
              <BrandPanelStep
                index={3}
                title="Start tracking"
                description="Import past transactions or add them manually"
              />
            </div>
          </div>

          <BrandPanelTrust>
            All data is stored on your own server. No third-party analytics, no data selling.
          </BrandPanelTrust>
        </>
      }
    >
      <div className="mb-7">
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Create account
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">Fill in your details to get started</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email address</Label>
          <InputGroup className="h-11 bg-muted dark:bg-muted/70">
            <InputGroupAddon>
              <Mail size={16} />
            </InputGroupAddon>
            <InputGroupInput
              id="email"
              type="email"
              autoComplete="email"
              placeholder="name@example.com"
              aria-invalid={!!errors.email}
              {...registerField('email')}
            />
          </InputGroup>
          {errors.email && (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <TriangleAlert size={13} className="shrink-0" />
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="password">Password</Label>
            <span className="text-xs text-muted-foreground">min. 8 characters</span>
          </div>
          <InputGroup className="h-11 bg-muted dark:bg-muted/70">
            <InputGroupAddon>
              <Lock size={16} />
            </InputGroupAddon>
            <InputGroupInput
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Create a strong password"
              aria-invalid={!!errors.password}
              {...passwordFieldProps}
              onChange={(e) => {
                setPasswordValue(e.target.value)
                onPasswordRhfChange(e)
              }}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="button"
                size="icon-xs"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {passwordValue && (
            <div className="flex items-center gap-2 pt-0.5">
              <div className="flex flex-1 gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-border">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-300',
                        i < score ? STRENGTH_COLORS[score - 1] : 'w-0',
                      )}
                      style={{ width: i < score ? '100%' : '0%' }}
                    />
                  </div>
                ))}
              </div>
              {score > 0 && (
                <span className="text-[0.65rem] font-medium text-muted-foreground">
                  {STRENGTH_LABELS[score - 1]}
                </span>
              )}
            </div>
          )}
          {errors.password && (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <TriangleAlert size={13} className="shrink-0" />
              {errors.password.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="invite_code">Invite code</Label>
          <InputGroup className="h-11 bg-muted dark:bg-muted/70">
            <InputGroupAddon>
              <KeyRound size={16} />
            </InputGroupAddon>
            <InputGroupInput
              id="invite_code"
              type="text"
              autoComplete="off"
              placeholder="Paste your invite code"
              aria-invalid={!!errors.invite_code}
              {...registerField('invite_code')}
            />
          </InputGroup>
          <p className="text-xs text-muted-foreground">
            Registration is invite-only — ask the site owner for a code.
          </p>
          {errors.invite_code && (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <TriangleAlert size={13} className="shrink-0" />
              {errors.invite_code.message}
            </p>
          )}
        </div>

        {serverError && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <TriangleAlert size={15} className="shrink-0" />
            {serverError}
          </div>
        )}

        <Button type="submit" className="mt-1 h-11 w-full font-semibold" disabled={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Create account'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}
