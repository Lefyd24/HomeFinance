import { useMemo, useState } from 'react'
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

type Tone = 'good' | 'watch' | 'over' | 'unused'

function budgetTone(percentage: number): Tone {
  if (percentage > 100) return 'over'
  if (percentage > 90) return 'watch'
  if (percentage === 0) return 'unused'
  return 'good'
}

const TONE_BAR: Record<Tone, string> = {
  good: 'bg-primary',
  watch: 'bg-amber-500',
  over: 'bg-destructive',
  unused: 'bg-border',
}

const TONE_BADGE: Record<Tone, { label: string; variant: 'destructive' | 'secondary' | 'outline' }> = {
  over: { label: 'Over', variant: 'destructive' },
  watch: { label: 'Almost', variant: 'secondary' },
  unused: { label: 'Unused', variant: 'outline' },
  good: { label: 'On track', variant: 'outline' },
}

export function BudgetsPage() {
  const { data: budgets = [], isLoading } = useBudgets()
  const { data: categories = [] } = useCategories()
  const deleteBudget = useDeleteBudget()
  const { confirm, confirmDialog } = useConfirm()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null)
  const [detailsBudget, setDetailsBudget] = useState<Budget | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const sortedBudgets = useMemo(
    () => [...budgets].sort((a, b) => b.percentage - a.percentage),
    [budgets],
  )

  const summary = useMemo(() => {
    const totalBudgeted = budgets.reduce((sum, b) => sum + b.amount, 0)
    const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0)
    const totalRemaining = totalBudgeted - totalSpent
    const overCount = budgets.filter((b) => b.percentage > 100).length
    const usagePct = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0
    return { totalBudgeted, totalSpent, totalRemaining, overCount, count: budgets.length, usagePct }
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
        description="Set spending limits for categories and periods. Scan every envelope at a glance, drill into one when you need the history."
        action={
          <Button size="sm" onClick={handleAdd}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
            Create Budget
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-64 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
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
        <div className="flex flex-col gap-5">
          {/* Ledger tape — the whole envelope portfolio, one line */}
          <section className="glass-panel overflow-hidden rounded-xl border">
            <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-5">
              <div className="flex items-baseline gap-2.5">
                <span className="font-heading text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
                  {formatCurrency(summary.totalSpent)}
                </span>
                <span className="text-sm text-muted-foreground sm:text-base">
                  spent of {formatCurrency(summary.totalBudgeted)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={summary.overCount > 0 ? 'destructive' : 'secondary'}>
                  {summary.overCount > 0 ? `${summary.overCount} over limit` : `${summary.count} envelopes`}
                </Badge>
                <span
                  className={cn(
                    'text-sm font-medium tabular-nums',
                    summary.totalRemaining < 0 ? 'text-destructive' : 'text-success',
                  )}
                >
                  {summary.totalRemaining < 0 ? '−' : ''}
                  {formatCurrency(Math.abs(summary.totalRemaining))}{' '}
                  {summary.totalRemaining < 0 ? 'over' : 'left'}
                </span>
              </div>
            </div>
            {/* receipt-tape meter: one tick per budget, proportional to its own limit */}
            <div className="flex h-2 w-full gap-px bg-border/60 px-px">
              {sortedBudgets.map((budget) => {
                const share = summary.totalBudgeted > 0 ? (budget.amount / summary.totalBudgeted) * 100 : 100 / sortedBudgets.length
                const tone = budgetTone(budget.percentage)
                return (
                  <div key={budget.id} className="h-full min-w-[3px]" style={{ width: `${share}%` }}>
                    <div className={cn('h-full', TONE_BAR[tone])} style={{ opacity: 0.85 }} />
                  </div>
                )
              })}
            </div>
          </section>

          {/* Envelope grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sortedBudgets.map((budget) => (
              <BudgetCard
                key={budget.id}
                budget={budget}
                categoryNames={budget.category_ids
                  .map((id) => categoryNameById.get(id))
                  .filter((n): n is string => !!n)}
                onEdit={() => handleEdit(budget)}
                onDelete={() => handleDelete(budget)}
                onViewDetails={() => handleViewDetails(budget)}
              />
            ))}
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

function BudgetCard({
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
  const tone = budgetTone(budget.percentage)
  const status = TONE_BADGE[tone]
  const range = budgetDateRange(budget)
  const visibleCategories = categoryNames.slice(0, 3)
  const extraCategories = categoryNames.length - visibleCategories.length

  return (
    <section className="glass-panel flex flex-col overflow-hidden rounded-xl border">
      <div className={cn('h-1 w-full', TONE_BAR[tone])} />

      <div className="flex items-start justify-between gap-2 px-4 pt-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 className="truncate font-heading text-base font-semibold sm:text-lg">{budget.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] capitalize">
              {periodLabel(budget.period)}
            </Badge>
            <Badge variant={status.variant} className="text-[10px]">
              {status.label}
            </Badge>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`${budget.name} actions`} className="shrink-0">
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

      {range && (
        <p className="mt-2 flex items-center gap-1.5 px-4 text-xs text-muted-foreground sm:px-5">
          <HugeiconsIcon icon={Calendar03Icon} strokeWidth={2} />
          <span>{range}</span>
        </p>
      )}

      <div className="mt-3 flex items-end justify-between gap-2 px-4 sm:px-5">
        <div>
          <p
            className={cn(
              'font-heading text-2xl font-bold tabular-nums tracking-tight',
              budget.percentage > 100 ? 'text-destructive' : 'text-foreground',
            )}
          >
            {formatCurrency(budget.spent)}
          </p>
          <p className="text-xs text-muted-foreground">of {formatCurrency(budget.amount)} limit</p>
        </div>
        <p
          className={cn(
            'shrink-0 text-end text-sm font-semibold tabular-nums',
            budget.remaining < 0 ? 'text-destructive' : 'text-success',
          )}
        >
          {budget.remaining < 0 ? '−' : ''}
          {formatCurrency(Math.abs(budget.remaining))}
          <span className="block text-[10px] font-normal text-muted-foreground">
            {budget.remaining < 0 ? 'over' : 'remaining'}
          </span>
        </p>
      </div>

      <div className="mt-2.5 px-4 sm:px-5">
        <ProgressBar value={budget.percentage} variant={progressVariantForPercent(budget.percentage)} className="h-1.5" />
      </div>

      {tone === 'over' || tone === 'watch' ? (
        <div className="mx-4 mt-3 flex items-center gap-1.5 rounded-lg border border-destructive/25 bg-destructive/8 px-2.5 py-1.5 text-xs text-destructive sm:mx-5">
          <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
          <span>{tone === 'over' ? 'Budget exceeded' : 'Almost at the limit'}</span>
        </div>
      ) : null}

      {/* perforated stub — separates the numbers from the footer, like a receipt tear line */}
      <div
        className="mx-4 mt-4 h-px sm:mx-5"
        style={{
          backgroundImage: 'repeating-linear-gradient(to right, var(--border) 0 6px, transparent 6px 11px)',
        }}
      />

      <div className="flex min-h-8 flex-wrap items-center gap-1.5 px-4 py-3 sm:px-5">
        {visibleCategories.length > 0 ? (
          <>
            {visibleCategories.map((name) => (
              <Badge key={name} variant="outline" className="text-[10px]">
                {name}
              </Badge>
            ))}
            {extraCategories > 0 && (
              <Badge variant="outline" className="text-[10px]">
                +{extraCategories}
              </Badge>
            )}
          </>
        ) : (
          <span className="text-xs text-muted-foreground">All categories</span>
        )}
      </div>

      <div className="mt-auto flex gap-2 border-t border-border px-4 py-3 sm:px-5">
        <Button size="sm" variant="outline" className="flex-1" onClick={onViewDetails}>
          <HugeiconsIcon icon={ChartHistogramIcon} strokeWidth={2} data-icon="inline-start" />
          Period details
        </Button>
        <Button size="sm" variant="ghost" onClick={onEdit} aria-label={`Edit ${budget.name}`}>
          <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
        </Button>
      </div>
    </section>
  )
}
