import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { SpendingReport } from './reportsApi'
import { formatCurrency } from '../lib/format'
import { baseAxisStyle, seriesHoverSafe, tooltipStyle, useChartTheme } from '../reports/chartTheme'

interface SpendingChartProps {
  report: SpendingReport | undefined
  /** Category name → its own colour, so bars match the chips used elsewhere. */
  colorByLabel?: Record<string, string>
  height?: number
}

export function SpendingChart({ report, colorByLabel, height = 340 }: SpendingChartProps) {
  const theme = useChartTheme()

  const option = useMemo(() => {
    if (!report || report.labels.length === 0) return null

    const pairs = report.labels
      .map((name, index) => ({ name, value: report.data[index] ?? 0 }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value)

    if (pairs.length === 0) return null

    const max = Math.max(...pairs.map((p) => p.value))

    const barColor = (name: string) => colorByLabel?.[name] || theme.neutral

    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        ...tooltipStyle(theme),
        formatter: (params: Array<{ name: string; value: number }>) => {
          const item = params[0]
          if (!item) return ''
          return `${item.name}<br/>${formatCurrency(item.value)}`
        },
      },
      grid: {
        left: 8,
        right: 12,
        top: 28,
        bottom: 8,
        containLabel: true,
      },
      xAxis: {
        type: 'category' as const,
        data: pairs.map((p) => p.name),
        ...baseAxisStyle(theme),
        splitLine: { show: false },
        axisLabel: {
          color: theme.muted,
          interval: 0,
          rotate: pairs.length > 4 ? 35 : 0,
          hideOverlap: false,
          fontSize: 11,
          overflow: 'truncate' as const,
          width: pairs.length > 8 ? 64 : 88,
        },
      },
      yAxis: {
        type: 'value' as const,
        ...baseAxisStyle(theme),
        axisLine: { show: false },
        axisLabel: {
          color: theme.muted,
          formatter: (value: number) =>
            value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : `${value}`,
        },
      },
      series: [
        {
          type: 'bar' as const,
          ...seriesHoverSafe,
          data: pairs.map((p) => ({
            value: p.value,
            itemStyle: { color: barColor(p.name), borderRadius: [6, 6, 0, 0] },
          })),
          barMaxWidth: 44,
          itemStyle: {
            color: theme.neutral,
            borderRadius: [6, 6, 0, 0],
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 12,
              shadowColor: theme.isDark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.18)',
            },
          },
          label: {
            show: true,
            position: 'top' as const,
            color: theme.ink,
            fontSize: 11,
            fontWeight: 600,
            formatter: (params: { value: number }) => {
              if (params.value < max * 0.08 && pairs.length > 8) return ''
              return formatCurrency(params.value)
            },
          },
        },
      ],
    }
  }, [report, colorByLabel, theme])

  if (!option) {
    return <p className="text-muted-foreground text-sm">No spending data for this period.</p>
  }

  return (
    <ReactECharts
      option={option}
      style={{ height, width: '100%' }}
      opts={{ renderer: 'svg' }}
      notMerge
    />
  )
}
