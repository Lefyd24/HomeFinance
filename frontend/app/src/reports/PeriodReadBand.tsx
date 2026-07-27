import { Link } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight, Minus, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatCurrency } from '../lib/format'
import { useChartTheme } from './chartTheme'
import { Sparkline } from './Sparkline'
import {
  advisorPrompt,
  buildRead,
  percentChange,
  savingsRate,
  type PeriodTotals,
} from './periodRead'
import type { ReportFilters } from './useReportFilters'

/**
 * The page opens with a sentence, not a chart.
 *
 * Everything below this band is evidence for the claim made here, and the one
 * button on it hands the same period straight to the advisor — so "why?" is
 * one click from "what".
 */
export function PeriodReadBand({
  current,
  previous,
  loading,
  filters,
}: {
  current: PeriodTotals | null
  previous: PeriodTotals | null
  loading: boolean
  filters: ReportFilters
}) {
  const theme = useChartTheme()

  if (loading || !current) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <Skeleton className="h-8 w-3/4 max-w-xl" />
        <Skeleton className="mt-3 h-4 w-1/2 max-w-md" />
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      </section>
    )
  }

  const read = buildRead(current, previous)
  const net = current.income - current.expenses
  const rate = savingsRate(current)
  const previousRate = previous ? savingsRate(previous) : null

  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-card p-5 shadow-sm sm:p-6',
        read.tone === 'positive' && 'border-success/35',
        read.tone === 'negative' && 'border-destructive/35',
        read.tone === 'neutral' && 'border-border',
      )}
    >
      {/* A single hairline of accent along the top edge — the only decoration
          on the page, carrying the period's verdict. */}
      <span
        aria-hidden
        className={cn(
          'absolute inset-x-0 top-0 h-0.5',
          read.tone === 'positive' && 'bg-success',
          read.tone === 'negative' && 'bg-destructive',
          read.tone === 'neutral' && 'bg-border',
        )}
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            The period in one line
          </p>
          <h2 className="mt-2 font-heading text-2xl font-bold leading-snug tracking-tight text-foreground sm:text-3xl">
            {read.headline}
          </h2>
          {read.detail && <p className="mt-2 text-sm text-muted-foreground">{read.detail}</p>}
        </div>

        <Button asChild variant="outline" className="shrink-0">
          <Link
            to={`/ai-advisor?q=${encodeURIComponent(advisorPrompt(filters.startDate, filters.endDate, filters.tab))}`}
          >
            <Sparkles data-icon="inline-start" />
            Ask the advisor about this
          </Link>
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4">
        <Metric
          label="Money in"
          value={formatCurrency(current.income)}
          change={previous ? percentChange(current.income, previous.income) : null}
          changeIsGood={(delta) => delta >= 0}
          series={current.incomeSeries}
          color={theme.positive}
        />
        <Metric
          label="Money out"
          value={formatCurrency(current.expenses)}
          change={previous ? percentChange(current.expenses, previous.expenses) : null}
          changeIsGood={(delta) => delta <= 0}
          series={current.expenseSeries}
          color={theme.negative}
        />
        <Metric
          label="Net"
          value={formatCurrency(net)}
          change={previous ? percentChange(net, previous.income - previous.expenses) : null}
          changeIsGood={(delta) => delta >= 0}
          series={current.netSeries}
          color={theme.neutral}
        />
        <Metric
          label="Savings rate"
          value={rate === null ? '—' : `${rate.toFixed(0)}%`}
          change={rate !== null && previousRate !== null ? rate - previousRate : null}
          changeIsGood={(delta) => delta >= 0}
          changeUnit="pp"
          series={current.netSeries}
          color={theme.neutral}
        />
      </div>
    </section>
  )
}

function Metric({
  label,
  value,
  change,
  changeIsGood,
  changeUnit = '%',
  series,
  color,
}: {
  label: string
  value: string
  change: number | null
  changeIsGood: (delta: number) => boolean
  changeUnit?: string
  series: number[]
  color: string
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-xl font-bold tabular-nums tracking-tight text-foreground">
        {value}
      </p>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <DeltaChip change={change} isGood={changeIsGood} unit={changeUnit} />
        <Sparkline values={series} color={color} className="shrink-0" />
      </div>
    </div>
  )
}

/**
 * A change always ships with an arrow and a "vs prior" label, so direction is
 * never carried by colour alone.
 */
function DeltaChip({
  change,
  isGood,
  unit,
}: {
  change: number | null
  isGood: (delta: number) => boolean
  unit: string
}) {
  if (change === null || Math.abs(change) < 0.5) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="size-3" />
        Flat vs prior
      </span>
    )
  }

  const good = isGood(change)
  const Icon = change > 0 ? ArrowUpRight : ArrowDownRight

  return (
    <span
      className={cn(
        'flex items-center gap-1 text-xs font-medium tabular-nums',
        good ? 'text-success' : 'text-destructive',
      )}
    >
      <Icon className="size-3" />
      {Math.abs(change).toFixed(unit === 'pp' ? 1 : 0)}
      {unit} vs prior
    </span>
  )
}
