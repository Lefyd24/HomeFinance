import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, Time04Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatBalance, formatDate } from '../../lib/format'
import { useBalanceVisibility } from '../../ui/BalanceVisibilityContext'
import { fmtPct } from '../research/researchFormat'
import { DeltaAmount, DeltaPct } from '../InvestmentPrimitives'
import { positionValue } from '../portfolioInsights'
import { toYahooSymbol } from '../symbolMapping'
import { useCompanyProfile } from '../useInvestments'
import type { CompanyProfile, InvestmentProvider, PortfolioPosition } from '../investmentsApi'

/**
 * One holding, opened out.
 *
 * The list behind it shows the four things you scan for; everything else about
 * a position lives here. Laid out as three ledgers rather than a grid of
 * loose fields, because the questions a holding has to answer are sequential,
 * not parallel: what did this cost me, what is it worth now, and what did it
 * do today. A grid made every figure look equally important and left the
 * reader to work out which ones add up to which — so cost basis, commission
 * and total paid now sit in one column that visibly sums, and the return is
 * shown twice: before fees (what the broker calls your return) and after them
 * (what actually happened to your money).
 *
 * It grows out of the row you clicked rather than appearing over it: the card
 * and the row share a `layoutId`, so the transition says "this row, larger"
 * instead of "a new thing on top". Motion is skipped entirely when the user
 * has asked for reduced motion — the card then simply appears.
 */
export function HoldingDetailCard({
  position,
  currency,
  provider,
  onClose,
}: {
  position: PortfolioPosition | null
  /** The scope's currency, for the converted-value and commission rows. */
  currency: string
  /** The position's own broker, so its ticker can be translated for research lookups. */
  provider: InvestmentProvider | null
  onClose: () => void
}) {
  const { t } = useTranslation('investments')
  const { hidden } = useBalanceVisibility()
  const reduced = useReducedMotion()
  const cardRef = useRef<HTMLDivElement>(null)
  const open = position != null

  // Escape closes, and the page behind stops scrolling while it is open —
  // otherwise the card stays put while the list slides away underneath it.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  // Move focus into the card so a keyboard user lands inside it rather than
  // continuing from wherever the list left off.
  useEffect(() => {
    if (open) cardRef.current?.focus()
  }, [open])

  // Best-effort research enrichment — a broker ticker is translated to
  // Yahoo's own convention first (see symbolMapping.ts; e.g. Freedom24's
  // `VIO.GR` -> Yahoo's `VIO.AT`), but plenty of tickers (crypto pairs Yahoo
  // doesn't list, unlisted bonds, an unmapped exchange) still won't resolve —
  // `useCompanyProfile` already turns that into a quiet non-retrying miss
  // rather than a visible error.
  const yahooSymbol = position ? toYahooSymbol(position.symbol, provider) : null
  const { data: profile, isLoading: profileLoading } = useCompanyProfile(yahooSymbol)

  const money = (value: number | null | undefined, cur = position?.currency ?? currency) =>
    value == null ? '—' : formatBalance(value, cur, hidden)
  /** Commission is only ever reported in the account's currency — see the API type. */
  const base = (value: number | null | undefined) =>
    value == null ? '—' : formatBalance(value, currency, hidden)

  // Everything in the "after fees" line is in the account's currency, so the
  // gross return has to come from the base-currency column too rather than
  // from the position's own — mixing the two would silently add a EUR
  // commission to a USD gain.
  const grossPnl = position?.unrealized_pnl_base ?? position?.unrealized_pnl ?? null
  const costBase = position?.cost_basis_base ?? position?.cost_basis ?? null
  const feesPaid = position?.fees_paid_base ?? null
  const hasFees = feesPaid != null && feesPaid > 0
  const totalPaid = costBase != null && hasFees ? costBase + feesPaid : null
  const netPnl = grossPnl != null && hasFees ? grossPnl - feesPaid : null
  const netPct = netPnl != null && totalPaid ? (netPnl / totalPaid) * 100 : null

  // Portalled to <body>: the shell's content column carries a backdrop-filter
  // for its glass surface, and any backdrop-filter/filter/transform ancestor
  // silently opens a new CSS stacking context. Rendered in place, this
  // overlay's `fixed` box would still cover the viewport visually, but its
  // z-50 would only ever be compared against other elements *inside* that
  // stacking context — never against the mobile dock or the quick-add FAB,
  // which sit outside it as their own fixed, z-indexed siblings. No z-index
  // set here could ever paint over them. Escaping to `document.body` puts
  // this overlay back in the root stacking context, where z-50 actually wins.
  return createPortal(
    <AnimatePresence>
      {position && (
        // Bottom-anchored on a phone so the card opens within thumb reach and
        // the close control isn't stranded at the top of a tall screen;
        // centred once there's room for it to float. `data-section` re-applies
        // the investments room's tint/radius tokens (`index.css`'s
        // `[data-section='investments']` block) that this element would
        // otherwise lose by portalling out from under `AppShell`'s scoped
        // wrapper — this card only ever opens from inside investments.
        <div
          data-section="investments"
          className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
        >
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.2 }}
            onClick={onClose}
            aria-label={t('holding.close')}
            className="absolute inset-0 cursor-default bg-background/70 backdrop-blur-sm"
          />

          <motion.div
            ref={cardRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={position.name ?? position.symbol}
            layoutId={reduced ? undefined : `holding-${position.account_id}-${position.id}`}
            transition={{ duration: reduced ? 0 : 0.3, type: reduced ? undefined : 'spring', bounce: 0.1 }}
            className={cn(
              'glass-panel relative z-10 flex max-h-[85dvh] w-full max-w-lg flex-col overflow-y-auto',
              'border border-border p-4 shadow-xl outline-none',
              // A sheet rising from the bottom edge on a phone, a card on
              // larger screens. The safe-area padding keeps the last row clear
              // of the home indicator in an installed PWA.
              'rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-2xl sm:pb-4',
            )}
          >
            {/* The grab handle that says "this came up from the bottom". */}
            <div
              aria-hidden="true"
              className="mx-auto -mt-1 mb-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/25 sm:hidden"
            />
            <header className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-heading text-lg font-semibold leading-tight">
                  {position.symbol}
                </h3>
                {position.name && (
                  <p className="truncate text-sm text-muted-foreground">{position.name}</p>
                )}
                {position.exchange && (
                  <p className="mt-0.5 text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
                    {position.exchange}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                aria-label={t('holding.close')}
                className="-mr-1 -mt-1 shrink-0"
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-4" />
              </Button>
            </header>

            <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t('detail.table.marketValue')}
                </span>
                <span className="font-heading text-2xl font-semibold tabular-nums tracking-tight">
                  {money(position.market_value)}
                </span>
                {/* Only worth restating when it isn't the scope's own currency. */}
                {position.currency !== currency && (
                  <span className="text-xs text-muted-foreground">
                    {formatBalance(positionValue(position), currency, hidden)}
                  </span>
                )}
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <DeltaAmount
                  amount={position.unrealized_pnl}
                  format={(v) => money(v)}
                  className="text-base"
                />
                <DeltaPct pct={position.unrealized_return_pct} className="text-sm" />
              </div>
            </div>

            {/* What it cost. Reads top to bottom as a sum: the price paid, the
                commission on top of it, and the line the two add up to — the
                number that actually left the account. */}
            <Ledger title={t('holding.breakdown.paidTitle')}>
              <LedgerRow
                label={t('holding.costBasis')}
                hint={t('holding.breakdown.costFormula', {
                  quantity: position.quantity,
                  price: money(position.avg_price),
                })}
                value={money(position.cost_basis)}
              />
              <LedgerRow
                label={t('holding.breakdown.fees')}
                hint={
                  hasFees
                    ? t('holding.breakdown.feesHint', { count: position.fee_count })
                    : t('holding.breakdown.feesNone')
                }
                value={hasFees ? base(feesPaid) : '—'}
              />
              {totalPaid != null && (
                <LedgerRow
                  label={t('holding.breakdown.totalPaid')}
                  hint={t('holding.breakdown.totalPaidHint')}
                  value={base(totalPaid)}
                  emphasis
                />
              )}
            </Ledger>

            {/* Market value and the gross return are the headline above, so
                neither is restated here — this section only adds what the
                headline cannot say: the price behind the value, and the return
                once the commission above is taken off it. */}
            <Ledger title={t('holding.breakdown.nowTitle')}>
              <LedgerRow
                label={t('detail.table.currentPrice')}
                hint={t('holding.hints.currentPrice')}
                value={money(position.current_price)}
              />
              {netPnl != null && (
                <LedgerRow
                  label={t('holding.breakdown.netReturn')}
                  hint={t('holding.breakdown.netReturnHint')}
                  value={
                    <span className="flex items-baseline justify-end gap-2">
                      <DeltaAmount amount={netPnl} format={(v) => base(v)} />
                      <DeltaPct pct={netPct} className="text-xs" />
                    </span>
                  }
                  emphasis
                />
              )}
            </Ledger>

            {/* Today, on its own: an intraday move belongs nowhere near the
                since-you-bought-it figures, which is exactly the confusion the
                old flat grid invited. The section heading already says when,
                so the rows say what rather than repeating "today" twice more. */}
            <Ledger title={t('holding.breakdown.todayTitle')}>
              <LedgerRow
                label={t('holding.breakdown.todayPrice')}
                value={<DeltaPct pct={position.day_change_pct} className="text-sm" />}
              />
              <LedgerRow
                label={t('holding.breakdown.todayValue')}
                value={<DeltaAmount amount={position.day_change} format={(v) => money(v)} />}
              />
            </Ledger>

            {/* Quantity and average price are already spelled out as the cost
                line's working ("10 × 1.00 at your average price"), so only the
                two facts that appear nowhere else are left. */}
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border/60 pt-3 text-sm">
              <Row
                label={t('detail.table.weight')}
                hint={t('holding.hints.weight')}
                value={position.weight_pct != null ? `${position.weight_pct.toFixed(1)}%` : '—'}
              />
              <Row
                label={t('holding.pricedAt')}
                hint={t('holding.hints.pricedAt')}
                value={formatDate(position.synced_at)}
              />
            </dl>

            <ResearchEnrichment loading={profileLoading} profile={profile ?? null} />

            {/* One short row rather than four full-width chips wrapping onto
                two lines. The icon and the solid fill are spent on the one
                action this card exists to lead to; the two research links are
                bare labels, which is all the width they were earning. */}
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <Button asChild size="xs">
                <Link
                  to={`/investments/holdings/${position.account_id}/${encodeURIComponent(position.symbol)}`}
                >
                  <HugeiconsIcon icon={Time04Icon} strokeWidth={2} data-icon="inline-start" />
                  {t('holding.actions.history')}
                </Link>
              </Button>
              <Button asChild size="xs" variant="outline">
                <Link to={`/investments/research?symbol=${encodeURIComponent(position.symbol)}`}>
                  {t('holding.actions.research')}
                </Link>
              </Button>
              <Button asChild size="xs" variant="outline">
                <Link to={`/investments/technical?symbol=${encodeURIComponent(position.symbol)}`}>
                  {t('holding.actions.technical')}
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/** A titled run of rows that reads as one calculation. */
function Ledger({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h4 className="mb-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </h4>
      <dl className="flex flex-col">{children}</dl>
    </section>
  )
}

/**
 * Label and gloss on the left, figure on the right. `emphasis` marks the line
 * the ones above it add up to — a top border and heavier type, the way a
 * statement marks a subtotal.
 */
function LedgerRow({
  label,
  hint,
  value,
  emphasis = false,
}: {
  label: string
  hint?: string
  value: ReactNode
  emphasis?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 py-1',
        emphasis && 'mt-1 border-t border-border/60 pt-2',
      )}
    >
      <dt className="min-w-0 flex-1">
        <span className={cn('block text-sm leading-tight', emphasis && 'font-medium')}>
          {label}
        </span>
        {hint && (
          <span className="block text-[0.7rem] leading-snug text-muted-foreground">{hint}</span>
        )}
      </dt>
      <dd
        className={cn(
          'shrink-0 text-end text-sm tabular-nums leading-tight',
          emphasis && 'font-semibold',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function Row({ label, hint, value }: { label: string; hint: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </dt>
      <dd className="truncate tabular-nums">{value}</dd>
      <p className="text-[0.7rem] leading-snug text-muted-foreground">{hint}</p>
    </div>
  )
}

/**
 * What the company-research endpoint adds beyond the broker's own fields —
 * sector/beta/dividend for a stock, expense ratio/category/top holdings for a
 * fund. Omitted entirely rather than shown empty: a crypto symbol or an
 * unlisted bond routinely won't resolve on Yahoo, and that's an expected miss,
 * not an error worth a placeholder for.
 */
function ResearchEnrichment({
  loading,
  profile,
}: {
  loading: boolean
  profile: CompanyProfile | null
}) {
  const { t } = useTranslation('investments')

  if (loading) {
    return (
      <div className="mt-4 flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  if (!profile) return null

  const isFund = profile.quote_type === 'etf' || profile.quote_type === 'mutual_fund'
  const rows = isFund
    ? [
        { label: t('holding.research.expenseRatio'), value: fmtPct(profile.expense_ratio) },
        { label: t('holding.research.category'), value: profile.category ?? '—' },
        {
          label: t('holding.research.topHolding'),
          value: profile.top_holdings[0]
            ? `${profile.top_holdings[0].symbol} (${fmtPct(profile.top_holdings[0].weight)})`
            : '—',
        },
      ]
    : [
        { label: t('holding.research.sector'), value: profile.sector ?? '—' },
        { label: t('holding.research.beta'), value: profile.beta != null ? profile.beta.toFixed(2) : '—' },
        {
          label: t('holding.research.dividendYield'),
          value: profile.dividend_yield != null ? `${profile.dividend_yield.toFixed(2)}%` : '—',
        },
      ]

  const hasAnyValue = rows.some((row) => row.value !== '—')
  if (!hasAnyValue) return null

  return (
    <div className="mt-4 border-t border-border/60 pt-3">
      <p className="mb-2 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {t('holding.research.title')}
      </p>
      <div className="grid grid-cols-3 gap-x-2 gap-y-2 text-xs">
        {rows.map((row) => (
          <div key={row.label} className="flex min-w-0 flex-col gap-0.5">
            <dt className="truncate text-[0.6rem] text-muted-foreground">{row.label}</dt>
            <dd className="truncate font-medium tabular-nums">{row.value}</dd>
          </div>
        ))}
      </div>
    </div>
  )
}
