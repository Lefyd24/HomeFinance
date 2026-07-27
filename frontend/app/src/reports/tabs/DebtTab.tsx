import { useQuery } from '@tanstack/react-query'
import { Landmark } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { EmptyState } from '../../ui/EmptyState'
import { StatCard, StatStrip } from '../../ui/StatStrip'
import { formatCurrency, formatDate } from '../../lib/format'
import { getDebtInsights } from '../reportsPageApi'

export function DebtTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'debt-insights'],
    queryFn: getDebtInsights,
  })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  const debts = data?.debts ?? []

  if (debts.length === 0) {
    return (
      <EmptyState
        icon={Landmark}
        title="No debts tracked"
        description="Add a debt and this tab will show payoff progress, interest cost, and which one to clear first."
      />
    )
  }

  const totalOriginal = debts.reduce((sum, debt) => sum + debt.original_balance, 0)
  const totalPaid = totalOriginal - (data?.total_current ?? 0)
  const paidPct = totalOriginal > 0 ? (totalPaid / totalOriginal) * 100 : 0

  /**
   * Ordered highest interest rate first — the avalanche method. Paying the
   * dearest debt first costs the least overall, so that ordering is the
   * recommendation, and the page says so rather than making you infer it.
   */
  const byRate = [...debts].sort((a, b) => (b.interest_rate ?? 0) - (a.interest_rate ?? 0))
  const target = byRate[0]

  return (
    <div className="flex flex-col gap-4">
      <StatStrip className="xl:grid-cols-3">
        <StatCard
          label="Still owed"
          value={formatCurrency(data?.total_current ?? 0)}
          hint={`Across ${debts.length} debt${debts.length === 1 ? '' : 's'}`}
          tone="destructive"
        />
        <StatCard
          label="Paid down"
          value={formatCurrency(totalPaid)}
          hint={`${paidPct.toFixed(0)}% of the original ${formatCurrency(totalOriginal)}`}
          tone="success"
        />
        <StatCard
          label="Interest paid so far"
          value={formatCurrency(data?.total_interest_paid ?? 0)}
          hint="The part of your payments that bought nothing"
        />
      </StatStrip>

      {target && target.interest_rate ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Clear {target.name} first.</CardTitle>
            <CardDescription>
              At {target.interest_rate.toFixed(2)}% it is your most expensive debt, so every euro sent
              there saves more than the same euro sent anywhere else. Keep the minimum payment on the
              rest while you do it.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payoff progress</CardTitle>
          <CardDescription>Ordered by interest rate — most expensive first.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {byRate.map((debt) => (
            <div key={debt.name}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-sm font-medium">{debt.name}</p>
                  {debt.interest_rate !== null && (
                    <Badge variant="outline" className="shrink-0 tabular-nums">
                      {debt.interest_rate.toFixed(2)}%
                    </Badge>
                  )}
                </div>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {formatCurrency(debt.current_balance)} left of{' '}
                  {formatCurrency(debt.original_balance)}
                </p>
              </div>

              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full',
                    debt.paid_pct >= 100 ? 'bg-success' : 'bg-primary',
                  )}
                  style={{ width: `${Math.min(100, Math.max(0, debt.paid_pct))}%` }}
                />
              </div>

              <p className="mt-1.5 text-xs text-muted-foreground">
                {debt.paid_pct.toFixed(0)}% paid off
                {debt.projected_payoff
                  ? ` · clear by ${formatDate(debt.projected_payoff)} at the current minimum payment`
                  : ' · set a minimum payment to project a payoff date'}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
