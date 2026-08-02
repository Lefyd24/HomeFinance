import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { Chart, ChartFrame } from '../ChartFrame'
import { baseAxisStyle, compactNumber, tooltipStyle, useChartTheme, seriesHoverSafe } from '../chartTheme'
import { formatCurrency } from '../../lib/format'
import { getBalanceHistory, type CashflowReport } from '../reportsPageApi'
import { formatPeriodLabel } from '../periodLabels'
import type { ReportFilters } from '../useReportFilters'

export function CashflowTab({
  filters,
  cashflow,
  cashflowLoading,
}: {
  filters: ReportFilters
  cashflow: CashflowReport | undefined
  cashflowLoading: boolean
}) {
  const { t } = useTranslation('reports')
  const theme = useChartTheme()

  const { data: balances, isLoading: balancesLoading } = useQuery({
    queryKey: ['reports', 'balance-history', filters.params],
    queryFn: () => getBalanceHistory(filters.params),
  })

  const rows = useMemo(() => {
    if (!cashflow) return []
    return cashflow.labels.map((label, index) => {
      const income = cashflow.income[index] ?? 0
      const expenses = cashflow.expenses[index] ?? 0
      return { label, income, expenses, net: income - expenses }
    })
  }, [cashflow])

  const changeInBalanceLabel = t('series.changeInBalance')
  const totalLabel = t('series.total')

  /**
   * A waterfall, not another pair of bars. The overview already shows the two
   * flows side by side; the question this answers is different — how each
   * month pushed the running balance up or down, and where it stands now.
   * The floating bar carries that: its base is the running total, its length
   * is the month's contribution.
   */
  const waterfallOption = useMemo(() => {
    if (rows.length === 0) return null

    const bases: number[] = []
    const deltas: number[] = []
    let running = 0

    for (const row of rows) {
      bases.push(row.net >= 0 ? running : running + row.net)
      deltas.push(Math.abs(row.net))
      running += row.net
    }

    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        ...tooltipStyle(theme),
        formatter: (params: Array<{ dataIndex: number }>) => {
          const index = params[0]?.dataIndex ?? 0
          const row = rows[index]
          const cumulative = rows.slice(0, index + 1).reduce((sum, item) => sum + item.net, 0)
          const flowLabel =
            row.net >= 0
              ? t('cashflow.waterfall.tooltipAdded', { amount: formatCurrency(Math.abs(row.net)) })
              : t('cashflow.waterfall.tooltipDrewDown', { amount: formatCurrency(Math.abs(row.net)) })
          return [
            `<strong>${formatPeriodLabel(row.label, t)}</strong>`,
            flowLabel,
            `<span style="opacity:.7">${t('cashflow.waterfall.tooltipRunningTotal', { amount: formatCurrency(cumulative) })}</span>`,
          ].join('<br/>')
        },
      },
      grid: { left: 4, right: 8, top: 16, bottom: 8, containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: rows.map((row) => formatPeriodLabel(row.label, t)),
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
          type: 'bar' as const,
          stack: 'waterfall',
          silent: true,
          itemStyle: { color: 'transparent' },
          emphasis: { focus: 'none' as const, itemStyle: { color: 'transparent' } },
          data: bases,
        },
        {
          name: changeInBalanceLabel,
          type: 'bar' as const,
          stack: 'waterfall',
          ...seriesHoverSafe,
          barMaxWidth: 28,
          data: deltas.map((value, index) => ({
            value,
            itemStyle: {
              color: rows[index].net >= 0 ? theme.positive : theme.negative,
              borderRadius: 4,
            },
          })),
        },
      ],
    }
  }, [rows, theme, t, changeInBalanceLabel])

  /**
   * Balance history is one line per account plus a Total. The Total is the
   * one anyone reads first, so it gets the ink weight and the area fill;
   * the per-account lines stay thin behind it.
   */
  const balanceOption = useMemo(() => {
    if (!balances || balances.labels.length === 0) return null

    const accountSeries = balances.series.filter((entry) => entry.name !== 'Total')
    const total = balances.series.find((entry) => entry.name === 'Total')

    return {
      tooltip: {
        trigger: 'axis' as const,
        ...tooltipStyle(theme),
        valueFormatter: (value: number) => formatCurrency(value),
      },
      legend: {
        bottom: 0,
        type: 'scroll' as const,
        icon: 'roundRect',
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: theme.muted, fontSize: 11 },
      },
      grid: { left: 4, right: 8, top: 16, bottom: 44, containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: balances.labels,
        boundaryGap: false,
        ...baseAxisStyle(theme),
        splitLine: { show: false },
        axisLabel: {
          color: theme.muted,
          fontSize: 11,
          // One label per ~8 days keeps a six-month window readable.
          interval: Math.max(0, Math.floor(balances.labels.length / 8) - 1),
        },
      },
      yAxis: {
        type: 'value' as const,
        ...baseAxisStyle(theme),
        axisLine: { show: false },
        axisLabel: { color: theme.muted, fontSize: 11, formatter: compactNumber },
      },
      series: [
        ...accountSeries.map((entry, index) => ({
          name: entry.name,
          type: 'line' as const,
          ...seriesHoverSafe,
          data: entry.data,
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 1.5, color: theme.seriesColor(index) },
          itemStyle: { color: theme.seriesColor(index) },
        })),
        ...(total
          ? [
              {
                name: totalLabel,
                type: 'line' as const,
                ...seriesHoverSafe,
                data: total.data,
                smooth: true,
                showSymbol: false,
                z: 5,
                lineStyle: { width: 2.5, color: theme.ink },
                itemStyle: { color: theme.ink },
                areaStyle: { color: theme.ink, opacity: theme.isDark ? 0.1 : 0.06 },
              },
            ]
          : []),
      ],
    }
  }, [balances, theme, totalLabel])

  return (
    <div className="flex flex-col gap-4">
      <ChartFrame
        title={t('cashflow.waterfall.title')}
        hint={t('cashflow.waterfall.hint')}
        loading={cashflowLoading}
        isEmpty={!waterfallOption}
        emptyMessage={t('cashflow.waterfall.empty')}
        height={320}
      >
        {waterfallOption && <Chart option={waterfallOption} height={320} />}
      </ChartFrame>

      <ChartFrame
        title={t('cashflow.balanceHistory.title')}
        hint={t('cashflow.balanceHistory.hint')}
        loading={balancesLoading}
        isEmpty={!balanceOption}
        emptyMessage={t('cashflow.balanceHistory.empty')}
        height={320}
      >
        {balanceOption && <Chart option={balanceOption} height={320} />}
      </ChartFrame>

      <ChartFrame
        title={t('cashflow.table.title')}
        hint={t('cashflow.table.hint')}
        loading={cashflowLoading}
        isEmpty={rows.length === 0}
        emptyMessage={t('cashflow.table.empty')}
        height={200}
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('cashflow.table.period')}</TableHead>
                <TableHead className="text-end">{t('cashflow.table.moneyIn')}</TableHead>
                <TableHead className="text-end">{t('cashflow.table.moneyOut')}</TableHead>
                <TableHead className="text-end">{t('cashflow.table.net')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="font-medium">{formatPeriodLabel(row.label, t)}</TableCell>
                  <TableCell className="text-end tabular-nums">{formatCurrency(row.income)}</TableCell>
                  <TableCell className="text-end tabular-nums">{formatCurrency(row.expenses)}</TableCell>
                  <TableCell
                    className={cn(
                      'text-end font-semibold tabular-nums',
                      row.net >= 0 ? 'text-success' : 'text-destructive',
                    )}
                  >
                    {row.net >= 0 ? '+' : '−'}
                    {formatCurrency(Math.abs(row.net))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </ChartFrame>
    </div>
  )
}
