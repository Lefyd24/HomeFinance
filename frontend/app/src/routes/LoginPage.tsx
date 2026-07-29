import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Mail, Lock, Eye, EyeOff, TriangleAlert } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { AuthLayout, BrandPanelHeader, BrandPanelStep, BrandPanelTrust } from '../auth/AuthLayout'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})

type LoginForm = z.infer<typeof loginSchema>

export function LoginPage() {
  const { t } = useTranslation('auth')
  const { login } = useAuth()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
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
      setServerError(t('login.serverError'))
    }
  })

  return (
    <AuthLayout
      brand={
        <>
          <BrandPanelHeader />

          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/70">
              {t('login.brandPanel.eyebrow')}
            </p>
            <h1 className="mb-6 text-[clamp(1.875rem,3.25vw,2.5rem)] font-bold leading-tight text-white">
              {t('login.brandPanel.headingLine1')}
              <br />
              {t('login.brandPanel.headingLine2')}
            </h1>
            <p className="mb-10 max-w-[34ch] text-base leading-relaxed text-white/80">
              {t('login.brandPanel.subtitle')}
            </p>

            <div className="flex flex-col gap-4">
              <BrandPanelStep
                index={1}
                title={t('login.brandPanel.steps.dashboard.title')}
                description={t('login.brandPanel.steps.dashboard.description')}
              />
              <BrandPanelStep
                index={2}
                title={t('login.brandPanel.steps.spending.title')}
                description={t('login.brandPanel.steps.spending.description')}
              />
              <BrandPanelStep
                index={3}
                title={t('login.brandPanel.steps.bills.title')}
                description={t('login.brandPanel.steps.bills.description')}
              />
            </div>
          </div>

          <BrandPanelTrust>{t('shared.trustMessage')}</BrandPanelTrust>
        </>
      }
    >
      <div className="mb-7">
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {t('login.heading')}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('login.subtitle')}</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">{t('login.emailLabel')}</Label>
          <InputGroup className="h-11 bg-muted dark:bg-muted/70">
            <InputGroupAddon>
              <Mail size={16} />
            </InputGroupAddon>
            <InputGroupInput
              id="email"
              type="email"
              autoComplete="email"
              placeholder={t('login.emailPlaceholder')}
              aria-invalid={!!errors.email}
              {...register('email')}
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
            <Label htmlFor="password">{t('login.passwordLabel')}</Label>
            <Link
              to="/forgot-password"
              className="text-xs font-medium text-primary hover:underline"
            >
              {t('login.forgotPassword')}
            </Link>
          </div>
          <InputGroup className="h-11 bg-muted dark:bg-muted/70">
            <InputGroupAddon>
              <Lock size={16} />
            </InputGroupAddon>
            <InputGroupInput
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder={t('login.passwordPlaceholder')}
              aria-invalid={!!errors.password}
              {...register('password')}
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
          {errors.password && (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <TriangleAlert size={13} className="shrink-0" />
              {errors.password.message}
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
          {isSubmitting ? t('login.submitting') : t('login.submit')}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t('login.noAccount')}{' '}
        <Link to="/register" className="font-semibold text-primary hover:underline">
          {t('login.createAccount')}
        </Link>
      </p>
    </AuthLayout>
  )
}
