import { useEffect, useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  AnalyticsUpIcon,
  BankIcon,
  Calendar03Icon,
  Car01Icon,
  CheckmarkCircle02Icon,
  CreditCardIcon,
  Delete02Icon,
  Edit02Icon,
  File01Icon,
  FlashIcon,
  Home01Icon,
  Hospital01Icon,
  Invoice01Icon,
  JusticeScale01Icon,
  Money01Icon,
  MoreVerticalIcon,
  PercentCircleIcon,
  RepeatIcon,
  StudentCardIcon,
  TaxesIcon,
  TransactionIcon,
  UserIcon,
  Wallet01Icon,
} from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog } from '../ui/Dialog'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { formatCurrency, formatDate } from '../lib/format'
import { cn } from '@/lib/utils'
import {
  useDebtPayments,
  useDebtSummary,
  useDebts,
  useDeleteDebt,
  usePayoffComparison,
} from './useDebts'
import { DebtFormDialog } from './DebtFormDialog'
import { DebtPaymentDialog } from './DebtPaymentDialog'
import type { Debt, DebtType, PayoffComparison } from './debtsApi'

const TYPE_META: Record<
  DebtType,
  { label: string; icon: typeof CreditCardIcon }
> = {
  credit_card: { label: 'Credit Card', icon: CreditCardIcon },
  personal_loan: { label: 'Personal Loan', icon: Money01Icon },
  student_loan: { label: 'Student Loan', icon: StudentCardIcon },
  mortgage: { label: 'Mortgage', icon: Home01Icon },
  car_loan: { label: 'Car Loan', icon: Car01Icon },
  informal: { label: 'Informal', icon: UserIcon },
  utilities: { label: 'Utilities', icon: FlashIcon },
  subscription: { label: 'Subscription', icon: RepeatIcon },
  medical: { label: 'Medical', icon: Hospital01Icon },
  tax: { label: 'Tax', icon: TaxesIcon },
  legal: { label: 'Legal', icon: JusticeScale01Icon },
  other: { label: 'Other', icon: File01Icon },
  custom: { label: 'Custom', icon: Invoice01Icon },
}

function debtTypeLabel(debt: Debt): string {
  if (debt.type === 'custom') return debt.custom_type?.trim() || 'Custom'
  return TYPE_META[debt.type]?.label ?? debt.type
}

function payoffPercent(debt: Debt): number {
  if (debt.is_paid_off) return 100
  if (debt.original_balance <= 0) return 0
  const paid = debt.original_balance - debt.current_balance
  return Math.max(0, Math.min(100, (paid / debt.original_balance) * 100))
}

function aprPercent(rate: number | null | undefined): number | null {
  if (rate == null || rate <= 0) return null
  return rate <= 1 ? rate * 100 : rate
}

function ProgressDial({ percent, label }: { percent: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, percent))
  const r = 28
  const c = 2 * Math.PI * r
  const offset = c - (clamped / 100) * c

  return (
    <div className="flex items-center gap-3">
      <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0" aria-hidden>
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          className="stroke-muted"
          strokeWidth="6"
        />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          className="stroke-primary transition-[stroke-dashoffset] duration-700"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c.toFixed(2)}
          strokeDashoffset={offset.toFixed(2)}
          transform="rotate(-90 32 32)"
        />
        <text
          x="32"
          y="36"
          textAnchor="middle"
          className="fill-foreground text-[14px] font-semibold tabular-nums"
        >
          {Math.round(clamped)}%
        </text>
      </svg>
      <p className="text-xs text-muted-foreground leading-snug">{label}</p>
    </div>
  )
}

export function DebtsPage() {
  const { data: debts = [], isLoading } = useDebts()
  const { data: summary } = useDebtSummary()
  const deleteDebt = useDeleteDebt()

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentsSheetOpen, setPaymentsSheetOpen] = useState(false)
  const [strategiesOpen, setStrategiesOpen] = useState(false)

  const active = useMemo(
    () =>
      debts
        .filter((d) => !d.is_paid_off)
        .sort((a, b) => (b.priority || 0) - (a.priority || 0)),
    [debts],
  )
  const paid = useMemo(
    () =>
      debts
        .filter((d) => d.is_paid_off)
        .sort((a, b) => {
          const da = a.paid_off_date ? new Date(a.paid_off_date).getTime() : 0
          const db = b.paid_off_date ? new Date(b.paid_off_date).getTime() : 0
          return db - da
        }),
    [debts],
  )

  const selected =
    debts.find((d) => d.id === selectedId) ?? active[0] ?? paid[0] ?? null

  useEffect(() => {
    if (!debts.length) {
      setSelectedId(null)
      return
    }
    if (selectedId != null && debts.some((d) => d.id === selectedId)) return
    setSelectedId((active[0] ?? paid[0])?.id ?? null)
  }, [debts, selectedId, active, paid])

  const openCreate = () => {
    setEditingDebt(null)
    setFormOpen(true)
  }

  const openEdit = (debt: Debt) => {
    setEditingDebt(debt)
    setFormOpen(true)
  }

  const handleDelete = async (debt: Debt) => {
    if (!confirm(`Delete "${debt.name}"? This cannot be undone.`)) return
    try {
      await deleteDebt.mutateAsync(debt.id)
      toast.success('Debt deleted')
      if (selectedId === debt.id) setSelectedId(null)
    } catch {
      toast.error('Failed to delete debt')
    }
  }

  return (
    <PageContainer wide>
      <PageHeader
        title="Debts"
        description="Interest calculator, payment schedule, and linked transactions — one debt at a time."
        action={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStrategiesOpen(true)}
              disabled={active.length === 0}
            >
              <HugeiconsIcon icon={AnalyticsUpIcon} strokeWidth={2} data-icon="inline-start" />
              Payoff strategies
            </Button>
            <Button size="sm" onClick={openCreate}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              Add debt
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(16rem,20rem)_1fr] gap-4 min-h-[28rem]">
          <Skeleton className="h-[28rem] w-full rounded-xl" />
          <Skeleton className="h-[28rem] w-full rounded-xl" />
        </div>
      ) : debts.length === 0 ? (
        <Empty className="border border-dashed py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={BankIcon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>No debts tracked yet</EmptyTitle>
            <EmptyDescription>
              Add a loan or card with APR and minimum payment to project interest and payoff.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={openCreate}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              Add first debt
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(16rem,20rem)_1fr] gap-4 items-start">
          <aside className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border px-4 py-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Portfolio
                </p>
                <p className="text-sm font-semibold tabular-nums">
                  {formatCurrency(
                    summary?.total_amount_due ??
                      summary?.total_current_balance ??
                      active.reduce((s, d) => s + d.current_balance, 0),
                  )}
                </p>
              </div>
              <ProgressDial
                percent={summary?.overall_progress_percentage ?? 0}
                label="overall payoff"
              />
            </div>
            <ScrollArea className="h-[min(70vh,36rem)]">
              <div className="flex flex-col p-2 gap-1">
                {active.length > 0 && (
                  <p className="px-2 pt-2 pb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                    Active · {active.length}
                  </p>
                )}
                {active.map((debt) => (
                  <DebtListItem
                    key={debt.id}
                    debt={debt}
                    selected={selected?.id === debt.id}
                    onSelect={() => setSelectedId(debt.id)}
                  />
                ))}
                {paid.length > 0 && (
                  <p className="px-2 pt-3 pb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                    Paid off · {paid.length}
                  </p>
                )}
                {paid.map((debt) => (
                  <DebtListItem
                    key={debt.id}
                    debt={debt}
                    selected={selected?.id === debt.id}
                    onSelect={() => setSelectedId(debt.id)}
                  />
                ))}
              </div>
            </ScrollArea>
            <div className="border-t border-border px-4 py-3 grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground uppercase tracking-wide text-[0.65rem]">
                  Min. monthly
                </p>
                <p className="font-semibold tabular-nums">
                  {formatCurrency(summary?.total_minimum_payments ?? 0)}
                </p>
              </div>
              <div className="text-end">
                <p className="text-muted-foreground uppercase tracking-wide text-[0.65rem]">
                  Proj. interest
                </p>
                <p className="font-semibold tabular-nums text-destructive">
                  {formatCurrency(summary?.total_projected_interest ?? 0)}
                </p>
              </div>
            </div>
          </aside>

          {selected ? (
            <DebtDetailPanel
              debt={selected}
              onEdit={() => openEdit(selected)}
              onDelete={() => handleDelete(selected)}
              onPayment={() => setPaymentOpen(true)}
              onOpenPayments={() => setPaymentsSheetOpen(true)}
            />
          ) : (
            <Empty className="border border-dashed py-14">
              <EmptyHeader>
                <EmptyTitle>Select a debt</EmptyTitle>
                <EmptyDescription>Choose a debt from the list to inspect payoff math.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      )}

      <DebtFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        debt={editingDebt}
      />
      <DebtPaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        debt={selected}
      />
      <DebtPaymentsSheet
        debt={selected}
        open={paymentsSheetOpen}
        onOpenChange={setPaymentsSheetOpen}
      />
      <PayoffStrategiesDialog open={strategiesOpen} onOpenChange={setStrategiesOpen} />
    </PageContainer>
  )
}

function DebtListItem({
  debt,
  selected,
  onSelect,
}: {
  debt: Debt
  selected: boolean
  onSelect: () => void
}) {
  const meta = TYPE_META[debt.type] ?? TYPE_META.other
  const apr = aprPercent(debt.interest_rate)

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full text-start rounded-lg px-3 py-2.5 transition-colors flex items-start gap-3',
        selected
          ? 'bg-primary/10 ring-1 ring-primary/30'
          : 'hover:bg-muted/60',
      )}
    >
      <div
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          debt.is_paid_off ? 'bg-success/15 text-success' : 'bg-muted text-foreground',
        )}
      >
        <HugeiconsIcon
          icon={debt.is_paid_off ? CheckmarkCircle02Icon : meta.icon}
          strokeWidth={2}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{debt.creditor || debt.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {debtTypeLabel(debt)}
          {apr != null ? ` · ${apr.toFixed(2)}% APR` : ''}
        </p>
      </div>
      <p
        className={cn(
          'text-sm font-semibold tabular-nums shrink-0',
          debt.is_paid_off ? 'text-success' : 'text-foreground',
        )}
      >
        {formatCurrency(
          apr != null && debt.total_amount_due != null
            ? debt.total_amount_due
            : debt.current_balance,
        )}
      </p>
    </button>
  )
}

function DebtDetailPanel({
  debt,
  onEdit,
  onDelete,
  onPayment,
  onOpenPayments,
}: {
  debt: Debt
  onEdit: () => void
  onDelete: () => void
  onPayment: () => void
  onOpenPayments: () => void
}) {
  const meta = TYPE_META[debt.type] ?? TYPE_META.other
  const percentage = payoffPercent(debt)
  const paidAmount = Math.max(0, debt.original_balance - debt.current_balance)
  const apr = aprPercent(debt.interest_rate)
  const displayDue =
    apr != null && debt.total_amount_due != null ? debt.total_amount_due : debt.current_balance
  const projectedInterest = debt.total_interest ?? 0

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden min-w-0">
      <div className="bg-destructive text-destructive-foreground px-5 py-5 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
              <HugeiconsIcon icon={meta.icon} strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider opacity-80">{debtTypeLabel(debt)}</p>
              <h2 className="text-xl font-heading font-bold truncate">
                {debt.creditor || debt.name}
              </h2>
              {debt.creditor && (
                <p className="text-sm opacity-90 truncate">{debt.name}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!debt.is_paid_off && (
              <Button
                size="sm"
                variant="secondary"
                className="bg-white/15 text-destructive-foreground hover:bg-white/25 border-0"
                onClick={onPayment}
              >
                <HugeiconsIcon icon={Wallet01Icon} strokeWidth={2} data-icon="inline-start" />
                Add payment
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-destructive-foreground hover:bg-white/15"
                  aria-label="More actions"
                >
                  <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={onEdit}>
                    <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} data-icon="inline-start" />
                    Edit debt
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onOpenPayments}>
                    <HugeiconsIcon
                      icon={TransactionIcon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    Payments & transactions
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
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-wider opacity-75">
              {apr != null ? 'Amount due (w/ interest)' : 'Current balance'}
            </p>
            <p className="mt-1 text-3xl font-heading font-bold tabular-nums tracking-tight">
              {formatCurrency(displayDue)}
            </p>
            {apr != null && projectedInterest > 0 && (
              <p className="mt-1 text-xs opacity-80">
                includes {formatCurrency(projectedInterest)} projected interest
              </p>
            )}
          </div>
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-wider opacity-75">
              Principal remaining
            </p>
            <p className="mt-1 text-2xl font-heading font-bold tabular-nums">
              {formatCurrency(debt.current_balance)}
            </p>
            <p className="mt-1 text-xs opacity-80">
              of {formatCurrency(debt.original_balance)} original
            </p>
          </div>
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-wider opacity-75">
              Paid toward principal
            </p>
            <p className="mt-1 text-2xl font-heading font-bold tabular-nums">
              {formatCurrency(paidAmount)}
            </p>
            {!debt.is_paid_off && (
              <div className="mt-2">
                <Progress value={percentage} className="h-1.5 bg-white/20" />
                <p className="mt-1 text-xs opacity-80 tabular-nums">
                  {Math.round(percentage)}% paid off
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6 flex flex-col gap-6">
        <div>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold">Interest & payoff calculator</h3>
            {debt.priority > 0 && (
              <Badge variant="secondary">Priority · P{debt.priority}</Badge>
            )}
            {debt.is_paid_off && <Badge variant="secondary">Paid off</Badge>}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <CalcCell
              label="APR"
              value={apr != null ? `${apr.toFixed(2)}%` : '—'}
              icon={PercentCircleIcon}
              hint="Monthly compounding"
            />
            <CalcCell
              label="Min. payment"
              value={
                debt.minimum_payment != null && debt.minimum_payment > 0
                  ? formatCurrency(debt.minimum_payment)
                  : '—'
              }
              icon={Wallet01Icon}
              hint={debt.recurrence_unit ? `Every ${debt.recurrence_interval ?? 1} ${debt.recurrence_unit}` : 'Set for projections'}
            />
            <CalcCell
              label="Months to payoff"
              value={debt.months_to_payoff != null ? String(debt.months_to_payoff) : '—'}
              icon={Calendar03Icon}
              hint={
                debt.payoff_date
                  ? `Est. ${formatDate(debt.payoff_date)}`
                  : 'Needs APR + min. payment'
              }
            />
            <CalcCell
              label="Total interest"
              value={
                debt.total_interest != null ? formatCurrency(debt.total_interest) : '—'
              }
              icon={AnalyticsUpIcon}
              hint="If paying minimum only"
              tone="destructive"
            />
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <DetailRow label="Opened" value={debt.opened_date ? formatDate(debt.opened_date) : '—'} />
          <DetailRow
            label="Maturity"
            value={debt.maturity_date ? formatDate(debt.maturity_date) : '—'}
          />
          <DetailRow
            label="Next payment"
            value={debt.next_payment_date ? formatDate(debt.next_payment_date) : '—'}
          />
          <DetailRow
            label="Schedule day"
            value={
              debt.recurrence_day_of_month != null
                ? `Day ${debt.recurrence_day_of_month}`
                : '—'
            }
          />
          {debt.is_paid_off && debt.paid_off_date && (
            <DetailRow label="Cleared on" value={formatDate(debt.paid_off_date)} />
          )}
        </div>

        {debt.notes && (
          <>
            <Separator />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                Notes
              </p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{debt.notes}</p>
            </div>
          </>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onOpenPayments}>
            <HugeiconsIcon icon={TransactionIcon} strokeWidth={2} data-icon="inline-start" />
            View payments & linked txns
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit}>
            <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} data-icon="inline-start" />
            Edit properties
          </Button>
        </div>
      </div>
    </section>
  )
}

function CalcCell({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string
  value: string
  hint: string
  icon: typeof PercentCircleIcon
  tone?: 'destructive'
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <HugeiconsIcon icon={icon} strokeWidth={2} />
        <span className="text-[0.65rem] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p
        className={cn(
          'text-lg font-heading font-bold tabular-nums',
          tone === 'destructive' && value !== '—' ? 'text-destructive' : 'text-foreground',
        )}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums text-end">{value}</span>
    </div>
  )
}

function DebtPaymentsSheet({
  debt,
  open,
  onOpenChange,
}: {
  debt: Debt | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: payments = [], isLoading } = useDebtPayments(debt?.id ?? null, open)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0" showCloseButton>
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle>Payments & transactions</SheetTitle>
          <SheetDescription>
            {debt
              ? `Payment history for ${debt.name}. Linked transaction IDs appear when a payment created or attached a ledger entry.`
              : 'Select a debt to view payments.'}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-2 p-4">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))
            ) : payments.length === 0 ? (
              <Empty className="py-10">
                <EmptyHeader>
                  <EmptyTitle>No payments yet</EmptyTitle>
                  <EmptyDescription>
                    Record a payment to reduce the balance and optionally create a transaction.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              payments.map((payment) => (
                <div
                  key={payment.id}
                  className="rounded-lg border border-border bg-muted/20 p-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm">Payment</p>
                    {payment.notes && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {payment.notes}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                      {formatDate(payment.payment_date)}
                      {payment.transaction_id != null && (
                        <> · Txn #{payment.transaction_id}</>
                      )}
                    </p>
                    {(payment.principal_amount != null || payment.interest_amount != null) && (
                      <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                        {payment.principal_amount != null &&
                          `Principal ${formatCurrency(payment.principal_amount)}`}
                        {payment.principal_amount != null &&
                          payment.interest_amount != null &&
                          ' · '}
                        {payment.interest_amount != null &&
                          `Interest ${formatCurrency(payment.interest_amount)}`}
                      </p>
                    )}
                  </div>
                  <p className="font-bold tabular-nums text-success shrink-0">
                    −{formatCurrency(payment.amount)}
                  </p>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function PayoffStrategiesDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data, isLoading, isError, error } = usePayoffComparison(open)

  return (
    <Dialog
      open={open}
      title="Payoff strategy comparison"
      onOpenChange={onOpenChange}
      className="sm:max-w-3xl"
    >
      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">
          {(error as Error)?.message || 'Could not load payoff strategies.'}
        </p>
      ) : data ? (
        <StrategyComparison comparison={data} />
      ) : null}
    </Dialog>
  )
}

function StrategyComparison({ comparison }: { comparison: PayoffComparison }) {
  const { snowball, avalanche, recommended_strategy, savings_difference, months_difference } =
    comparison
  const schedule =
    recommended_strategy === 'snowball'
      ? snowball.payoff_schedule
      : avalanche.payoff_schedule

  return (
    <div className="flex flex-col gap-5">
      <div
        className={cn(
          'rounded-xl border p-4',
          recommended_strategy === 'avalanche'
            ? 'border-success/40 bg-success/10'
            : 'border-primary/30 bg-primary/10',
        )}
      >
        <p className="font-semibold">
          Recommended: {recommended_strategy === 'avalanche' ? 'Debt Avalanche' : 'Debt Snowball'}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {recommended_strategy === 'avalanche'
            ? `Save ${formatCurrency(savings_difference)} in interest and finish ${months_difference} month(s) sooner.`
            : 'Pay smallest balances first for quick wins while staying motivated.'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <StrategyCard
          title="Debt Snowball"
          subtitle="Lowest balance first"
          strategy={snowball}
          recommended={recommended_strategy === 'snowball'}
        />
        <StrategyCard
          title="Debt Avalanche"
          subtitle="Highest APR first"
          strategy={avalanche}
          recommended={recommended_strategy === 'avalanche'}
        />
      </div>

      <div>
        <h4 className="font-semibold mb-2">Payoff schedule preview</h4>
        <p className="text-xs text-muted-foreground mb-3">
          First months of the {recommended_strategy} plan
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="text-start font-medium px-3 py-2">Month</th>
                <th className="text-start font-medium px-3 py-2">Debt</th>
                <th className="text-end font-medium px-3 py-2">Payment</th>
                <th className="text-end font-medium px-3 py-2">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {schedule.slice(0, 10).map((item, idx) => (
                <tr key={`${item.month}-${item.debt_id}-${idx}`} className="border-t border-border">
                  <td className="px-3 py-2 tabular-nums">{item.month}</td>
                  <td className="px-3 py-2">{item.debt_name}</td>
                  <td className="px-3 py-2 text-end tabular-nums">
                    {formatCurrency(item.payment)}
                  </td>
                  <td className="px-3 py-2 text-end tabular-nums">
                    {formatCurrency(item.remaining_balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StrategyCard({
  title,
  subtitle,
  strategy,
  recommended,
}: {
  title: string
  subtitle: string
  strategy: PayoffComparison['snowball']
  recommended: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-muted/20 p-4 flex flex-col gap-3',
        recommended && 'ring-2 ring-primary/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {recommended && <Badge>Recommended</Badge>}
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">Total months</span>
          <span className="font-semibold tabular-nums">{strategy.total_months}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">Total interest</span>
          <span className="font-semibold tabular-nums">
            {formatCurrency(strategy.total_interest_paid)}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">Total payments</span>
          <span className="font-semibold tabular-nums">
            {formatCurrency(strategy.total_payments)}
          </span>
        </div>
      </div>
    </div>
  )
}
