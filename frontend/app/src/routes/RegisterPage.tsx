import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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

const STRENGTH_KEYS = ['weak', 'fair', 'good', 'strong'] as const
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
  const { t } = useTranslation('auth')
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
      setServerError(t('register.serverError'))
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
              {t('register.brandPanel.eyebrow')}
            </p>
            <h1 className="mb-6 text-[clamp(1.875rem,3.25vw,2.5rem)] font-bold leading-tight text-white">
              {t('register.brandPanel.headingLine1')}
              <br />
              {t('register.brandPanel.headingLine2')}
            </h1>
            <p className="mb-10 max-w-[34ch] text-base leading-relaxed text-white/80">
              {t('register.brandPanel.subtitle')}
            </p>

            <div className="flex flex-col gap-4">
              <BrandPanelStep
                index={1}
                title={t('register.brandPanel.steps.createAccount.title')}
                description={t('register.brandPanel.steps.createAccount.description')}
              />
              <BrandPanelStep
                index={2}
                title={t('register.brandPanel.steps.addAccounts.title')}
                description={t('register.brandPanel.steps.addAccounts.description')}
              />
              <BrandPanelStep
                index={3}
                title={t('register.brandPanel.steps.startTracking.title')}
                description={t('register.brandPanel.steps.startTracking.description')}
              />
            </div>
          </div>

          <BrandPanelTrust>{t('shared.trustMessage')}</BrandPanelTrust>
        </>
      }
    >
      <div className="mb-7">
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {t('register.heading')}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('register.subtitle')}</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">{t('register.emailLabel')}</Label>
          <InputGroup className="h-11 bg-muted dark:bg-muted/70">
            <InputGroupAddon>
              <Mail size={16} />
            </InputGroupAddon>
            <InputGroupInput
              id="email"
              type="email"
              autoComplete="email"
              placeholder={t('register.emailPlaceholder')}
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
            <Label htmlFor="password">{t('register.passwordLabel')}</Label>
            <span className="text-xs text-muted-foreground">{t('register.passwordHint')}</span>
          </div>
          <InputGroup className="h-11 bg-muted dark:bg-muted/70">
            <InputGroupAddon>
              <Lock size={16} />
            </InputGroupAddon>
            <InputGroupInput
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder={t('register.passwordPlaceholder')}
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
                aria-label={t(showPassword ? 'shared.hidePassword' : 'shared.showPassword')}
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
                  {t(`register.passwordStrength.${STRENGTH_KEYS[score - 1]}`)}
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
          <Label htmlFor="invite_code">{t('register.inviteCodeLabel')}</Label>
          <InputGroup className="h-11 bg-muted dark:bg-muted/70">
            <InputGroupAddon>
              <KeyRound size={16} />
            </InputGroupAddon>
            <InputGroupInput
              id="invite_code"
              type="text"
              autoComplete="off"
              placeholder={t('register.inviteCodePlaceholder')}
              aria-invalid={!!errors.invite_code}
              {...registerField('invite_code')}
            />
          </InputGroup>
          <p className="text-xs text-muted-foreground">{t('register.inviteCodeHint')}</p>
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
          {isSubmitting ? t('register.submitting') : t('register.submit')}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t('register.haveAccount')}{' '}
        <Link to="/login" className="font-semibold text-primary hover:underline">
          {t('register.signIn')}
        </Link>
      </p>
    </AuthLayout>
  )
}
