import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, ChartLineData01Icon, News01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '../../lib/format'
import { DeltaAmount, DeltaPct } from '../InvestmentPrimitives'
import { positionValue } from '../portfolioInsights'
import type { PortfolioPosition } from '../investmentsApi'

/**
 * One holding, opened out.
 *
 * The list behind it shows the four things you scan for; everything else about
 * a position — quantity, average price, exchange, the converted value, the
 * links out to research and news — lives here, so the list never has to grow a
 * column to accommodate a field most rows don't need.
 *
 * It grows out of the row you clicked rather than appearing over it: the card
 * and the row share a `layoutId`, so the transition says "this row, larger"
 * instead of "a new thing on top". Motion is skipped entirely when the user
 * has asked for reduced motion — the card then simply appears.
 */
export function HoldingDetailCard({
  position,
  currency,
  onClose,
}: {
  position: PortfolioPosition | null
  /** The scope's currency, for the converted-value row. */
  currency: string
  onClose: () => void
}) {
  const { t } = useTranslation('investments')
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

  const money = (value: number | null | undefined, cur = position?.currency ?? currency) =>
    value == null ? '—' : formatCurrency(value, cur)

  return (
    <AnimatePresence>
      {position && (
        // Bottom-anchored on a phone so the card opens within thumb reach and
        // the close control isn't stranded at the top of a tall screen;
        // centred once there's room for it to float.
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
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
                    {formatCurrency(positionValue(position), currency)}
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

            {/* Each field carries a one-line gloss. The abbreviations here are
                the ones a brokerage statement assumes you already know — "cost
                basis", "weight" — and this card is the place with room to say
                what they mean instead of leaving them to be guessed at. */}
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Row
                label={t('detail.table.quantity')}
                hint={t('holding.hints.quantity')}
                value={position.quantity}
              />
              <Row
                label={t('detail.table.avgPrice')}
                hint={t('holding.hints.avgPrice')}
                value={money(position.avg_price)}
              />
              <Row
                label={t('detail.table.currentPrice')}
                hint={t('holding.hints.currentPrice')}
                value={money(position.current_price)}
              />
              <Row
                label={t('detail.table.dayChange')}
                hint={t('holding.hints.dayChange')}
                value={<DeltaPct pct={position.day_change_pct} className="text-sm" />}
              />
              <Row
                label={t('holding.dayChangeAmount')}
                hint={t('holding.hints.dayChangeAmount')}
                value={<DeltaAmount amount={position.day_change} format={(v) => money(v)} />}
              />
              <Row
                label={t('holding.costBasis')}
                hint={t('holding.hints.costBasis')}
                value={money(position.cost_basis)}
              />
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

            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="secondary">
                <Link to={`/investments/research?symbol=${encodeURIComponent(position.symbol)}`}>
                  <HugeiconsIcon
                    icon={ChartLineData01Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  {t('research.title')}
                </Link>
              </Button>
              <Button asChild size="sm" variant="secondary">
                <Link to={`/investments/technical?symbol=${encodeURIComponent(position.symbol)}`}>
                  <HugeiconsIcon
                    icon={ChartLineData01Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  {t('technical.title')}
                </Link>
              </Button>
              <Button asChild size="sm" variant="secondary">
                <Link to={`/investments/news?symbol=${encodeURIComponent(position.symbol)}`}>
                  <HugeiconsIcon icon={News01Icon} strokeWidth={2} data-icon="inline-start" />
                  {t('news.title')}
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
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
