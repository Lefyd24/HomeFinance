import { useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import {
  AlarmClockIcon,
  BankIcon,
  PiggyBankIcon,
  TagIcon,
  TargetIcon,
  WalletIcon,
} from '@hugeicons/core-free-icons'
import { useAccounts } from '../accounts/useAccounts'
import { useBudgets } from '../budgets/useBudgets'
import { useCategories } from '../categories/useCategories'
import { useGoals } from '../goals/useGoals'
import { useTransactions } from '../transactions/useTransactions'
import { queryKeys } from '../lib/queryKeys'
import { formatCurrency, formatDate, currentMonthRange } from '../lib/format'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { ProgressBar, progressVariantForPercent } from '../ui/ProgressBar'
import { Amount, CategoryChip, flowOfType, flowRail } from '../ui/money'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { getSpendingReport } from './reportsApi'
import { listUpcomingDebtPayments, type UpcomingDebtPayment } from '../debts/debtsApi'
import {
  listUpcomingRecurringPayments,
  type UpcomingRecurringPayment,
} from '../recurring/recurringApi'
import { SpendingChart } from './SpendingChart'
import type { Account } from '../accounts/accountsApi'
import { AccountIcon, getAccountTypeMeta } from '../accounts/bankIcons'
import { cn } from '@/lib/utils'

/** Consistent frame for every panel on the page: title, optional link, body. */
function Panel({
  title,
  hint,
  icon,
  to,
  linkLabel = 'View all',
  children,
  className,
}: {
  title: string
  hint?: string
  icon: IconSvgElement
  to?: string
  linkLabel?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'glass-panel flex min-w-0 flex-col rounded-xl border',
        className,
      )}
    >
      <header className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <HugeiconsIcon
          icon={icon}
          strokeWidth={2}
          className="size-4 shrink-0 text-muted-foreground"
        />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        {to && (
          <Button variant="ghost" size="sm" className="-me-1.5 shrink-0" asChild>
            <Link to={to}>{linkLabel}</Link>
          </Button>
        )}
      </header>
      <div className="min-w-0 flex-1 p-4">{children}</div>
    </section>
  )
}

function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
}

export function DashboardPage() {
  const monthRange = currentMonthRange()

  const { data: accounts, isLoading: accountsLoading } = useAccounts()
  const { data: budgets, isLoading: budgetsLoading } = useBudgets()
  const { data: goals, isLoading: goalsLoading } = useGoals()
  const { data: categories = [] } = useCategories()

  const { data: txnData, isLoading: txnLoading } = useTransactions({
    ...monthRange,
    per_page: 100,
    page: 1,
  })

  const { data: recentTxnData, isLoading: recentTxnLoading } = useTransactions({
    page: 1,
    per_page: 6,
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
  const totalIncome = txns
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0)
  const totalExpenses = txns
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0)
  const netSaved = totalIncome - totalExpenses

  const totalBalance = accounts?.reduce((sum, acc) => sum + (acc.balance ?? 0), 0) ?? 0
  const accountCount = accounts?.length ?? 0

  const totalSpent = spendingReport?.data.reduce((a, b) => a + b, 0) ?? 0
  const topCategory =
    spendingReport && spendingReport.labels.length > 0
      ? { name: spendingReport.labels[0], amount: spendingReport.data[0] }
      : null
  const categoryCount = spendingReport?.labels.length ?? 0

  const categoryColors = useMemo(() => {
    const map: Record<string, string> = {}
    for (const category of categories) {
      if (category.color) map[category.name] = category.color
    }
    return map
  }, [categories])

  const activeGoals =
    goals?.filter((g) => g.status !== 'completed' && g.status !== 'cancelled').slice(0, 4) ?? []

  const upcomingPayments = useMemo(
    () =>
      [
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
      ].sort((a, b) => a.daysUntil - b.daysUntil),
    [upcomingDebts, upcomingRecurring],
  )

  const upcomingTotal = upcomingPayments.reduce((sum, p) => sum + p.amount, 0)

  // Share of the month's income that stayed put. Drives the in/out bar.
  const inShare = totalIncome + totalExpenses > 0
    ? (totalIncome / (totalIncome + totalExpenses)) * 100
    : 0

  return (
    <PageContainer wide className="flex flex-col gap-5">
      <PageHeader
        title="Dashboard"
        description="This month at a glance."
        className="mb-0"
      />

      {/* The month in four figures and one bar. Everything below explains it. */}
      <section
        aria-label="This month"
        className="glass-panel rounded-xl border p-5"
      >
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Total balance
            </p>
            <p className="mt-1 font-heading text-4xl font-bold tabular-nums tracking-tight">
              {accountsLoading ? '…' : formatCurrency(totalBalance)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              across {accountCount} account{accountCount === 1 ? '' : 's'}
            </p>
          </div>
          <dl className="flex flex-wrap gap-x-8 gap-y-4">
            <Figure
              label="In this month"
              value={txnLoading ? '…' : formatCurrency(totalIncome)}
              tone="in"
            />
            <Figure
              label="Out this month"
              value={txnLoading ? '…' : formatCurrency(totalExpenses)}
              tone="out"
            />
            <Figure
              label="Net saved"
              value={txnLoading ? '…' : formatCurrency(netSaved)}
              tone={netSaved >= 0 ? 'in' : 'out'}
            />
          </dl>
        </div>

        {!txnLoading && totalIncome + totalExpenses > 0 && (
          <div className="mt-5 flex h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-flow-in" style={{ width: `${inShare}%` }} />
            <div className="h-full bg-flow-out" style={{ width: `${100 - inShare}%` }} />
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <Panel
          title="Spending by category"
          hint={
            reportLoading
              ? undefined
              : `${formatCurrency(totalSpent)} across ${categoryCount} categor${categoryCount === 1 ? 'y' : 'ies'}${topCategory ? ` · most on ${topCategory.name}` : ''}`
          }
          icon={TagIcon}
          to="/reports"
          linkLabel="Reports"
          className="lg:col-span-2"
        >
          {reportLoading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : (
            <SpendingChart report={spendingReport} colorByLabel={categoryColors} height={280} />
          )}
        </Panel>

        <Panel
          title="Due in 30 days"
          hint={
            debtsLoading || recurringLoading
              ? undefined
              : upcomingPayments.length === 0
                ? 'Nothing scheduled'
                : `${formatCurrency(upcomingTotal)} across ${upcomingPayments.length}`
          }
          icon={AlarmClockIcon}
          to="/recurring"
        >
          {debtsLoading || recurringLoading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : upcomingPayments.length === 0 ? (
            <EmptyLine>Nothing due in the next 30 days.</EmptyLine>
          ) : (
            <ul className="flex flex-col">
              {upcomingPayments.slice(0, 5).map((payment) => (
                <li
                  key={payment.id}
                  className={cn(
                    'flex items-center justify-between gap-3 border-b border-border/60 py-2 ps-2.5 last:border-b-0',
                    'border-s-2',
                    payment.isOverdue ? 'border-s-destructive' : 'border-s-flow-out',
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{payment.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {payment.isOverdue ? (
                        <span className="font-medium text-destructive">Overdue</span>
                      ) : payment.daysUntil === 0 ? (
                        'Due today'
                      ) : (
                        `In ${payment.daysUntil} day${payment.daysUntil === 1 ? '' : 's'} · ${formatDate(payment.dueDate)}`
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-end">
                    <Amount value={payment.amount} flow="out" signed={false} className="text-sm" />
                    <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                      {payment.type}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <Panel
          title="Accounts"
          hint={accountsLoading ? undefined : 'Live balances'}
          icon={WalletIcon}
          to="/accounts"
          className="lg:col-span-2"
        >
          {accountsLoading ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (accounts?.length ?? 0) === 0 ? (
            <EmptyLine>No accounts yet. Add one on the Accounts page.</EmptyLine>
          ) : (
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {accounts?.map((account) => (
                <AccountRow key={account.id} account={account} />
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Budgets"
          hint={budgetsLoading ? undefined : 'How this period is tracking'}
          icon={PiggyBankIcon}
          to="/budgets"
        >
          {budgetsLoading ? (
            <div className="flex flex-col gap-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (budgets?.length ?? 0) === 0 ? (
            <EmptyLine>No budgets yet.</EmptyLine>
          ) : (
            <ul className="flex flex-col gap-3.5">
              {budgets?.slice(0, 4).map((budget) => (
                <li key={budget.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium">{budget.name}</p>
                    <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
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
        </Panel>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <Panel
          title="Recent activity"
          hint="Your latest six entries"
          icon={BankIcon}
          to="/transactions"
          className="lg:col-span-2"
        >
          {recentTxnLoading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (recentTxnData?.items.length ?? 0) === 0 ? (
            <EmptyLine>Nothing recorded yet.</EmptyLine>
          ) : (
            <ul className="flex flex-col">
              {recentTxnData?.items.map((txn) => {
                const flow = flowOfType(txn.type)
                return (
                  <li
                    key={txn.id}
                    className={cn(
                      'flex items-center justify-between gap-3 border-b border-border/60 py-2 ps-2.5 last:border-b-0',
                      flowRail[flow],
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{txn.description}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(txn.date)}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {txn.type !== 'transfer' && (
                        <CategoryChip
                          name={txn.category_name}
                          color={txn.category_color}
                          className="hidden sm:inline-flex"
                        />
                      )}
                      <Amount value={txn.amount} flow={flow} className="text-sm" />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <Panel
          title="Goals"
          hint={goalsLoading ? undefined : 'Progress toward your targets'}
          icon={TargetIcon}
          to="/goals"
        >
          {goalsLoading ? (
            <div className="flex flex-col gap-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : activeGoals.length === 0 ? (
            <EmptyLine>No active goals.</EmptyLine>
          ) : (
            <ul className="flex flex-col gap-3.5">
              {activeGoals.map((goal) => (
                <li key={goal.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium">{goal.name}</p>
                    <Badge variant="outline" className="shrink-0 text-xs tabular-nums">
                      {Math.round(goal.progress_percentage ?? 0)}%
                    </Badge>
                  </div>
                  <ProgressBar
                    value={goal.progress_percentage ?? 0}
                    variant={progressVariantForPercent(goal.progress_percentage ?? 0)}
                  />
                  <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                    {formatCurrency(goal.current_amount)} of{' '}
                    {formatCurrency(goal.target_amount)}
                    {goal.target_date ? ` · by ${formatDate(goal.target_date)}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </PageContainer>
  )
}

function Figure({
  label,
  value,
  tone = 'plain',
}: {
  label: string
  value: string
  tone?: 'plain' | 'in' | 'out'
}) {
  return (
    <div>
      <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          'mt-1 font-heading text-2xl font-bold tabular-nums tracking-tight',
          tone === 'in' && 'text-flow-in',
          tone === 'out' && 'text-flow-out',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function AccountRow({ account }: { account: Account }) {
  const meta = getAccountTypeMeta(account.type)
  const balance = account.balance ?? 0

  return (
    <Link
      to={`/transactions?account_id=${account.id}`}
      className="flex items-center gap-2.5 border-b border-border/60 py-2 transition-colors hover:bg-muted/40"
    >
      <AccountIcon
        icon={account.icon}
        type={account.type}
        className="size-8 rounded-lg"
        imageClassName="size-6"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={account.name}>
          {account.name}
        </p>
        <p className={cn('text-xs', meta.text)}>{meta.label}</p>
      </div>
      <p
        className={cn(
          'shrink-0 text-sm font-semibold tabular-nums',
          balance >= 0 ? 'text-foreground' : 'text-flow-out',
        )}
      >
        {formatCurrency(balance, account.currency)}
      </p>
    </Link>
  )
}
