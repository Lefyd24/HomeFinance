import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  AlarmClockIcon,
  ArrowRight01Icon,
  Calendar01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  MoreVerticalIcon,
  PauseIcon,
  PencilEdit02Icon,
  PlayIcon,
  RepeatIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { formatCurrency, formatDate } from '../lib/format'
import { cn } from '@/lib/utils'
import { useAccounts } from '../accounts/useAccounts'
import { useCategories } from '../categories/useCategories'
import {
  useDeleteRecurringExpense,
  useLinkedTransactions,
  useRecurringExpenses,
  useSetRecurringActive,
} from './useRecurring'
import { RecurringFormDialog } from './RecurringFormDialog'
import { MarkPaidDialog } from './MarkPaidDialog'
import type { RecurringExpense } from './recurringApi'

type FlowFilter = 'all' | 'expense' | 'income'

const CALENDAR_DAYS = 21

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

function toIsoLocal(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function startOfToday(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function daysUntilDue(expense: RecurringExpense, now = new Date()): number {
  if (typeof expense.days_until_due === 'number') return expense.days_until_due
  const due = parseLocalDate(expense.next_due_date)
  const today = startOfToday(now)
  return Math.round((due.getTime() - today.getTime()) / 86_400_000)
}

function isOverdue(expense: RecurringExpense): boolean {
  if (typeof expense.is_overdue === 'boolean') return expense.is_overdue
  const days = daysUntilDue(expense)
  return days < 0
}

function cadenceLabel(expense: RecurringExpense): string {
  const { recurrence_interval: interval, recurrence_unit: unit } = expense
  if (interval === 1) {
    return { days: 'Daily', weeks: 'Weekly', months: 'Monthly' }[unit]
  }
  return `Every ${interval} ${unit}`
}

function dueStatusLabel(expense: RecurringExpense): string {
  if (!expense.is_active) return 'Inactive'
  const days = daysUntilDue(expense)
  if (isOverdue(expense) || days < 0) return `Overdue · ${Math.abs(days)}d`
  if (days === 0) return 'Due today'
  if (days <= 7) return `Due in ${days}d`
  return `In ${days}d`
}

function weekdayShort(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(date)
}

function dayNumber(date: Date): string {
  return String(date.getDate())
}

export function RecurringPage() {
  const { data: expenses = [], isLoading } = useRecurringExpenses()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const deleteRecurring = useDeleteRecurringExpense()
  const setActive = useSetRecurringActive()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<RecurringExpense | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [paying, setPaying] = useState<RecurringExpense | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [flowFilter, setFlowFilter] = useState<FlowFilter>('all')
  const [inactiveOpen, setInactiveOpen] = useState(false)

  const categoryById = useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, c]))
    return map
  }, [categories])

  const accountById = useMemo(() => {
    const map = new Map(accounts.map((a) => [a.id, a]))
    return map
  }, [accounts])

  const flowOf = (expense: RecurringExpense): 'expense' | 'income' | 'unknown' => {
    if (expense.category_id == null) return 'expense'
    const cat = categoryById.get(expense.category_id)
    if (!cat) return 'expense'
    if (cat.type === 'income') return 'income'
    return 'expense'
  }

  const active = useMemo(() => expenses.filter((e) => e.is_active), [expenses])
  const inactive = useMemo(() => expenses.filter((e) => !e.is_active), [expenses])

  const filteredActive = useMemo(() => {
    return active.filter((e) => {
      if (flowFilter === 'all') return true
      return flowOf(e) === flowFilter
    })
  }, [active, flowFilter, categoryById])

  const calendarDays = useMemo(() => {
    const today = startOfToday()
    return Array.from({ length: CALENDAR_DAYS }, (_, i) => {
      const date = new Date(today)
      date.setDate(today.getDate() + i)
      const iso = toIsoLocal(date)
      const dueHere = filteredActive.filter((e) => e.next_due_date.slice(0, 10) === iso)
      const overdueHere =
        i === 0
          ? filteredActive.filter((e) => isOverdue(e) || (daysUntilDue(e) < 0))
          : []
      const items = i === 0 ? [...overdueHere, ...dueHere.filter((e) => !isOverdue(e))] : dueHere
      const unique = Array.from(new Map(items.map((e) => [e.id, e])).values())
      return {
        iso,
        date,
        isToday: i === 0,
        items: unique,
        total: unique.reduce((sum, e) => sum + e.amount, 0),
      }
    })
  }, [filteredActive])

  const agendaGroups = useMemo(() => {
    const overdue = filteredActive
      .filter((e) => isOverdue(e) || (daysUntilDue(e) < 0))
      .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))

    const byDate = new Map<string, RecurringExpense[]>()
    for (const expense of filteredActive) {
      if (isOverdue(expense) || (daysUntilDue(expense) < 0)) continue
      if (selectedDay && expense.next_due_date.slice(0, 10) !== selectedDay) continue
      const key = expense.next_due_date.slice(0, 10)
      const list = byDate.get(key) ?? []
      list.push(expense)
      byDate.set(key, list)
    }

    const upcoming = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([iso, items]) => ({
        key: iso,
        label: iso === toIsoLocal(startOfToday()) ? 'Today' : formatDate(parseLocalDate(iso)),
        tone: 'upcoming' as const,
        items,
      }))

    const groups: Array<{
      key: string
      label: string
      tone: 'overdue' | 'upcoming'
      items: RecurringExpense[]
    }> = []

    if (overdue.length > 0 && (!selectedDay || selectedDay === toIsoLocal(startOfToday()))) {
      groups.push({ key: 'overdue', label: 'Overdue', tone: 'overdue', items: overdue })
    }
    if (selectedDay) {
      const dayItems = filteredActive.filter((e) => {
        if (selectedDay === toIsoLocal(startOfToday())) {
          return e.next_due_date.slice(0, 10) === selectedDay || isOverdue(e)
        }
        return e.next_due_date.slice(0, 10) === selectedDay
      })
      return [
        {
          key: selectedDay,
          label:
            selectedDay === toIsoLocal(startOfToday())
              ? 'Today'
              : formatDate(parseLocalDate(selectedDay)),
          tone: dayItems.some((e) => isOverdue(e)) ? ('overdue' as const) : ('upcoming' as const),
          items: dayItems,
        },
      ]
    }
    return [...groups, ...upcoming]
  }, [filteredActive, selectedDay])

  const detailExpense = expenses.find((e) => e.id === detailId) ?? null
  const linkedQuery = useLinkedTransactions(detailId)

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (expense: RecurringExpense) => {
    setEditing(expense)
    setFormOpen(true)
  }

  const openPay = (expense: RecurringExpense) => {
    setPaying(expense)
    setPayOpen(true)
  }

  const handleDisable = async (expense: RecurringExpense) => {
    try {
      await setActive.mutateAsync({ id: expense.id, active: false })
      toast.success('Recurring expense disabled')
    } catch {
      toast.error('Failed to disable')
    }
  }

  const handleEnable = async (expense: RecurringExpense) => {
    try {
      await setActive.mutateAsync({ id: expense.id, active: true })
      toast.success('Recurring expense enabled')
      if (detailId === expense.id) setDetailId(null)
    } catch {
      toast.error('Failed to enable')
    }
  }

  const handleDelete = async (expense: RecurringExpense) => {
    if (
      !confirm(
        `Permanently delete "${expense.name}"? Its payment history will be destroyed. Disable it instead to keep the history.`,
      )
    ) {
      return
    }
    try {
      await deleteRecurring.mutateAsync(expense.id)
      toast.success('Deleted')
      if (detailId === expense.id) setDetailId(null)
    } catch {
      toast.error('Failed to delete')
    }
  }

  const metaLine = (expense: RecurringExpense) => {
    const bits: string[] = []
    const cat = expense.category_id != null ? categoryById.get(expense.category_id) : null
    const acc = expense.account_id != null ? accountById.get(expense.account_id) : null
    if (cat) bits.push(cat.name)
    if (acc) bits.push(acc.name)
    bits.push(`Next ${formatDate(parseLocalDate(expense.next_due_date.slice(0, 10)))}`)
    return bits.join(' · ')
  }

  return (
    <PageContainer wide>
      <PageHeader
        title="Recurring"
        description="Bills and subscriptions on a due-date agenda — mark paid, pause, or review linked payments."
        action={
          <Button size="sm" onClick={openCreate}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
            Add
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : expenses.length === 0 ? (
        <Empty className="border border-dashed py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={RepeatIcon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>No recurring expenses yet</EmptyTitle>
            <EmptyDescription>
              Add bills, subscriptions, and periodic costs you want to track.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={openCreate}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              Add your first
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs
              value={flowFilter}
              onValueChange={(v) => setFlowFilter(v as FlowFilter)}
            >
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="expense">Expenses</TabsTrigger>
                <TabsTrigger value="income">Income</TabsTrigger>
              </TabsList>
            </Tabs>
            {selectedDay && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedDay(null)}>
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} data-icon="inline-start" />
                Clear day filter
              </Button>
            )}
          </div>

          {/* Calendar strip — distinctive vs StatStrip/card grids */}
          <section
            aria-label="Upcoming due dates"
            className="rounded-xl border bg-muted/20 overflow-hidden"
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b bg-background/60">
              <div className="flex items-center gap-2 min-w-0">
                <HugeiconsIcon icon={Calendar01Icon} strokeWidth={2} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">Next {CALENDAR_DAYS} days</p>
                  <p className="text-xs text-muted-foreground truncate">
                    Tap a day to focus the agenda
                  </p>
                </div>
              </div>
              <Badge variant="outline">{filteredActive.length} active</Badge>
            </div>
            <div className="overflow-x-auto">
              <div className="flex gap-2 p-3 min-w-min">
                {calendarDays.map((day) => {
                  const selected = selectedDay === day.iso
                  const hasDue = day.items.length > 0
                  return (
                    <button
                      key={day.iso}
                      type="button"
                      onClick={() => setSelectedDay(selected ? null : day.iso)}
                      className={cn(
                        'flex w-16 shrink-0 flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-center transition-colors',
                        selected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : hasDue
                            ? 'border-border bg-background hover:bg-muted/50'
                            : 'border-transparent bg-transparent text-muted-foreground hover:bg-muted/40',
                      )}
                    >
                      <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">
                        {weekdayShort(day.date)}
                      </span>
                      <span className="text-lg font-heading font-semibold tabular-nums leading-none">
                        {dayNumber(day.date)}
                      </span>
                      {hasDue ? (
                        <span
                          className={cn(
                            'text-[10px] tabular-nums truncate max-w-full',
                            selected ? 'opacity-90' : 'text-muted-foreground',
                          )}
                        >
                          {day.items.length}
                        </span>
                      ) : (
                        <span className="size-1.5 rounded-full bg-transparent" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </section>

          {/* Agenda timeline */}
          <section aria-label="Due date agenda" className="flex flex-col gap-4">
            {agendaGroups.length === 0 ? (
              <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                No matching items in this view.
              </div>
            ) : (
              agendaGroups.map((group) => (
                <div key={group.key} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 px-0.5">
                    <span
                      className={cn(
                        'size-2 rounded-full shrink-0',
                        group.tone === 'overdue' ? 'bg-destructive' : 'bg-primary',
                      )}
                    />
                    <h2
                      className={cn(
                        'text-xs font-semibold uppercase tracking-wider',
                        group.tone === 'overdue' ? 'text-destructive' : 'text-muted-foreground',
                      )}
                    >
                      {group.label}
                    </h2>
                    <Badge variant={group.tone === 'overdue' ? 'destructive' : 'outline'}>
                      {group.items.length}
                    </Badge>
                  </div>

                  <ul className="rounded-xl border divide-y bg-background overflow-hidden">
                    {group.items.map((expense) => {
                      const overdueItem =
                        expense.is_active && (isOverdue(expense) || (daysUntilDue(expense) < 0))
                      const flow = flowOf(expense)
                      return (
                        <li
                          key={expense.id}
                          className={cn(
                            'flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4',
                            overdueItem && 'bg-destructive/5',
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => setDetailId(expense.id)}
                            className="flex min-w-0 flex-1 items-start gap-3 text-start hover:opacity-90"
                          >
                            <div
                              className={cn(
                                'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border',
                                overdueItem
                                  ? 'border-destructive/40 bg-destructive/10 text-destructive'
                                  : 'border-border bg-muted/40 text-muted-foreground',
                              )}
                            >
                              <HugeiconsIcon
                                icon={overdueItem ? AlarmClockIcon : RepeatIcon}
                                strokeWidth={2}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium truncate">{expense.name}</p>
                                <Badge variant="outline">{cadenceLabel(expense)}</Badge>
                                <Badge
                                  variant={
                                    overdueItem
                                      ? 'destructive'
                                      : (daysUntilDue(expense) <= 7)
                                        ? 'default'
                                        : 'secondary'
                                  }
                                >
                                  {dueStatusLabel(expense)}
                                </Badge>
                                {flow === 'income' && (
                                  <Badge variant="outline">Income</Badge>
                                )}
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground truncate">
                                {metaLine(expense)}
                              </p>
                              {expense.notes && (
                                <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
                                  {expense.notes}
                                </p>
                              )}
                            </div>
                            <p
                              className={cn(
                                'shrink-0 text-lg font-heading font-semibold tabular-nums',
                                flow === 'income' ? 'text-foreground' : 'text-destructive',
                              )}
                            >
                              {formatCurrency(expense.amount)}
                            </p>
                          </button>

                          <div className="flex items-center gap-2 sm:shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDetailId(expense.id)}
                            >
                              Transactions
                            </Button>
                            <Button size="sm" onClick={() => openPay(expense)}>
                              <HugeiconsIcon
                                icon={CheckmarkCircle02Icon}
                                strokeWidth={2}
                                data-icon="inline-start"
                              />
                              Mark paid
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm" aria-label="More actions">
                                  <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2} />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuGroup>
                                  <DropdownMenuItem onClick={() => openEdit(expense)}>
                                    <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleDisable(expense)}>
                                    <HugeiconsIcon icon={PauseIcon} strokeWidth={2} />
                                    Disable
                                  </DropdownMenuItem>
                                </DropdownMenuGroup>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => handleDelete(expense)}
                                >
                                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))
            )}
          </section>

          {inactive.length > 0 && (
            <div className="rounded-xl border bg-muted/10">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start"
                onClick={() => setInactiveOpen((v) => !v)}
                aria-expanded={inactiveOpen}
              >
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Disabled recurring expenses ({inactive.length})
                </span>
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  strokeWidth={2}
                  className={cn('transition-transform', inactiveOpen && 'rotate-90')}
                />
              </button>
              {inactiveOpen && (
                <ul className="border-t divide-y">
                  {inactive.map((expense) => (
                    <li
                      key={expense.id}
                      className="flex flex-col gap-3 p-3 opacity-80 sm:flex-row sm:items-center"
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-start"
                        onClick={() => setDetailId(expense.id)}
                      >
                        <p className="font-medium truncate">{expense.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {metaLine(expense)}
                        </p>
                      </button>
                      <p className="tabular-nums font-medium">{formatCurrency(expense.amount)}</p>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleEnable(expense)}>
                          <HugeiconsIcon icon={PlayIcon} strokeWidth={2} data-icon="inline-start" />
                          Enable
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label="More actions">
                              <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuGroup>
                              <DropdownMenuItem onClick={() => openEdit(expense)}>
                                <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setDetailId(expense.id)}>
                                View history
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => handleDelete(expense)}
                            >
                              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <Sheet open={detailId != null} onOpenChange={(open) => !open && setDetailId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
          <SheetHeader className="border-b">
            <SheetTitle>{detailExpense?.name ?? 'Recurring payment'}</SheetTitle>
            <SheetDescription>
              {detailExpense
                ? `${cadenceLabel(detailExpense)}${
                    detailExpense.category_id != null &&
                    categoryById.get(detailExpense.category_id)
                      ? ` · ${categoryById.get(detailExpense.category_id)!.name}`
                      : ''
                  } · ${formatCurrency(detailExpense.amount)}`
                : 'Connected payments'}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            {linkedQuery.isLoading ? (
              <div className="flex flex-col gap-3 p-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : linkedQuery.isError ? (
              <p className="p-4 text-sm text-destructive">Error loading transactions.</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 border-b px-4 py-4">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Total paid
                    </p>
                    <p className="mt-1 font-heading font-semibold tabular-nums">
                      {formatCurrency(linkedQuery.data?.summary.total_paid ?? 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Payments
                    </p>
                    <p className="mt-1 font-heading font-semibold tabular-nums">
                      {linkedQuery.data?.summary.payment_count ?? 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Last payment
                    </p>
                    <p className="mt-1 text-sm font-medium tabular-nums">
                      {linkedQuery.data?.summary.last_payment_date
                        ? formatDate(
                            parseLocalDate(
                              linkedQuery.data.summary.last_payment_date.slice(0, 10),
                            ),
                          )
                        : '—'}
                    </p>
                  </div>
                </div>

                {(linkedQuery.data?.transactions.length ?? 0) === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Use &ldquo;Mark paid&rdquo; to record one.
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-end">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {linkedQuery.data!.transactions.map((row) => (
                        <TableRow key={row.payment_id}>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatDate(
                              parseLocalDate(
                                (row.transaction_date || row.payment_date).slice(0, 10),
                              ),
                            )}
                          </TableCell>
                          <TableCell className="min-w-0">
                            <p className="truncate font-medium">{row.description || '—'}</p>
                            <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-muted-foreground">
                              {row.account_name && <span>{row.account_name}</span>}
                              {row.category_name && (
                                <Badge variant="outline" className="text-[10px]">
                                  {row.category_name}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-end tabular-nums font-semibold whitespace-nowrap">
                            {formatCurrency(row.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </>
            )}
          </div>

          <SheetFooter className="border-t flex-row justify-end gap-2">
            {detailExpense && !detailExpense.is_active && (
              <Button size="sm" onClick={() => handleEnable(detailExpense)}>
                <HugeiconsIcon icon={PlayIcon} strokeWidth={2} data-icon="inline-start" />
                Enable
              </Button>
            )}
            {detailExpense?.is_active && (
              <Button size="sm" onClick={() => openPay(detailExpense)}>
                Mark paid
              </Button>
            )}
            {detailExpense && (
              <Button size="sm" variant="outline" onClick={() => openEdit(detailExpense)}>
                Edit
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <RecurringFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditing(null)
        }}
        expense={editing}
      />
      <MarkPaidDialog
        open={payOpen}
        onOpenChange={(open) => {
          setPayOpen(open)
          if (!open) setPaying(null)
        }}
        expense={paying}
      />
    </PageContainer>
  )
}
