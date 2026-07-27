import { useQuery } from '@tanstack/react-query'
import ReactECharts from 'echarts-for-react'
import { BarChart3 } from 'lucide-react'
import { getSpendingReport } from '../dashboard/reportsApi'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { EmptyState } from '../ui/EmptyState'
import { ListCard } from '../ui/ListCard'
import { getCashflowReport, getNetWorthHistory } from './reportsPageApi'

export function ReportsPage() {
  const { data: spending, isLoading: spendingLoading } = useQuery({
    queryKey: ['reports', 'spending'],
    queryFn: () => getSpendingReport(),
  })
  const { data: cashflow, isLoading: cashflowLoading } = useQuery({
    queryKey: ['reports', 'cashflow'],
    queryFn: getCashflowReport,
  })
  const { data: netWorth, isLoading: netWorthLoading } = useQuery({
    queryKey: ['reports', 'net-worth'],
    queryFn: getNetWorthHistory,
  })

  const loading = spendingLoading || cashflowLoading || netWorthLoading
  const hasAny =
    (spending?.labels.length ?? 0) > 0 ||
    (cashflow?.labels.length ?? 0) > 0 ||
    (netWorth?.length ?? 0) > 0

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader title="Reports" description="Headline charts for spending, cashflow, and net worth." />

      {loading && <p className="text-muted-foreground">Loading reports…</p>}

      {!loading && !hasAny && (
        <EmptyState
          icon={BarChart3}
          title="No report data yet"
          description="Add transactions and accounts to populate these charts."
        />
      )}

      {spending && spending.labels.length > 0 && (
        <ListCard as="div">
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">Spending by category</h2>
          <ReactECharts
            option={{
              tooltip: { trigger: 'item' },
              series: [
                {
                  type: 'pie',
                  radius: ['50%', '70%'],
                  data: spending.labels.map((name, i) => ({
                    name,
                    value: spending.data[i] ?? 0,
                  })),
                },
              ],
            }}
            style={{ height: 240 }}
            opts={{ renderer: 'svg' }}
          />
        </ListCard>
      )}

      {cashflow && cashflow.labels.length > 0 && (
        <ListCard as="div">
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">Cashflow</h2>
          <ReactECharts
            option={{
              tooltip: { trigger: 'axis' },
              legend: { data: ['Income', 'Expenses'] },
              xAxis: { type: 'category', data: cashflow.labels },
              yAxis: { type: 'value' },
              series: [
                { type: 'bar', name: 'Income', data: cashflow.income },
                { type: 'bar', name: 'Expenses', data: cashflow.expenses },
              ],
            }}
            style={{ height: 240 }}
            opts={{ renderer: 'svg' }}
          />
        </ListCard>
      )}

      {netWorth && netWorth.length > 0 && (
        <ListCard as="div">
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">Net worth</h2>
          <ReactECharts
            option={{
              tooltip: { trigger: 'axis' },
              xAxis: { type: 'category', data: netWorth.map((p) => p.date) },
              yAxis: { type: 'value' },
              series: [{ type: 'line', data: netWorth.map((p) => p.net_worth), smooth: true }],
            }}
            style={{ height: 240 }}
            opts={{ renderer: 'svg' }}
          />
        </ListCard>
      )}
    </PageContainer>
  )
}
