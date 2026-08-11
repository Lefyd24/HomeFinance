import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { formatBalance, formatDate } from '../../lib/format'
import { useBalanceVisibility } from '../../ui/BalanceVisibilityContext'
import { useEarnPositions } from '../useInvestments'
import { Tile, TileEmpty } from './Tile'

/**
 * Yield-bearing balances Binance's Simple Earn holds outside the regular spot
 * position list — invisible everywhere else on this page, since the sync
 * service only tracks spot balances. A 501 from the endpoint (no such product
 * on this provider, or no permission on the API key) renders as the same
 * quiet empty state as "no positions", not an error banner.
 */
export function EarnPositionsTile({
  accountId,
  className,
}: {
  accountId: number
  className?: string
}) {
  const { t } = useTranslation('investments')
  const { hidden } = useBalanceVisibility()
  const { data, isLoading } = useEarnPositions(accountId)
  const positions = data ?? []

  return (
    <Tile title={t('tiles.earnPositions')} className={className}>
      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : positions.length === 0 ? (
        <TileEmpty>{t('tiles.noEarnPositions')}</TileEmpty>
      ) : (
        <ul className="flex flex-col gap-2">
          {positions.map((position, index) => (
            <li
              key={`${position.asset}-${position.kind}-${index}`}
              className="flex items-center gap-2 text-xs"
            >
              <span className="min-w-0 flex-1 truncate font-medium">{position.asset}</span>
              <Badge variant="outline" className="shrink-0 text-[0.6rem]">
                {t(position.kind === 'locked' ? 'tiles.earnLocked' : 'tiles.earnFlexible')}
              </Badge>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatBalance(position.amount, position.asset, hidden)}
              </span>
              <span className="shrink-0 text-end text-muted-foreground">
                {position.apr != null
                  ? t('tiles.earnApr', { pct: `${(position.apr * 100).toFixed(1)}%` })
                  : position.lock_end_time
                    ? t('tiles.earnUnlocks', { date: formatDate(position.lock_end_time) })
                    : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  )
}
