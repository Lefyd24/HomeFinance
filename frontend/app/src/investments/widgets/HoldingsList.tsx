import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, useReducedMotion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon, ArrowUp01Icon } from '@hugeicons/core-free-icons'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatCurrency } from '../../lib/format'
import { DeltaPct } from '../InvestmentPrimitives'
import { positionPnl, positionValue } from '../portfolioInsights'
import { HoldingDetailCard } from './HoldingDetailCard'
import { Tile, TileEmpty } from './Tile'
import type { PortfolioPosition } from '../investmentsApi'

type SortKey = 'value' | 'day' | 'pnl' | 'return' | 'symbol'
type SortDir = 'asc' | 'desc'

const SORTS: Array<{ key: SortKey; labelKey: string }> = [
  { key: 'value', labelKey: 'detail.table.marketValue' },
  { key: 'day', labelKey: 'detail.table.dayChange' },
  { key: 'pnl', labelKey: 'detail.table.unrealizedPnl' },
  { key: 'return', labelKey: 'detail.table.returnPct' },
  { key: 'symbol', labelKey: 'detail.table.symbol' },
]

const READ: Record<SortKey, (p: PortfolioPosition) => number | null> = {
  value: (p) => positionValue(p),
  day: (p) => p.day_change_pct,
  pnl: (p) => positionPnl(p),
  return: (p) => p.unrealized_return_pct,
  symbol: () => null,
}

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
 * Losing the columns loses the ability to compare a field down the page, so
 * sorting replaces it: pick the field, and the order answers the same question
 * a column of numbers would have.
 */
export function HoldingsList({
  positions,
  currency,
  loading,
  className,
}: {
  positions: PortfolioPosition[]
  /** The scope's currency, for the weight bar and converted values. */
  currency: string
  loading: boolean
  className?: string
}) {
  const { t } = useTranslation('investments')
  const reduced = useReducedMotion()
  const [sortKey, setSortKey] = useState<SortKey>('value')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [openId, setOpenId] = useState<string | null>(null)

  const sorted = useMemo(() => {
    const rows = [...positions]
    const factor = sortDir === 'asc' ? 1 : -1
    if (sortKey === 'symbol') {
      return rows.sort((a, b) => factor * a.symbol.localeCompare(b.symbol))
    }
    const read = READ[sortKey]
    return rows.sort((a, b) => {
      const av = read(a)
      const bv = read(b)
      // Holdings with no quote sort to the bottom either way rather than
      // pretending to be zero and landing in the middle of the list.
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return factor * (av - bv)
    })
  }, [positions, sortKey, sortDir])

  const total = useMemo(
    () => positions.reduce((sum, position) => sum + positionValue(position), 0),
    [positions],
  )

  const open = useMemo(
    () => sorted.find((p) => `${p.account_id}-${p.id}` === openId) ?? null,
    [sorted, openId],
  )

  const toggle = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      // Numbers are most useful biggest-first; names are most useful A–Z.
      setSortDir(key === 'symbol' ? 'asc' : 'desc')
    }
  }

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
        footer={positions.length > 0 ? t('holding.openHint') : undefined}
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
          <div className="flex flex-col gap-2">
            {/* The sort control replaces the column headers a table would have
                had. Scrolls sideways on a phone rather than wrapping to two
                rows and pushing the list down. */}
            <div className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-0.5">
              <span className="shrink-0 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {t('holding.sortBy')}
              </span>
              {SORTS.map((sort) => {
                const active = sortKey === sort.key
                return (
                  <button
                    key={sort.key}
                    type="button"
                    onClick={() => toggle(sort.key)}
                    aria-pressed={active}
                    className={cn(
                      // Taller on touch, where these chips are the only way to
                      // reorder the list and a 20px target is a miss waiting
                      // to happen.
                      'inline-flex h-8 shrink-0 items-center gap-0.5 rounded-full px-2.5 text-[0.65rem] font-medium transition-colors sm:h-6 sm:px-2',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                      active
                        ? 'bg-primary/12 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {t(sort.labelKey)}
                    {active && (
                      <HugeiconsIcon
                        icon={sortDir === 'asc' ? ArrowUp01Icon : ArrowDown01Icon}
                        strokeWidth={2.25}
                        className="size-3 shrink-0"
                      />
                    )}
                  </button>
                )
              })}
            </div>

            <ul className="flex flex-col">
              {sorted.map((position) => (
                <HoldingRow
                  key={`${position.account_id}-${position.id}`}
                  position={position}
                  currency={currency}
                  total={total}
                  animate={!reduced}
                  onOpen={() => setOpenId(`${position.account_id}-${position.id}`)}
                />
              ))}
            </ul>
          </div>
        )}
      </Tile>

      <HoldingDetailCard position={open} currency={currency} onClose={() => setOpenId(null)} />
    </>
  )
}

function HoldingRow({
  position,
  currency,
  total,
  animate,
  onOpen,
}: {
  position: PortfolioPosition
  currency: string
  total: number
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
            {formatCurrency(position.market_value, position.currency)}
          </span>
          {/* Only worth restating when it isn't the scope's own currency. */}
          {position.currency !== currency && (
            <span className="text-[0.65rem] tabular-nums text-muted-foreground">
              {formatCurrency(value, currency)}
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
