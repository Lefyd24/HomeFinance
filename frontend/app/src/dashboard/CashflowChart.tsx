import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { useTranslation } from 'react-i18next'
import type { CashflowReport, NetWorthReport } from './reportsApi'
import { baseAxisStyle, compactNumber, polarityItemStyle, seriesHoverSafe, tooltipStyle, useChartTheme } from '../reports/chartTheme'

interface CashflowChartProps {
  cashflow: CashflowReport | undefined
  netWorth: NetWorthReport | undefined
}

export function CashflowChart({ cashflow, netWorth }: CashflowChartProps) {
  const { t } = useTranslation('dashboard')
  const theme = useChartTheme()

  const option = useMemo(() => {
    if (!cashflow || cashflow.labels.length === 0) return null

    const netWorthData = netWorth?.data ?? []
    const incomeLabel = t('cashflowChart.legend.income')
    const expensesLabel = t('cashflowChart.legend.expenses')
    const netWorthLabel = t('cashflowChart.legend.netWorth')

    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'cross' as const },
        ...tooltipStyle(theme),
      },
      legend: {
        data: [incomeLabel, expensesLabel, netWorthLabel],
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
          name: t('cashflowChart.yAxis.cashflow'),
          nameTextStyle: { color: theme.muted, fontSize: 11 },
          ...baseAxisStyle(theme),
          axisLine: { show: false },
          axisLabel: { color: theme.muted, fontSize: 11, formatter: compactNumber },
        },
        {
          type: 'value' as const,
          name: t('cashflowChart.yAxis.netWorth'),
          nameTextStyle: { color: theme.muted, fontSize: 11 },
          ...baseAxisStyle(theme),
          axisLine: { show: false },
          axisLabel: { color: theme.muted, fontSize: 11, formatter: compactNumber },
        },
      ],
      series: [
        {
          name: incomeLabel,
          type: 'bar' as const,
          ...seriesHoverSafe,
          data: cashflow.income,
          itemStyle: polarityItemStyle(theme, 'positive'),
        },
        {
          name: expensesLabel,
          type: 'bar' as const,
          ...seriesHoverSafe,
          data: cashflow.expenses,
          itemStyle: polarityItemStyle(theme, 'negative'),
        },
        {
          name: netWorthLabel,
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
  }, [cashflow, netWorth, theme, t])

  if (!option) {
    return <p className="text-muted-foreground text-sm">{t('cashflowChart.noData')}</p>
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
