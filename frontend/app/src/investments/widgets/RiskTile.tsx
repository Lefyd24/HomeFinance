import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '../../lib/format'
import { DeltaPct, MetricWithHelp } from '../InvestmentPrimitives'
import { GLOSSARY, PERFORMANCE_GLOSSARY } from '../metricGlossary'
import { PerformanceError } from './PerformanceTile'
import { Tile } from './Tile'
import type { PortfolioPerformance } from '../investmentsApi'

/**
 * How bumpy the ride was over the selected range. Every figure is flow-adjusted
 * on the server; a figure it could not compute (too little history) shows "—".
 */
export function RiskTile({
  performance,
  loading,
  error,
  rangeLabel,
  className,
}: {
  performance: PortfolioPerformance | undefined
  loading: boolean
  error: Error | null
  /** Human name of the selected range, e.g. "3 months". */
  rangeLabel?: string
  className?: string
}) {
  const { t } = useTranslation('investments')
  const summary = performance?.summary

  const missing = (
    <span title={t('performance.risk.notEnoughHistory')} className="text-muted-foreground">
      —
    </span>
  )
  const plain = (value: number | null | undefined, format: (v: number) => string): ReactNode =>
    value == null ? missing : format(value)

  return (
    <Tile
      title={t('performance.risk.title')}
      className={className}
      action={rangeLabel && <span className="text-[0.65rem] text-muted-foreground">{rangeLabel}</span>}
    >
      {loading ? (
        <Skeleton className="h-[9rem] w-full rounded-lg" />
      ) : error ? (
        <PerformanceError error={error} />
      ) : (
        <div className="grid h-full grid-cols-2 content-between gap-x-3 gap-y-4">
          <MetricWithHelp
            size="sm"
            label={t('performance.risk.volatility')}
            entry={GLOSSARY.volatility}
            value={plain(summary?.volatility, (v) => `${(v * 100).toFixed(1)}%`)}
          />
          <MetricWithHelp
            size="sm"
            label={t('performance.risk.maxDrawdown')}
            entry={GLOSSARY.maxDrawdown}
            value={plain(summary?.max_drawdown, (v) => `${(v * 100).toFixed(1)}%`)}
          />
          <MetricWithHelp
            size="sm"
            label={t('performance.risk.sharpe')}
            entry={GLOSSARY.sharpe}
            value={plain(summary?.sharpe, (v) => v.toFixed(2))}
          />
          {summary?.twr_annualized != null && (
            <MetricWithHelp
              size="sm"
              label={t('performance.risk.twrAnnualized')}
              entry={PERFORMANCE_GLOSSARY.twrAnnualized}
              value={<DeltaPct pct={summary.twr_annualized * 100} className="text-base font-semibold" />}
            />
          )}
          {(['bestDay', 'worstDay'] as const).map((key) => {
            const day = key === 'bestDay' ? summary?.best_day : summary?.worst_day
            return (
              <MetricWithHelp
                key={key}
                size="sm"
                label={t(`performance.risk.${key}`)}
                entry={PERFORMANCE_GLOSSARY[key]}
                value={
                  day ? (
                    <DeltaPct pct={day.return * 100} className="text-base font-semibold" />
                  ) : (
                    missing
                  )
                }
                hint={day ? formatDate(day.date) : undefined}
              />
            )
          })}
        </div>
      )}
    </Tile>
  )
}
