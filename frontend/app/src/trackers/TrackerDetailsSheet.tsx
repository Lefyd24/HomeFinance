import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDownLeft01Icon,
  ArrowUpRight01Icon,
  Delete02Icon,
  MoneyAdd01Icon,
  PencilEdit02Icon,
} from '@hugeicons/core-free-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '../lib/format'
import { CategoryIcon, ICON_MAP } from '../categories/categoryIcons'
import { DEFAULT_TRACKER_COLOR, DEFAULT_TRACKER_ICON } from './trackerMeta'
import { useRemoveTrackerTransaction, useTrackerTransactions } from './useTrackers'
import type { Tracker } from './trackersApi'

/**
 * Wider than the app's other sheets on purpose: every row here carries an icon,
 * a description, a meta line, an amount and a remove button, and at the default
 * width those collided and wrapped.
 *
 * The `data-[side=right]:` prefix is load-bearing — SheetContent pins the panel
 * with `data-[side=right]:sm:max-w-sm`, and an unprefixed `sm:max-w-*` from a
 * caller loses the specificity tie against it and is silently ignored.
 */
const SHEET_WIDTH =
  'w-full data-[side=right]:sm:max-w-xl data-[side=right]:lg:max-w-3xl flex flex-col gap-0 p-0'

interface TrackerDetailsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tracker: Tracker | null
  onAddTransaction?: (tracker: Tracker) => void
  onEdit?: (tracker: Tracker) => void
}

export function TrackerDetailsSheet({
  open,
  onOpenChange,
  tracker,
  onAddTransaction,
  onEdit,
}: TrackerDetailsSheetProps) {
  const { t } = useTranslation('trackers')
  const trackerId = open && tracker ? tracker.id : null
  const { data, isLoading } = useTrackerTransactions(trackerId)
  const removeTransaction = useRemoveTrackerTransaction()

  if (!tracker) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className={SHEET_WIDTH} />
      </Sheet>
    )
  }

  const iconKey =
    tracker.icon && tracker.icon in ICON_MAP ? tracker.icon : DEFAULT_TRACKER_ICON
  const entries = data?.items ?? []
  const total = data?.total_amount ?? tracker.total_amount
  const hasTarget = tracker.target_amount != null && tracker.target_amount > 0
  const percentage = Math.min(Math.max(tracker.progress_percentage ?? 0, 0), 100)
  const overTarget = hasTarget && (tracker.progress_percentage ?? 0) > 100

  const handleRemove = async (transactionId: number) => {
    try {
      await removeTransaction.mutateAsync({ id: tracker.id, transactionId })
      toast.success(t('details.toasts.removed'))
    } catch {
      toast.error(t('details.toasts.removeFailed'))
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={SHEET_WIDTH}>
        <SheetHeader className="gap-1.5 border-b border-border p-4 pe-14">
          <SheetTitle className="flex min-w-0 items-center gap-2.5">
            <CategoryIcon
              icon={iconKey}
              color={tracker.color || DEFAULT_TRACKER_COLOR}
              className="size-8 shrink-0"
              size={17}
            />
            {/* The status sits with the name, not under it: whether a tracker is
                still collecting is part of what it *is*, and the eye reads the
                pair in one pass. `min-w-0` keeps a long name truncating rather
                than pushing the badge off the panel. */}
            <span className="truncate">{tracker.name}</span>
            <Badge
              variant={tracker.is_active ? 'success' : 'destructive'}
              className="shrink-0"
            >
              {tracker.is_active ? t('details.active') : t('details.inactive')}
            </Badge>
          </SheetTitle>
          <SheetDescription className="text-xs">
            {t('details.createdOn', { date: formatDate(tracker.created_at) })}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-6 p-4 sm:p-6">
            <div className="flex flex-col gap-4 rounded-2xl border bg-muted/30 p-4 sm:p-5">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">{t('details.total')}</p>
                <p className="mt-1 font-heading text-3xl font-bold tabular-nums tracking-tight">
                  {formatCurrency(total, tracker.currency)}
                </p>
              </div>

              {hasTarget && (
                <div className="flex flex-col gap-1.5">
                  <Progress
                    value={percentage}
                    className={cn(
                      'h-2',
                      overTarget && '[&_[data-slot=progress-indicator]]:bg-destructive',
                    )}
                  />
                  <p
                    className={cn(
                      'text-xs text-center tabular-nums',
                      overTarget ? 'text-destructive' : 'text-muted-foreground',
                    )}
                  >
                    {overTarget
                      ? t('details.overBy', {
                          amount: formatCurrency(
                            Math.abs(tracker.remaining_amount ?? 0),
                            tracker.currency,
                          ),
                        })
                      : t('details.leftOfTarget', {
                          amount: formatCurrency(
                            tracker.remaining_amount ?? 0,
                            tracker.currency,
                          ),
                          target: formatCurrency(tracker.target_amount!, tracker.currency),
                        })}
                  </p>
                </div>
              )}

              {/* Three tiles side by side leave ~100px each on a phone, which
                  a formatted date does not survive. Below sm they become plain
                  label/value rows instead of squeezed columns. */}
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <StatTile
                  label={t('details.entries')}
                  value={String(data?.count ?? tracker.transaction_count)}
                  numeric
                />
                <StatTile
                  label={t('details.created')}
                  value={formatDate(tracker.created_at)}
                />
                <StatTile
                  label={t('details.lastEntry')}
                  value={
                    tracker.last_transaction_date
                      ? formatDate(tracker.last_transaction_date)
                      : '—'
                  }
                />
              </dl>
            </div>

            {tracker.description && (
              <p className="text-sm text-muted-foreground">{tracker.description}</p>
            )}

            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="font-heading font-semibold">{t('details.transactions')}</h4>
                {entries.length > 0 && (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {t('card.entries', { count: entries.length })}
                  </span>
                )}
              </div>

              {isLoading ? (
                <div className="flex flex-col gap-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-xl" />
                  ))}
                </div>
              ) : entries.length === 0 ? (
                <p className="mx-auto max-w-sm rounded-xl border border-dashed px-4 py-8 text-center text-sm text-balance text-muted-foreground">
                  {t('details.noTransactions')}
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {entries.map((entry) => {
                    const isIncome = entry.type === 'income'
                    return (
                      <li
                        key={entry.id}
                        className="group/row flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-border hover:bg-muted/40"
                      >
                        <div
                          className={cn(
                            'flex size-9 shrink-0 items-center justify-center rounded-full',
                            isIncome
                              ? 'bg-success/15 text-success'
                              : 'bg-destructive/15 text-destructive',
                          )}
                        >
                          <HugeiconsIcon
                            icon={isIncome ? ArrowDownLeft01Icon : ArrowUpRight01Icon}
                            strokeWidth={2}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{entry.description}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[formatDate(entry.date), entry.category_name, entry.account_name]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                          {/* The amount rides under the description on phones,
                              where a third column would have squeezed both. */}
                          <p
                            className={cn(
                              'mt-0.5 text-sm font-semibold tabular-nums sm:hidden',
                              isIncome ? 'text-success' : 'text-foreground',
                            )}
                          >
                            {isIncome ? '−' : '+'}
                            {formatCurrency(entry.amount, tracker.currency)}
                          </p>
                        </div>

                        <p
                          className={cn(
                            'hidden shrink-0 text-sm font-semibold tabular-nums sm:block',
                            isIncome ? 'text-success' : 'text-foreground',
                          )}
                        >
                          {isIncome ? '−' : '+'}
                          {formatCurrency(entry.amount, tracker.currency)}
                        </p>

                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label={t('details.removeFromTrackerNamed', {
                            description: entry.description,
                          })}
                          disabled={removeTransaction.isPending}
                          onClick={() => void handleRemove(entry.transaction_id)}
                        >
                          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </ScrollArea>

        <Separator />
        {/* Stacked on phones so neither label has to shrink to fit; a row from
            sm up. Close is dropped on phones — the header's × already does it,
            and three buttons on one line is what made this feel cramped. */}
        <SheetFooter className="flex-col-reverse gap-2 bg-muted/30 p-4 sm:flex-row sm:justify-end">
          <Button
            variant="ghost"
            className="hidden sm:inline-flex"
            onClick={() => onOpenChange(false)}
          >
            {t('details.close')}
          </Button>
          {onEdit && (
            <Button variant="outline" onClick={() => onEdit(tracker)}>
              <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} data-icon="inline-start" />
              {t('details.edit')}
            </Button>
          )}
          {onAddTransaction && (
            <Button onClick={() => onAddTransaction(tracker)}>
              <HugeiconsIcon icon={MoneyAdd01Icon} strokeWidth={2} data-icon="inline-start" />
              {t('details.addTransaction')}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

/**
 * One label/value fact about the tracker. A row on phones, a centred tile from
 * sm up — the same information, laid out for the space actually available.
 */
function StatTile({
  label,
  value,
  numeric = false,
}: {
  label: string
  value: string
  numeric?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 rounded-xl bg-background px-3 py-2 sm:flex-col sm:items-center sm:justify-start sm:gap-0.5 sm:px-2.5 sm:text-center">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'font-heading text-sm font-semibold',
          numeric && 'tabular-nums',
        )}
      >
        {value}
      </dd>
    </div>
  )
}
