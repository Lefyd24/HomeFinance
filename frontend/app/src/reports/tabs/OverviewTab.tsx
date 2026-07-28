import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Chart, ChartFrame } from '../ChartFrame'
import { baseAxisStyle, compactNumber, tooltipStyle, useChartTheme, MAX_SERIES, seriesHoverSafe } from '../chartTheme'
import { formatCurrency } from '../../lib/format'
import { getCategoryBreakdown, getSavingsRate, type CashflowReport } from '../reportsPageApi'
import type { ReportFilters } from '../useReportFilters'
import { formatPeriodLabel } from '../periodLabels'

export function OverviewTab({
  filters,
  cashflow,
  cashflowLoading,
}: {
  filters: ReportFilters
  cashflow: CashflowReport | undefined
  cashflowLoading: boolean
}) {
  const theme = useChartTheme()

  const { data: breakdown, isLoading: breakdownLoading } = useQuery({
    queryKey: ['reports', 'category-breakdown', filters.params],
    queryFn: () => getCategoryBreakdown(filters.params),
  })

  const { data: savings, isLoading: savingsLoading } = useQuery({
    queryKey: ['reports', 'savings-rate', filters.params],
    queryFn: () => getSavingsRate(filters.params),
  })

  /**
   * Income and expenses are the same measure (money, same currency), so they
   * share one axis. The net line rides that axis too — a second scale would
   * let the line cross the bars at an arbitrary place and imply a
   * relationship that isn't in the data.
   */
  const cashflowOption = useMemo(() => {
    const labels = cashflow?.labels ?? []
    if (!cashflow || labels.length === 0) return null
    const net = labels.map((_, index) => (cashflow.income[index] ?? 0) - (cashflow.expenses[index] ?? 0))

    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        ...tooltipStyle(theme),
        valueFormatter: (value: number) => formatCurrency(value),
      },
      legend: {
        bottom: 0,
        icon: 'roundRect',
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: theme.muted, fontSize: 11 },
      },
      grid: { left: 4, right: 8, top: 16, bottom: 40, containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: labels.map(formatPeriodLabel),
        ...baseAxisStyle(theme),
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        ...baseAxisStyle(theme),
        axisLine: { show: false },
        axisLabel: { color: theme.muted, fontSize: 11, formatter: compactNumber },
      },
      series: [
        {
          name: 'Money in',
          type: 'bar' as const,
          ...seriesHoverSafe,
          data: cashflow.income,
          barMaxWidth: 22,
          itemStyle: { color: theme.positive, borderRadius: [4, 4, 0, 0] },
        },
        {
          name: 'Money out',
          type: 'bar' as const,
          ...seriesHoverSafe,
          data: cashflow.expenses,
          barMaxWidth: 22,
          itemStyle: { color: theme.negative, borderRadius: [4, 4, 0, 0] },
        },
        {
          name: 'Net',
          type: 'line' as const,
          ...seriesHoverSafe,
          data: net,
          smooth: true,
          symbolSize: 8,
          lineStyle: { width: 2, color: theme.neutral },
          itemStyle: { color: theme.neutral, borderColor: theme.surface, borderWidth: 2 },
        },
      ],
    }
  }, [cashflow, theme])

  /**
   * Categories are ranked, so they run horizontally: the label sits beside its
   * bar and stays readable however long the name is. Past eight, the tail
   * folds into "Other" rather than inventing colours nobody can tell apart.
   */
  const rankedOption = useMemo(() => {
    const rows = breakdown?.categories ?? []
    if (rows.length === 0) return null

    const sorted = [...rows].sort((a, b) => b.amount - a.amount)
    const head = sorted.slice(0, MAX_SERIES)
    const tail = sorted.slice(MAX_SERIES)
    const items = tail.length
      ? [...head, { name: 'Other', amount: tail.reduce((sum, row) => sum + row.amount, 0), color: null, count: 0 }]
      : head

    // ECharts draws the first category at the bottom of a value/category pair.
    const ordered = [...items].reverse()

    return {
      tooltip: {
        trigger: 'item' as const,
        ...tooltipStyle(theme),
        formatter: (params: { name: string; value: number }) =>
          `${params.name}<br/><strong>${formatCurrency(params.value)}</strong>`,
      },
      grid: { left: 4, right: 72, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: 'value' as const, show: false },
      yAxis: {
        type: 'category' as const,
        data: ordered.map((item) => item.name),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: theme.ink, fontSize: 12, width: 110, overflow: 'truncate' as const },
      },
      series: [
        {
          type: 'bar' as const,
          ...seriesHoverSafe,
          data: ordered.map((item, index) => ({
            value: item.amount,
            itemStyle: {
              color: theme.seriesColor(ordered.length - 1 - index),
              borderRadius: [0, 4, 4, 0],
            },
          })),
          barMaxWidth: 18,
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
  }, [breakdown, theme])

  const savingsOption = useMemo(() => {
    if (!savings || savings.labels.length === 0) return null

    return {
      tooltip: {
        trigger: 'axis' as const,
        ...tooltipStyle(theme),
        valueFormatter: (value: number) => `${Number(value).toFixed(1)}%`,
      },
      grid: { left: 4, right: 8, top: 16, bottom: 8, containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: savings.labels.map(formatPeriodLabel),
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
          data: savings.rate.map((value) => ({
            value,
            itemStyle: {
              color: value >= 0 ? theme.positive : theme.negative,
              borderRadius: value >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4],
            },
          })),
          barMaxWidth: 26,
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: theme.axis, type: 'solid' as const, width: 1 },
            data: [{ yAxis: 0 }],
            label: { show: false },
          },
        },
      ],
    }
  }, [savings, theme])

  const rankedHeight = Math.max(240, Math.min((breakdown?.categories.length ?? 0) + 1, MAX_SERIES + 1) * 34 + 40)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartFrame
          className="xl:col-span-2"
          title="Money in, money out, and what was left"
          hint="Bars are the two flows; the line is what survived each period."
          loading={cashflowLoading}
          isEmpty={!cashflowOption}
          emptyMessage="No income or expenses landed in this range."
          height={340}
        >
          {cashflowOption && <Chart option={cashflowOption} height={340} />}
        </ChartFrame>

        <ChartFrame
          title="Where it went"
          hint="Expense categories, largest first."
          loading={breakdownLoading}
          isEmpty={!rankedOption}
          emptyMessage="No categorised expenses in this range."
          height={rankedHeight}
        >
          {rankedOption && <Chart option={rankedOption} height={rankedHeight} />}
        </ChartFrame>
      </div>

      <ChartFrame
        title="Savings rate by month"
        hint="Share of each month's income you did not spend. Below the line means you dipped into reserves."
        loading={savingsLoading}
        isEmpty={!savingsOption}
        emptyMessage="Needs at least one month with recorded income."
        height={220}
      >
        {savingsOption && <Chart option={savingsOption} height={220} />}
      </ChartFrame>
    </div>
  )
}
