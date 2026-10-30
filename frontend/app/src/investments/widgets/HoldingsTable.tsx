import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatBalance } from '../../lib/format'
import { useBalanceVisibility } from '../../ui/BalanceVisibilityContext'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DeltaAmount, DeltaPct } from '../InvestmentPrimitives'
import { positionValue } from '../portfolioInsights'
import { HoldingDetailCard } from './HoldingDetailCard'
import { HoldingsList } from './HoldingsList'
import { Tile } from './Tile'
import type { PortfolioPosition } from '../investmentsApi'

/**
 * The holdings panel as a real data table, for `md` and up — nine columns need
 * the width. Below `md` the existing `HoldingsList` cards stand in instead
 * (see `HoldingsList`'s note on why it gave up on a table of its own).
 *
 * Figures follow `HoldingsList` exactly: the *_base columns are in the
 * account's currency, avg cost and last in the instrument's own; a null day
 * change is a dash, never 0.00% — a missing quote is not "unchanged".
 */
export function HoldingsTable({
  positions,
  currency,
  loading,
  className,
}: {
  positions: PortfolioPosition[]
  /** The scope's currency, for the *_base columns and the totals. */
  currency: string
  loading: boolean
  className?: string
}) {
  const { t } = useTranslation('investments')
  const { hidden } = useBalanceVisibility()
  // Largest holding first — the same default order HoldingsList picks.
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'market_value_base', desc: true },
  ])
  const [openId, setOpenId] = useState<string | null>(null)

  const columns = useMemo(() => buildColumns(t, currency, hidden), [t, currency, hidden])

  const table = useReactTable({
    data: positions,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const open = useMemo(
    () => positions.find((p) => `${p.account_id}-${p.id}` === openId) ?? null,
    [positions, openId],
  )

  const totalMarketValue = positions.reduce((sum, p) => sum + positionValue(p), 0)
  const dayChanges = positions.map((p) => p.day_change_base).filter((v): v is number => v != null)
  const totalDayChange = dayChanges.reduce((sum, v) => sum + v, 0)
  const pnls = positions
    .map((p) => p.unrealized_pnl_base ?? p.unrealized_pnl)
    .filter((v): v is number => v != null)
  const totalPnl = pnls.reduce((sum, v) => sum + v, 0)

  return (
    <>
      <Tile
        title={t('tiles.holdings')}
        action={
          <span className="text-[0.65rem] text-muted-foreground">
            {t('card.holdings', { count: positions.length })}
          </span>
        }
        className={cn('hidden md:flex', className)}
      >
        {loading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : positions.length === 0 ? (
          <p className="flex h-full min-h-16 items-center justify-center px-2 text-center text-xs text-muted-foreground">
            {t('detail.noPositions')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className="hover:bg-transparent">
                    {headerGroup.headers.map((header) => {
                      const sorted = header.column.getIsSorted()
                      return (
                        <TableHead
                          key={header.id}
                          aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                          className={cn(
                            stickyFirstColumn(header.id) && 'sticky start-0 z-20 bg-card',
                            header.id !== 'symbol' && 'text-end',
                          )}
                        >
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex items-center gap-0.5 hover:text-foreground"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sorted && <span aria-hidden="true">{sorted === 'asc' ? '↑' : '↓'}</span>}
                          </button>
                        </TableHead>
                      )
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => {
                  const position = row.original
                  return (
                    <TableRow
                      key={row.id}
                      // Rows open in place, like the list version's rows do.
                      onClick={() => setOpenId(`${position.account_id}-${position.id}`)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setOpenId(`${position.account_id}-${position.id}`)
                        }
                      }}
                      className="group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            stickyFirstColumn(cell.column.id) &&
                              'sticky start-0 z-10 border-e border-border/50 bg-card group-hover:bg-muted/50',
                            cell.column.id !== 'symbol' && 'text-end align-top',
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  )
                })}
              </TableBody>
              <TableFooter className="bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))]">
                <TableRow className="hover:bg-transparent">
                  <TableCell className="sticky start-0 z-10 border-e border-border/50 bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))] text-start font-semibold">
                    {t('holdingsTable.total')}
                  </TableCell>
                  {/* Spacer cells for the columns the totals don't answer. */}
                  {['quantity', 'avg_price', 'current_price'].map((id) => (
                    <TableCell key={id} className="align-top" />
                  ))}
                  <TableCell className="text-end align-top tabular-nums font-semibold">
                    {formatBalance(totalMarketValue, currency, hidden)}
                  </TableCell>
                  <TableCell className="align-top text-end" />
                  <TableCell
                    className={cn(
                      'text-end align-top font-medium tabular-nums',
                      totalDayChange > 0 ? 'text-flow-in' : totalDayChange < 0 ? 'text-flow-out' : undefined,
                    )}
                  >
                    {dayChanges.length === 0 ? (
                      '—'
                    ) : (
                      `${totalDayChange > 0 ? '+' : ''}${formatBalance(totalDayChange, currency, hidden)}`
                    )}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-end align-top font-medium tabular-nums',
                      totalPnl > 0 ? 'text-flow-in' : totalPnl < 0 ? 'text-flow-out' : undefined,
                    )}
                  >
                    {pnls.length === 0 ? (
                      '—'
                    ) : (
                      `${totalPnl > 0 ? '+' : ''}${formatBalance(totalPnl, currency, hidden)}`
                    )}
                  </TableCell>
                  <TableCell className="align-top" />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </Tile>

      {/* No accounts passed: the detail card only needs a provider for research
          lookups, and a null provider is a valid answer there. */}
      <div className="md:hidden">
        <HoldingsList positions={positions} currency={currency} accounts={[]} loading={loading} />
      </div>

      <HoldingDetailCard
        position={open}
        currency={currency}
        // The connected account is not in this widget's contract; the list's
        // own card (rendered on the <md branch) passes its provider through.
        provider={null}
        onClose={() => setOpenId(null)}
      />
    </>
  )
}

/** The symbol column is the only sticky one — scroll the numbers, keep the name. */
function stickyFirstColumn(columnId: string): boolean {
  return columnId === 'symbol'
}

function buildColumns(
  t: TFunction<'investments'>,
  currency: string,
  hidden: boolean,
) {
  const helper = createColumnHelper<PortfolioPosition>()
  return [
    helper.accessor((position) => `${position.symbol} ${position.name ?? ''}`, {
      id: 'symbol',
      header: t('holdingsTable.symbol'),
      cell: (info) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{info.row.original.symbol}</span>
          {info.row.original.name && (
            <span className="truncate text-[0.65rem] text-muted-foreground">
              {info.row.original.name}
            </span>
          )}
        </div>
      ),
    }),
    helper.accessor('quantity', {
      id: 'quantity',
      header: t('holdingsTable.qty'),
      cell: (info) => <span className="tabular-nums">{info.getValue().toLocaleString('de-DE')}</span>,
    }),
    helper.accessor('avg_price', {
      id: 'avg_price',
      header: t('holdingsTable.avgCost'),
      cell: (info) =>
        info.getValue() == null ? '—' : formatBalance(info.getValue() as number, info.row.original.currency, hidden),
    }),
    helper.accessor('current_price', {
      id: 'current_price',
      header: t('holdingsTable.last'),
      cell: (info) =>
        info.getValue() == null ? '—' : formatBalance(info.getValue() as number, info.row.original.currency, hidden),
    }),
    // The base value accessor falls back to the raw market value (the same
    // rule `positionValue` uses) so sorting matches what the list showed, while
    // the cell still prints a dash when the conversion genuinely has no figure.
    helper.accessor((position) => positionValue(position), {
      id: 'market_value_base',
      header: t('holdingsTable.marketValue'),
      cell: (info) =>
        info.row.original.market_value_base == null
          ? '—'
          : formatBalance(info.getValue() as number, currency, hidden),
    }),
    helper.accessor('weight_pct', {
      id: 'weight_pct',
      header: t('holdingsTable.weight'),
      cell: (info) => {
        const pct = info.getValue()
        return (
          <div className="flex min-w-14 flex-col gap-0.5">
            <span className="tabular-nums">{pct == null ? '—' : `${pct.toFixed(1)}%`}</span>
            <span className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-primary/70"
                style={{ width: `${pct == null ? 0 : Math.min(100, Math.max(0, pct))}%` }}
              />
            </span>
          </div>
        )
      },
    }),
    helper.accessor('day_change_pct', {
      id: 'day_change_pct',
      header: t('holdingsTable.today'),
      cell: (info) => (
        <div className="flex flex-col items-end">
          {/* A null day change is a quote gap, not a flat day — print the dash,
              never 0.00%. Same for the amount below it. */}
          <DeltaPct pct={info.getValue()} />
          <DeltaAmount
            amount={info.row.original.day_change_base}
            format={(value) => formatBalance(value, currency, hidden)}
            className="text-[0.65rem]"
          />
        </div>
      ),
    }),
    helper.accessor('unrealized_pnl_base', {
      id: 'unrealized_pnl_base',
      header: t('holdingsTable.unrealizedPnl'),
      cell: (info) => (
        <div className="flex flex-col items-end">
          <DeltaAmount
            amount={info.getValue() ?? info.row.original.unrealized_pnl}
            format={(value) => formatBalance(value, currency, hidden)}
          />
          <span className="text-[0.65rem]">
            <DeltaPct pct={info.row.original.unrealized_return_pct} />
          </span>
        </div>
      ),
    }),
    helper.accessor('fees_paid_base', {
      id: 'fees_paid_base',
      header: t('holdingsTable.fees'),
      cell: (info) =>
        info.getValue() == null ? '—' : formatBalance(info.getValue() as number, currency, hidden),
    }),
  ]
}
