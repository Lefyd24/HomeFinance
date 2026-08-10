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
import { DeltaPill, SyncStatusBadge } from '../InvestmentPrimitives'
import type { InvestmentAccount } from '../investmentsApi'

/**
 * A connected account, and the control that points the workspace at it.
 *
 * Sized for the scope rail: narrow on phones so a second card peeks in,
 * wider on desktop. A 3 px left accent strip shows the account's trend
 * direction at a glance — the same flow-in / flow-out tokens used everywhere
 * else in the app. Selecting a card promotes the accent to primary and lifts
 * the card with a directional shadow.
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
  const trendPositive = (account.total_return_pct ?? 0) >= 0

  return (
    <article
      className={cn(
        // `border-2` on both states, so selecting a card changes its colour and
        // not its size — a 1px stroke swap would nudge the whole rail.
        'relative flex shrink-0 snap-start flex-col overflow-hidden rounded-xl border-2 bg-card',
        // Narrower on phones so a second card peeks in and the row reads as
        // scrollable, rather than one card filling the viewport edge to edge.
        'w-[13.5rem] sm:w-[18rem]',
        'transition-[box-shadow,border-color,opacity] duration-200 ease-out motion-reduce:transition-none',
        // 3px left accent: the card's trend in one glance before you read numbers.
        trendPositive ? 'border-l-flow-in/70' : 'border-l-flow-out/60',
        selected
          ? cn(
              'border-primary [border-left-color:var(--color-primary)]',
            )
          : 'border-border/70 opacity-70 hover:border-primary/40 hover:opacity-100',
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
