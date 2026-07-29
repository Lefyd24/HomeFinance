import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Calendar03Icon,
  TargetIcon,
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
import { formatCurrency, formatDate } from '../lib/format'
import { cn } from '@/lib/utils'
import { useGoalProgress, useGoalTransactions } from './useGoals'
import {
  categoryLabel,
  goalPercentage,
  isGoalComplete,
  remainingAmount,
} from './goalMeta'
import { ProgressRing } from './ProgressRing'
import type { Goal } from './goalsApi'

interface GoalDetailsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  goal: Goal | null
  onContribute?: (goal: Goal) => void
  onEdit?: (goal: Goal) => void
}

export function GoalDetailsSheet({
  open,
  onOpenChange,
  goal,
  onContribute,
  onEdit,
}: GoalDetailsSheetProps) {
  const { t } = useTranslation(['goals', 'common'])
  const goalId = open && goal ? goal.id : null
  const { data: transactions = [], isLoading: txLoading } = useGoalTransactions(goalId)
  const { data: progress } = useGoalProgress(goalId)

  if (!goal) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0" />
      </Sheet>
    )
  }

  const percentage = goalPercentage(goal)
  const clamped = Math.min(Math.max(percentage, 0), 100)
  const complete = isGoalComplete(goal)
  const remaining = remainingAmount(goal)
  const monthlyNeeded =
    progress?.monthly_contribution_needed ?? goal.monthly_contribution_needed ?? null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle className="truncate">{goal.name}</SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-xs capitalize">
              {categoryLabel(goal.category, t)}
            </Badge>
            {goal.is_primary && <Badge className="text-xs">{t('details.primary')}</Badge>}
            {complete && (
              <Badge variant="secondary" className="text-xs">
                {t('details.completed')}
              </Badge>
            )}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-6 p-4">
            <div className="flex flex-col items-center gap-4 rounded-2xl border bg-muted/30 p-6">
              <ProgressRing
                value={clamped}
                size={128}
                strokeWidth={10}
                complete={complete}
                accent={goal.color}
              >
                <div className="flex flex-col items-center">
                  <span className="text-2xl font-heading font-bold tabular-nums">
                    {clamped.toFixed(0)}%
                  </span>
                  <span className="text-xs text-muted-foreground">{t('details.complete')}</span>
                </div>
              </ProgressRing>

              <div className="flex size-12 items-center justify-center rounded-full text-2xl bg-primary/10 text-primary">
                {goal.icon || <HugeiconsIcon icon={TargetIcon} strokeWidth={2} />}
              </div>

              <div className="grid w-full grid-cols-2 gap-3 text-center">
                <div className="rounded-xl bg-background p-3">
                  <p className="text-xs text-muted-foreground">{t('details.saved')}</p>
                  <p className="mt-1 font-heading font-semibold tabular-nums">
                    {formatCurrency(goal.current_amount, goal.currency)}
                  </p>
                </div>
                <div className="rounded-xl bg-background p-3">
                  <p className="text-xs text-muted-foreground">{t('details.target')}</p>
                  <p className="mt-1 font-heading font-semibold tabular-nums">
                    {formatCurrency(goal.target_amount, goal.currency)}
                  </p>
                </div>
                <div className="rounded-xl bg-background p-3">
                  <p className="text-xs text-muted-foreground">{t('details.remaining')}</p>
                  <p className="mt-1 font-heading font-semibold tabular-nums">
                    {formatCurrency(remaining, goal.currency)}
                  </p>
                </div>
                {goal.target_date ? (
                  <div className="rounded-xl bg-background p-3">
                    <p className="text-xs text-muted-foreground">{t('details.targetDate')}</p>
                    <p className="mt-1 font-heading font-semibold">
                      {formatDate(goal.target_date)}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl bg-background p-3">
                    <p className="text-xs text-muted-foreground">{t('details.daysLeft')}</p>
                    <p className="mt-1 font-heading font-semibold">
                      {goal.days_remaining ?? progress?.days_remaining ?? '—'}
                    </p>
                  </div>
                )}
              </div>

              <Progress
                value={clamped}
                className={cn(
                  'h-2 w-full',
                  complete && '[&_[data-slot=progress-indicator]]:bg-success',
                )}
              />

              {monthlyNeeded != null && monthlyNeeded > 0 && goal.target_date && (
                <p className="text-sm text-center text-muted-foreground">
                  {t('details.saveToReach', {
                    amount: formatCurrency(monthlyNeeded, goal.currency),
                    date: formatDate(goal.target_date),
                  })}
                </p>
              )}

              {progress && goal.target_date && (
                <Badge variant={progress.on_track ? 'secondary' : 'outline'} className="text-xs">
                  {progress.on_track ? t('details.onTrack') : t('details.behindPace')}
                  {progress.average_monthly_contribution > 0 && (
                    <>
                      {' '}
                      ·{' '}
                      {t('details.avgPerMonth', {
                        amount: formatCurrency(progress.average_monthly_contribution, goal.currency),
                      })}
                    </>
                  )}
                </Badge>
              )}
            </div>

            {goal.description && (
              <p className="text-sm text-muted-foreground">{goal.description}</p>
            )}

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-heading font-semibold">{t('details.recentActivity')}</h4>
                {goal.target_date && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <HugeiconsIcon icon={Calendar03Icon} strokeWidth={2} />
                    {formatDate(goal.target_date)}
                  </span>
                )}
              </div>

              {txLoading ? (
                <div className="flex flex-col gap-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-xl" />
                  ))}
                </div>
              ) : transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {t('details.noContributions')}
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {transactions.map((tx) => {
                    const isIn = tx.type === 'contribution'
                    return (
                      <li
                        key={tx.id}
                        className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={cn(
                              'flex size-9 shrink-0 items-center justify-center rounded-full',
                              isIn
                                ? 'bg-success/15 text-success'
                                : 'bg-destructive/15 text-destructive',
                            )}
                          >
                            <HugeiconsIcon
                              icon={isIn ? ArrowDown01Icon : ArrowUp01Icon}
                              strokeWidth={2}
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {isIn ? t('details.contribution') : t('details.withdrawal')}
                            </p>
                            {tx.description && (
                              <p className="text-xs text-muted-foreground truncate">
                                {tx.description}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-end shrink-0">
                          <p
                            className={cn(
                              'text-sm font-semibold tabular-nums',
                              isIn ? 'text-success' : 'text-destructive',
                            )}
                          >
                            {isIn ? '+' : '−'}
                            {formatCurrency(tx.amount, goal.currency)}
                          </p>
                          <p className="text-xs text-muted-foreground">{formatDate(tx.date)}</p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </ScrollArea>

        <Separator />
        <SheetFooter className="flex-row gap-2 p-4">
          {!complete && onContribute && (
            <Button className="flex-1" onClick={() => onContribute(goal)}>
              {t('details.contribute')}
            </Button>
          )}
          {onEdit && (
            <Button variant="outline" className="flex-1" onClick={() => onEdit(goal)}>
              {t('details.edit')}
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('details.close')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
