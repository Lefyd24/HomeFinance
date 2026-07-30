import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import {
  MARKET_DATA_PROVIDERS,
  type InvestmentAccount,
  type MarketDataProviderId,
  type NewsSentiment,
} from './investmentsApi'

/**
 * The shared vocabulary of the investments surface.
 *
 * Every figure on these pages is one of three kinds, and each kind has exactly
 * one visual treatment so a number never means two things:
 *
 * - **Magnitude** (a value, a cost, a balance) — `Metric`: a wide-tracked micro
 *   label above a large tabular figure.
 * - **Polarity** (a return, a day move, a signed amount) — `DeltaPct` /
 *   `DeltaAmount`: the app's `flow-in`/`flow-out` tokens, the same pair used for
 *   money in and out everywhere else.
 * - **Comparable magnitude** (how one holding's gain stacks up against the
 *   others) — `DeltaBar`.
 */

/** Label + figure. The label is set small and wide so the number stays the loudest thing. */
export function Metric({
  label,
  value,
  hint,
  size = 'md',
  align = 'start',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  align?: 'start' | 'end'
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', align === 'end' && 'items-end text-right')}>
      <span className="text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          'font-heading font-semibold tabular-nums tracking-tight',
          size === 'sm' && 'text-base',
          size === 'md' && 'text-xl',
          size === 'lg' && 'text-2xl sm:text-3xl',
        )}
      >
        {value}
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}

function polarityClass(value: number | null | undefined, muted = false): string {
  if (value == null || value === 0) return 'text-muted-foreground'
  if (value > 0) return muted ? 'text-flow-in/90' : 'text-flow-in'
  return muted ? 'text-flow-out/90' : 'text-flow-out'
}

/** Signed percentage. The one treatment used for every return figure on these pages. */
export function DeltaPct({
  pct,
  className,
  showSign = true,
}: {
  pct: number | null | undefined
  className?: string
  showSign?: boolean
}) {
  if (pct == null) return <span className={cn('text-muted-foreground', className)}>—</span>
  return (
    <span className={cn('font-medium tabular-nums', polarityClass(pct), className)}>
      {showSign && pct > 0 ? '+' : ''}
      {pct.toFixed(2)}%
    </span>
  )
}

/** Signed money. `format` is passed in so the caller controls the currency. */
export function DeltaAmount({
  amount,
  format,
  className,
}: {
  amount: number | null | undefined
  format: (value: number) => string
  className?: string
}) {
  if (amount == null) return <span className={cn('text-muted-foreground', className)}>—</span>
  return (
    <span className={cn('font-medium tabular-nums', polarityClass(amount), className)}>
      {amount > 0 ? '+' : ''}
      {format(amount)}
    </span>
  )
}

/** A percentage in a tinted pill — for the one headline return per card. */
export function DeltaPill({ pct, className }: { pct: number | null | undefined; className?: string }) {
  if (pct == null) return null
  const positive = pct >= 0
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
        positive ? 'bg-flow-in/12 text-flow-in' : 'bg-flow-out/12 text-flow-out',
        className,
      )}
    >
      {positive && pct > 0 ? '+' : ''}
      {pct.toFixed(2)}%
    </span>
  )
}

/**
 * Gain or loss as a bar growing out from a centre line that represents cost.
 *
 * `scale` is the largest absolute gain/loss in the same table, so every bar is
 * drawn to one shared scale — which is the point: a percentage column tells you
 * a holding is up 40%, this tells you whether that 40% is material next to the
 * rest of the portfolio. Decorative on its own, so it is hidden from screen
 * readers; the adjacent cells carry the numbers.
 */
export function DeltaBar({
  value,
  scale,
  className,
}: {
  value: number | null | undefined
  scale: number
  className?: string
}) {
  if (value == null || !Number.isFinite(scale) || scale <= 0) return null
  const width = Math.min(Math.abs(value) / scale, 1) * 50
  const positive = value >= 0
  return (
    <div
      aria-hidden="true"
      className={cn('relative h-1.5 w-full min-w-14 overflow-hidden rounded-full bg-muted', className)}
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />
      <span
        className={cn(
          'absolute inset-y-0 rounded-full transition-[width] duration-500 motion-reduce:transition-none',
          positive ? 'bg-flow-in' : 'bg-flow-out',
        )}
        style={positive ? { left: '50%', width: `${width}%` } : { right: '50%', width: `${width}%` }}
      />
    </div>
  )
}

/** The largest absolute gain/loss in a set, i.e. the shared scale for `DeltaBar`. */
export function deltaScale(values: Array<number | null | undefined>): number {
  return values.reduce<number>((max, v) => (v == null ? max : Math.max(max, Math.abs(v))), 0)
}

const SENTIMENT_CLASS: Record<NewsSentiment, string> = {
  positive: 'bg-flow-in',
  negative: 'bg-flow-out',
  neutral: 'bg-muted-foreground/50',
}

/**
 * A story's sentiment as a small dot. Sentiment is the broker's own label, and
 * it is never the only signal — the dot always sits beside the source and time,
 * and carries a text label for screen readers.
 */
export function SentimentDot({ sentiment }: { sentiment: NewsSentiment | null }) {
  const { t } = useTranslation('investments')
  if (!sentiment) return null
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={cn('size-1.5 shrink-0 rounded-full', SENTIMENT_CLASS[sentiment])}
      />
      <span className="sr-only">{t(`news.sentiment.${sentiment}`)}</span>
    </span>
  )
}

export function SyncStatusBadge({ status }: { status: InvestmentAccount['sync_status'] }) {
  const { t } = useTranslation('investments')
  if (status === 'ok') return <Badge variant="secondary">{t('status.ok')}</Badge>
  if (status === 'error') return <Badge variant="destructive">{t('status.error')}</Badge>
  return <Badge variant="outline">{t('status.pending')}</Badge>
}

/** Investments › <current page>. Used by the market news and ticker search subpages. */
export function InvestmentsBreadcrumb({ current }: { current: string }) {
  const { t } = useTranslation('investments')
  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/investments">{t('page.title')}</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{current}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}

/**
 * Switch between market-data backends (broker feed today, Yahoo Finance next).
 * Lives in the URL via the caller so a provider choice can be linked and shared.
 */
export function MarketDataProviderSwitch({
  value,
  onChange,
}: {
  value: MarketDataProviderId
  onChange: (next: MarketDataProviderId) => void
}) {
  const { t } = useTranslation('investments')
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next as MarketDataProviderId)
      }}
      variant="outline"
      size="sm"
      spacing={0}
      aria-label={t('providers.label')}
    >
      {MARKET_DATA_PROVIDERS.map((provider) => (
        <ToggleGroupItem key={provider.id} value={provider.id} className="px-3">
          {t(`providers.${provider.id}`)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
