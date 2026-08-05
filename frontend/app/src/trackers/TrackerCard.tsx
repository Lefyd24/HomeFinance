import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Calendar03Icon,
  Delete02Icon,
  MoneyAdd01Icon,
  MoreVerticalIcon,
  PencilEdit02Icon,
  PlayIcon,
  PauseIcon,
} from '@hugeicons/core-free-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '../lib/format'
import { CategoryIcon, ICON_MAP, type IconKey } from '../categories/categoryIcons'
import { ProgressRing } from '../goals/ProgressRing'
import { DEFAULT_TRACKER_COLOR, DEFAULT_TRACKER_ICON } from './trackerMeta'
import type { Tracker } from './trackersApi'

interface TrackerCardProps {
  tracker: Tracker
  onOpen: () => void
  onAddTransaction: () => void
  onEdit: () => void
  onToggleActive: () => void
  onDelete: () => void
}

/**
 * A tracker at a glance, built like a goal card but tighter.
 *
 * The lead visual splits on whether a target exists: with one, a progress ring
 * carries the icon and the percentage, exactly as a goal does; without one —
 * the common case — the ring would be a lie, so the icon gets a plain medallion
 * and the running total takes the space instead.
 */
export function TrackerCard({
  tracker,
  onOpen,
  onAddTransaction,
  onEdit,
  onToggleActive,
  onDelete,
}: TrackerCardProps) {
  const { t } = useTranslation('trackers')
  const accent = tracker.color || DEFAULT_TRACKER_COLOR
  const iconKey = (tracker.icon && tracker.icon in ICON_MAP
    ? tracker.icon
    : DEFAULT_TRACKER_ICON) as IconKey
  const hasTarget = tracker.target_amount != null && tracker.target_amount > 0
  const rawPercentage = tracker.progress_percentage ?? 0
  const clamped = Math.min(Math.max(rawPercentage, 0), 100)
  const overTarget = hasTarget && rawPercentage > 100

  return (
    <li
      className={cn(
        'glass-panel group relative flex flex-col overflow-hidden rounded-2xl border transition-all',
        tracker.is_active
          ? 'hover:border-primary/40 hover:shadow-md'
          : 'border-dashed opacity-80',
      )}
    >
      {/* A soft wash of the tracker's own colour, so a wall of cards is
          scannable by hue before you read a single word. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 end-0 w-2/3 opacity-40"
        style={{ background: `radial-gradient(circle at 85% 25%, ${accent}44, transparent 70%)` }}
      />

      <button
        type="button"
        onClick={onOpen}
        className="relative flex flex-1 items-start gap-4 p-5 text-start"
      >
        {hasTarget ? (
          <ProgressRing
            value={clamped}
            size={72}
            strokeWidth={6}
            accent={overTarget ? 'var(--destructive)' : accent}
            className="shrink-0"
          >
            <span className="text-xs font-heading font-bold tabular-nums">
              {rawPercentage.toFixed(0)}%
            </span>
          </ProgressRing>
        ) : (
          <CategoryIcon
            icon={iconKey}
            color={accent}
            className="size-[52px] shrink-0"
            size={26}
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {hasTarget && (
                  <span
                    aria-hidden
                    className="inline-flex size-5 items-center justify-center rounded-md"
                    style={{ backgroundColor: `${accent}22`, color: accent }}
                  >
                    <HugeiconsIcon icon={ICON_MAP[iconKey]} size={14} strokeWidth={2} />
                  </span>
                )}
                <p className="font-heading text-base font-semibold leading-tight truncate">
                  {tracker.name}
                </p>
                {/* Same red as the details sheet's status badge — one colour,
                    one meaning, wherever a tracker's state is shown. */}
                {!tracker.is_active && (
                  <Badge variant="destructive">{t('card.inactive')}</Badge>
                )}
              </div>
            </div>
          </div>

          <p className="font-heading text-2xl font-bold tabular-nums tracking-tight">
            {formatCurrency(tracker.total_amount, tracker.currency)}
            {hasTarget && (
              <span className="ms-1.5 text-xs font-medium text-muted-foreground">
                {t('card.ofTarget', {
                  amount: formatCurrency(tracker.target_amount!, tracker.currency),
                })}
              </span>
            )}
          </p>

          {hasTarget && (
            <Progress
              value={clamped}
              className={cn(
                'h-1.5 max-w-[16rem]',
                overTarget && '[&_[data-slot=progress-indicator]]:bg-destructive',
              )}
            />
          )}

          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span>{t('card.entries', { count: tracker.transaction_count })}</span>
            {tracker.last_transaction_date && (
              <span className="inline-flex items-center gap-1">
                <HugeiconsIcon icon={Calendar03Icon} size={13} strokeWidth={2} />
                {t('card.lastEntry', { date: formatDate(tracker.last_transaction_date) })}
              </span>
            )}
            {overTarget && (
              <span className="text-destructive font-medium">
                {t('card.overTarget', {
                  amount: formatCurrency(
                    Math.abs(tracker.remaining_amount ?? 0),
                    tracker.currency,
                  ),
                })}
              </span>
            )}
          </p>
        </div>
      </button>

      <div className="relative flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
        <Button size="sm" variant="ghost" onClick={onAddTransaction}>
          <HugeiconsIcon icon={MoneyAdd01Icon} strokeWidth={2} data-icon="inline-start" />
          {t('card.addTransaction')}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('card.actionsFor', { name: tracker.name })}
            >
              <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onEdit}>
                <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
                {t('card.menu.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleActive}>
                <HugeiconsIcon
                  icon={tracker.is_active ? PauseIcon : PlayIcon}
                  strokeWidth={2}
                />
                {tracker.is_active ? t('card.menu.deactivate') : t('card.menu.activate')}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                {t('card.menu.delete')}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}
