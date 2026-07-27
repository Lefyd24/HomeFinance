import ReactECharts from 'echarts-for-react'
import type { CashflowReport, NetWorthReport } from './reportsApi'

interface CashflowChartProps {
  cashflow: CashflowReport | undefined
  netWorth: NetWorthReport | undefined
}

export function CashflowChart({ cashflow, netWorth }: CashflowChartProps) {
  if (!cashflow || cashflow.labels.length === 0) {
    return <p className="text-muted-foreground text-sm">No cashflow data for this period.</p>
  }

  // Align net worth data with cashflow labels by index
  const netWorthData = netWorth?.data ?? []

  const option = {
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'cross' as const },
    },
    legend: {
      data: ['Income', 'Expenses', 'Net Worth'],
      bottom: 0,
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
    },
    yAxis: [
      {
        type: 'value' as const,
        name: 'Cashflow',
        axisLabel: {
          formatter: (value: number) => {
            return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${value}`
          },
        },
      },
      {
        type: 'value' as const,
        name: 'Net Worth',
        axisLabel: {
          formatter: (value: number) => {
            return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${value}`
          },
        },
      },
    ],
    series: [
      {
        name: 'Income',
        type: 'bar' as const,
        data: cashflow.income,
        itemStyle: { color: '#10b981' },
      },
      {
        name: 'Expenses',
        type: 'bar' as const,
        data: cashflow.expenses,
        itemStyle: { color: '#ef4444' },
      },
      {
        name: 'Net Worth',
        type: 'line' as const,
        yAxisIndex: 1,
        data: netWorthData,
        smooth: true,
        itemStyle: { color: '#3b82f6' },
        lineStyle: { width: 2 },
      },
    ],
  }

  return (
    <ReactECharts
      option={option}
      style={{ height: 320, width: '100%' }}
      opts={{ renderer: 'svg' }}
    />
  )
}
