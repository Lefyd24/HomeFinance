import { useQuery } from '@tanstack/react-query'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { ReportFilterBar } from './ReportFilterBar'
import { PeriodReadBand } from './PeriodReadBand'
import { getCashflowReport } from './reportsPageApi'
import { totalsFrom } from './periodRead'
import { previousPeriod, useReportFilters } from './useReportFilters'
import { OverviewTab } from './tabs/OverviewTab'
import { CashflowTab } from './tabs/CashflowTab'
import { SpendingTab } from './tabs/SpendingTab'
import { BudgetsTab } from './tabs/BudgetsTab'
import { DebtTab } from './tabs/DebtTab'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'cashflow', label: 'Cash flow' },
  { key: 'spending', label: 'Spending' },
  { key: 'budgets', label: 'Budgets' },
  { key: 'debt', label: 'Debt' },
] as const

export function ReportsPage() {
  const filters = useReportFilters()

  const { data: cashflow, isLoading: cashflowLoading } = useQuery({
    queryKey: ['reports', 'cashflow', filters.params],
    queryFn: () => getCashflowReport(filters.params),
  })

  // The same window, shifted back — every headline number is stated as a change.
  const { data: priorCashflow } = useQuery({
    queryKey: ['reports', 'cashflow', 'prior', filters.params],
    queryFn: () => getCashflowReport(previousPeriod(filters.params)),
  })

  return (
    <PageContainer wide className="pt-0">
      <ReportFilterBar filters={filters} />

      <PageHeader
        title="Reports"
        description="Pick a window, then read what happened in it."
        className="mb-5"
      />

      <div className="flex flex-col gap-5">
        <PeriodReadBand
          current={cashflow ? totalsFrom(cashflow) : null}
          previous={priorCashflow ? totalsFrom(priorCashflow) : null}
          loading={cashflowLoading}
          filters={filters}
        />

        <Tabs value={filters.tab} onValueChange={filters.setTab}>
          <TabsList className="mb-4 w-full justify-start overflow-x-auto">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab filters={filters} cashflow={cashflow} cashflowLoading={cashflowLoading} />
          </TabsContent>
          <TabsContent value="cashflow">
            <CashflowTab filters={filters} cashflow={cashflow} cashflowLoading={cashflowLoading} />
          </TabsContent>
          <TabsContent value="spending">
            <SpendingTab filters={filters} />
          </TabsContent>
          <TabsContent value="budgets">
            <BudgetsTab />
          </TabsContent>
          <TabsContent value="debt">
            <DebtTab />
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  )
}
