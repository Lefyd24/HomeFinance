import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { CashflowReport, NetWorthReport } from './reportsApi'
import { baseAxisStyle, compactNumber, seriesHoverSafe, tooltipStyle, useChartTheme } from '../reports/chartTheme'

interface CashflowChartProps {
  cashflow: CashflowReport | undefined
  netWorth: NetWorthReport | undefined
}

export function CashflowChart({ cashflow, netWorth }: CashflowChartProps) {
  const theme = useChartTheme()

  const option = useMemo(() => {
    if (!cashflow || cashflow.labels.length === 0) return null

    const netWorthData = netWorth?.data ?? []

    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'cross' as const },
        ...tooltipStyle(theme),
      },
      legend: {
        data: ['Income', 'Expenses', 'Net Worth'],
        bottom: 0,
        textStyle: { color: theme.muted, fontSize: 11 },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '12%',
        containLabel: true,
      },
      xAxis: {
        type: 'category' as const,
        data: cashflow.labels,
        axisPointer: { type: 'shadow' as const },
        ...baseAxisStyle(theme),
        splitLine: { show: false },
      },
      yAxis: [
        {
          type: 'value' as const,
          name: 'Cashflow',
          nameTextStyle: { color: theme.muted, fontSize: 11 },
          ...baseAxisStyle(theme),
          axisLine: { show: false },
          axisLabel: { color: theme.muted, fontSize: 11, formatter: compactNumber },
        },
        {
          type: 'value' as const,
          name: 'Net Worth',
          nameTextStyle: { color: theme.muted, fontSize: 11 },
          ...baseAxisStyle(theme),
          axisLine: { show: false },
          axisLabel: { color: theme.muted, fontSize: 11, formatter: compactNumber },
        },
      ],
      series: [
        {
          name: 'Income',
          type: 'bar' as const,
          ...seriesHoverSafe,
          data: cashflow.income,
          itemStyle: { color: theme.positive },
        },
        {
          name: 'Expenses',
          type: 'bar' as const,
          ...seriesHoverSafe,
          data: cashflow.expenses,
          itemStyle: { color: theme.negative },
        },
        {
          name: 'Net Worth',
          type: 'line' as const,
          ...seriesHoverSafe,
          yAxisIndex: 1,
          data: netWorthData,
          smooth: true,
          itemStyle: { color: theme.neutral },
          lineStyle: { width: 2, color: theme.neutral },
        },
      ],
    }
  }, [cashflow, netWorth, theme])

  if (!option) {
    return <p className="text-muted-foreground text-sm">No cashflow data for this period.</p>
  }

  return (
    <ReactECharts
      option={option}
      style={{ height: 320, width: '100%' }}
      opts={{ renderer: 'svg' }}
      notMerge
    />
  )
}
