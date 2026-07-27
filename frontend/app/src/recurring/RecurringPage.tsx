import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  MoreVerticalIcon,
  PauseIcon,
  PencilEdit02Icon,
  PlayIcon,
  RepeatIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
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
import { useConfirm } from '../ui/useConfirm'
import { Amount, CategoryChip } from '../ui/money'
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

type View = 'all' | 'expense' | 'income' | 'paused'

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

function startOfToday(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function daysUntilDue(expense: RecurringExpense, now = new Date()): number {
  if (typeof expense.days_until_due === 'number') return expense.days_until_due
  const due = parseLocalDate(expense.next_due_date.slice(0, 10))
  return Math.round((due.getTime() - startOfToday(now).getTime()) / 86_400_000)
}

function isOverdue(expense: RecurringExpense): boolean {
  if (typeof expense.is_overdue === 'boolean') return expense.is_overdue
  return daysUntilDue(expense) < 0
}

function cadenceLabel(expense: RecurringExpense): string {
  const { recurrence_interval: interval, recurrence_unit: unit } = expense
  if (interval === 1) return { days: 'Daily', weeks: 'Weekly', months: 'Monthly' }[unit]
  return `Every ${interval} ${unit}`
}

/** What this line costs per month, whatever cadence it runs on. */
function monthlyEquivalent(expense: RecurringExpense): number {
  const { amount, recurrence_interval: interval, recurrence_unit: unit } = expense
  const per = Math.max(interval, 1)
  if (unit === 'days') return (amount * 30.44) / per
  if (unit === 'weeks') return (amount * 4.348) / per
  return amount / per
}

function dueLabel(expense: RecurringExpense): string {
  if (!expense.is_active) return 'Paused'
  const days = daysUntilDue(expense)
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days <= 30) return `In ${days} days`
  return formatDate(parseLocalDate(expense.next_due_date.slice(0, 10)))
}

export function RecurringPage() {
  const { data: expenses = [], isLoading } = useRecurringExpenses()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const deleteRecurring = useDeleteRecurringExpense()
  const setActive = useSetRecurringActive()
  const { confirm, confirmDialog } = useConfirm()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<RecurringExpense | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [paying, setPaying] = useState<RecurringExpense | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [view, setView] = useState<View>('all')

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  const flowOf = (expense: RecurringExpense): 'expense' | 'income' => {
    if (expense.category_id == null) return 'expense'
    return categoryById.get(expense.category_id)?.type === 'income' ? 'income' : 'expense'
  }

  const active = useMemo(() => expenses.filter((e) => e.is_active), [expenses])
  const paused = useMemo(() => expenses.filter((e) => !e.is_active), [expenses])

  const visible = useMemo(() => {
    if (view === 'paused') return paused
    if (view === 'all') return active
    return active.filter((e) => flowOf(e) === view)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, paused, view, categoryById])

  /** Three horizons, because that is how a bill actually feels: late, soon, later. */
  const sections = useMemo(() => {
    if (view === 'paused') {
      return [{ key: 'paused', label: 'Paused', items: visible, urgent: false }]
    }
    const sorted = [...visible].sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))
    const overdue = sorted.filter((e) => isOverdue(e))
    const soon = sorted.filter((e) => !isOverdue(e) && daysUntilDue(e) <= 7)
    const later = sorted.filter((e) => !isOverdue(e) && daysUntilDue(e) > 7)
    return [
      { key: 'overdue', label: 'Overdue', items: overdue, urgent: true },
      { key: 'soon', label: 'Next 7 days', items: soon, urgent: false },
      { key: 'later', label: 'Later', items: later, urgent: false },
    ].filter((section) => section.items.length > 0)
  }, [visible, view])

  const totals = useMemo(() => {
    const due30 = active
      .filter((e) => daysUntilDue(e) <= 30)
      .reduce((sum, e) => sum + e.amount, 0)
    const overdueTotal = active
      .filter((e) => isOverdue(e))
      .reduce((sum, e) => sum + e.amount, 0)
    const monthly = active
      .filter((e) => flowOf(e) === 'expense')
      .reduce((sum, e) => sum + monthlyEquivalent(e), 0)
    return { due30, overdueTotal, monthly }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, categoryById])

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

  const handleSetActive = async (expense: RecurringExpense, next: boolean) => {
    try {
      await setActive.mutateAsync({ id: expense.id, active: next })
      toast.success(next ? `${expense.name} resumed` : `${expense.name} paused`)
    } catch {
      toast.error(next ? 'Could not resume it. Try again.' : 'Could not pause it. Try again.')
    }
  }

  const handleDelete = async (expense: RecurringExpense) => {
    const ok = await confirm({
      title: `Delete ${expense.name}?`,
      description:
        'Its payment history goes with it. Pause it instead if you only want it off the agenda.',
      confirmLabel: 'Delete permanently',
    })
    if (!ok) return
    try {
      await deleteRecurring.mutateAsync(expense.id)
      toast.success('Deleted')
      if (detailId === expense.id) setDetailId(null)
    } catch {
      toast.error('Could not delete it. Try again.')
    }
  }

  const metaLine = (expense: RecurringExpense) => {
    const account = expense.account_id != null ? accountById.get(expense.account_id) : null
    return [cadenceLabel(expense), account?.name].filter(Boolean).join(' · ')
  }

  return (
    <PageContainer wide className="flex flex-col gap-6">
      <PageHeader
        title="Recurring"
        description="What leaves your accounts on a schedule, and when it is next due."
        className="mb-0"
        action={
          <Button size="sm" onClick={openCreate}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
            Add
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      ) : expenses.length === 0 ? (
        <Empty className="border border-dashed py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={RepeatIcon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>Nothing on a schedule yet</EmptyTitle>
            <EmptyDescription>
              Add the bills and subscriptions that repeat, and they will show up here before they
              are due.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={openCreate}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              Add the first one
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Three figures on one hairline. No cards — the numbers are the design. */}
          <section
            aria-label="Recurring totals"
            className="grid grid-cols-1 divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0"
          >
            <Figure
              label="Due in 30 days"
              value={formatCurrency(totals.due30)}
              hint={`${active.length} active`}
            />
            <Figure
              label="Monthly commitment"
              value={formatCurrency(totals.monthly)}
              hint="All cadences normalised"
            />
            <Figure
              label="Overdue"
              value={formatCurrency(totals.overdueTotal)}
              hint={totals.overdueTotal > 0 ? 'Needs attention' : 'All clear'}
              tone={totals.overdueTotal > 0 ? 'urgent' : 'calm'}
            />
          </section>

          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="expense">Expenses</TabsTrigger>
              <TabsTrigger value="income">Income</TabsTrigger>
              <TabsTrigger value="paused">Paused ({paused.length})</TabsTrigger>
            </TabsList>
          </Tabs>

          <section aria-label="Recurring schedule" className="flex flex-col gap-7">
            {sections.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Nothing here in this view.
              </p>
            ) : (
              sections.map((section) => (
                <div key={section.key} className="flex flex-col">
                  <div className="flex items-baseline gap-3 pb-2">
                    <h2
                      className={cn(
                        'text-xs font-semibold uppercase tracking-[0.14em]',
                        section.urgent ? 'text-destructive' : 'text-muted-foreground',
                      )}
                    >
                      {section.label}
                    </h2>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {section.items.length}
                    </span>
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {formatCurrency(section.items.reduce((sum, e) => sum + e.amount, 0))}
                    </span>
                  </div>

                  <ul className="flex flex-col">
                    {section.items.map((expense) => (
                      <RecurringRow
                        key={expense.id}
                        expense={expense}
                        flow={flowOf(expense)}
                        category={
                          expense.category_id != null
                            ? categoryById.get(expense.category_id)
                            : undefined
                        }
                        meta={metaLine(expense)}
                        onOpen={() => setDetailId(expense.id)}
                        onPay={() => openPay(expense)}
                        onEdit={() => openEdit(expense)}
                        onToggleActive={() => handleSetActive(expense, !expense.is_active)}
                        onDelete={() => handleDelete(expense)}
                      />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>
        </div>
      )}

      <Sheet open={detailId != null} onOpenChange={(open) => !open && setDetailId(null)}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b">
            <SheetTitle>{detailExpense?.name ?? 'Recurring payment'}</SheetTitle>
            <SheetDescription>
              {detailExpense
                ? `${cadenceLabel(detailExpense)} · ${formatCurrency(detailExpense.amount)}`
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
              <p className="p-4 text-sm text-destructive">
                Could not load the payment history.
              </p>
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
                      Mark it paid once and the history starts here.
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
                            <div className="mt-0.5 flex flex-wrap items-center gap-2">
                              {row.account_name && (
                                <span className="text-xs text-muted-foreground">
                                  {row.account_name}
                                </span>
                              )}
                              {row.category_name && (
                                <CategoryChip
                                  name={row.category_name}
                                  color={row.category_color}
                                />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-end font-semibold tabular-nums">
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

          <SheetFooter className="flex-row justify-end gap-2 border-t">
            {detailExpense && !detailExpense.is_active && (
              <Button size="sm" onClick={() => handleSetActive(detailExpense, true)}>
                <HugeiconsIcon icon={PlayIcon} strokeWidth={2} data-icon="inline-start" />
                Resume
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
      {confirmDialog}
    </PageContainer>
  )
}

function Figure({
  label,
  value,
  hint,
  tone = 'calm',
}: {
  label: string
  value: string
  hint: string
  tone?: 'calm' | 'urgent'
}) {
  return (
    <div className="px-1 py-4 sm:px-5 sm:first:ps-0">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'mt-1.5 font-heading text-2xl font-bold tabular-nums tracking-tight',
          tone === 'urgent' && 'text-destructive',
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

function RecurringRow({
  expense,
  flow,
  category,
  meta,
  onOpen,
  onPay,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  expense: RecurringExpense
  flow: 'expense' | 'income'
  category?: { name: string; color: string | null }
  meta: string
  onOpen: () => void
  onPay: () => void
  onEdit: () => void
  onToggleActive: () => void
  onDelete: () => void
}) {
  const overdue = expense.is_active && isOverdue(expense)
  const paused = !expense.is_active

  return (
    <li
      className={cn(
        'group/row flex items-center gap-3 border-b border-border/60 py-2.5 ps-3 transition-colors',
        'border-s-2 hover:bg-muted/40',
        paused
          ? 'border-s-border'
          : overdue
            ? 'border-s-destructive'
            : flow === 'income'
              ? 'border-s-flow-in'
              : 'border-s-flow-out',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-start"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={cn('truncate font-medium', paused && 'text-muted-foreground')}>
              {expense.name}
            </span>
            {category && (
              <CategoryChip
                name={category.name}
                color={category.color}
                className="hidden sm:inline-flex"
              />
            )}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{meta}</span>
        </span>

        <span
          className={cn(
            'hidden w-28 shrink-0 text-end text-xs tabular-nums sm:block',
            overdue ? 'font-medium text-destructive' : 'text-muted-foreground',
          )}
        >
          {dueLabel(expense)}
        </span>

        <span className="w-24 shrink-0 text-end">
          <Amount
            value={expense.amount}
            flow={paused ? undefined : flow === 'income' ? 'in' : 'out'}
            muted={paused}
            signed={false}
            className="text-sm font-semibold"
          />
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-1">
        {/* Mark paid is the point of the page: always reachable, quiet until hovered. */}
        {expense.is_active ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={onPay}
            className="text-muted-foreground group-hover/row:text-foreground"
          >
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            Mark paid
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={onToggleActive}>
            <HugeiconsIcon icon={PlayIcon} strokeWidth={2} data-icon="inline-start" />
            Resume
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={onOpen}
          className="hidden md:inline-flex md:opacity-0 md:group-hover/row:opacity-100 md:group-focus-within/row:opacity-100"
        >
          Transactions
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More actions">
              <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onEdit}>
                <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleActive}>
                <HugeiconsIcon
                  icon={expense.is_active ? PauseIcon : PlayIcon}
                  strokeWidth={2}
                />
                {expense.is_active ? 'Disable' : 'Resume'}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}
