import { useTranslation } from 'react-i18next'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { CompanyHistory } from '../investmentsApi'
import { useInViewOnce } from './useInViewOnce'
import {
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
  fmtPct,
} from './researchFormat'

/**
 * Bento cell C3 — the shape of daily returns over the selected range.
 *
 * Bars are coloured by sign, so fat left tails are visible rather than
 * something you have to read off an axis. Bucket bounds come from the server's
 * numpy histogram, so the browser does no binning.
 */
export function ReturnsHistogram({
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
  const bins = history?.return_histogram ?? []
  const data = bins.map((bin) => ({
    ...bin,
    mid: (bin.lower + bin.upper) / 2,
    label: fmtPct((bin.lower + bin.upper) / 2, { decimals: 1 }),
  }))

  return (
    <Card size="sm" className={cn('flex flex-col', className)}>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-muted-foreground">
          {t('research.distributionTitle')}
        </CardTitle>
        {history != null && (
          <p className="text-xs text-muted-foreground">
            {t('research.distributionCount', { count: history.return_observations })}
          </p>
        )}
      </CardHeader>
      <CardContent className="flex-1">
        <div ref={ref} className="min-h-[140px]">
          {isLoading && data.length === 0 ? (
            <Skeleton className="h-[140px] w-full rounded-lg" />
          ) : data.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {t('research.chartEmpty')}
            </p>
          ) : inView ? (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9 }}
                  interval="preserveStartEnd"
                  minTickGap={24}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                  itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                  cursor={{ fill: 'var(--color-muted)', opacity: 0.3 }}
                  labelFormatter={(label) => t('research.distributionBin', { range: label })}
                  formatter={(value) => [String(value), t('research.distributionDays')]}
                />
                <Bar dataKey="count" isAnimationActive={false} radius={[2, 2, 0, 0]}>
                  {data.map((bin) => (
                    <Cell
                      key={`${bin.lower}-${bin.upper}`}
                      fill={bin.mid < 0 ? 'var(--color-flow-out)' : 'var(--color-flow-in)'}
                      fillOpacity={0.65}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[140px]" />
          )}
        </div>
      </CardContent>
    </Card>
  )
}
