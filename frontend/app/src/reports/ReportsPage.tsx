import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ViewSelect } from '../ui/ViewSelect'
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

const TAB_KEYS = ['overview', 'cashflow', 'spending', 'budgets', 'debt'] as const

export function ReportsPage() {
  const { t } = useTranslation('reports')
  const filters = useReportFilters()

  const tabs = TAB_KEYS.map((key) => ({
    key,
    label: t(`tabs.${key}`),
  }))

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

      <PageHeader title={t('page.title')} description={t('page.description')} className="mb-5" />

      <div className="flex flex-col gap-5">
        <PeriodReadBand
          current={cashflow ? totalsFrom(cashflow) : null}
          previous={priorCashflow ? totalsFrom(priorCashflow) : null}
          loading={cashflowLoading}
          filters={filters}
        />

        <Tabs value={filters.tab} onValueChange={filters.setTab} className="w-full">
          {/* Phones get a dropdown instead of a strip. Five report names cannot
              share a phone-width row without either scrolling out of sight or
              shrinking past legibility — a Select shows the current one in full
              and puts the rest one tap away. */}
          <ViewSelect
            label={t('viewSelect.report')}
            value={filters.tab}
            onValueChange={filters.setTab}
            options={tabs.map((tab) => ({ value: tab.key, label: tab.label }))}
            className="mb-4 sm:hidden"
          />

          {/* No min-w-0 on the triggers: it let the flex line shrink them past
              their label width, which is what made these collide. */}
          <TabsList fullWidth className="mb-4 max-sm:hidden">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key} className="flex-1">
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
