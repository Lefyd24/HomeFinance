import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { formatCurrency, formatDate } from '../lib/format'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { DeltaAmount, DeltaPct, InvestmentsBreadcrumb } from './InvestmentPrimitives'
import { useInvestmentAccounts, usePositionHistory } from './useInvestments'
import { PositionJourneyChart } from './widgets/PositionJourneyChart'
import { TickerMatchPanel } from './widgets/TickerMatchPanel'
import { Tile } from './widgets/Tile'
import type { PositionHistoryRange } from './investmentsApi'

/**
 * One real holding, given the full page the scenario sandbox gives a
 * hypothesis.
 *
 * The overview's detail card answers "what is this worth right now"; this
 * answers "how did it get here" — the same shape as `ScenarioDetailPage`
 * (breadcrumb, header, headline figures, journey chart, an audit table under
 * a disclosure) so the two read as one family rather than as two features
 * that happen to both draw lines.
 *
 * `TickerMatchPanel` is not decoration. No broker records a per-position
 * valuation history, so the series is the account's own trades priced against
 * a market series — which means a broker ticker had to be matched to a Yahoo
 * listing first, by heuristic. That match is shown, with the currency check
 * that confirmed it and every candidate that lost, where the reader can see it
 * rather than in a comment they never will.
 */
export function HoldingHistoryPage() {
  const { t } = useTranslation('investments')
  const { accountId, symbol } = useParams<{ accountId: string; symbol: string }>()
  const id = accountId ? Number(accountId) : null
  const ticker = symbol ? decodeURIComponent(symbol) : null

  const [range, setRange] = useState<PositionHistoryRange>('entry')
  const { data: accounts = [] } = useInvestmentAccounts()
  const account = accounts.find((a) => a.id === id) ?? null
  // `isFetching` rather than `isLoading`: the query keeps the previous range's
  // data on screen while the next one loads, so the chart dims instead of the
  // whole page falling back to a skeleton every time a range is picked.
  const { data: history, isLoading, isError, isFetching } = usePositionHistory(id, ticker, range)

  if (isLoading) {
    return (
      <PageContainer wide className="flex flex-col gap-5">
        <InvestmentsBreadcrumb current={ticker ?? ''} />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </PageContainer>
    )
  }

  if (isError || !history) {
    return (
      <PageContainer wide className="flex flex-col gap-5">
        <InvestmentsBreadcrumb current={ticker ?? ''} />
        <Empty className="rounded-xl border border-dashed bg-card py-10 shadow-sm">
          <EmptyHeader>
            <EmptyTitle>{t('holding.history.emptyTitle')}</EmptyTitle>
            <EmptyDescription>{t('holding.history.emptyDescription')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </PageContainer>
    )
  }

  const money = (value: number) => formatCurrency(value, history.currency)
  const totalPaid = history.cost_basis + history.fees_paid
  const netPnl = history.unrealized_pnl - history.fees_paid
  const netPct = totalPaid ? (netPnl / totalPaid) * 100 : null

  return (
    <PageContainer wide className="flex flex-col gap-5">
      <div>
        <InvestmentsBreadcrumb current={history.symbol} />
        <PageHeader
          title={history.symbol}
          description={
            history.opened_on
              ? t('holding.history.subtitle', {
                  name: history.name ?? history.symbol,
                  date: formatDate(history.opened_on),
                  account: account?.name ?? '',
                })
              : (history.name ?? history.symbol)
          }
          className="mb-0"
        />
      </div>

      {/* The figures the chart is a picture of, in the order the money moved.
          Cost and commission share a card because they are two halves of one
          question — what this position took out of the account — and the two
          returns sit side by side because the only way to see what the
          commission actually cost you is to read them against each other. */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Stat
          label={t('holding.history.investedLabel')}
          value={money(history.cost_basis)}
          hint={t('holding.history.investedHint')}
          secondaryLabel={t('holding.breakdown.fees')}
          secondaryValue={money(history.fees_paid)}
        />
        <Stat
          label={t('detail.table.marketValue')}
          value={money(history.market_value)}
          hint={t('holding.history.marketValueHint')}
        />
        <Stat
          label={t('holding.breakdown.grossReturn')}
          hint={t('holding.history.grossReturnHint')}
          value={
            <span className="flex flex-wrap items-baseline gap-2">
              <DeltaAmount amount={history.unrealized_pnl} format={money} className="text-lg" />
              <DeltaPct pct={history.unrealized_return_pct} className="text-xs" />
            </span>
          }
        />
        <Stat
          label={t('holding.breakdown.netReturn')}
          hint={t('holding.history.netReturnHint')}
          value={
            <span className="flex flex-wrap items-baseline gap-2">
              <DeltaAmount amount={netPnl} format={money} className="text-lg" />
              <DeltaPct pct={netPct} className="text-xs" />
            </span>
          }
        />
      </div>

      <PositionJourneyChart
        series={history.series}
        currency={history.currency}
        openedOn={history.opened_on}
        buyDates={history.buy_dates}
        range={range}
        onRangeChange={setRange}
        loading={isFetching}
      />

      <TickerMatchPanel history={history} accountId={id} />

      {history.series.length > 0 && (
        <Collapsible className="overflow-hidden rounded-xl bg-card p-3 shadow-card">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-fit px-0 text-xs text-muted-foreground">
              {t('holding.history.dailyTable')}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 max-h-80 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('scenarios.detail.table.date')}</TableHead>
                  <TableHead className="text-end">{t('detail.table.quantity')}</TableHead>
                  <TableHead className="text-end">{t('detail.table.currentPrice')}</TableHead>
                  <TableHead className="text-end">{t('scenarios.detail.table.value')}</TableHead>
                  <TableHead className="text-end">
                    {t('scenarios.detail.table.invested')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...history.series].reverse().map((point) => (
                  <TableRow key={point.date}>
                    <TableCell className="text-xs">{formatDate(point.date)}</TableCell>
                    <TableCell className="text-end text-xs tabular-nums text-muted-foreground">
                      {point.quantity}
                    </TableCell>
                    <TableCell className="text-end text-xs tabular-nums text-muted-foreground">
                      {point.price != null ? money(point.price) : '—'}
                    </TableCell>
                    <TableCell className="text-end text-xs tabular-nums">
                      {point.value != null ? money(point.value) : '—'}
                    </TableCell>
                    <TableCell className="text-end text-xs tabular-nums text-muted-foreground">
                      {point.invested != null ? money(point.invested) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CollapsibleContent>
        </Collapsible>
      )}
    </PageContainer>
  )
}

/**
 * One headline figure, optionally with a second one under it.
 *
 * The secondary slot exists for commission, which belongs with the cost it was
 * charged on rather than in a card of its own competing for the same attention
 * as the market value — it is a component of what was paid, not a peer of it.
 */
function Stat({
  label,
  value,
  hint,
  secondaryLabel,
  secondaryValue,
}: {
  label: string
  value: React.ReactNode
  hint?: string
  secondaryLabel?: string
  secondaryValue?: React.ReactNode
}) {
  return (
    <Tile>
      <div className="flex flex-col gap-0.5">
        <span className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </span>
        <span className="font-heading text-lg font-semibold tabular-nums tracking-tight">
          {value}
        </span>
        {secondaryLabel && (
          <span className="mt-1 flex items-baseline justify-between gap-2 border-t border-border/60 pt-1 text-xs">
            <span className="min-w-0 truncate text-muted-foreground">{secondaryLabel}</span>
            <span className="shrink-0 tabular-nums">{secondaryValue}</span>
          </span>
        )}
        {hint && <span className="text-[0.7rem] leading-snug text-muted-foreground">{hint}</span>}
      </div>
    </Tile>
  )
}
