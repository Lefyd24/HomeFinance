import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { ChartLineData01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useTechnical } from '../useTechnical'
import { useInViewOnce } from './useInViewOnce'
import { fmtRatio } from './researchFormat'

/** Only the four headline signals — the full suite stays on the technical page. */
const HEADLINE_SIGNALS = ['rsi', 'macd', 'smaCross', 'bollinger'] as const

function toneClass(direction: number): string {
  if (direction > 0) return 'bg-flow-in/12 text-flow-in'
  if (direction < 0) return 'bg-flow-out/12 text-flow-out'
  return 'bg-muted text-muted-foreground'
}

/**
 * Bento cell C4 — a four-chip technical summary.
 *
 * Deliberately lazy: `/technical/{symbol}` is rate-limited (investments.py:70)
 * and recomputes a full indicator suite, so the request is only spent once the
 * user has actually scrolled to this row. Anything beyond these four signals
 * belongs on the technical analysis page, which this links to.
 */
export function TechnicalSignalsRow({
  symbol,
  className,
}: {
  symbol: string
  className?: string
}) {
  const { t } = useTranslation('investments')
  const [ref, inView] = useInViewOnce<HTMLDivElement>()
  const { data, isLoading, isError } = useTechnical(inView ? symbol : '', '1y')

  const signals = (data?.signals ?? []).filter((signal) =>
    (HEADLINE_SIGNALS as readonly string[]).includes(signal.id),
  )

  return (
    <Card size="sm" className={cn('p-4', className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-muted-foreground">
          {t('research.signalsTitle')}
        </p>
        <Button asChild variant="ghost" size="sm">
          <Link to={`/investments/technical?symbol=${encodeURIComponent(symbol)}`}>
            <HugeiconsIcon icon={ChartLineData01Icon} strokeWidth={2} data-icon="inline-start" />
            {t('research.viewTechnical')}
          </Link>
        </Button>
      </div>

      <div ref={ref} className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {isError ? (
          <p className="col-span-full text-sm text-muted-foreground">
            {t('research.signalsUnavailable')}
          </p>
        ) : !inView || isLoading ? (
          HEADLINE_SIGNALS.map((id) => <Skeleton key={id} className="h-16 rounded-lg" />)
        ) : signals.length === 0 ? (
          <p className="col-span-full text-sm text-muted-foreground">
            {t('research.signalsUnavailable')}
          </p>
        ) : (
          signals.map((signal) => (
            <div
              key={signal.id}
              className={cn(
                'flex flex-col gap-1 rounded-lg px-3 py-2.5',
                toneClass(signal.direction),
              )}
            >
              <span className="text-[0.65rem] uppercase tracking-[0.14em] opacity-80">
                {t(`technical.signals.ids.${signal.id}`)}
              </span>
              <span className="text-sm font-medium tabular-nums">{fmtRatio(signal.value)}</span>
            </div>
          ))
        )}
      </div>
    </Card>
  )
}
