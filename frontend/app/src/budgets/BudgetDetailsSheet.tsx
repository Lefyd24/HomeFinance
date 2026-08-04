import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ProgressBar, progressVariantForPercent } from '../ui/ProgressBar'
import { formatCurrency, formatDate, todayIsoDate } from '../lib/format'
import { cn } from '@/lib/utils'
import { useBudgetSummary } from './useBudgets'
import type { Budget, BudgetSummaryPeriod } from './budgetsApi'

function periodSuffixKey(period: Budget['period']): 'perMonth' | 'perYear' | null {
  if (period === 'monthly') return 'perMonth'
  if (period === 'yearly') return 'perYear'
  return null
}

function isCurrentPeriod(period: BudgetSummaryPeriod): boolean {
  const today = todayIsoDate()
  return today >= period.period_start.slice(0, 10) && today <= period.period_end.slice(0, 10)
}

function periodStatusKey(
  period: BudgetSummaryPeriod,
): { labelKey: string; variant: 'destructive' | 'secondary' | 'outline' } | null {
  if (period.percentage > 100) return { labelKey: 'statusOver', variant: 'destructive' }
  if (period.percentage > 90) return { labelKey: 'statusAlmost', variant: 'secondary' }
  if (period.spent === 0) return { labelKey: 'statusNoSpending', variant: 'outline' }
  return null
}

interface BudgetDetailsSheetProps {
  budget: Budget | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function BudgetDetailsSheet({ budget, open, onOpenChange }: BudgetDetailsSheetProps) {
  const { t } = useTranslation('budgets')
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [openPeriods, setOpenPeriods] = useState<string[]>([])

  useEffect(() => {
    if (open) {
      setYear(new Date().getFullYear())
      setOpenPeriods([])
    }
  }, [open, budget?.id])

  const { data: summary, isLoading, isFetching } = useBudgetSummary(open && budget ? budget.id : null, year)

  useEffect(() => {
    if (!summary?.periods.length) return
    const current = summary.periods.find(isCurrentPeriod)
    if (!current) return
    setOpenPeriods((prev) => (prev.includes(current.label) ? prev : [...prev, current.label]))
  }, [summary])

  const yearTotal = summary?.year_total
  const loading = isLoading || (isFetching && !summary)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full p-0 flex flex-col gap-0 data-[side=right]:sm:max-w-xl data-[side=right]:md:max-w-2xl"
        showCloseButton
      >
        <SheetHeader className="border-b border-border px-4 py-4 sm:px-6">
          <SheetTitle>{budget?.name ?? t('details.titleFallback')}</SheetTitle>
          <SheetDescription>
            {t('details.description', { year })}
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setYear((y) => y - 1)}
            aria-label={t('details.prevYearAria', { year: year - 1 })}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} data-icon="inline-start" />
            <span className="hidden sm:inline">{year - 1}</span>
          </Button>
          <span className="text-lg font-heading font-semibold tabular-nums">{year}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setYear((y) => y + 1)}
            aria-label={t('details.nextYearAria', { year: year + 1 })}
          >
            <span className="hidden sm:inline">{year + 1}</span>
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} data-icon="inline-end" />
          </Button>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="flex flex-col gap-4 px-4 pb-6 sm:px-6">
            {loading ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
            ) : !summary || !yearTotal ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('details.unableToLoad')}</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MetricTile
                    label={t('details.budgetPeriod', {
                      suffix: periodSuffixKey(summary.budget.period)
                        ? t(`details.${periodSuffixKey(summary.budget.period)}`)
                        : '',
                    })}
                    value={formatCurrency(summary.budget.amount)}
                  />
                  <MetricTile label={t('details.yearBudget')} value={formatCurrency(yearTotal.budget_amount)} />
                  <MetricTile
                    label={t('details.yearSpent')}
                    value={formatCurrency(yearTotal.spent)}
                    valueClassName="text-destructive"
                  />
                  <MetricTile
                    label={t('details.yearRemaining')}
                    value={`${yearTotal.remaining < 0 ? '−' : ''}${formatCurrency(Math.abs(yearTotal.remaining))}`}
                    valueClassName={yearTotal.remaining < 0 ? 'text-destructive' : 'text-success'}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{t('details.yearUsage')}</span>
                    <span className="tabular-nums">{yearTotal.percentage}%</span>
                  </div>
                  <ProgressBar
                    value={yearTotal.percentage}
                    variant={progressVariantForPercent(yearTotal.percentage)}
                  />
                </div>

                <Separator />

                {summary.periods.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">{t('details.noDataForYear')}</p>
                ) : (
                  <Accordion
                    type="multiple"
                    value={openPeriods}
                    onValueChange={setOpenPeriods}
                    className="flex flex-col gap-2"
                  >
                    {summary.periods.map((period) => {
                      const current = isCurrentPeriod(period)
                      const status = periodStatusKey(period)
                      return (
                        <AccordionItem
                          key={period.label}
                          value={period.label}
                          className={cn(
                            'overflow-hidden rounded-xl border border-border bg-card',
                            current && 'border-primary/50',
                          )}
                        >
                          <AccordionTrigger className="gap-2 rounded-none border-0 px-3 py-3 hover:no-underline focus-visible:border-0 focus-visible:ring-0 sm:px-4">
                            <div className="flex w-full min-w-0 flex-col gap-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <span className="truncate text-sm font-semibold sm:text-base">
                                    {period.label}
                                  </span>
                                  {current && (
                                    <Badge variant="default" className="shrink-0 text-[10px]">
                                      {t('details.current')}
                                    </Badge>
                                  )}
                                  {status && (
                                    <Badge variant={status.variant} className="shrink-0 text-[10px]">
                                      {t(`details.${status.labelKey}`)}
                                    </Badge>
                                  )}
                                </div>
                                <span className="shrink-0 text-xs tabular-nums sm:text-sm">
                                  <span
                                    className={cn(
                                      'font-semibold',
                                      period.spent > period.budget_amount && 'text-destructive',
                                    )}
                                  >
                                    {formatCurrency(period.spent)}
                                  </span>
                                  <span className="text-muted-foreground"> / {formatCurrency(period.budget_amount)}</span>
                                </span>
                              </div>
                              <ProgressBar
                                value={period.percentage}
                                variant={progressVariantForPercent(period.percentage)}
                                className="h-1"
                              />
                            </div>
                          </AccordionTrigger>

                          <AccordionContent className="px-0 pt-0 pb-0">
                            <div className="border-t border-border px-2 pb-3 pt-2 sm:px-4">
                              {period.transactions.length === 0 ? (
                                <p className="py-2 text-sm text-muted-foreground">
                                  {t('details.noTransactions')}
                                </p>
                              ) : (
                                <>
                                  <div className="overflow-hidden rounded-lg border border-border">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>{t('details.table.date')}</TableHead>
                                          <TableHead>{t('details.table.description')}</TableHead>
                                          <TableHead className="hidden sm:table-cell">{t('details.table.category')}</TableHead>
                                          <TableHead className="hidden md:table-cell">{t('details.table.account')}</TableHead>
                                          <TableHead className="text-end">{t('details.table.amount')}</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {period.transactions.map((tx) => (
                                          <TableRow key={tx.id}>
                                            <TableCell className="whitespace-nowrap text-xs">
                                              {formatDate(tx.date)}
                                            </TableCell>
                                            <TableCell>
                                              <div className="max-w-[10rem] truncate sm:max-w-none">
                                                {tx.description}
                                              </div>
                                              <div className="mt-0.5 sm:hidden">
                                                <Badge variant="outline" className="text-[10px]">
                                                  {tx.category_name ?? t('details.table.uncategorized')}
                                                </Badge>
                                              </div>
                                            </TableCell>
                                            <TableCell className="hidden sm:table-cell">
                                              <Badge variant="outline" className="text-[10px]">
                                                {tx.category_name ?? t('details.table.uncategorized')}
                                              </Badge>
                                            </TableCell>
                                            <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                                              {tx.account_name ?? '—'}
                                            </TableCell>
                                            <TableCell className="text-end font-medium tabular-nums text-destructive whitespace-nowrap">
                                              −{formatCurrency(tx.amount)}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                      <TableFooter>
                                        <TableRow>
                                          <TableCell colSpan={2} className="sm:hidden text-xs">
                                            {t('details.totalMobile', { count: period.transactions.length })}
                                          </TableCell>
                                          <TableCell colSpan={3} className="hidden sm:table-cell text-xs">
                                            {t('details.totalDesktop', { count: period.transactions.length })}
                                          </TableCell>
                                          <TableCell className="hidden md:table-cell" />
                                          <TableCell className="text-end tabular-nums text-destructive">
                                            −{formatCurrency(period.spent)}
                                          </TableCell>
                                        </TableRow>
                                      </TableFooter>
                                    </Table>
                                  </div>
                                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2 text-xs">
                                    <span className="text-muted-foreground">
                                      {t('details.percentUsed', { percent: Math.round(period.percentage) })}
                                    </span>
                                    <span
                                      className={cn(
                                        'font-medium tabular-nums',
                                        period.remaining < 0 ? 'text-destructive' : 'text-success',
                                      )}
                                    >
                                      {period.remaining < 0 ? '−' : ''}
                                      {formatCurrency(Math.abs(period.remaining))}{' '}
                                      {period.remaining < 0 ? t('details.over') : t('details.left')}
                                    </span>
                                  </div>
                                </>
                              )}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )
                    })}
                  </Accordion>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function MetricTile({
  label,
  value,
  valueClassName,
}: {
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="rounded-xl bg-muted/50 p-2.5">
      <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
      <p className={cn('text-sm font-bold tabular-nums sm:text-base', valueClassName)}>{value}</p>
    </div>
  )
}
