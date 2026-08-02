import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { Chart, ChartFrame } from '../ChartFrame'
import { baseAxisStyle, tooltipStyle, useChartTheme, MAX_SERIES, seriesHoverSafe } from '../chartTheme'
import { formatCurrency } from '../../lib/format'
import { getCategoryBreakdown, getSpendingMom, getTopMerchants, getWeekdayHeatmap } from '../reportsPageApi'
import { formatPeriodLabel } from '../periodLabels'
import type { ReportFilters } from '../useReportFilters'

export function SpendingTab({ filters }: { filters: ReportFilters }) {
  const { t } = useTranslation('reports')
  const theme = useChartTheme()

  const { data: breakdown, isLoading: breakdownLoading } = useQuery({
    queryKey: ['reports', 'category-breakdown', filters.params],
    queryFn: () => getCategoryBreakdown(filters.params),
  })
  const { data: merchants, isLoading: merchantsLoading } = useQuery({
    queryKey: ['reports', 'top-merchants', filters.params],
    queryFn: () => getTopMerchants(filters.params, 10),
  })
  const { data: weekday, isLoading: weekdayLoading } = useQuery({
    queryKey: ['reports', 'weekday-heatmap', filters.params],
    queryFn: () => getWeekdayHeatmap(filters.params),
  })
  const { data: mom, isLoading: momLoading } = useQuery({
    queryKey: ['reports', 'spending-mom', filters.params],
    queryFn: () => getSpendingMom(filters.params),
  })

  /**
   * A treemap rather than a pie: area is far easier to compare than angle,
   * long category names fit inside their own tile, and the transaction count
   * rides along in the same rectangle without a second chart.
   */
  const treemapOption = useMemo(() => {
    const rows = breakdown?.categories ?? []
    if (rows.length === 0) return null

    const sorted = [...rows].sort((a, b) => b.amount - a.amount)
    const head = sorted.slice(0, MAX_SERIES)
    const tail = sorted.slice(MAX_SERIES)
    const items = tail.length
      ? [
          ...head,
          {
            name: t('series.otherCount', { count: tail.length }),
            amount: tail.reduce((sum, row) => sum + row.amount, 0),
            count: tail.reduce((sum, row) => sum + row.count, 0),
          },
        ]
      : head

    const total = items.reduce((sum, item) => sum + item.amount, 0)

    return {
      tooltip: {
        ...tooltipStyle(theme),
        formatter: (params: { name: string; value: number; data: { count: number } }) =>
          [
            `<strong>${params.name}</strong>`,
            formatCurrency(params.value),
            `<span style="opacity:.7">${t('spending.byCategory.tooltipShare', {
              pct: ((params.value / total) * 100).toFixed(1),
              count: params.data.count,
            })}</span>`,
          ].join('<br/>'),
      },
      series: [
        {
          type: 'treemap' as const,
          ...seriesHoverSafe,
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          width: '100%',
          height: '100%',
          top: 0,
          left: 0,
          itemStyle: { borderColor: theme.surface, borderWidth: 2, gapWidth: 2 },
          label: {
            show: true,
            color: '#ffffff',
            fontSize: 12,
            fontWeight: 600,
            overflow: 'truncate' as const,
            formatter: (params: { name: string; value: number }) =>
              `${params.name}\n${formatCurrency(params.value)}`,
          },
          data: items.map((item, index) => ({
            name: item.name,
            value: item.amount,
            count: item.count,
            itemStyle: { color: theme.seriesColor(index) },
          })),
        },
      ],
    }
  }, [breakdown, theme, t])

  const merchantOption = useMemo(() => {
    if (!merchants || merchants.labels.length === 0) return null
    const ordered = merchants.labels
      .map((name, index) => ({ name, value: merchants.data[index] ?? 0 }))
      .sort((a, b) => a.value - b.value)

    return {
      tooltip: {
        trigger: 'item' as const,
        ...tooltipStyle(theme),
        formatter: (params: { name: string; value: number }) =>
          `${params.name}<br/><strong>${formatCurrency(params.value)}</strong>`,
      },
      grid: { left: 4, right: 76, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: 'value' as const, show: false },
      yAxis: {
        type: 'category' as const,
        data: ordered.map((item) => item.name),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: theme.ink, fontSize: 12, width: 140, overflow: 'truncate' as const },
      },
      series: [
        {
          type: 'bar' as const,
          ...seriesHoverSafe,
          data: ordered.map((item) => item.value),
          barMaxWidth: 16,
          itemStyle: { color: theme.neutral, borderRadius: [0, 4, 4, 0] },
          label: {
            show: true,
            position: 'right' as const,
            color: theme.muted,
            fontSize: 11,
            formatter: (params: { value: number }) => formatCurrency(params.value),
          },
        },
      ],
    }
  }, [merchants, theme])

  /**
   * Month-over-month change is polarity, so it diverges from a zero line:
   * up is more spend, down is less. The arrow in each label carries the sign
   * independently of the colour.
   */
  const momOption = useMemo(() => {
    if (!mom || mom.labels.length < 2) return null
    // The first month has nothing to compare against; the API reports it as 0.
    const points = mom.labels.slice(1).map((label, index) => ({
      label,
      change: mom.changes[index + 1] ?? 0,
      amount: mom.data[index + 1] ?? 0,
    }))

    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        ...tooltipStyle(theme),
        formatter: (params: Array<{ dataIndex: number }>) => {
          const point = points[params[0]?.dataIndex ?? 0]
          const arrow = point.change >= 0 ? '▲' : '▼'
          return [
            `<strong>${formatPeriodLabel(point.label, t)}</strong>`,
            t('spending.mom.tooltipSpent', { amount: formatCurrency(point.amount) }),
            `<span style="opacity:.7">${t('spending.mom.tooltipChange', {
              arrow,
              pct: Math.abs(point.change).toFixed(1),
            })}</span>`,
          ].join('<br/>')
        },
      },
      grid: { left: 4, right: 8, top: 16, bottom: 8, containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: points.map((point) => formatPeriodLabel(point.label, t)),
        ...baseAxisStyle(theme),
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        ...baseAxisStyle(theme),
        axisLine: { show: false },
        axisLabel: { color: theme.muted, fontSize: 11, formatter: (value: number) => `${value}%` },
      },
      series: [
        {
          type: 'bar' as const,
          ...seriesHoverSafe,
          barMaxWidth: 26,
          data: points.map((point) => ({
            value: point.change,
            itemStyle: {
              // More spend than last month is the unwelcome direction here.
              color: point.change > 0 ? theme.negative : theme.positive,
              borderRadius: point.change >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4],
            },
            label: {
              show: true,
              position: (point.change >= 0 ? 'top' : 'bottom') as 'top' | 'bottom',
              color: theme.muted,
              fontSize: 11,
              formatter: `${point.change >= 0 ? '▲' : '▼'} ${Math.abs(point.change).toFixed(0)}%`,
            },
          })),
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: theme.axis, width: 1 },
            data: [{ yAxis: 0 }],
            label: { show: false },
          },
        },
      ],
    }
  }, [mom, theme, t])

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartFrame
          title={t('spending.byCategory.title')}
          hint={t('spending.byCategory.hint')}
          loading={breakdownLoading}
          isEmpty={!treemapOption}
          emptyMessage={t('spending.byCategory.empty')}
          height={340}
        >
          {treemapOption && <Chart option={treemapOption} height={340} />}
        </ChartFrame>

        <ChartFrame
          title={t('spending.merchants.title')}
          hint={t('spending.merchants.hint')}
          loading={merchantsLoading}
          isEmpty={!merchantOption}
          emptyMessage={t('spending.merchants.empty')}
          height={340}
        >
          {merchantOption && <Chart option={merchantOption} height={340} />}
        </ChartFrame>
      </div>

      <WeekdayRhythm data={weekday} loading={weekdayLoading} />

      <ChartFrame
        title={t('spending.mom.title')}
        hint={t('spending.mom.hint')}
        loading={momLoading}
        isEmpty={!momOption}
        emptyMessage={t('spending.mom.empty')}
        height={260}
      >
        {momOption && <Chart option={momOption} height={260} />}
      </ChartFrame>
    </div>
  )
}

/**
 * Seven cells, shaded by how much goes out on each weekday, with the heaviest
 * day named in words above them. Built from divs rather than a chart: at seven
 * values a plot is more machinery than the data deserves, and the sentence is
 * the part people act on.
 */
function WeekdayRhythm({
  data,
  loading,
}: {
  data: { weekdays: string[]; data: number[] } | undefined
  loading: boolean
}) {
  const { t } = useTranslation('reports')
  const theme = useChartTheme()
  const values = data?.data ?? []
  const total = values.reduce((sum, value) => sum + value, 0)
  const max = Math.max(...values, 0)
  const peakIndex = values.indexOf(max)
  const peakDayKey = data?.weekdays[peakIndex]
  const peakDay = peakDayKey ? t(`weekdays.${peakDayKey}` as 'weekdays.Mon') : undefined

  return (
    <ChartFrame
      title={t('spending.weekday.title')}
      hint={
        peakDay && total > 0
          ? t('spending.weekday.hintPeak', {
              day: peakDay,
              pct: ((max / total) * 100).toFixed(0),
            })
          : t('spending.weekday.hintDefault')
      }
      loading={loading}
      isEmpty={total === 0}
      emptyMessage={t('spending.weekday.empty')}
      height={110}
    >
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {(data?.weekdays ?? []).map((dayKey, index) => {
          const value = values[index] ?? 0
          const dayLabel = t(`weekdays.${dayKey}` as 'weekdays.Mon')
          // Five discrete steps of one hue: darker means more money out.
          const step = max > 0 ? Math.min(4, Math.floor((value / max) * 5)) : 0
          const isPeak = index === peakIndex && value > 0

          return (
            <Tooltip key={dayKey}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'flex flex-col items-center justify-center gap-1 rounded-lg border px-1 py-3 transition-transform hover:scale-[1.03]',
                    isPeak ? 'border-foreground/25' : 'border-transparent',
                  )}
                  style={{
                    backgroundColor: value > 0 ? theme.sequential[step] : 'transparent',
                    boxShadow: value > 0 ? 'none' : `inset 0 0 0 1px ${theme.grid}`,
                  }}
                >
                  <span
                    className="text-xs font-semibold"
                    style={{ color: value > 0 && step >= 3 ? '#ffffff' : theme.ink }}
                  >
                    {dayLabel}
                  </span>
                  <span
                    className="text-[11px] tabular-nums"
                    style={{ color: value > 0 && step >= 3 ? 'rgba(255,255,255,.85)' : theme.muted }}
                  >
                    {total > 0 ? `${((value / total) * 100).toFixed(0)}%` : '—'}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {t('spending.weekday.tooltip', { day: dayLabel, amount: formatCurrency(value) })}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </ChartFrame>
  )
}
