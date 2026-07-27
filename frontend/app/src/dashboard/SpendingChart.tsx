import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { SpendingReport } from './reportsApi'
import { formatCurrency } from '../lib/format'

interface SpendingChartProps {
  report: SpendingReport | undefined
}

function readCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

export function SpendingChart({ report }: SpendingChartProps) {
  const option = useMemo(() => {
    if (!report || report.labels.length === 0) return null

    const pairs = report.labels
      .map((name, index) => ({ name, value: report.data[index] ?? 0 }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value)

    if (pairs.length === 0) return null

    const primary = readCssVar('--primary', '#0e7490')
    const muted = readCssVar('--muted-foreground', '#64748b')
    const border = readCssVar('--border', 'rgba(148,163,184,0.35)')
    const foreground = readCssVar('--foreground', '#0f172a')
    const max = Math.max(...pairs.map((p) => p.value))

    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        formatter: (params: Array<{ name: string; value: number }>) => {
          const item = params[0]
          if (!item) return ''
          return `${item.name}<br/>${formatCurrency(item.value)}`
        },
      },
      grid: {
        left: 8,
        right: 12,
        top: 36,
        bottom: pairs.length > 6 ? 72 : 48,
        containLabel: true,
      },
      xAxis: {
        type: 'category' as const,
        data: pairs.map((p) => p.name),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: border } },
        axisLabel: {
          color: muted,
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
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: border, type: 'dashed' as const } },
        axisLabel: {
          color: muted,
          formatter: (value: number) =>
            value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : `${value}`,
        },
      },
      series: [
        {
          type: 'bar' as const,
          data: pairs.map((p) => p.value),
          barMaxWidth: 44,
          itemStyle: {
            color: primary,
            borderRadius: [8, 8, 0, 0],
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 12,
              shadowColor: 'rgba(0,0,0,0.18)',
            },
          },
          label: {
            show: true,
            position: 'top' as const,
            color: foreground,
            fontSize: 11,
            fontWeight: 600,
            formatter: (params: { value: number }) => {
              // Hide labels on very short bars to reduce clutter; tooltip still has the value.
              if (params.value < max * 0.08 && pairs.length > 8) return ''
              return formatCurrency(params.value)
            },
          },
        },
      ],
    }
  }, [report])

  if (!option) {
    return <p className="text-muted-foreground text-sm">No spending data for this period.</p>
  }

  return (
    <ReactECharts
      option={option}
      style={{ height: 340, width: '100%' }}
      opts={{ renderer: 'svg' }}
      notMerge
    />
  )
}
