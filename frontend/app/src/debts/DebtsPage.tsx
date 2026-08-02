import { useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  AnalyticsUpIcon,
  ArrowDown01Icon,
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
  PercentCircleIcon,
  RepeatIcon,
  StudentCardIcon,
  TaxesIcon,
  TransactionIcon,
  UserIcon,
  Wallet01Icon,
} from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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
import { Dialog } from '../ui/Dialog'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader, PageHeaderActionLabel } from '../ui/PageHeader'
import { useConfirm } from '../ui/useConfirm'
import { formatCurrency, formatDate } from '../lib/format'
import { cn } from '@/lib/utils'
import {
  useDebtPayments,
  useDebtSummary,
  useDebts,
  useDeleteDebt,
  useDeleteDebtPayment,
  usePayoffComparison,
} from './useDebts'
import { DebtFormDialog } from './DebtFormDialog'
import { DebtPaymentDialog } from './DebtPaymentDialog'
import type { Debt, DebtPayment, DebtType, PayoffComparison } from './debtsApi'

const TYPE_META: Record<
  DebtType,
  { labelKey: string; icon: typeof CreditCardIcon }
> = {
  credit_card: { labelKey: 'types.creditCard', icon: CreditCardIcon },
  personal_loan: { labelKey: 'types.personalLoan', icon: Money01Icon },
  student_loan: { labelKey: 'types.studentLoan', icon: StudentCardIcon },
  mortgage: { labelKey: 'types.mortgage', icon: Home01Icon },
  car_loan: { labelKey: 'types.carLoan', icon: Car01Icon },
  informal: { labelKey: 'types.informal', icon: UserIcon },
  utilities: { labelKey: 'types.utilities', icon: FlashIcon },
  subscription: { labelKey: 'types.subscription', icon: RepeatIcon },
  medical: { labelKey: 'types.medical', icon: Hospital01Icon },
  tax: { labelKey: 'types.tax', icon: TaxesIcon },
  legal: { labelKey: 'types.legal', icon: JusticeScale01Icon },
  other: { labelKey: 'types.other', icon: File01Icon },
  custom: { labelKey: 'types.custom', icon: Invoice01Icon },
}

function debtTypeLabel(debt: Debt, t: (key: string) => string): string {
  if (debt.type === 'custom') return debt.custom_type?.trim() || t('types.custom')
  const meta = TYPE_META[debt.type]
  return meta ? t(meta.labelKey) : debt.type
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

type DebtTone = 'success' | 'primary' | 'warning'

/**
 * Colour follows how the payoff is going, not the fact that it's a debt. A
 * card that's 80% cleared shouldn't shout the same red as one just opened.
 */
function debtTone(debt: Debt): DebtTone {
  if (debt.is_paid_off) return 'success'
  const percent = payoffPercent(debt)
  if (percent >= 60) return 'success'
  if (percent >= 25) return 'primary'
  return 'warning'
}

const TONE_BAR: Record<DebtTone, string> = {
  success: 'bg-success',
  primary: 'bg-primary',
  warning: 'bg-warning',
}

const TONE_MARK: Record<DebtTone, string> = {
  success: 'bg-success/15 text-success ring-success/25',
  primary: 'bg-primary/15 text-primary ring-primary/25',
  warning: 'bg-warning/20 text-warning ring-warning/30',
}

const TONE_DIALOG: Record<DebtTone, 'primary' | 'warning'> = {
  success: 'primary',
  primary: 'primary',
  warning: 'warning',
}

/**
 * One bar for the whole obligation: what's already gone to principal, what's
 * still owed, and how much of the total is interest you haven't paid yet.
 * Seeing the interest slice next to the principal is the point of the page.
 */
function PayoffBar({
  paid,
  remaining,
  interest,
}: {
  paid: number
  remaining: number
  interest: number
}) {
  const { t } = useTranslation('debts')
  const total = Math.max(paid + remaining + interest, 0.01)
  const segments = [
    { key: 'paid', value: paid, className: 'bg-success', label: t('payoffBar.paidOff') },
    { key: 'remaining', value: remaining, className: 'bg-primary', label: t('payoffBar.stillOwed') },
    { key: 'interest', value: interest, className: 'bg-warning', label: t('payoffBar.interestAhead') },
  ].filter((s) => s.value > 0)

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={t('payoffBar.ariaLabel', {
          paid: formatCurrency(paid),
          remaining: formatCurrency(remaining),
          interest: formatCurrency(interest),
        })}
      >
        {segments.map((segment) => (
          <div
            key={segment.key}
            className={cn('h-full transition-[width] duration-700', segment.className)}
            style={{ width: `${(segment.value / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((segment) => (
          <span key={segment.key} className="flex items-center gap-1.5 text-xs">
            <span className={cn('size-2 rounded-full', segment.className)} aria-hidden />
            <span className="text-muted-foreground">{segment.label}</span>
            <span className="font-medium tabular-nums">{formatCurrency(segment.value)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function ProgressDial({ percent, label }: { percent: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, percent))
  const r = 28
  const c = 2 * Math.PI * r
  const offset = c - (clamped / 100) * c

  return (
    <div className="flex items-center gap-3">
      <svg width="56" height="56" viewBox="0 0 64 64" className="shrink-0" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" className="stroke-muted" strokeWidth="6" />
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
          className="fill-foreground text-[13px] font-semibold tabular-nums"
        >
          {Math.round(clamped)}%
        </text>
      </svg>
      <p className="text-xs text-muted-foreground leading-snug">{label}</p>
    </div>
  )
}

export function DebtsPage() {
  const { t } = useTranslation('debts')
  const { data: debts = [], isLoading } = useDebts()
  const { data: summary } = useDebtSummary()
  const deleteDebt = useDeleteDebt()
  const { confirm, confirmDialog } = useConfirm()

  const [formOpen, setFormOpen] = useState(false)
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null)
  const [activeDebt, setActiveDebt] = useState<Debt | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentsSheetOpen, setPaymentsSheetOpen] = useState(false)
  const [strategiesOpen, setStrategiesOpen] = useState(false)
  const [paidOffExpanded, setPaidOffExpanded] = useState(false)

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

  const openCreate = () => {
    setEditingDebt(null)
    setFormOpen(true)
  }

  const openEdit = (debt: Debt) => {
    setDetailOpen(false)
    setEditingDebt(debt)
    setFormOpen(true)
  }

  const openDetail = (debt: Debt) => {
    setActiveDebt(debt)
    setDetailOpen(true)
  }

  const openPayment = (debt: Debt) => {
    setDetailOpen(false)
    setActiveDebt(debt)
    setPaymentOpen(true)
  }

  const openPaymentsSheet = (debt: Debt) => {
    setDetailOpen(false)
    setActiveDebt(debt)
    setPaymentsSheetOpen(true)
  }

  const handleDelete = async (debt: Debt) => {
    const ok = await confirm({
      title: t('page.deleteDialog.title', { name: debt.creditor || debt.name }),
      description: t('page.deleteDialog.description'),
      confirmLabel: t('page.deleteDialog.confirmLabel'),
    })
    if (!ok) return
    try {
      await deleteDebt.mutateAsync(debt.id)
      toast.success(t('page.toasts.deleted'))
      setDetailOpen(false)
    } catch {
      toast.error(t('page.toasts.deleteFailed'))
    }
  }

  return (
    <PageContainer wide>
      <PageHeader
        title={t('page.title')}
        description={t('page.description')}
        action={
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStrategiesOpen(true)}
              disabled={active.length === 0}
            >
              <HugeiconsIcon icon={AnalyticsUpIcon} strokeWidth={2} data-icon="inline-start" />
              <PageHeaderActionLabel>{t('page.payoffStrategies')}</PageHeaderActionLabel>
            </Button>
            <Button size="sm" onClick={openCreate}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              <PageHeaderActionLabel>{t('page.addDebt')}</PageHeaderActionLabel>
            </Button>
          </>
        }
      />

      {isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        </div>
      ) : debts.length === 0 ? (
        <Empty className="border border-dashed py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={BankIcon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>{t('page.empty.title')}</EmptyTitle>
            <EmptyDescription>
              {t('page.empty.description')}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={openCreate}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              {t('page.addFirstDebt')}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Statement head — the whole obligation, one line */}
          <section className="glass-panel rounded-xl border px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('page.totalOwed')}
                </p>
                <p className="mt-1 font-heading text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
                  {formatCurrency(
                    summary?.total_amount_due ??
                      summary?.total_current_balance ??
                      active.reduce((s, d) => s + d.current_balance, 0),
                  )}
                </p>
              </div>
              <ProgressDial percent={summary?.overall_progress_percentage ?? 0} label={t('page.overallPayoff')} />
              <div className="flex flex-wrap gap-x-8 gap-y-2 sm:ms-auto">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('page.minMonthly')}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {formatCurrency(summary?.total_minimum_payments ?? 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('page.projInterest')}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-destructive">
                    {formatCurrency(summary?.total_projected_interest ?? 0)}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Active debt tiles */}
          {active.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              {t('page.allPaidOff')}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {active.map((debt) => (
                <DebtTile key={debt.id} debt={debt} onOpen={() => openDetail(debt)} />
              ))}
            </div>
          )}

          {/* Paid off — collapsed by default, out of the way once cleared */}
          {paid.length > 0 && (
            <Collapsible open={paidOffExpanded} onOpenChange={setPaidOffExpanded}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted/40"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="text-success" />
                    {t('page.paidOffCount', { count: paid.length })}
                  </span>
                  <HugeiconsIcon
                    icon={ArrowDown01Icon}
                    strokeWidth={2}
                    className={cn('transition-transform', paidOffExpanded && 'rotate-180')}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="data-open:animate-accordion-down data-closed:animate-accordion-up overflow-hidden">
                <div className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2 xl:grid-cols-3">
                  {paid.map((debt) => (
                    <DebtTile key={debt.id} debt={debt} onOpen={() => openDetail(debt)} />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}

      <DebtDetailDialog
        debt={activeDebt}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={() => activeDebt && openEdit(activeDebt)}
        onDelete={() => activeDebt && handleDelete(activeDebt)}
        onPayment={() => activeDebt && openPayment(activeDebt)}
        onOpenPayments={() => activeDebt && openPaymentsSheet(activeDebt)}
      />
      <DebtFormDialog open={formOpen} onOpenChange={setFormOpen} debt={editingDebt} />
      <DebtPaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} debt={activeDebt} />
      <DebtPaymentsSheet debt={activeDebt} open={paymentsSheetOpen} onOpenChange={setPaymentsSheetOpen} />
      <PayoffStrategiesDialog open={strategiesOpen} onOpenChange={setStrategiesOpen} />
      {confirmDialog}
    </PageContainer>
  )
}

/**
 * The main clickable surface. Shows exactly what someone needs before they
 * decide whether to dig in: current balance against the original, and what's
 * due each period — nothing else competes for attention here.
 */
function DebtTile({ debt, onOpen }: { debt: Debt; onOpen: () => void }) {
  const { t } = useTranslation('debts')
  const meta = TYPE_META[debt.type] ?? TYPE_META.other
  const apr = aprPercent(debt.interest_rate)
  const tone = debtTone(debt)
  const percent = payoffPercent(debt)

  return (
    <button
      type="button"
      onClick={onOpen}
      className="glass-panel flex w-full flex-col overflow-hidden rounded-xl border text-start transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className={cn('h-1 w-full', debt.is_paid_off ? 'bg-success' : TONE_BAR[tone])} />

      <div className="flex items-start gap-3 px-4 pt-3.5 sm:px-5">
        <div
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg ring-1',
            debt.is_paid_off ? 'bg-success/15 text-success ring-success/25' : TONE_MARK[tone],
          )}
        >
          <HugeiconsIcon icon={debt.is_paid_off ? CheckmarkCircle02Icon : meta.icon} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold sm:text-base">{debt.creditor || debt.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {debtTypeLabel(debt, t)}
            {apr != null ? t('tile.aprSuffix', { apr: apr.toFixed(2) }) : ''}
          </p>
        </div>
        {debt.is_paid_off && (
          <Badge className="shrink-0 bg-success/15 text-[10px] text-success ring-1 ring-success/25">
            {t('tile.cleared')}
          </Badge>
        )}
      </div>

      <div className="mt-3 px-4 sm:px-5">
        <p
          className={cn(
            'font-heading text-2xl font-bold tabular-nums tracking-tight',
            debt.is_paid_off ? 'text-success' : 'text-foreground',
          )}
        >
          {formatCurrency(debt.current_balance)}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('tile.ofOriginal', { amount: formatCurrency(debt.original_balance) })}
        </p>
      </div>

      <div className="mt-2.5 px-4 sm:px-5">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full', debt.is_paid_off ? 'bg-success' : TONE_BAR[tone])}
            style={{ width: `${Math.max(2, percent)}%` }}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border px-4 py-3 sm:px-5">
        <span className="text-xs text-muted-foreground">
          {debt.is_paid_off ? t('tile.paidOff') : t('tile.minPayment')}
        </span>
        <span className="text-sm font-semibold tabular-nums">
          {debt.is_paid_off
            ? debt.paid_off_date
              ? formatDate(debt.paid_off_date)
              : '—'
            : debt.minimum_payment != null && debt.minimum_payment > 0
              ? formatCurrency(debt.minimum_payment)
              : '—'}
        </span>
      </div>
    </button>
  )
}

function recurrencePaymentHint(
  debt: Debt,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (!debt.recurrence_unit) return t('detail.interestAndPayoff.setOneToUnlock')
  const unitKey = debt.recurrence_unit
  const singularKey = unitKey.replace(/s$/, '')
  if ((debt.recurrence_interval ?? 1) === 1) {
    return t('detail.interestAndPayoff.everyUnit', {
      unit: t(`detail.interestAndPayoff.recurrenceUnits.${singularKey}`),
    })
  }
  return t('detail.interestAndPayoff.everyIntervalUnit', {
    interval: debt.recurrence_interval,
    unit: t(`detail.interestAndPayoff.recurrenceUnits.${unitKey}`),
  })
}

function DebtDetailDialog({
  debt,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  onPayment,
  onOpenPayments,
}: {
  debt: Debt | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: () => void
  onDelete: () => void
  onPayment: () => void
  onOpenPayments: () => void
}) {
  const { t } = useTranslation('debts')
  if (!debt) {
    return <Dialog open={false} title="" onOpenChange={onOpenChange}>{null}</Dialog>
  }

  const meta = TYPE_META[debt.type] ?? TYPE_META.other
  const percentage = payoffPercent(debt)
  const paidAmount = Math.max(0, debt.original_balance - debt.current_balance)
  const apr = aprPercent(debt.interest_rate)
  const displayDue =
    apr != null && debt.total_amount_due != null ? debt.total_amount_due : debt.current_balance
  const projectedInterest = debt.total_interest ?? 0
  const tone = debtTone(debt)

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={debt.creditor || debt.name}
      description={`${debtTypeLabel(debt, t)}${debt.creditor ? ` · ${debt.name}` : ''}`}
      icon={meta.icon}
      tone={debt.is_paid_off ? 'primary' : TONE_DIALOG[tone]}
      className="sm:max-w-lg"
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          {!debt.is_paid_off && (
            <Button size="sm" onClick={onPayment}>
              <HugeiconsIcon icon={Wallet01Icon} strokeWidth={2} data-icon="inline-start" />
              {t('detail.addPayment')}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onOpenPayments}>
            <HugeiconsIcon icon={TransactionIcon} strokeWidth={2} data-icon="inline-start" />
            {t('detail.payments')}
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit}>
            <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} data-icon="inline-start" />
            {t('detail.edit')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive ms-auto"
            onClick={onDelete}
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} data-icon="inline-start" />
            {t('detail.delete')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
              {apr != null ? t('detail.amountDueInterestIncluded') : t('detail.currentBalance')}
            </p>
            <p className="mt-1 font-heading text-3xl font-bold tabular-nums tracking-tight">
              {formatCurrency(displayDue)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('detail.ofOriginal', { amount: formatCurrency(debt.original_balance) })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {debt.is_paid_off ? (
              <Badge className="bg-success/15 text-success ring-1 ring-success/25">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} data-icon="inline-start" />
                {t('detail.cleared')}
              </Badge>
            ) : (
              <Badge variant="secondary" className="tabular-nums">
                {t('detail.percentPaidOff', { percent: Math.round(percentage) })}
              </Badge>
            )}
            {debt.priority > 0 && (
              <Badge variant="outline">{t('detail.priority', { priority: debt.priority })}</Badge>
            )}
          </div>
        </div>

        {!debt.is_paid_off && (
          <PayoffBar paid={paidAmount} remaining={debt.current_balance} interest={projectedInterest} />
        )}

        <Separator />

        <div>
          <div className="mb-3">
            <h3 className="text-sm font-semibold">{t('detail.interestAndPayoff.title')}</h3>
            <p className="text-xs text-muted-foreground">{t('detail.interestAndPayoff.description')}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <CalcCell
              label={t('detail.interestAndPayoff.apr')}
              value={apr != null ? `${apr.toFixed(2)}%` : '—'}
              icon={PercentCircleIcon}
              hint={t('detail.interestAndPayoff.aprHint')}
              tone="primary"
            />
            <CalcCell
              label={t('detail.interestAndPayoff.minPayment')}
              value={
                debt.minimum_payment != null && debt.minimum_payment > 0
                  ? formatCurrency(debt.minimum_payment)
                  : '—'
              }
              icon={Wallet01Icon}
              hint={recurrencePaymentHint(debt, t)}
              tone="primary"
            />
            <CalcCell
              label={t('detail.interestAndPayoff.monthsToPayoff')}
              value={debt.months_to_payoff != null ? String(debt.months_to_payoff) : '—'}
              icon={Calendar03Icon}
              hint={
                debt.payoff_date
                  ? t('detail.interestAndPayoff.estDate', { date: formatDate(debt.payoff_date) })
                  : t('detail.interestAndPayoff.needsAprAndMinPayment')
              }
              tone="success"
            />
            <CalcCell
              label={t('detail.interestAndPayoff.totalInterest')}
              value={debt.total_interest != null ? formatCurrency(debt.total_interest) : '—'}
              icon={AnalyticsUpIcon}
              hint={t('detail.interestAndPayoff.totalInterestHint')}
              tone="warning"
            />
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <DetailRow label={t('detail.opened')} value={debt.opened_date ? formatDate(debt.opened_date) : '—'} />
          <DetailRow label={t('detail.maturity')} value={debt.maturity_date ? formatDate(debt.maturity_date) : '—'} />
          <DetailRow
            label={t('detail.nextPayment')}
            value={debt.next_payment_date ? formatDate(debt.next_payment_date) : '—'}
          />
          <DetailRow
            label={t('detail.scheduleDay')}
            value={
              debt.recurrence_day_of_month != null
                ? t('detail.day', { day: debt.recurrence_day_of_month })
                : '—'
            }
          />
          {debt.is_paid_off && debt.paid_off_date && (
            <DetailRow label={t('detail.clearedOn')} value={formatDate(debt.paid_off_date)} />
          )}
        </div>

        {debt.notes && (
          <>
            <Separator />
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('detail.notes')}
              </p>
              <p className="whitespace-pre-wrap text-sm text-foreground">{debt.notes}</p>
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}

const CALC_TONE = {
  default: { icon: 'text-muted-foreground', value: 'text-foreground', surface: 'bg-muted/30' },
  primary: { icon: 'text-primary', value: 'text-foreground', surface: 'bg-primary/6' },
  success: { icon: 'text-success', value: 'text-success', surface: 'bg-success/8' },
  warning: { icon: 'text-warning', value: 'text-warning', surface: 'bg-warning/10' },
} as const

function CalcCell({
  label,
  value,
  hint,
  icon,
  tone = 'default',
}: {
  label: string
  value: string
  hint: string
  icon: typeof PercentCircleIcon
  tone?: keyof typeof CALC_TONE
}) {
  const empty = value === '—'
  const palette = CALC_TONE[empty ? 'default' : tone]

  return (
    <div className={cn('flex flex-col gap-1.5 rounded-lg border border-border p-3', palette.surface)}>
      <div className="flex items-center gap-1.5">
        <HugeiconsIcon icon={icon} strokeWidth={2} className={palette.icon} />
        <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <p className={cn('font-heading text-lg font-bold tabular-nums', palette.value)}>{value}</p>
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
  const { t } = useTranslation('debts')
  const { data: payments = [], isLoading } = useDebtPayments(debt?.id ?? null, open)
  const deletePayment = useDeleteDebtPayment()
  const { confirm, confirmDialog } = useConfirm()
  const [editingPayment, setEditingPayment] = useState<DebtPayment | null>(null)

  async function handleDeletePayment(payment: DebtPayment) {
    if (!debt) return
    const ok = await confirm({
      title: t('paymentsSheet.deleteConfirm.title'),
      description: t('paymentsSheet.deleteConfirm.description'),
      confirmLabel: t('paymentsSheet.deleteConfirm.confirmLabel'),
    })
    if (!ok) return
    try {
      await deletePayment.mutateAsync({ debtId: debt.id, paymentId: payment.id })
      toast.success(t('paymentsSheet.toasts.deleted'))
    } catch {
      toast.error(t('paymentsSheet.toasts.deleteFailed'))
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0" showCloseButton>
          <SheetHeader className="border-b border-border px-5 py-4">
            <SheetTitle>{t('paymentsSheet.title')}</SheetTitle>
            <SheetDescription>
              {debt
                ? t('paymentsSheet.descriptionWithDebt', { name: debt.name })
                : t('paymentsSheet.descriptionNoDebt')}
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
                    <EmptyTitle>{t('paymentsSheet.empty.title')}</EmptyTitle>
                    <EmptyDescription>{t('paymentsSheet.empty.description')}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="rounded-lg border border-border bg-muted/20 p-3 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">{t('paymentsSheet.payment')}</p>
                      {payment.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {payment.notes}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                        {formatDate(payment.payment_date)}
                        {payment.transaction_id != null && (
                          <> · {t('paymentsSheet.transactionHash', { id: payment.transaction_id })}</>
                        )}
                      </p>
                      {(payment.principal_amount != null || payment.interest_amount != null) && (
                        <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                          {payment.principal_amount != null &&
                            t('paymentsSheet.principal', {
                              amount: formatCurrency(payment.principal_amount),
                            })}
                          {payment.principal_amount != null &&
                            payment.interest_amount != null &&
                            ' · '}
                          {payment.interest_amount != null &&
                            t('paymentsSheet.interest', {
                              amount: formatCurrency(payment.interest_amount),
                            })}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingPayment(payment)}
                        >
                          <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} data-icon="inline-start" />
                          {t('paymentsSheet.edit')}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => void handleDeletePayment(payment)}
                        >
                          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} data-icon="inline-start" />
                          {t('paymentsSheet.delete')}
                        </Button>
                      </div>
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

      <DebtPaymentDialog
        open={editingPayment != null}
        onOpenChange={(next) => {
          if (!next) setEditingPayment(null)
        }}
        debt={debt}
        payment={editingPayment}
      />
      {confirmDialog}
    </>
  )
}

function PayoffStrategiesDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('debts')
  const { data, isLoading, isError, error } = usePayoffComparison(open)

  return (
    <Dialog
      open={open}
      title={t('strategies.title')}
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
          {(error as Error)?.message || t('strategies.loadError')}
        </p>
      ) : data ? (
        <StrategyComparison comparison={data} />
      ) : null}
    </Dialog>
  )
}

function StrategyComparison({ comparison }: { comparison: PayoffComparison }) {
  const { t } = useTranslation('debts')
  const { snowball, avalanche, recommended_strategy, savings_difference, months_difference } =
    comparison
  const schedule =
    recommended_strategy === 'snowball'
      ? snowball.payoff_schedule
      : avalanche.payoff_schedule
  const recommendedName =
    recommended_strategy === 'avalanche'
      ? t('strategies.debtAvalanche')
      : t('strategies.debtSnowball')

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
        <p className="font-semibold">{t('strategies.recommended', { strategy: recommendedName })}</p>
        <p className="text-sm text-muted-foreground mt-1">
          {recommended_strategy === 'avalanche'
            ? t('strategies.recommendAvalanche', {
                amount: formatCurrency(savings_difference),
                months: months_difference,
              })
            : t('strategies.recommendSnowball')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <StrategyCard
          title={t('strategies.debtSnowball')}
          subtitle={t('strategies.snowballSubtitle')}
          strategy={snowball}
          recommended={recommended_strategy === 'snowball'}
        />
        <StrategyCard
          title={t('strategies.debtAvalanche')}
          subtitle={t('strategies.avalancheSubtitle')}
          strategy={avalanche}
          recommended={recommended_strategy === 'avalanche'}
        />
      </div>

      <div>
        <h4 className="font-semibold mb-2">{t('strategies.scheduleTitle')}</h4>
        <p className="text-xs text-muted-foreground mb-3">
          {t('strategies.scheduleSubtitle', { strategy: recommendedName })}
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="text-start font-medium px-3 py-2">{t('strategies.table.month')}</th>
                <th className="text-start font-medium px-3 py-2">{t('strategies.table.debt')}</th>
                <th className="text-end font-medium px-3 py-2">{t('strategies.table.payment')}</th>
                <th className="text-end font-medium px-3 py-2">{t('strategies.table.remaining')}</th>
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
  const { t } = useTranslation('debts')
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
        {recommended && <Badge>{t('strategies.recommendedBadge')}</Badge>}
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">{t('strategies.totalMonths')}</span>
          <span className="font-semibold tabular-nums">{strategy.total_months}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">{t('strategies.totalInterest')}</span>
          <span className="font-semibold tabular-nums">
            {formatCurrency(strategy.total_interest_paid)}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">{t('strategies.totalPayments')}</span>
          <span className="font-semibold tabular-nums">
            {formatCurrency(strategy.total_payments)}
          </span>
        </div>
      </div>
    </div>
  )
}
