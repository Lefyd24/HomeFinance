import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  Calendar03Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  InformationCircleIcon,
  MoneyReceive01Icon,
  MoreVerticalIcon,
  PencilEdit02Icon,
  TargetIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { useConfirm } from '../ui/useConfirm'
import { formatCurrency, formatDate } from '../lib/format'
import { cn } from '@/lib/utils'
import { useDeleteGoal, useGoals, useUpdateGoal } from './useGoals'
import { GoalFormDialog } from './GoalFormDialog'
import { ContributeSheet } from './ContributeSheet'
import { GoalDetailsSheet } from './GoalDetailsSheet'
import { ProgressRing } from './ProgressRing'
import {
  categoryLabel,
  goalPercentage,
  isGoalComplete,
  pickPrimaryGoal,
  remainingAmount,
} from './goalMeta'
import type { Goal } from './goalsApi'
import { EmptyState } from '@/ui/EmptyState'

type FilterTab = 'active' | 'completed' | 'all'

export function GoalsPage() {
  const { data: goals = [], isLoading } = useGoals()
  const deleteGoal = useDeleteGoal()
  const { confirm, confirmDialog } = useConfirm()
  const updateGoal = useUpdateGoal()

  const [filter, setFilter] = useState<FilterTab>('active')
  const [formOpen, setFormOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null)
  const [contributeGoal, setContributeGoal] = useState<Goal | null>(null)
  const [detailsGoal, setDetailsGoal] = useState<Goal | null>(null)

  const filtered = useMemo(() => {
    if (filter === 'active') {
      return goals.filter((g) => !isGoalComplete(g) && g.status !== 'cancelled')
    }
    if (filter === 'completed') {
      return goals.filter((g) => isGoalComplete(g))
    }
    return goals
  }, [goals, filter])

  const primary = useMemo(() => pickPrimaryGoal(filtered), [filtered])
  const secondary = useMemo(
    () => filtered.filter((g) => g.id !== primary?.id),
    [filtered, primary],
  )

  const journey = useMemo(() => {
    const totalTarget = goals.reduce((sum, g) => sum + g.target_amount, 0)
    const totalSaved = goals.reduce((sum, g) => sum + g.current_amount, 0)
    const overall = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0
    const active = goals.filter((g) => !isGoalComplete(g) && g.status !== 'cancelled').length
    const completed = goals.filter(isGoalComplete).length
    return { totalTarget, totalSaved, overall, active, completed, count: goals.length }
  }, [goals])

  const openCreate = () => {
    setEditingGoal(null)
    setFormOpen(true)
  }

  const openEdit = (goal: Goal) => {
    setDetailsGoal(null)
    setEditingGoal(goal)
    setFormOpen(true)
  }

  const openContribute = (goal: Goal) => {
    setDetailsGoal(null)
    setContributeGoal(goal)
  }

  const openDetails = (goal: Goal) => {
    setDetailsGoal(goal)
  }

  const handleDelete = async (goal: Goal) => {
    const ok = await confirm({
      title: `Delete ${goal.name}?`,
      description: 'The goal and its progress history are removed. This cannot be undone.',
      confirmLabel: 'Delete goal',
    })
    if (!ok) return
    try {
      await deleteGoal.mutateAsync(goal.id)
      toast.success('Goal deleted')
      if (detailsGoal?.id === goal.id) setDetailsGoal(null)
    } catch {
      toast.error('Failed to delete goal')
    }
  }

  const handleMarkComplete = async (goal: Goal) => {
    try {
      await updateGoal.mutateAsync({ id: goal.id, input: { status: 'completed' } })
      toast.success('Goal marked complete')
    } catch {
      toast.error('Failed to update goal')
    }
  }

  return (
    <PageContainer wide>
      <PageHeader
        title="Goals"
        description="Chase targets with a clear finish line — contribute, track, and celebrate."
        action={
          <Button size="sm" onClick={openCreate}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
            Add goal
          </Button>
        }
      />

      {isLoading ? (
        <GoalsSkeleton />
      ) : goals.length === 0 ? (
        <EmptyState
          icon={<HugeiconsIcon icon={TargetIcon} strokeWidth={2} />}
          title="No goals yet"
          description="Create your first financial goal to start tracking progress toward a target."
          action={
            <Button size="sm" onClick={openCreate}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              Create first goal
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          <JourneyStrip journey={journey} />

          {primary && (
            <PrimaryGoalHero
              goal={primary}
              onContribute={() => openContribute(primary)}
              onDetails={() => openDetails(primary)}
              onEdit={() => openEdit(primary)}
              onDelete={() => handleDelete(primary)}
              onMarkComplete={() => handleMarkComplete(primary)}
            />
          )}

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-heading text-lg font-semibold tracking-tight">Your goals</h2>
              <Tabs
                value={filter}
                onValueChange={(v) => setFilter(v as FilterTab)}
              >
                <TabsList>
                  <TabsTrigger value="active">Active</TabsTrigger>
                  <TabsTrigger value="completed">Completed</TabsTrigger>
                  <TabsTrigger value="all">All</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No {filter === 'all' ? '' : filter} goals in this view.
              </p>
            ) : secondary.length === 0 && primary ? (
              <p className="text-sm text-muted-foreground py-2">
                Spotlight goal above is your only {filter === 'all' ? '' : `${filter} `}goal.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {secondary.map((goal) => (
                  <GoalListRow
                    key={goal.id}
                    goal={goal}
                    onContribute={() => openContribute(goal)}
                    onDetails={() => openDetails(goal)}
                    onEdit={() => openEdit(goal)}
                    onDelete={() => handleDelete(goal)}
                    onMarkComplete={() => handleMarkComplete(goal)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <GoalFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditingGoal(null)
        }}
        goal={editingGoal}
      />
      <ContributeSheet
        open={!!contributeGoal}
        onOpenChange={(open) => {
          if (!open) setContributeGoal(null)
        }}
        goal={contributeGoal}
      />
      <GoalDetailsSheet
        open={!!detailsGoal}
        onOpenChange={(open) => {
          if (!open) setDetailsGoal(null)
        }}
        goal={detailsGoal}
        onContribute={openContribute}
        onEdit={openEdit}
      />
      {confirmDialog}
    </PageContainer>
  )
}

function JourneyStrip({
  journey,
}: {
  journey: {
    totalTarget: number
    totalSaved: number
    overall: number
    active: number
    completed: number
    count: number
  }
}) {
  const clamped = Math.min(Math.max(journey.overall, 0), 100)
  return (
    <section
      aria-label="Savings journey"
      className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-muted/40 p-5 sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Savings journey
          </p>
          <p className="mt-1 font-heading text-2xl sm:text-3xl font-bold tracking-tight tabular-nums">
            {clamped.toFixed(0)}%
            <span className="ms-2 text-base font-medium text-muted-foreground">
              of {formatCurrency(journey.totalTarget)} targeted
            </span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatCurrency(journey.totalSaved)} saved across {journey.count} goal
            {journey.count === 1 ? '' : 's'} · {journey.active} active · {journey.completed}{' '}
            completed
          </p>
        </div>
        <ProgressRing value={clamped} size={72} strokeWidth={7}>
          <span className="text-xs font-semibold tabular-nums">{clamped.toFixed(0)}%</span>
        </ProgressRing>
      </div>
      <Progress value={clamped} className="mt-4 h-1.5" />
    </section>
  )
}

function PrimaryGoalHero({
  goal,
  onContribute,
  onDetails,
  onEdit,
  onDelete,
  onMarkComplete,
}: {
  goal: Goal
  onContribute: () => void
  onDetails: () => void
  onEdit: () => void
  onDelete: () => void
  onMarkComplete: () => void
}) {
  const percentage = goalPercentage(goal)
  const clamped = Math.min(Math.max(percentage, 0), 100)
  const complete = isGoalComplete(goal)
  const remaining = remainingAmount(goal)

  return (
    <section
      aria-label={`Primary goal: ${goal.name}`}
      className={cn(
        'glass-panel relative overflow-hidden rounded-xl border',
        complete ? 'border-success/40 bg-success/5' : 'border-primary/25',
      )}
    >
      <div
        className="pointer-events-none absolute inset-y-0 end-0 w-1/2 opacity-30"
        style={{
          background: `radial-gradient(circle at 80% 40%, ${goal.color || 'var(--primary)'}55, transparent 65%)`,
        }}
        aria-hidden
      />

      <div className="relative flex flex-col gap-6 p-5 sm:p-8 lg:flex-row lg:items-center">
        <ProgressRing
          value={clamped}
          size={160}
          strokeWidth={12}
          complete={complete}
          accent={goal.color}
          className="mx-auto lg:mx-0 shrink-0"
        >
          <div className="flex flex-col items-center gap-1">
            <span className="text-3xl leading-none" aria-hidden>
              {goal.icon || '🎯'}
            </span>
            <span className="text-lg font-heading font-bold tabular-nums">{clamped.toFixed(0)}%</span>
          </div>
        </ProgressRing>

        <div className="min-w-0 flex-1 flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  Spotlight
                </Badge>
                {goal.is_primary && <Badge className="text-xs">Primary</Badge>}
                {complete && (
                  <Badge variant="secondary" className="text-xs">
                    Completed
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs capitalize">
                  {categoryLabel(goal.category)}
                </Badge>
              </div>
              <h2 className="mt-2 font-heading text-2xl sm:text-3xl font-bold tracking-tight truncate">
                {goal.name}
              </h2>
              {goal.description && (
                <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{goal.description}</p>
              )}
            </div>
            <GoalActionsMenu
              goal={goal}
              onContribute={onContribute}
              onDetails={onDetails}
              onEdit={onEdit}
              onDelete={onDelete}
              onMarkComplete={onMarkComplete}
            />
          </div>

          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p
              className={cn(
                'text-3xl font-heading font-bold tabular-nums tracking-tight',
                complete ? 'text-success' : 'text-foreground',
              )}
            >
              {formatCurrency(goal.current_amount, goal.currency)}
            </p>
            <p className="text-sm text-muted-foreground tabular-nums">
              of {formatCurrency(goal.target_amount, goal.currency)}
              {!complete && remaining > 0 && (
                <> · {formatCurrency(remaining, goal.currency)} to go</>
              )}
            </p>
          </div>

          {goal.monthly_contribution_needed != null &&
            goal.monthly_contribution_needed > 0 &&
            goal.target_date &&
            !complete && (
              <p className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                Save{' '}
                <span className="font-semibold tabular-nums">
                  {formatCurrency(goal.monthly_contribution_needed, goal.currency)}
                </span>
                /month to arrive by {formatDate(goal.target_date)}
              </p>
            )}

          {goal.target_date && (
            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <HugeiconsIcon icon={Calendar03Icon} strokeWidth={2} />
              Target {formatDate(goal.target_date)}
              {goal.days_remaining != null && goal.days_remaining > 0 && (
                <> · {goal.days_remaining} days left</>
              )}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {!complete && (
              <Button onClick={onContribute}>
                <HugeiconsIcon icon={MoneyReceive01Icon} strokeWidth={2} data-icon="inline-start" />
                Contribute
              </Button>
            )}
            <Button variant="outline" onClick={onDetails}>
              <HugeiconsIcon
                icon={InformationCircleIcon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              Details
            </Button>
            <Button variant="ghost" onClick={onEdit}>
              <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} data-icon="inline-start" />
              Edit
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

function GoalListRow({
  goal,
  onContribute,
  onDetails,
  onEdit,
  onDelete,
  onMarkComplete,
}: {
  goal: Goal
  onContribute: () => void
  onDetails: () => void
  onEdit: () => void
  onDelete: () => void
  onMarkComplete: () => void
}) {
  const percentage = goalPercentage(goal)
  const clamped = Math.min(Math.max(percentage, 0), 100)
  const complete = isGoalComplete(goal)
  const remaining = remainingAmount(goal)

  return (
    <li
      className={cn(
        'glass-panel group flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center',
        complete && 'border-success/30',
      )}
    >
      <button
        type="button"
        onClick={onDetails}
        className="flex min-w-0 flex-1 items-center gap-3 text-start"
      >
        <ProgressRing
          value={clamped}
          size={52}
          strokeWidth={5}
          complete={complete}
          accent={goal.color}
          className="shrink-0"
        >
          <span className="text-sm leading-none" aria-hidden>
            {goal.icon || '🎯'}
          </span>
        </ProgressRing>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium truncate">{goal.name}</p>
            {goal.is_primary && <Badge className="text-[10px]">Primary</Badge>}
            {complete && (
              <Badge variant="secondary" className="text-[10px]">
                Done
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {categoryLabel(goal.category)}
            {goal.target_date ? ` · ${formatDate(goal.target_date)}` : ''}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <Progress
              value={clamped}
              className={cn(
                'h-1.5 flex-1 max-w-xs',
                complete && '[&_[data-slot=progress-indicator]]:bg-success',
              )}
            />
            <span className="text-xs tabular-nums text-muted-foreground shrink-0">
              {clamped.toFixed(0)}%
            </span>
          </div>
        </div>
      </button>

      <div className="flex items-center justify-between gap-3 sm:justify-end sm:shrink-0">
        <div className="text-end">
          <p
            className={cn(
              'font-heading font-semibold tabular-nums',
              complete ? 'text-success' : 'text-foreground',
            )}
          >
            {formatCurrency(goal.current_amount, goal.currency)}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            of {formatCurrency(goal.target_amount, goal.currency)}
            {!complete && remaining > 0 && (
              <span className="hidden md:inline">
                {' '}
                · {formatCurrency(remaining, goal.currency)} left
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-1">
          {!complete && (
            <Button size="sm" variant="outline" onClick={onContribute}>
              <HugeiconsIcon icon={MoneyReceive01Icon} strokeWidth={2} data-icon="inline-start" />
              <span className="hidden sm:inline">Contribute</span>
            </Button>
          )}
          <GoalActionsMenu
            goal={goal}
            onContribute={onContribute}
            onDetails={onDetails}
            onEdit={onEdit}
            onDelete={onDelete}
            onMarkComplete={onMarkComplete}
          />
        </div>
      </div>
    </li>
  )
}

function GoalActionsMenu({
  goal,
  onContribute,
  onDetails,
  onEdit,
  onDelete,
  onMarkComplete,
}: {
  goal: Goal
  onContribute: () => void
  onDetails: () => void
  onEdit: () => void
  onDelete: () => void
  onMarkComplete: () => void
}) {
  const complete = isGoalComplete(goal)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`${goal.name} actions`}>
          <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          {!complete && (
            <DropdownMenuItem onClick={onContribute}>
              <HugeiconsIcon icon={MoneyReceive01Icon} strokeWidth={2} />
              Contribute
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onDetails}>
            <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} />
            Details
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onEdit}>
            <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
            Edit
          </DropdownMenuItem>
          {!complete && (
            <DropdownMenuItem onClick={onMarkComplete}>
              <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} />
              Mark complete
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            Delete
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function GoalsSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-28 w-full rounded-2xl" />
      <Skeleton className="h-56 w-full rounded-2xl" />
      <div className="flex flex-col gap-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}
