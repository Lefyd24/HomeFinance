import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '../../lib/format'
import { positionValue } from '../portfolioInsights'
import { Tile, TileEmpty } from './Tile'
import type { PortfolioPosition } from '../investmentsApi'

interface CurrencyRow {
  currency: string
  value: number
  pct: number
  positionCount: number
}

/**
 * How much of the portfolio sits in each currency.
 *
 * Freedom24-specific: a multi-currency brokerage account genuinely carries FX
 * risk on top of the instruments themselves — a EUR-denominated stock in a
 * USD account moves with the EUR/USD rate as well as its own price. A crypto
 * account has no analogue (everything prices in one quote asset), which is
 * why this tile is scoped to Freedom24 accounts only.
 */
export function CurrencyExposureTile({
  positions,
  currency,
  loading,
  className,
}: {
  positions: PortfolioPosition[]
  /** The scope's own currency, for the converted totals. */
  currency: string
  loading: boolean
  className?: string
}) {
  const { t } = useTranslation('investments')

  const rows = useMemo(() => {
    const byCurrency = new Map<string, { value: number; count: number }>()
    for (const position of positions) {
      const value = positionValue(position)
      if (value <= 0) continue
      const entry = byCurrency.get(position.currency) ?? { value: 0, count: 0 }
      entry.value += value
      entry.count += 1
      byCurrency.set(position.currency, entry)
    }

    const total = Array.from(byCurrency.values()).reduce((sum, e) => sum + e.value, 0)
    if (total <= 0) return [] as CurrencyRow[]

    return Array.from(byCurrency.entries())
      .map(([code, entry]) => ({
        currency: code,
        value: entry.value,
        pct: (entry.value / total) * 100,
        positionCount: entry.count,
      }))
      .sort((a, b) => b.value - a.value)
  }, [positions])

  return (
    <Tile title={t('tiles.currencyExposure')} className={className}>
      {loading ? (
        <div className="flex flex-col gap-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-8 w-full rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <TileEmpty>{t('detail.noPositions')}</TileEmpty>
      ) : rows.length === 1 ? (
        <TileEmpty>{t('tiles.singleCurrency', { currency: rows[0].currency })}</TileEmpty>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li key={row.currency} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate font-medium">{row.currency}</span>
              <span className="hidden w-16 shrink-0 flex-col sm:flex">
                <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-chart-4"
                    style={{ width: `${Math.min(100, row.pct)}%` }}
                  />
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {row.pct.toFixed(1)}%
              </span>
              <span className="shrink-0 tabular-nums">{formatCurrency(row.value, currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  )
}
