import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Delete02Icon,
  Key01Icon,
  MoreVerticalIcon,
  PencilEdit02Icon,
  Refresh01Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { formatCurrency } from '../../lib/format'
import { AccountIcon } from '../../accounts/bankIcons'
import { Sparkline } from '../../reports/Sparkline'
import { computeRange } from '../../reports/useReportFilters'
import { DeltaPill, SyncStatusBadge } from '../InvestmentPrimitives'
import { useInvestmentHistory } from '../useInvestments'
import type { InvestmentAccount } from '../investmentsApi'

/**
 * A connected account, and the control that points the workspace at it.
 *
 * Unchanged in spirit from the card this page has always had — the trend as a
 * faded backdrop rather than a caption-sized chip, the figures over it — but
 * sized for the scope rail rather than a two-column grid, since selecting an
 * account now rescopes the whole page instead of opening a panel underneath.
 */
export function AccountCard({
  account,
  selected,
  onSelect,
  onEdit,
  onRotateKeys,
  onDelete,
  onSync,
  syncDisabled,
}: {
  account: InvestmentAccount
  selected: boolean
  onSelect: () => void
  onEdit: () => void
  onRotateKeys: () => void
  onDelete: () => void
  onSync: () => void
  syncDisabled: boolean
}) {
  const { t } = useTranslation('investments')
  const money = (value: number) => formatCurrency(value, account.currency)
  const historyParams = useMemo(() => ({ start_date: computeRange('3m').start }), [])
  const { data: history = [] } = useInvestmentHistory(account.id, historyParams)
  const sparkValues = useMemo(() => history.map((h) => h.total_value), [history])
  const sparkColor = (account.total_return_pct ?? 0) >= 0 ? 'var(--flow-in)' : 'var(--flow-out)'

  return (
    <article
      className={cn(
        // `border-2` on both states, so selecting a card changes its colour and
        // not its size — a 1px stroke swap would nudge the whole rail.
        'glass-panel relative flex shrink-0 snap-start flex-col overflow-hidden rounded-xl border-2',
        // Narrower on phones so a second card peeks in and the row reads as
        // scrollable, rather than one card filling the viewport edge to edge.
        'w-[13.5rem] sm:w-[16rem]',
        'transition-[box-shadow,border-color,opacity] duration-200 ease-out motion-reduce:transition-none',
        selected
          ? cn(
              // Border only — no tint or ring, which fought the sparkline
              // backdrop behind it. A heavier stroke plus a shadow cast down
              // and to the start edge is enough to lift the card off the rail.
              'border-primary',
              'shadow-[-8px_8px_20px_-10px_var(--glass-shadow-depth)]',
              'rtl:shadow-[8px_8px_20px_-10px_var(--glass-shadow-depth)]',
            )
          : 'border-border/70 opacity-90 hover:border-primary/40 hover:opacity-100',
      )}
    >
      {/* A real button covering the card rather than a click handler on the
          article, so it is reachable by keyboard and announced as selected.
          Content sits above it via pointer-events; the menu opts back in. */}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="absolute inset-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="sr-only">{t('card.selectAccount', { name: account.name })}</span>
      </button>

      {/* Trend as the card's own texture: it fills the right half and fades
          into the left, so it never competes with the figures over it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 end-0 w-3/5 opacity-70 [mask-image:linear-gradient(to_right,transparent,black_38%)]"
      >
        <Sparkline
          values={sparkValues}
          color={sparkColor}
          width={220}
          height={160}
          className="size-full"
        />
      </div>

      <div className="pointer-events-none relative flex flex-col gap-2 p-2.5">
        <div className="flex items-center gap-2">
          <AccountIcon
            icon={
              account.icon ??
              (account.provider === 'freedom24' || account.provider === 'binance'
                ? `${account.provider}.svg`
                : null)
            }
            type="investment"
            className="size-8 shrink-0"
            imageClassName="size-5"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-medium leading-tight" title={account.name}>
                {account.name}
              </p>
              <SyncStatusBadge status={account.sync_status} iconOnly />
            </div>
            <span className="text-[0.65rem] font-medium capitalize text-muted-foreground">
              {account.provider}
            </span>
          </div>
          <div className="pointer-events-auto shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  // Full touch target on phones, tightened once there's a
                  // pointer — this sits inside a card, so the slack matters.
                  className="-me-1 size-9 opacity-70 sm:size-7"
                  aria-label={t('card.actionsLabel')}
                >
                  <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2} className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={onSync} disabled={syncDisabled}>
                    <HugeiconsIcon icon={Refresh01Icon} strokeWidth={2} />
                    {t('detail.syncNow')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onEdit}>
                    <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
                    {t('card.edit')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onRotateKeys}>
                    <HugeiconsIcon icon={Key01Icon} strokeWidth={2} />
                    {t('edit.rotateKeys')}
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={onDelete}>
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                    {t('card.delete')}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex items-end justify-between gap-2">
          <span className="font-heading text-lg font-semibold leading-none tabular-nums tracking-tight">
            {money(account.balance)}
          </span>
          <DeltaPill pct={account.total_return_pct} />
        </div>

        <dl className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[0.7rem]">
          <div className="flex items-baseline gap-1">
            <dt className="text-muted-foreground">{t('card.holdingsShort')}</dt>
            <dd className="font-medium tabular-nums">{account.position_count}</dd>
          </div>
          <div className="flex items-baseline gap-1">
            <dt className="text-muted-foreground">{t('card.cash')}</dt>
            <dd className="font-medium tabular-nums">{money(account.cash_balance)}</dd>
          </div>
        </dl>
      </div>
    </article>
  )
}
