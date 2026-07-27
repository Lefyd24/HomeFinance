import { useQuery } from '@tanstack/react-query'
import { useAccounts } from '../accounts/useAccounts'
import { useBudgets } from '../budgets/useBudgets'
import { queryKeys } from '../lib/queryKeys'
import { cn } from '@/lib/utils'
import { getSpendingReport } from './reportsApi'
import { SpendingChart } from './SpendingChart'

const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' })

export function DashboardPage() {
  const { data: accounts, isLoading: accountsLoading } = useAccounts()
  const { data: budgets, isLoading: budgetsLoading } = useBudgets()
  const { data: spendingReport, isLoading: reportLoading } = useQuery({
    queryKey: queryKeys.spendingReport(),
    queryFn: () => getSpendingReport(),
  })

  const totalBalance = accounts?.reduce((sum, acc) => sum + (acc.balance ?? 0), 0) ?? 0

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto flex flex-col gap-6">
      <h1 className="text-xl font-bold text-foreground">Dashboard</h1>

      <section className="p-4 rounded-xl bg-muted">
        <p className="text-sm text-muted-foreground">Total Balance</p>
        {accountsLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <p className="text-2xl font-bold text-primary">{currencyFormatter.format(totalBalance)}</p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-foreground mb-3">Spending by category</h2>
        {reportLoading ? (
          <p className="text-muted-foreground">Loading chart…</p>
        ) : (
          <SpendingChart report={spendingReport} />
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-foreground mb-3">Budgets</h2>
        {budgetsLoading && <p className="text-muted-foreground">Loading budgets…</p>}
        <ul className="flex flex-col gap-3">
          {budgets?.map((budget) => (
            <li key={budget.id} className="p-4 rounded-xl bg-muted">
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-foreground">{budget.name}</p>
                <p className="text-sm text-muted-foreground">
                  {currencyFormatter.format(budget.spent)} of {currencyFormatter.format(budget.amount)}
                </p>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden border border-border">
                <div
                  className={cn(
                    'h-full rounded-full',
                    budget.percentage >= 100 ? 'bg-destructive' : 'bg-primary',
                  )}
                  style={{ width: `${Math.min(budget.percentage, 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
