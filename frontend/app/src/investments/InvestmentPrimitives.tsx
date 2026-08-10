import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { CheckmarkBadge01Icon, HelpCircleIcon } from '@hugeicons/core-free-icons'
import { Badge } from '@/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import type { GlossaryEntry } from './metricGlossary'
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

export function SyncStatusBadge({
  status,
  iconOnly = false,
}: {
  status: InvestmentAccount['sync_status']
  /** Always show the glanceable tick, skipping the text badge even at `sm+`. */
  iconOnly?: boolean
}) {
  const { t } = useTranslation('investments')
  if (status === 'ok') {
    return (
      <>
        {/* Phones get a glanceable glowing tick instead of spelling out "Synced". */}
        <span
          className={cn('inline-flex', iconOnly ? 'inline-flex' : 'sm:hidden')}
          title={t('status.ok')}
          aria-label={t('status.ok')}
        >
          <HugeiconsIcon
            icon={CheckmarkBadge01Icon}
            strokeWidth={2}
            className="size-4 text-flow-in"
          />
        </span>
        {!iconOnly && (
          <Badge variant="secondary" className="hidden sm:inline-flex">
            {t('status.ok')}
          </Badge>
        )}
      </>
    )
  }
  if (status === 'error') return <Badge variant="destructive">{t('status.error')}</Badge>
  return <Badge variant="outline">{t('status.pending')}</Badge>
}

/**
 * Investments › <current page>.
 *
 * The sidebar says which section you are in; the breadcrumb says where this
 * page sits within it and gives one click back to the portfolio. Used by every
 * page under `/investments` except the overview itself, which is the root.
 *
 * `parent` adds one extra clickable crumb between "Investments" and `current`
 * — for pages with a drill-down state (e.g. company research after a symbol
 * is picked: Investments › Company research › AAPL).
 */
export function InvestmentsBreadcrumb({
  current,
  parent,
}: {
  current: string
  parent?: { label: string; onClick: () => void }
}) {
  const { t } = useTranslation('investments')
  return (
    <Breadcrumb className="mb-3">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/investments">{t('page.title')}</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        {parent && (
          <>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <button type="button" onClick={parent.onClick}>
                  {parent.label}
                </button>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </>
        )}
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

/**
 * The content shared by `MetricWithHelp`'s tooltip (desktop) and popover (touch).
 * A real `<button aria-label>` triggers it either way — a bare tooltip is
 * unreachable without hover, and half the value of the glossary is on a phone.
 */
function GlossaryBody({ entry }: { entry: GlossaryEntry }) {
  const { t } = useTranslation('investments')
  return (
    <div className="flex flex-col gap-1.5 text-left">
      <p className="text-xs font-semibold text-foreground">{t(entry.shortKey)}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">{t(entry.bodyKey)}</p>
      {entry.scaleKey && (
        <p className="text-xs leading-relaxed text-muted-foreground/80">{t(entry.scaleKey)}</p>
      )}
      {entry.caveatKey && (
        <p className="text-xs leading-relaxed text-flow-out/90">{t(entry.caveatKey)}</p>
      )}
      {entry.sourceKey && (
        <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground/70">
          {t(entry.sourceKey)}
        </p>
      )}
    </div>
  )
}

/**
 * A metric label with a `?` affordance that explains it in plain language —
 * hover/focus opens a tooltip on desktop, tap opens a popover on touch, so the
 * explanation is reachable either way. Wraps `Metric` rather than replacing it.
 */
export function MetricWithHelp({
  label,
  value,
  hint,
  entry,
  size = 'md',
  align = 'start',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  entry: GlossaryEntry
  size?: 'sm' | 'md' | 'lg'
  align?: 'start' | 'end'
}) {
  const { t } = useTranslation('investments')

  const trigger = (
    <button
      type="button"
      aria-label={t('compare.help', { metric: t(entry.labelKey) })}
      className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
    >
      <HugeiconsIcon icon={HelpCircleIcon} strokeWidth={2} className="size-3.5" />
    </button>
  )

  return (
    <div className={cn('flex min-w-0 flex-col gap-1', align === 'end' && 'items-end text-right')}>
      <span className="inline-flex items-center gap-1 text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
        {/* A tap-or-click Popover reaches every input method — hover-only tooltips are
            unreachable on touch, and half the value of the glossary is on a phone. */}
        <Popover>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent
            className="w-[min(22rem,calc(100vw-2rem))] max-h-[min(24rem,70vh)] overflow-y-auto"
            collisionPadding={12}
          >
            <GlossaryBody entry={entry} />
          </PopoverContent>
        </Popover>
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

/**
 * A point estimate with its 95% confidence interval subdued alongside it — for
 * Sharpe and any other ratio whose standard error is too large to print as a
 * bare number without misleading (see docs/investments/00-research-foundations.md §A.1).
 */
export function ConfidenceBand({
  value,
  ciLow,
  ciHigh,
  decimals = 2,
  className,
}: {
  value: number | null | undefined
  ciLow: number | null | undefined
  ciHigh: number | null | undefined
  decimals?: number
  className?: string
}) {
  const { t } = useTranslation('investments')
  if (value == null) return <span className={cn('text-muted-foreground', className)}>—</span>
  const half = ciLow != null && ciHigh != null ? (ciHigh - ciLow) / 2 : null
  return (
    <span className={cn('inline-flex items-baseline gap-1 tabular-nums', className)}>
      <span className="font-medium">{value.toFixed(decimals)}</span>
      {half != null && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-default text-xs text-muted-foreground">
              ±{half.toFixed(decimals)}
            </span>
          </TooltipTrigger>
          <TooltipContent className="w-56">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t('compare.confidenceBand', {
                low: ciLow!.toFixed(decimals),
                high: ciHigh!.toFixed(decimals),
              })}
            </p>
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  )
}

/** The provenance line at a tile's footer — where the numbers came from, and as of when. */
export function DataSourceNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('text-[0.7rem] leading-relaxed text-muted-foreground/70', className)}>{children}</p>
  )
}
