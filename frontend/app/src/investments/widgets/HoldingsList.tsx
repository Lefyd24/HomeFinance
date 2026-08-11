import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, useReducedMotion } from 'motion/react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatBalance } from '../../lib/format'
import { useBalanceVisibility } from '../../ui/BalanceVisibilityContext'
import { DeltaPct } from '../InvestmentPrimitives'
import { positionValue } from '../portfolioInsights'
import { HoldingDetailCard } from './HoldingDetailCard'
import { Tile, TileEmpty } from './Tile'
import type { InvestmentAccount, PortfolioPosition } from '../investmentsApi'

/**
 * Every holding, as rows that fit.
 *
 * This started as a ten-column table, which is fine at full page width and
 * unreadable in a tile beside other tiles — the columns either overflow or
 * squeeze until every cell wraps. So the columns are gone: each row shows the
 * four things you scan a holdings list for (what it is, how much of the
 * portfolio it is, what it's worth, how it's doing) laid out to stay legible
 * from a phone to a wide desktop, and the remaining detail moves into a card
 * you open by clicking the row.
 *
 * Fixed order — largest holding first — rather than a sort control: this is
 * a persistent sidebar now, not a tile competing for space, and a sort chip
 * row is one more control fighting a narrow column for width.
 */
export function HoldingsList({
  positions,
  currency,
  accounts,
  loading,
  className,
}: {
  positions: PortfolioPosition[]
  /** The scope's currency, for the weight bar and converted values. */
  currency: string
  /** So the detail card can look up each position's own broker for research lookups. */
  accounts: InvestmentAccount[]
  loading: boolean
  className?: string
}) {
  const { t } = useTranslation('investments')
  const { hidden } = useBalanceVisibility()
  const providerByAccountId = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.provider])),
    [accounts],
  )
  const reduced = useReducedMotion()
  const [openId, setOpenId] = useState<string | null>(null)

  const sorted = useMemo(
    () => [...positions].sort((a, b) => positionValue(b) - positionValue(a)),
    [positions],
  )

  const total = useMemo(
    () => positions.reduce((sum, position) => sum + positionValue(position), 0),
    [positions],
  )

  const open = useMemo(
    () => sorted.find((p) => `${p.account_id}-${p.id}` === openId) ?? null,
    [sorted, openId],
  )

  return (
    <>
      <Tile
        title={t('tiles.holdings')}
        className={className}
        action={
          <span className="text-[0.65rem] text-muted-foreground">
            {t('card.holdings', { count: positions.length })}
          </span>
        }
        footer={
          positions.length > 0 ? (
            <div className="flex items-center justify-between">
              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {t('card.totalValue')}
              </span>
              <span className="font-heading text-sm font-semibold tabular-nums">
                {formatBalance(total, currency, hidden)}
              </span>
            </div>
          ) : undefined
        }
      >
        {loading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-11 w-full rounded-lg" />
            ))}
          </div>
        ) : positions.length === 0 ? (
          <TileEmpty>{t('detail.noPositions')}</TileEmpty>
        ) : (
          <ul className="flex flex-col">
            {sorted.map((position) => (
              <HoldingRow
                key={`${position.account_id}-${position.id}`}
                position={position}
                currency={currency}
                total={total}
                hidden={hidden}
                animate={!reduced}
                onOpen={() => setOpenId(`${position.account_id}-${position.id}`)}
              />
            ))}
          </ul>
        )}
      </Tile>

      <HoldingDetailCard
        position={open}
        currency={currency}
        provider={open ? providerByAccountId.get(open.account_id) ?? null : null}
        onClose={() => setOpenId(null)}
      />
    </>
  )
}

function HoldingRow({
  position,
  currency,
  total,
  hidden,
  animate,
  onOpen,
}: {
  position: PortfolioPosition
  currency: string
  total: number
  hidden: boolean
  animate: boolean
  onOpen: () => void
}) {
  const { t } = useTranslation('investments')
  const value = positionValue(position)
  const share = total > 0 ? (value / total) * 100 : 0

  return (
    <motion.li
      layoutId={animate ? `holding-${position.account_id}-${position.id}` : undefined}
      className="border-b border-border/50 last:border-b-0"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={t('holding.open', { symbol: position.symbol })}
        className={cn(
          // `min-h-11` keeps the row a full touch target even when the holding
          // has no company name and the content alone would be shorter.
          'group flex min-h-11 w-full items-center gap-3 rounded-lg px-1.5 py-2 text-start transition-colors',
          'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        )}
      >
        {/* Identity. Given the leftover width so a long company name truncates
            rather than squeezing the figures, which must never wrap. */}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium leading-tight">{position.symbol}</span>
          {position.name && (
            <span className="truncate text-[0.7rem] text-muted-foreground">{position.name}</span>
          )}
        </span>

        {/* Share of the portfolio, as a bar plus its number. Hidden on the
            narrowest screens, where the value and return matter more. */}
        <span className="hidden w-24 shrink-0 flex-col gap-1 sm:flex">
          <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-chart-4 transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${Math.min(100, share)}%` }}
            />
          </span>
          <span className="text-[0.65rem] tabular-nums text-muted-foreground">
            {share.toFixed(1)}%
          </span>
        </span>

        {/* Figures. Fixed width and right-aligned so they form a column down
            the list even though this is not a table. */}
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="text-sm font-medium tabular-nums leading-tight">
            {formatBalance(position.market_value, position.currency, hidden)}
          </span>
          {/* Only worth restating when it isn't the scope's own currency. */}
          {position.currency !== currency && (
            <span className="text-[0.65rem] tabular-nums text-muted-foreground">
              {formatBalance(value, currency, hidden)}
            </span>
          )}
          <span className="flex items-baseline gap-1.5">
            <DeltaPct pct={position.day_change_pct} className="text-[0.7rem]" />
            <span className="text-[0.7rem] text-muted-foreground">·</span>
            <DeltaPct pct={position.unrealized_return_pct} className="text-[0.7rem]" />
          </span>
        </span>
      </button>
    </motion.li>
  )
}
