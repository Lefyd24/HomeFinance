import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAccounts } from '../accounts/useAccounts'
import { useBudgets } from '../budgets/useBudgets'
import { useGoals } from '../goals/useGoals'
import { useTransactions } from '../transactions/useTransactions'
import { queryKeys } from '../lib/queryKeys'
import { formatCurrency, formatDate, currentMonthRange } from '../lib/format'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { ProgressBar, progressVariantForPercent } from '../ui/ProgressBar'
import { StatCard, StatStrip } from '../ui/StatStrip'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { getSpendingReport } from './reportsApi'
import { listUpcomingDebtPayments, type UpcomingDebtPayment } from '../debts/debtsApi'
import { listUpcomingRecurringPayments, type UpcomingRecurringPayment } from '../recurring/recurringApi'
import { SpendingChart } from './SpendingChart'
import type { Account } from '../accounts/accountsApi'
import { AccountIcon, getAccountTypeMeta } from '../accounts/bankIcons'
import { cn } from '@/lib/utils'

export function DashboardPage() {
  const monthRange = currentMonthRange()

  const { data: accounts, isLoading: accountsLoading } = useAccounts()
  const { data: budgets, isLoading: budgetsLoading } = useBudgets()
  const { data: goals, isLoading: goalsLoading } = useGoals()

  const { data: txnData, isLoading: txnLoading } = useTransactions({
    ...monthRange,
    per_page: 100,
    page: 1,
  })

  const { data: recentTxnData, isLoading: recentTxnLoading } = useTransactions({
    page: 1,
    per_page: 5,
  })

  const { data: spendingReport, isLoading: reportLoading } = useQuery({
    queryKey: queryKeys.spendingReport(monthRange),
    queryFn: () => getSpendingReport(monthRange),
  })

  const { data: upcomingDebts, isLoading: debtsLoading } = useQuery({
    queryKey: queryKeys.upcomingDebtPayments,
    queryFn: () => listUpcomingDebtPayments(30),
  })

  const { data: upcomingRecurring, isLoading: recurringLoading } = useQuery({
    queryKey: queryKeys.upcomingRecurringPayments,
    queryFn: () => listUpcomingRecurringPayments(15),
  })

  const txns = txnData?.items ?? []
  const totalIncome = txns.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0)
  const totalExpenses = txns.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0)
  const netSaved = totalIncome - totalExpenses

  const totalBalance = accounts?.reduce((sum, acc) => sum + (acc.balance ?? 0), 0) ?? 0
  const accountCount = accounts?.length ?? 0

  const totalSpent = spendingReport?.data.reduce((a, b) => a + b, 0) ?? 0
  const topCategory =
    spendingReport && spendingReport.labels.length > 0
      ? { name: spendingReport.labels[0], amount: spendingReport.data[0] }
      : null
  const categoryCount = spendingReport?.labels.length ?? 0

  const activeGoals =
    goals?.filter((g) => g.status !== 'completed' && g.status !== 'cancelled').slice(0, 4) ?? []

  const upcomingPayments: Array<{
    id: string
    name: string
    amount: number
    dueDate: string
    daysUntil: number
    isOverdue: boolean
    type: 'debt' | 'recurring'
  }> = [
    ...(upcomingDebts ?? []).map((d: UpcomingDebtPayment) => ({
      id: `debt-${d.debt_id}`,
      name: d.debt_name,
      amount: d.amount,
      dueDate: d.due_date,
      daysUntil: d.days_until_due,
      isOverdue: d.is_overdue,
      type: 'debt' as const,
    })),
    ...(upcomingRecurring ?? []).map((r: UpcomingRecurringPayment) => ({
      id: `recurring-${r.id}`,
      name: r.name,
      amount: r.amount,
      dueDate: r.due_date,
      daysUntil: r.days_until_due,
      isOverdue: r.is_overdue,
      type: 'recurring' as const,
    })),
  ].sort((a, b) => a.daysUntil - b.daysUntil)

  return (
    <PageContainer wide className="flex flex-col gap-6">
      <PageHeader title="Dashboard" description="A snapshot of your balances, spending, and budgets." />

      <StatStrip>
        <StatCard
          label="Total Balance"
          value={accountsLoading ? '…' : formatCurrency(totalBalance)}
          hint={accountsLoading ? undefined : `${accountCount} account${accountCount === 1 ? '' : 's'}`}
          tone="primary"
        />
        <StatCard
          label="Income (this month)"
          value={txnLoading ? '…' : formatCurrency(totalIncome)}
          tone="success"
        />
        <StatCard
          label="Expenses (this month)"
          value={txnLoading ? '…' : formatCurrency(totalExpenses)}
          tone="destructive"
        />
        <StatCard
          label="Net Saved"
          value={txnLoading ? '…' : formatCurrency(netSaved)}
          tone={netSaved >= 0 ? 'success' : 'destructive'}
        />
      </StatStrip>

      {/* Account balances */}
      <Card>
        <CardHeader>
          <CardTitle>Account Balances</CardTitle>
          <CardDescription>Live balances across your linked accounts</CardDescription>
          <CardAction>
            <Link to="/accounts">
              <Button variant="ghost" size="sm">
                View all
              </Button>
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          {accountsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : (accounts?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No accounts yet. Add one on the Accounts page.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {accounts?.map((acc) => (
                <AccountBalanceCard key={acc.id} account={acc} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upcoming payments + Budget overview (one row, above pie chart) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Upcoming Payments</CardTitle>
            <CardDescription>Due in the next 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {debtsLoading || recurringLoading ? (
              <div className="flex flex-col gap-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : upcomingPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming payments in the next 30 days.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {upcomingPayments.slice(0, 5).map((payment) => (
                  <li key={payment.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{payment.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {payment.isOverdue ? (
                          <span className="text-destructive font-medium">Overdue</span>
                        ) : (
                          `Due ${formatDate(payment.dueDate)} (${payment.daysUntil} day${payment.daysUntil === 1 ? '' : 's'})`
                        )}
                      </p>
                    </div>
                    <div className="text-end shrink-0">
                      <p className="font-semibold text-sm tabular-nums">{formatCurrency(payment.amount)}</p>
                      <Badge variant={payment.type === 'debt' ? 'destructive' : 'secondary'} className="text-xs">
                        {payment.type}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle>Budget Overview</CardTitle>
            <CardDescription>How you are tracking this period</CardDescription>
            <CardAction>
              <Link to="/budgets">
                <Button variant="ghost" size="sm">
                  View all
                </Button>
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {budgetsLoading ? (
              <div className="flex flex-col gap-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : (budgets?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No budgets yet. Create one on the Budgets page.</p>
            ) : (
              <ul className="flex flex-col gap-4">
                {budgets?.slice(0, 4).map((budget) => (
                  <li key={budget.id}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="font-medium text-sm truncate">{budget.name}</p>
                      <p className="text-xs text-muted-foreground tabular-nums shrink-0">
                        {formatCurrency(budget.spent)} / {formatCurrency(budget.amount)}
                      </p>
                    </div>
                    <ProgressBar
                      value={budget.percentage}
                      variant={progressVariantForPercent(budget.percentage)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Spending pie chart */}
      <Card>
        <CardHeader>
          <CardTitle>Spending by Category</CardTitle>
          <CardDescription>Current month expenses by category</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Spent</p>
                <div className="text-lg font-semibold">
                  {reportLoading ? <Skeleton className="h-6 w-24" /> : formatCurrency(totalSpent)}
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Top Category</p>
                <div className="text-lg font-semibold">
                  {reportLoading ? (
                    <Skeleton className="h-6 w-24" />
                  ) : topCategory ? (
                    `${topCategory.name} (${formatCurrency(topCategory.amount)})`
                  ) : (
                    '—'
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Categories</p>
                <div className="text-lg font-semibold">
                  {reportLoading ? <Skeleton className="h-6 w-16" /> : categoryCount}
                </div>
              </div>
            </div>
            <Separator />
            {reportLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : (
              <SpendingChart report={spendingReport} />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Goals — full-width row above transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Goals</CardTitle>
          <CardDescription>Progress toward your savings targets</CardDescription>
          <CardAction>
            <Link to="/goals">
              <Button variant="ghost" size="sm">
                View all
              </Button>
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          {goalsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : activeGoals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active goals. Create one on the Goals page.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {activeGoals.map((goal) => (
                <div
                  key={goal.id}
                  className="rounded-xl border border-border bg-muted/40 p-4 flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm truncate">{goal.name}</p>
                    <Badge variant="outline" className="shrink-0 text-xs tabular-nums">
                      {Math.round(goal.progress_percentage ?? 0)}%
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatCurrency(goal.current_amount)} / {formatCurrency(goal.target_amount)}
                  </p>
                  <ProgressBar
                    value={goal.progress_percentage ?? 0}
                    variant={progressVariantForPercent(goal.progress_percentage ?? 0)}
                  />
                  {goal.target_date && (
                    <p className="text-xs text-muted-foreground">Target: {formatDate(goal.target_date)}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
          <CardDescription>Your latest activity</CardDescription>
          <CardAction>
            <Link to="/transactions">
              <Button variant="ghost" size="sm">
                View all
              </Button>
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          {recentTxnLoading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (recentTxnData?.items.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {recentTxnData?.items.map((txn) => (
                <li
                  key={txn.id}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{txn.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(txn.date)} · {txn.category_name ?? 'Uncategorized'}
                    </p>
                  </div>
                  <div className="text-end shrink-0">
                    <p
                      className={cn(
                        'font-semibold text-sm tabular-nums',
                        txn.type === 'income' && 'text-success',
                        txn.type === 'expense' && 'text-destructive',
                      )}
                    >
                      {txn.type === 'income' ? '+' : txn.type === 'expense' ? '−' : ''}
                      {formatCurrency(txn.amount)}
                    </p>
                    <Badge variant="outline" className="text-xs capitalize">
                      {txn.type}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link to="/transactions">
            <Button>Add Transaction</Button>
          </Link>
          <Link to="/import">
            <Button variant="outline">Import Data</Button>
          </Link>
          <Link to="/budgets">
            <Button variant="outline">Manage Budgets</Button>
          </Link>
        </div>
      </section>
    </PageContainer>
  )
}

function AccountBalanceCard({ account }: { account: Account }) {
  const meta = getAccountTypeMeta(account.type)
  const balance = account.balance ?? 0

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3">
      <AccountIcon icon={account.icon} type={account.type} className="size-10 rounded-lg" imageClassName="size-7" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm truncate" title={account.name}>
          {account.name}
        </p>
        <p className="text-xs text-muted-foreground capitalize">{meta.label}</p>
        <p
          className={cn(
            'text-sm font-semibold tabular-nums mt-0.5',
            balance >= 0 ? 'text-success' : 'text-destructive',
          )}
        >
          {formatCurrency(balance, account.currency)}
        </p>
      </div>
    </div>
  )
}
