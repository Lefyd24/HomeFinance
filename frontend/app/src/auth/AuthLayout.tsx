import type { ReactNode } from 'react'
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
        style={{
          backgroundColor: 'oklch(29% 0.07 227)',
          backgroundImage: `
            radial-gradient(circle at 78% 15%, oklch(46% 0.10 224 / 0.65) 0%, transparent 55%),
            radial-gradient(circle at 12% 90%, oklch(18% 0.06 230 / 0.7) 0%, transparent 50%),
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
        Home Finance
      </span>
    </div>
  )
}

export function BrandPanelHeader() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-10 items-center justify-center rounded-xl bg-white/20">
        <img src="/assets/icons/favicon.svg" alt="" width={22} height={22} className="size-[1.375rem]" />
      </div>
      <span className="text-lg font-bold tracking-tight text-white">Home Finance</span>
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
  return (
    <div className="rounded-xl border border-white/25 bg-white/12 p-4 xl:p-5">
      <p className="mb-2 text-xs font-semibold text-white/75">Your data stays yours</p>
      <p className="text-sm text-white/90">{children}</p>
    </div>
  )
}

/** Auth form field wrapper: solid, high-contrast well distinct from the glassy page behind it. */
export function authFieldClass(hasError?: boolean) {
  return cn(
    'h-11 w-full items-center rounded-lg border bg-muted dark:bg-muted/70 transition-colors',
    hasError ? 'border-destructive' : 'border-border',
  )
}
