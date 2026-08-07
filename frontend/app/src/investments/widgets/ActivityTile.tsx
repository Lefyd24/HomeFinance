import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '../../lib/format'
import { DeltaAmount } from '../InvestmentPrimitives'
import { Tile, TileEmpty } from './Tile'
import type { InvestmentTransaction, InvestmentTransactionType } from '../investmentsApi'

/** How many rows fit before the tile becomes a list instead of a summary. */
const VISIBLE = 8

/**
 * Activity types are tinted by what they do to the account, reusing the app's
 * flow tokens. The signed amount beside the badge always says the same thing,
 * so the colour is reinforcement rather than the only signal.
 */
const TXN_BADGE: Record<InvestmentTransactionType, string> = {
  buy: 'border-chart-4/40 text-chart-4',
  sell: 'border-flow-in/40 text-flow-in',
  dividend: 'border-flow-in/40 text-flow-in',
  deposit: 'border-flow-in/40 text-flow-in',
  fx: 'border-border text-muted-foreground',
  fee: 'border-flow-out/40 text-flow-out',
  tax: 'border-flow-out/40 text-flow-out',
  withdrawal: 'border-flow-out/40 text-flow-out',
}

/** The last things that happened, newest first. */
export function ActivityTile({
  transactions,
  loading,
  className,
}: {
  transactions: InvestmentTransaction[]
  loading: boolean
  className?: string
}) {
  const { t } = useTranslation('investments')
  const visible = transactions.slice(0, VISIBLE)

  return (
    <Tile
      title={t('tiles.activity')}
      className={className}
      footer={
        transactions.length > VISIBLE
          ? t('tiles.activityMore', { count: transactions.length - VISIBLE })
          : undefined
      }
    >
      {loading ? (
        <Skeleton className="h-[9rem] w-full rounded-lg" />
      ) : visible.length === 0 ? (
        <TileEmpty>{t('detail.noTransactions')}</TileEmpty>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60">
          {visible.map((txn) => (
            <li key={txn.id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
              <div className="flex min-w-0 items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn('shrink-0 px-1.5 py-0 text-[0.6rem]', TXN_BADGE[txn.type])}
                >
                  {t(`detail.txnTypes.${txn.type}`, txn.type)}
                </Badge>
                <div className="min-w-0">
                  {txn.symbol && <span className="font-medium">{txn.symbol}</span>}
                  <div className="truncate text-[0.65rem] text-muted-foreground">
                    {formatDate(txn.date)}
                    {txn.quantity != null && txn.price != null && (
                      <>
                        {' · '}
                        {txn.quantity} @ {formatCurrency(txn.price, txn.currency)}
                      </>
                    )}
                  </div>
                </div>
              </div>
              <DeltaAmount
                amount={txn.amount}
                format={(v) => formatCurrency(v, txn.currency)}
                className="shrink-0 text-xs"
              />
            </li>
          ))}
        </ul>
      )}
    </Tile>
  )
}
