import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { MetricWithHelp } from '../InvestmentPrimitives'
import { GLOSSARY, type MetricId } from '../metricGlossary'
import type { CompanyHistory, HorizonStats } from '../investmentsApi'
import { deltaClass, fmtInt, fmtPct, fmtRatio } from './researchFormat'

type Row = {
  metricId: MetricId
  render: (stats: HorizonStats) => string
  tone?: (stats: HorizonStats) => string
}

/**
 * Rows are declared once and rendered per horizon, so a metric's formatting and
 * its glossary entry can never drift apart across columns.
 *
 * These lookbacks are fixed at 1y/3y/5y and do NOT follow the chart's range
 * selector — the point of the table is a stable comparison you can read while
 * changing what the chart shows.
 */
const ROWS: Row[] = [
  {
    metricId: 'cagr',
    render: (s) => fmtPct(s.annualized_return, { signed: true }),
    tone: (s) => deltaClass(s.annualized_return),
  },
  { metricId: 'volatility', render: (s) => fmtPct(s.volatility) },
  { metricId: 'sharpe', render: (s) => fmtRatio(s.sharpe) },
  { metricId: 'sortino', render: (s) => fmtRatio(s.sortino) },
  {
    metricId: 'maxDrawdown',
    render: (s) => fmtPct(s.max_drawdown),
    tone: (s) => deltaClass(s.max_drawdown),
  },
  { metricId: 'timeUnderWater', render: (s) => fmtInt(s.days_under_water) },
  { metricId: 'beta', render: (s) => fmtRatio(s.beta) },
  {
    metricId: 'alpha',
    render: (s) => fmtPct(s.alpha, { signed: true }),
    tone: (s) => deltaClass(s.alpha),
  },
  { metricId: 'upCapture', render: (s) => fmtRatio(s.up_capture) },
  { metricId: 'downCapture', render: (s) => fmtRatio(s.down_capture) },
]

export function HorizonTable({
  history,
  isLoading,
  className,
}: {
  history: CompanyHistory | undefined
  isLoading: boolean
  className?: string
}) {
  const { t } = useTranslation('investments')
  const horizons = history?.horizons ?? []

  return (
    <Card size="sm" className={cn('flex flex-col', className)}>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-muted-foreground">
          {t('research.horizonsTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {isLoading && horizons.length === 0 ? (
          <Skeleton className="h-64 w-full rounded-lg" />
        ) : horizons.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t('research.chartEmpty')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 text-start text-xs font-medium text-muted-foreground">
                    {t('research.metricColumn')}
                  </th>
                  {horizons.map((h) => (
                    <th
                      key={h.horizon}
                      className="pb-2 text-end text-xs font-semibold uppercase tracking-wide"
                    >
                      {h.horizon.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, index) => {
                  const entry = GLOSSARY[row.metricId]
                  return (
                    <tr key={row.metricId} className={cn(index % 2 === 1 && 'bg-muted/30')}>
                      <td className="py-1.5 pe-2">
                        <MetricWithHelp
                          label={t(entry.labelKey)}
                          value={null}
                          entry={entry}
                          size="sm"
                        />
                      </td>
                      {horizons.map((h) => (
                        <td
                          key={`${row.metricId}-${h.horizon}`}
                          className={cn(
                            'py-1.5 ps-2 text-end tabular-nums',
                            row.tone?.(h) ?? 'text-foreground',
                          )}
                        >
                          {row.render(h)}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
