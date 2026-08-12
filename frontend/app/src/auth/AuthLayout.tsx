import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

/**
 * Split-screen shell shared by the auth pages (login, register). The brand
 * panel is desktop-only; on mobile the wordmark collapses into the form
 * column so the page stays a single, fully responsive stack.
 */
export function AuthLayout({
  brand,
  children,
  className,
}: {
  brand: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className="app-canvas flex min-h-dvh flex-col lg:flex-row">
      <div
        className="relative hidden overflow-hidden lg:flex lg:w-[44%] lg:flex-col lg:justify-between xl:w-[42%]"
        /* The same deep-navy field the portfolio's primary contact card uses:
           navy body, one sky-lit corner, one shadowed one, over a faint dot
           grid. Kept inline because it is one bespoke surface, not a token. */
        style={{
          backgroundColor: 'oklch(28.2% 0.057 255)',
          backgroundImage: `
            radial-gradient(circle at 78% 15%, oklch(58% 0.13 246 / 0.55) 0%, transparent 55%),
            radial-gradient(circle at 12% 90%, oklch(17% 0.04 257 / 0.75) 0%, transparent 50%),
            radial-gradient(oklch(100% 0 0 / 0.1) 1.5px, transparent 1.5px)
          `,
          backgroundSize: '100% 100%, 100% 100%, 28px 28px',
        }}
      >
        <div className="flex h-full flex-col justify-between p-10 xl:p-14">{brand}</div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto p-6 sm:p-8 lg:p-12">
        <div className={cn('flex w-full max-w-sm flex-col py-6', className)}>
          <MobileBrandMark />
          {children}
        </div>
      </div>
    </div>
  )
}

function MobileBrandMark() {
  const { t } = useTranslation('nav')
  return (
    <div className="mb-7 flex items-center gap-3 lg:hidden">
      <img
        src="/assets/icons/favicon.svg"
        alt=""
        width={40}
        height={40}
        className="size-10 shrink-0 rounded-xl object-contain"
        decoding="async"
      />
      <span className="font-heading text-lg font-bold tracking-tight text-foreground">
        {t('brand.name')}
      </span>
    </div>
  )
}

export function BrandPanelHeader() {
  const { t } = useTranslation('nav')
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-10 items-center justify-center rounded-xl bg-white/20">
        <img src="/assets/icons/favicon.svg" alt="" width={22} height={22} className="size-[1.375rem]" />
      </div>
      <span className="text-lg font-bold tracking-tight text-white">{t('brand.name')}</span>
    </div>
  )
}

export function BrandPanelStep({
  index,
  title,
  description,
}: {
  index: number
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3.5">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white">
        {index}
      </div>
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-0.5 text-xs text-white/75">{description}</p>
      </div>
    </div>
  )
}

export function BrandPanelTrust({ children }: { children: ReactNode }) {
  const { t } = useTranslation('auth')
  return (
    <div className="rounded-xl border border-white/25 bg-white/12 p-4 xl:p-5">
      <p className="mb-2 text-xs font-semibold text-white/75">{t('shared.trustLabel')}</p>
      <p className="text-sm text-white/90">{children}</p>
    </div>
  )
}

/** Auth form field wrapper: a solid, high-contrast well against the flat page canvas. */
export function authFieldClass(hasError?: boolean) {
  return cn(
    'h-11 w-full items-center rounded-lg border bg-muted dark:bg-muted/70 transition-colors',
    hasError ? 'border-destructive' : 'border-border',
  )
}
