import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  Alert02Icon,
  Calendar03Icon,
  Delete02Icon,
  MoreVerticalIcon,
  PencilEdit02Icon,
  PiggyBankIcon,
  ChartHistogramIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { useConfirm } from '../ui/useConfirm'
import { ProgressBar, progressVariantForPercent } from '../ui/ProgressBar'
import { formatCurrency, formatDate } from '../lib/format'
import { cn } from '@/lib/utils'
import { useBudgets, useDeleteBudget } from './useBudgets'
import { useCategories } from '../categories/useCategories'
import { BudgetFormDialog } from './BudgetFormDialog'
import { BudgetDetailsSheet } from './BudgetDetailsSheet'
import type { Budget } from './budgetsApi'

function periodLabel(period: Budget['period']): string {
  return period.charAt(0).toUpperCase() + period.slice(1)
}

function budgetDateRange(budget: Budget): string | null {
  const start = budget.period_start ?? budget.start_date
  const end = budget.period_end ?? budget.end_date
  if (!start && !end) return null
  if (start && end) return `${formatDate(start)} – ${formatDate(end)}`
  return formatDate(start ?? end!)
}

function statusMeta(percentage: number): {
  label: string
  badge: 'destructive' | 'secondary' | 'outline'
  hint: string | null
} {
  if (percentage > 100) {
    return { label: 'Over', badge: 'destructive', hint: 'Budget exceeded' }
  }
  if (percentage > 90) {
    return { label: 'Almost', badge: 'secondary', hint: 'Budget almost exceeded' }
  }
  if (percentage === 0) {
    return { label: 'Unused', badge: 'outline', hint: null }
  }
  return { label: 'On track', badge: 'outline', hint: null }
}

export function BudgetsPage() {
  const { data: budgets = [], isLoading } = useBudgets()
  const { data: categories = [] } = useCategories()
  const deleteBudget = useDeleteBudget()
  const { confirm, confirmDialog } = useConfirm()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detailsBudget, setDetailsBudget] = useState<Budget | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const sortedBudgets = useMemo(
    () => [...budgets].sort((a, b) => b.percentage - a.percentage),
    [budgets],
  )

  useEffect(() => {
    if (sortedBudgets.length === 0) {
      setSelectedId(null)
      return
    }
    if (selectedId == null || !sortedBudgets.some((b) => b.id === selectedId)) {
      setSelectedId(sortedBudgets[0]!.id)
    }
  }, [sortedBudgets, selectedId])

  const selected = sortedBudgets.find((b) => b.id === selectedId) ?? null

  const summary = useMemo(() => {
    const totalBudgeted = budgets.reduce((sum, b) => sum + b.amount, 0)
    const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0)
    const totalRemaining = totalBudgeted - totalSpent
    const avgUsage =
      budgets.length > 0 ? budgets.reduce((sum, b) => sum + b.percentage, 0) / budgets.length : 0
    const overCount = budgets.filter((b) => b.percentage > 100).length
    const usagePct = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0
    return { totalBudgeted, totalSpent, totalRemaining, avgUsage, overCount, count: budgets.length, usagePct }
  }, [budgets])

  const categoryNameById = useMemo(() => {
    const map = new Map<number, string>()
    for (const c of categories) map.set(c.id, c.name)
    return map
  }, [categories])

  const handleAdd = () => {
    setEditingBudget(null)
    setDialogOpen(true)
  }

  const handleEdit = (budget: Budget) => {
    setEditingBudget(budget)
    setDialogOpen(true)
  }

  const handleDelete = async (budget: Budget) => {
    const ok = await confirm({
      title: `Delete ${budget.name}?`,
      description: 'Your spending stays; only the budget and its limit are removed.',
      confirmLabel: 'Delete budget',
    })
    if (!ok) return
    try {
      await deleteBudget.mutateAsync(budget.id)
      toast.success('Budget deleted')
      if (selectedId === budget.id) setSelectedId(null)
      if (detailsBudget?.id === budget.id) {
        setDetailsOpen(false)
        setDetailsBudget(null)
      }
    } catch {
      toast.error('Failed to delete budget')
    }
  }

  const handleViewDetails = (budget: Budget) => {
    setDetailsBudget(budget)
    setDetailsOpen(true)
  }

  return (
    <PageContainer wide>
      <PageHeader
        title="Budgets"
        description="Set spending limits for categories and periods. Monitor how much you've used and what's left before the budget resets."
        action={
          <Button size="sm" onClick={handleAdd}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
            Create Budget
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,20rem)_1fr] gap-4">
            <Skeleton className="h-80 w-full rounded-2xl" />
            <Skeleton className="h-80 w-full rounded-2xl" />
          </div>
        </div>
      ) : budgets.length === 0 ? (
        <Empty className="border border-dashed py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={PiggyBankIcon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>No budgets created yet</EmptyTitle>
            <EmptyDescription>
              Create a budget to watch how much you spend in each category before the period resets.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={handleAdd}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              Create your first budget
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Portfolio utilization narrative — not a StatStrip */}
          <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Portfolio utilization
                </p>
                <p className="mt-1 font-heading text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
                  {formatCurrency(summary.totalSpent)}
                  <span className="text-base font-medium text-muted-foreground sm:text-lg">
                    {' '}
                    of {formatCurrency(summary.totalBudgeted)}
                  </span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={summary.overCount > 0 ? 'destructive' : 'secondary'}>
                  {summary.overCount > 0
                    ? `${summary.overCount} over limit`
                    : `${summary.count} active`}
                </Badge>
                <Badge variant="outline" className="tabular-nums">
                  Avg {summary.avgUsage.toFixed(1)}%
                </Badge>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <ProgressBar
                value={summary.usagePct}
                variant={progressVariantForPercent(summary.usagePct)}
                className="h-3"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="tabular-nums">{summary.usagePct.toFixed(1)}% of all limits used</span>
                <span
                  className={cn(
                    'font-medium tabular-nums',
                    summary.totalRemaining < 0 ? 'text-destructive' : 'text-success',
                  )}
                >
                  {summary.totalRemaining < 0 ? '−' : ''}
                  {formatCurrency(Math.abs(summary.totalRemaining))}{' '}
                  {summary.totalRemaining < 0 ? 'over overall' : 'remaining overall'}
                </span>
              </div>
            </div>
          </section>

          {/* List + detail composition */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
            <aside className="rounded-2xl border border-border bg-card">
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">Active budgets</h2>
                <Badge variant="secondary">{summary.count}</Badge>
              </div>
              <ul className="flex flex-col gap-0.5 p-2" role="listbox" aria-label="Budgets">
                {sortedBudgets.map((budget) => {
                  const active = budget.id === selected?.id
                  const status = statusMeta(budget.percentage)
                  return (
                    <li key={budget.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => setSelectedId(budget.id)}
                        className={cn(
                          'flex w-full flex-col gap-2 rounded-xl px-3 py-2.5 text-start transition-colors',
                          active ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted/50',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">{budget.name}</span>
                          <Badge variant={status.badge} className="shrink-0 text-[10px]">
                            {status.label}
                          </Badge>
                        </div>
                        <ProgressBar
                          value={budget.percentage}
                          variant={progressVariantForPercent(budget.percentage)}
                          className="h-1.5"
                        />
                        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground tabular-nums">
                          <span>
                            {formatCurrency(budget.spent)} / {formatCurrency(budget.amount)}
                          </span>
                          <span
                            className={cn(
                              budget.percentage > 100 ? 'font-medium text-destructive' : undefined,
                            )}
                          >
                            {budget.percentage}%
                          </span>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </aside>

            {selected ? (
              <BudgetFocusPanel
                budget={selected}
                categoryNames={selected.category_ids
                  .map((id) => categoryNameById.get(id))
                  .filter((n): n is string => !!n)}
                onEdit={() => handleEdit(selected)}
                onDelete={() => handleDelete(selected)}
                onViewDetails={() => handleViewDetails(selected)}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                Select a budget to inspect period usage.
              </div>
            )}
          </div>
        </div>
      )}

      <BudgetFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        budget={editingBudget}
      />
      <BudgetDetailsSheet
        budget={detailsBudget}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />
      {confirmDialog}
    </PageContainer>
  )
}

function BudgetFocusPanel({
  budget,
  categoryNames,
  onEdit,
  onDelete,
  onViewDetails,
}: {
  budget: Budget
  categoryNames: string[]
  onEdit: () => void
  onDelete: () => void
  onViewDetails: () => void
}) {
  const status = statusMeta(budget.percentage)
  const range = budgetDateRange(budget)
  const spentShare = Math.min(budget.percentage, 100)
  const leftoverShare = Math.max(0, 100 - spentShare)

  return (
    <section className="rounded-2xl border border-border bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-heading text-lg font-semibold sm:text-xl">{budget.name}</h2>
            <Badge variant="outline" className="capitalize text-xs">
              {periodLabel(budget.period)}
            </Badge>
            <Badge variant={status.badge} className="text-xs">
              {status.label}
            </Badge>
          </div>
          {range && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <HugeiconsIcon icon={Calendar03Icon} strokeWidth={2} />
              <span>Current period · {range}</span>
            </p>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Budget actions">
              <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onEdit}>
                <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} data-icon="inline-start" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onViewDetails}>
                <HugeiconsIcon icon={ChartHistogramIcon} strokeWidth={2} data-icon="inline-start" />
                View details
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} data-icon="inline-start" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-col gap-5 p-4 sm:p-5">
        {/* Budget vs spent comparison layout */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-muted/40 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Spent</p>
            <p
              className={cn(
                'mt-1 font-heading text-3xl font-bold tabular-nums tracking-tight',
                budget.percentage > 100 ? 'text-destructive' : 'text-foreground',
              )}
            >
              {formatCurrency(budget.spent)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">{budget.percentage}% used</p>
          </div>
          <div className="rounded-xl bg-muted/40 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {budget.remaining < 0 ? 'Over by' : 'Remaining'}
            </p>
            <p
              className={cn(
                'mt-1 font-heading text-3xl font-bold tabular-nums tracking-tight',
                budget.remaining < 0 ? 'text-destructive' : 'text-success',
              )}
            >
              {formatCurrency(Math.abs(budget.remaining))}
            </p>
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              Limit {formatCurrency(budget.amount)}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex h-4 w-full overflow-hidden rounded-full border border-border bg-muted">
            <div
              className={cn(
                'h-full transition-[width] duration-500',
                budget.percentage > 100 ? 'bg-destructive' : 'bg-primary',
              )}
              style={{ width: `${spentShare}%` }}
              title="Spent"
            />
            {leftoverShare > 0 && (
              <div className="h-full bg-success/30" style={{ width: `${leftoverShare}%` }} title="Left" />
            )}
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Spent share</span>
            <span>Room left</span>
          </div>
        </div>

        {status.hint && (
          <div
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs',
              budget.percentage > 100
                ? 'border-destructive/30 bg-destructive/10 text-destructive'
                : 'border-border bg-muted/50 text-muted-foreground',
            )}
          >
            <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
            <span>{status.hint}</span>
          </div>
        )}

        {categoryNames.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Linked categories</p>
            <div className="flex flex-wrap gap-1.5">
              {categoryNames.map((name) => (
                <Badge key={name} variant="outline" className="text-xs">
                  {name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <Separator />

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onViewDetails}>
            <HugeiconsIcon icon={ChartHistogramIcon} strokeWidth={2} data-icon="inline-start" />
            View period details
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit}>
            <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} data-icon="inline-start" />
            Edit
          </Button>
        </div>
      </div>
    </section>
  )
}
