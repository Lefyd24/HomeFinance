import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, CircleAlert } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '../../ui/EmptyState'
import { cn } from '@/lib/utils'
import { formatCurrency } from '../../lib/format'
import { getBudgetPerformance } from '../reportsPageApi'

type Status = 'over' | 'tight' | 'ok'

/** Icon + word always accompany the colour, so state never rests on hue alone. */
const STATUS_META: Record<Status, { label: string; icon: typeof CheckCircle2; className: string }> = {
  over: { label: 'Over', icon: AlertTriangle, className: 'text-destructive' },
  tight: { label: 'Close', icon: CircleAlert, className: 'text-warning' },
  ok: { label: 'On track', icon: CheckCircle2, className: 'text-success' },
}

function statusFor(pct: number): Status {
  if (pct > 100) return 'over'
  if (pct >= 85) return 'tight'
  return 'ok'
}

export function BudgetsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'budget-performance'],
    queryFn: getBudgetPerformance,
  })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  const budgets = [...(data?.budgets ?? [])].sort((a, b) => b.pct - a.pct)

  if (budgets.length === 0) {
    return (
      <EmptyState
        icon={CircleAlert}
        title="No budgets to measure"
        description="Create a budget and this tab will show how close each one is to its limit."
      />
    )
  }

  const over = budgets.filter((budget) => budget.pct > 100)
  const tight = budgets.filter((budget) => budget.pct >= 85 && budget.pct <= 100)
  const totalLimit = budgets.reduce((sum, budget) => sum + budget.limit, 0)
  const totalSpent = budgets.reduce((sum, budget) => sum + budget.spent, 0)

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {over.length === 0 && tight.length === 0
              ? 'Every budget is comfortably inside its limit.'
              : over.length > 0
                ? `${over.length} budget${over.length === 1 ? ' is' : 's are'} over the limit.`
                : `${tight.length} budget${tight.length === 1 ? ' is' : 's are'} close to the limit.`}
          </CardTitle>
          <CardDescription>
            {formatCurrency(totalSpent)} spent against {formatCurrency(totalLimit)} budgeted, across{' '}
            {budgets.length} budget{budgets.length === 1 ? '' : 's'}. Sorted by how much of each is used.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {budgets.map((budget) => (
            <BudgetRow key={budget.name} {...budget} />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * The bar is scaled so the limit always sits at the same place on every row,
 * with any overspend drawn past it. A bar that simply stops at 100% hides the
 * one number that matters most — by how much you went over.
 */
function BudgetRow({
  name,
  limit,
  spent,
  pct,
}: {
  name: string
  limit: number
  spent: number
  pct: number
}) {
  const status = statusFor(pct)
  const meta = STATUS_META[status]
  const Icon = meta.icon

  // The track shows up to 130% of the limit; the limit marker sits at 100/130.
  const scaleMax = Math.max(130, pct)
  const limitMark = (100 / scaleMax) * 100
  const fill = Math.min(100, (pct / scaleMax) * 100)
  const overFill = pct > 100 ? ((pct - 100) / scaleMax) * 100 : 0

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={cn('size-4 shrink-0', meta.className)} />
          <p className="truncate text-sm font-medium">{name}</p>
          <span className={cn('text-xs font-medium shrink-0', meta.className)}>{meta.label}</span>
        </div>
        <p className="text-xs tabular-nums text-muted-foreground">
          {formatCurrency(spent)} of {formatCurrency(limit)} · {pct.toFixed(0)}%
        </p>
      </div>

      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'absolute inset-y-0 start-0 rounded-full',
            status === 'over' ? 'bg-destructive' : status === 'tight' ? 'bg-warning' : 'bg-success',
          )}
          style={{ width: `${status === 'over' ? limitMark : fill}%` }}
        />
        {overFill > 0 && (
          <div
            className="absolute inset-y-0 rounded-e-full bg-destructive/45"
            style={{ insetInlineStart: `${limitMark}%`, width: `${overFill}%` }}
          />
        )}
        <div
          className="absolute inset-y-0 w-px bg-foreground/45"
          style={{ insetInlineStart: `${limitMark}%` }}
          aria-hidden
        />
      </div>

      {pct > 100 && (
        <p className="mt-1.5 text-xs text-destructive">
          {formatCurrency(spent - limit)} over the limit.
        </p>
      )}
    </div>
  )
}
