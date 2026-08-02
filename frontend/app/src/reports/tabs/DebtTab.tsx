import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('reports')
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
        title={t('debt.empty.title')}
        description={t('debt.empty.description')}
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
          label={t('debt.stats.stillOwed')}
          value={formatCurrency(data?.total_current ?? 0)}
          hint={t('debt.stats.across', { count: debts.length })}
          tone="destructive"
        />
        <StatCard
          label={t('debt.stats.paidDown')}
          value={formatCurrency(totalPaid)}
          hint={t('debt.stats.paidDownHint', {
            pct: paidPct.toFixed(0),
            amount: formatCurrency(totalOriginal),
          })}
          tone="success"
        />
        <StatCard
          label={t('debt.stats.interestPaid')}
          value={formatCurrency(data?.total_interest_paid ?? 0)}
          hint={t('debt.stats.interestHint')}
        />
      </StatStrip>

      {target && target.interest_rate ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('debt.recommendation.title', { name: target.name })}</CardTitle>
            <CardDescription>
              {t('debt.recommendation.description', { rate: target.interest_rate.toFixed(2) })}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('debt.progress.title')}</CardTitle>
          <CardDescription>{t('debt.progress.description')}</CardDescription>
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
                  {t('debt.progress.leftOf', {
                    current: formatCurrency(debt.current_balance),
                    original: formatCurrency(debt.original_balance),
                  })}
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
                {t('debt.progress.paidOff', { pct: debt.paid_pct.toFixed(0) })}
                {debt.projected_payoff
                  ? t('debt.progress.clearBy', { date: formatDate(debt.projected_payoff) })
                  : t('debt.progress.setMinimum')}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
