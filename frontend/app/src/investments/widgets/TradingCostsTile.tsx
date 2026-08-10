import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatDate } from '../../lib/format'
import { Tile, TileEmpty } from './Tile'
import type { InvestmentTransaction } from '../investmentsApi'

/**
 * What trading has actually cost, in commissions.
 *
 * Freedom24-specific: every trade produces its own `fee` transaction (see
 * `Freedom24Provider.get_transactions`), so this is real, previously-unsurfaced
 * data rather than an estimate. Binance charges fees too, but usually in the
 * traded asset itself rather than cash pulled from the account, which reads
 * differently enough that lumping the two together would mislead more than help.
 */
export function TradingCostsTile({
  transactions,
  currency,
  loading,
  className,
}: {
  transactions: InvestmentTransaction[]
  currency: string
  loading: boolean
  className?: string
}) {
  const { t } = useTranslation('investments')

  const { total, fees } = useMemo(() => {
    const rows = transactions
      .filter((t) => t.type === 'fee')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const sum = rows.reduce((acc, row) => acc + Math.abs(row.amount), 0)
    return { total: sum, fees: rows.slice(0, 5) }
  }, [transactions])

  return (
    <Tile
      title={t('tiles.tradingCosts')}
      className={className}
      action={
        !loading && fees.length > 0 ? (
          <span className="text-[0.65rem] text-muted-foreground">
            {t('tiles.tradingCostsCount', { count: fees.length })}
          </span>
        ) : undefined
      }
    >
      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-6 w-full" />
        </div>
      ) : fees.length === 0 ? (
        <TileEmpty>{t('tiles.noTradingCosts')}</TileEmpty>
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t('tiles.totalCommissions')}
            </span>
            <span className="font-heading text-xl font-semibold tabular-nums tracking-tight">
              {formatCurrency(total, currency)}
            </span>
          </div>
          <ul className="flex flex-col gap-1">
            {fees.map((fee) => (
              <li key={fee.id} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {fee.symbol ?? '—'}
                </span>
                <span className="shrink-0 text-muted-foreground">{formatDate(fee.date)}</span>
                <span className="shrink-0 tabular-nums">
                  {formatCurrency(Math.abs(fee.amount), fee.currency)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Tile>
  )
}
