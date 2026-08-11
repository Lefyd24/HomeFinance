import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBalance } from '../../lib/format'
import { useBalanceVisibility } from '../../ui/BalanceVisibilityContext'
import { DeltaBar, DeltaPct, deltaScale } from '../InvestmentPrimitives'
import { topMovers } from '../portfolioInsights'
import { Tile, TileEmpty } from './Tile'
import type { PortfolioPosition } from '../investmentsApi'

/**
 * What moved today, in both directions.
 *
 * Only holdings the broker actually quoted are counted, and the tile says how
 * many that was — a portfolio where half the positions have no quote should
 * look like a partial picture, not a calm one.
 */
export function MoversTile({
  positions,
  loading,
  className,
}: {
  positions: PortfolioPosition[]
  loading: boolean
  className?: string
}) {
  const { t } = useTranslation('investments')
  const { hidden } = useBalanceVisibility()
  const movers = useMemo(() => topMovers(positions, 3), [positions])

  // One scale across gainers and losers alike, so a bar's length compares the
  // move against the biggest move of the day rather than against its own row.
  const scale = useMemo(
    () =>
      deltaScale([...movers.gainers, ...movers.losers].map((position) => position.day_change_pct)),
    [movers],
  )

  const hasMovers = movers.gainers.length > 0 || movers.losers.length > 0

  return (
    <Tile
      title={t('tiles.movers')}
      className={className}
      footer={
        movers.quoted > 0 && movers.quoted < movers.total
          ? t('tiles.quotedCount', { quoted: movers.quoted, total: movers.total })
          : undefined
      }
    >
      {loading ? (
        <Skeleton className="h-[9rem] w-full rounded-lg" />
      ) : !hasMovers ? (
        <TileEmpty>
          {movers.quoted === 0 ? t('tiles.noQuotes') : t('tiles.noMovers')}
        </TileEmpty>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {[...movers.gainers, ...movers.losers].map((position) => (
            <li key={`${position.account_id}-${position.id}`} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <Link
                  to={`/investments/research?symbol=${encodeURIComponent(position.symbol)}`}
                  className="min-w-0 truncate font-medium hover:underline"
                  title={position.name ?? position.symbol}
                >
                  {position.symbol}
                </Link>
                <span className="flex shrink-0 items-baseline gap-2">
                  {position.day_change != null && (
                    <span className="tabular-nums text-muted-foreground">
                      {formatBalance(position.day_change, position.currency, hidden)}
                    </span>
                  )}
                  <DeltaPct pct={position.day_change_pct} className="text-xs" />
                </span>
              </div>
              <DeltaBar value={position.day_change_pct} scale={scale} />
            </li>
          ))}
        </ul>
      )}
    </Tile>
  )
}
