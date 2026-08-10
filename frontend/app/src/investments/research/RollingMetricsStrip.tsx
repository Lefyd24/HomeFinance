import { useTranslation } from 'react-i18next'
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { MetricWithHelp } from '../InvestmentPrimitives'
import { GLOSSARY, type MetricId } from '../metricGlossary'
import type { CompanyHistory, RollingPoint } from '../investmentsApi'
import { useInViewOnce } from './useInViewOnce'
import { fmtPct, fmtRatio } from './researchFormat'

/**
 * Bento cells C2 — how the risk profile has moved, not just where it landed.
 *
 * Three sparklines over the selected range: 30-day annualised volatility,
 * 60-day rolling beta, 60-day rolling Sharpe. Each shows its latest value as
 * the headline with the trace beneath, so the strip reads as three stats that
 * happen to have shape.
 */
function Sparkline({
  metricId,
  points,
  format,
  stroke,
}: {
  metricId: MetricId
  points: RollingPoint[]
  format: (value: number | null) => string
  stroke: string
}) {
  const { t } = useTranslation('investments')
  const entry = GLOSSARY[metricId]
  const latest = points.length > 0 ? points[points.length - 1].value : null

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-muted/20 p-3">
      <MetricWithHelp
        label={t(entry.labelKey)}
        value={<span className="tabular-nums">{format(latest)}</span>}
        entry={entry}
        size="sm"
      />
      <div className="h-12">
        {points.length === 0 ? (
          <div className="flex h-full items-center text-xs text-muted-foreground">—</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <YAxis domain={['dataMin', 'dataMax']} hide />
              <Area
                type="monotone"
                dataKey="value"
                stroke={stroke}
                fill={stroke}
                fillOpacity={0.12}
                strokeWidth={1.4}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

export function RollingMetricsStrip({
  history,
  isLoading,
  className,
}: {
  history: CompanyHistory | undefined
  isLoading: boolean
  className?: string
}) {
  const { t } = useTranslation('investments')
  const [ref, inView] = useInViewOnce<HTMLDivElement>()

  return (
    <Card size="sm" className={cn('p-4', className)}>
      <p className="mb-3 text-sm font-semibold text-muted-foreground">
        {t('research.rollingTitle')}
      </p>
      <div ref={ref} className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {isLoading && !history ? (
          <>
            <Skeleton className="h-28 rounded-lg" />
            <Skeleton className="h-28 rounded-lg" />
            <Skeleton className="h-28 rounded-lg" />
          </>
        ) : inView && history ? (
          <>
            <Sparkline
              metricId="volatility"
              points={history.rolling_volatility}
              format={(value) => fmtPct(value)}
              stroke="var(--color-flow-out)"
            />
            <Sparkline
              metricId="beta"
              points={history.rolling_beta}
              format={(value) => fmtRatio(value)}
              stroke="var(--color-muted-foreground)"
            />
            <Sparkline
              metricId="sharpe"
              points={history.rolling_sharpe}
              format={(value) => fmtRatio(value)}
              stroke="var(--color-flow-in)"
            />
          </>
        ) : (
          <div className="h-28" />
        )}
      </div>
    </Card>
  )
}
