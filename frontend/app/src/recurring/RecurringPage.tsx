import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { PageHeader, PageHeaderActionLabel } from '../ui/PageHeader'
import { useConfirm } from '../ui/useConfirm'
import { Amount, CategoryChip } from '../ui/money'
import { formatCurrency, formatDate } from '../lib/format'
import { cn } from '@/lib/utils'
import { useAccounts } from '../accounts/useAccounts'
import { useCategories } from '../categories/useCategories'
import {
  useDeleteRecurringExpense,
  useDeleteRecurringPayment,
  useLinkedTransactions,
  useRecurringExpenses,
  useSetRecurringActive,
} from './useRecurring'
import { RecurringFormDialog } from './RecurringFormDialog'
import { MarkPaidDialog } from './MarkPaidDialog'
import { RecurringPaymentEditDialog } from './RecurringPaymentEditDialog'
import type { LinkedTransactionRow, RecurringExpense } from './recurringApi'
import {
  cadenceLabel,
  daysUntilDue,
  dueLabel,
  isOverdue,
} from './recurringLabels'
import { Badge } from '@/components/ui/badge'

type View = 'all' | 'expense' | 'income' | 'paused'

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/** What this line costs per month, whatever cadence it runs on. */
function monthlyEquivalent(expense: RecurringExpense): number {
  const { amount, recurrence_interval: interval, recurrence_unit: unit } = expense
  const per = Math.max(interval, 1)
  if (unit === 'days') return (amount * 30.44) / per
  if (unit === 'weeks') return (amount * 4.348) / per
  return amount / per
}

export function RecurringPage() {
  const { t } = useTranslation(['recurring', 'common'])
  const { data: expenses = [], isLoading } = useRecurringExpenses()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const deleteRecurring = useDeleteRecurringExpense()
  const deletePayment = useDeleteRecurringPayment()
  const setActive = useSetRecurringActive()
  const { confirm, confirmDialog } = useConfirm()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<RecurringExpense | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [paying, setPaying] = useState<RecurringExpense | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [editingPayment, setEditingPayment] = useState<LinkedTransactionRow | null>(null)
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
      return [{ key: 'paused', label: t('sections.paused'), items: visible, urgent: false }]
    }
    const sorted = [...visible].sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))
    const overdue = sorted.filter((e) => isOverdue(e))
    const soon = sorted.filter((e) => !isOverdue(e) && daysUntilDue(e) <= 7)
    const later = sorted.filter((e) => !isOverdue(e) && daysUntilDue(e) > 7)
    return [
      { key: 'overdue', label: t('sections.overdue'), items: overdue, urgent: true },
      { key: 'soon', label: t('sections.next7'), items: soon, urgent: false },
      { key: 'later', label: t('sections.later'), items: later, urgent: false },
    ].filter((section) => section.items.length > 0)
  }, [visible, view, t])

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
      toast.success(
        next ? t('toast.resumed', { name: expense.name }) : t('toast.paused', { name: expense.name }),
      )
    } catch {
      toast.error(next ? t('toast.resumeError') : t('toast.pauseError'))
    }
  }

  const handleDelete = async (expense: RecurringExpense) => {
    const ok = await confirm({
      title: t('deleteConfirm.title', { name: expense.name }),
      description: t('deleteConfirm.description'),
      confirmLabel: t('deleteConfirm.confirmLabel'),
    })
    if (!ok) return
    try {
      await deleteRecurring.mutateAsync(expense.id)
      toast.success(t('toast.deleted'))
      if (detailId === expense.id) setDetailId(null)
    } catch {
      toast.error(t('toast.deleteError'))
    }
  }

  const handleDeletePayment = async (row: LinkedTransactionRow) => {
    if (detailId == null) return
    const ok = await confirm({
      title: t('paymentEdit.deleteConfirm.title'),
      description: t('paymentEdit.deleteConfirm.description'),
      confirmLabel: t('paymentEdit.deleteConfirm.confirmLabel'),
    })
    if (!ok) return
    try {
      await deletePayment.mutateAsync({ expenseId: detailId, paymentId: row.payment_id })
      toast.success(t('paymentEdit.toasts.deleted'))
    } catch {
      toast.error(t('paymentEdit.toasts.deleteFailed'))
    }
  }

  const metaLine = (expense: RecurringExpense) => {
    const account = expense.account_id != null ? accountById.get(expense.account_id) : null
    return [cadenceLabel(expense, t), account?.name].filter(Boolean).join(' · ')
  }

  return (
    <PageContainer wide className="flex flex-col gap-6">
      <PageHeader
        title={t('page.title')}
        description={t('page.description')}
        className="mb-0"
        action={
          <Button size="sm" onClick={openCreate}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
            <PageHeaderActionLabel>{t('page.addAction')}</PageHeaderActionLabel>
          </Button>
        }
      />

      {isLoading ? (
        <div className="glass-panel flex flex-col gap-3 rounded-xl border p-4">
          <Skeleton className="h-14 w-full rounded-lg bg-muted/50" />
          <Skeleton className="h-64 w-full rounded-lg bg-muted/50" />
        </div>
      ) : expenses.length === 0 ? (
        <Empty className="glass-panel border border-dashed py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={RepeatIcon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>{t('empty.title')}</EmptyTitle>
            <EmptyDescription>{t('empty.description')}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={openCreate}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              {t('empty.addFirst')}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex flex-col gap-6">
          <section
            aria-label={t('aria.totals')}
            className="glass-panel overflow-hidden rounded-xl border"
          >
            <div className="grid grid-cols-1 divide-y divide-border/70 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <Figure
              label={t('totals.due30.label')}
              value={formatCurrency(totals.due30)}
              hint={t('totals.due30.hint', { count: active.length })}
            />
            <Figure
              label={t('totals.monthly.label')}
              value={formatCurrency(totals.monthly)}
              hint={t('totals.monthly.hint')}
            />
            <Figure
              label={t('totals.overdue.label')}
              value={formatCurrency(totals.overdueTotal)}
              hint={
                totals.overdueTotal > 0
                  ? t('totals.overdue.hintAttention')
                  : t('totals.overdue.hintClear')
              }
              tone={totals.overdueTotal > 0 ? 'urgent' : 'calm'}
            />
            </div>
          </section>

          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList>
              <TabsTrigger value="all">{t('tabs.all')}</TabsTrigger>
              <TabsTrigger value="expense">{t('tabs.expenses')}</TabsTrigger>
              <TabsTrigger value="income">{t('tabs.income')}</TabsTrigger>
              <TabsTrigger value="paused">{t('tabs.paused', { count: paused.length })}</TabsTrigger>
            </TabsList>
          </Tabs>

          <section aria-label={t('aria.schedule')} className="flex flex-col gap-5">
            {sections.length === 0 ? (
              <div className="glass-panel rounded-xl border px-4 py-10 text-center">
                <p className="text-sm text-muted-foreground">{t('sections.empty')}</p>
              </div>
            ) : (
              sections.map((section) => (
                <div key={section.key} className="glass-panel overflow-hidden rounded-xl border">
                  <div className="glass-inset-header flex items-baseline gap-3 border-b px-4 py-2.5">
                    <h2
                      className={cn(
                        'text-xs font-semibold uppercase tracking-[0.14em]',
                        section.urgent ? 'text-destructive' : 'text-muted-foreground',
                      )}
                    >
                      {section.label}
                    </h2>
                    <Badge variant="secondary">
                      {section.items.length}
                    </Badge>
                    <span className="h-px flex-1" />
                    <span className="text-xs font-semibold tabular-nums text-foreground">
                      {formatCurrency(section.items.reduce((sum, e) => sum + e.amount, 0))}
                    </span>
                  </div>

                  <ul className="divide-y divide-border/60">
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
                        dueText={dueLabel(expense, t)}
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
            <SheetTitle>{detailExpense?.name ?? t('detail.fallbackTitle')}</SheetTitle>
            <SheetDescription>
              {detailExpense
                ? `${cadenceLabel(detailExpense, t)} · ${formatCurrency(detailExpense.amount)}`
                : t('detail.fallbackDescription')}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            {linkedQuery.isLoading ? (
              <div className="flex flex-col gap-3 p-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : linkedQuery.isError ? (
              <p className="p-4 text-sm text-destructive">{t('detail.loadError')}</p>
            ) : (
              <>
                <div className="glass-panel mx-4 mt-4 grid grid-cols-3 gap-3 rounded-xl border px-4 py-4">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t('detail.stats.totalPaid')}
                    </p>
                    <p className="mt-1 font-heading font-semibold tabular-nums">
                      {formatCurrency(linkedQuery.data?.summary.total_paid ?? 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t('detail.stats.payments')}
                    </p>
                    <p className="mt-1 font-heading font-semibold tabular-nums">
                      {linkedQuery.data?.summary.payment_count ?? 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t('detail.stats.lastPayment')}
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
                    <p className="text-sm text-muted-foreground">{t('detail.empty.title')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t('detail.empty.description')}</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('detail.table.date')}</TableHead>
                        <TableHead>{t('detail.table.description')}</TableHead>
                        <TableHead className="text-end">{t('detail.table.amount')}</TableHead>
                        <TableHead className="w-10">
                          <span className="sr-only">{t('detail.table.actions')}</span>
                        </TableHead>
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
                              {!row.transaction_id && (
                                <span className="text-xs text-muted-foreground">
                                  {t('detail.paymentOnly')}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-end font-semibold tabular-nums">
                            {formatCurrency(row.amount)}
                          </TableCell>
                          <TableCell className="text-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={t('detail.table.actions')}
                                >
                                  <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2} />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuGroup>
                                  <DropdownMenuItem onClick={() => setEditingPayment(row)}>
                                    <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
                                    {t('common:actions.edit')}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => void handleDeletePayment(row)}
                                  >
                                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                                    {t('common:actions.delete')}
                                  </DropdownMenuItem>
                                </DropdownMenuGroup>
                              </DropdownMenuContent>
                            </DropdownMenu>
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
                {t('actions.resume')}
              </Button>
            )}
            {detailExpense?.is_active && (
              <Button size="sm" onClick={() => openPay(detailExpense)}>
                {t('actions.markPaid')}
              </Button>
            )}
            {detailExpense && (
              <Button size="sm" variant="outline" onClick={() => openEdit(detailExpense)}>
                {t('common:actions.edit')}
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
      <RecurringPaymentEditDialog
        open={editingPayment != null}
        onOpenChange={(open) => {
          if (!open) setEditingPayment(null)
        }}
        expenseId={detailId}
        payment={editingPayment}
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
    <div className="px-4 py-4 sm:px-5 sm:first:ps-5">
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
  dueText,
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
  dueText: string
  onOpen: () => void
  onPay: () => void
  onEdit: () => void
  onToggleActive: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation(['recurring', 'common'])
  const overdue = expense.is_active && isOverdue(expense)
  const paused = !expense.is_active

  return (
    <li
      className={cn(
        'glass-row group/row flex items-center gap-3 py-2.5 ps-3 pe-2 sm:pe-3',
        'border-s-[3px]',
        paused
          ? 'border-s-border/80'
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
          <span className="mt-0.5 hidden truncate text-xs text-muted-foreground sm:block">{meta}</span>
        </span>

        <span
          className={cn(
            'w-20 shrink-0 text-end text-[0.7rem] leading-tight tabular-nums sm:w-28 sm:text-xs',
            overdue ? 'font-medium text-destructive' : 'text-muted-foreground',
          )}
        >
          {dueText}
        </span>

        <span className="w-20 shrink-0 text-end sm:w-24">
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
            className="hidden text-muted-foreground group-hover/row:text-foreground sm:inline-flex"
          >
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {t('actions.markPaid')}
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={onToggleActive} className="hidden sm:inline-flex">
            <HugeiconsIcon icon={PlayIcon} strokeWidth={2} data-icon="inline-start" />
            {t('actions.resume')}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={onOpen}
          className="hidden md:inline-flex md:opacity-0 md:group-hover/row:opacity-100 md:group-focus-within/row:opacity-100"
        >
          {t('actions.viewTransactions')}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t('actions.moreActionsAria')}>
              <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onEdit}>
                <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
                {t('common:actions.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleActive}>
                <HugeiconsIcon
                  icon={expense.is_active ? PauseIcon : PlayIcon}
                  strokeWidth={2}
                />
                {expense.is_active ? t('actions.disable') : t('actions.resume')}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              {t('common:actions.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}
