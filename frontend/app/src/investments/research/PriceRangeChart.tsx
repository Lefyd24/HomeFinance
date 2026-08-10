import { useTranslation } from 'react-i18next'
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { HISTORY_PERIODS, type CompanyHistory, type HistoryPeriod } from '../investmentsApi'
import { useInViewOnce } from './useInViewOnce'
import {
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
  fmtCompactNumber,
  fmtMoney,
} from './researchFormat'

/**
 * Bento cell C1 — the page's centrepiece chart.
 *
 * Price area + 50/200-day moving averages + a volume histogram on a secondary
 * axis, with server-sliced ranges. Range changes refetch only the cached
 * history endpoint, and TanStack Query's placeholderData keeps the previous
 * series on screen, so switching never flashes a skeleton.
 *
 * Mounted lazily: the chart only renders once scrolled near, keeping first
 * paint cheap on a page that has several charts below it.
 */
export function PriceRangeChart({
  history,
  isLoading,
  period,
  onPeriodChange,
  currency,
  className,
}: {
  history: CompanyHistory | undefined
  isLoading: boolean
  period: HistoryPeriod
  onPeriodChange: (next: HistoryPeriod) => void
  currency: string
  className?: string
}) {
  const { t } = useTranslation('investments')
  const [ref, inView] = useInViewOnce<HTMLDivElement>()
  const bars = history?.bars ?? []

  return (
    <Card size="sm" className={cn('overflow-hidden', className)}>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-sm font-semibold text-muted-foreground">
          {t('research.chartTitle')}
        </CardTitle>
        <ToggleGroup
          type="single"
          size="sm"
          value={period}
          onValueChange={(next) => next && onPeriodChange(next as HistoryPeriod)}
          aria-label={t('research.rangeLabel')}
        >
          {HISTORY_PERIODS.map((option) => (
            <ToggleGroupItem key={option} value={option} className="px-2 text-xs uppercase">
              {t(`research.ranges.${option}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardHeader>
      <CardContent>
        <div ref={ref} className="min-h-[320px]">
          {isLoading && bars.length === 0 ? (
            <Skeleton className="h-[320px] w-full rounded-lg" />
          ) : bars.length === 0 ? (
            <p className="py-24 text-center text-sm text-muted-foreground">
              {t('research.chartEmpty')}
            </p>
          ) : inView ? (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={bars} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="researchPriceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-flow-in)" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="var(--color-flow-in)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(value: string) =>
                    new Date(value).toLocaleDateString(undefined, {
                      month: 'short',
                      year: '2-digit',
                    })
                  }
                  interval="preserveStartEnd"
                  minTickGap={40}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="price"
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(value: number) => fmtCompactNumber(value)}
                  width={52}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="volume"
                  orientation="right"
                  domain={[0, (max: number) => max * 4]}
                  hide
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                  itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                  labelFormatter={(label) => new Date(String(label)).toLocaleDateString()}
                  formatter={(value, name) => {
                    if (name === t('research.series.volume')) {
                      return [fmtCompactNumber(Number(value)), name]
                    }
                    return [fmtMoney(Number(value), currency), name]
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="line" />
                <Bar
                  yAxisId="volume"
                  dataKey="volume"
                  name={t('research.series.volume')}
                  fill="var(--color-muted-foreground)"
                  opacity={0.22}
                  isAnimationActive={false}
                />
                <Area
                  yAxisId="price"
                  type="monotone"
                  dataKey="close"
                  name={t('research.series.close')}
                  stroke="var(--color-flow-in)"
                  fill="url(#researchPriceGradient)"
                  strokeWidth={1.6}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="sma50"
                  name={t('research.series.sma50')}
                  stroke="var(--color-chart-2)"
                  strokeWidth={1.2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="sma200"
                  name={t('research.series.sma200')}
                  stroke="var(--color-chart-4)"
                  strokeWidth={1.2}
                  strokeDasharray="4 3"
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[320px]" />
          )}
        </div>
      </CardContent>
    </Card>
  )
}
