import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '../../lib/format'
import { Tile, TileEmpty } from './Tile'
import type { InvestmentTransaction } from '../investmentsApi'

interface FlowRow {
  asset: string
  deposits: number
  withdrawals: number
}

/**
 * Money moved on-chain, in and out, per asset.
 *
 * Binance-specific: deposit/withdrawal history is real data the Binance
 * provider fetches (`get_deposit_history`/`get_withdraw_history`) that
 * Freedom24 simply cannot — the broker has no working API for it — so this
 * tells a story only a crypto account can tell.
 *
 * Kept per-asset rather than blended into one total: a deposit/withdrawal
 * amount is denominated in its own coin (no FX rate is attached to these
 * transactions the way it is on positions), so summing a BTC deposit and a
 * USDT withdrawal into one number would silently add unlike units.
 */
export function CashFlowTile({
  transactions,
  loading,
  className,
}: {
  transactions: InvestmentTransaction[]
  loading: boolean
  className?: string
}) {
  const { t } = useTranslation('investments')

  const rows = useMemo(() => {
    const byAsset = new Map<string, FlowRow>()
    for (const txn of transactions) {
      if (txn.type !== 'deposit' && txn.type !== 'withdrawal') continue
      const asset = txn.currency
      const row = byAsset.get(asset) ?? { asset, deposits: 0, withdrawals: 0 }
      if (txn.type === 'deposit') row.deposits += txn.amount
      else row.withdrawals += Math.abs(txn.amount)
      byAsset.set(asset, row)
    }
    return Array.from(byAsset.values()).sort(
      (a, b) => b.deposits + b.withdrawals - (a.deposits + a.withdrawals),
    )
  }, [transactions])

  return (
    <Tile title={t('tiles.cashFlow')} className={className}>
      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <TileEmpty>{t('tiles.noCashFlow')}</TileEmpty>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            const net = row.deposits - row.withdrawals
            return (
              <li key={row.asset} className="flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 flex-1 truncate font-medium">{row.asset}</span>
                <span className="shrink-0 text-muted-foreground">
                  {row.deposits > 0 && (
                    <span className="text-flow-in">+{formatCurrency(row.deposits, row.asset)}</span>
                  )}
                  {row.deposits > 0 && row.withdrawals > 0 && ' / '}
                  {row.withdrawals > 0 && (
                    <span className="text-flow-out">
                      −{formatCurrency(row.withdrawals, row.asset)}
                    </span>
                  )}
                </span>
                <span
                  className={`w-24 shrink-0 text-end tabular-nums ${
                    net > 0 ? 'text-flow-in' : net < 0 ? 'text-flow-out' : 'text-muted-foreground'
                  }`}
                >
                  {net > 0 ? '+' : ''}
                  {formatCurrency(net, row.asset)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Tile>
  )
}
