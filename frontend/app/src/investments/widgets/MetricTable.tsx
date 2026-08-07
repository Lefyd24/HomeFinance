import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon, ArrowUp01Icon, HelpCircleIcon } from '@hugeicons/core-free-icons'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { seriesColor } from '../chartConfig'
import { GLOSSARY, type GlossaryEntry, type MetricId } from '../metricGlossary'
import type { InstrumentComparison } from '../comparisonApi'
import { Tile, TileEmpty } from './Tile'

/**
 * One row of `MetricTable` — a metric, how to read it off an instrument, and
 * (optionally) which direction counts as "better" for the quiet best-value cue.
 *
 * `getValue` returns the raw number/string the row sorts and compares by;
 * `format` gets both that value *and* the instrument so a caller can reach for
 * fields the plain value can't carry — e.g. rendering `ConfidenceBand` off
 * `risk_adjusted.sharpe.ci_low/ci_high` while sorting on `.value`.
 */
export interface MetricTableRow {
  id: MetricId
  getValue: (instrument: InstrumentComparison) => number | string | null
  format?: (value: number | string | null, instrument: InstrumentComparison) => ReactNode
  /** Set (true or false) to enable the best-value cue; omit for rows with no "better". */
  higherIsBetter?: boolean
  /** Return a translated reason (e.g. "n/a for funds") to show instead of a value. */
  naReason?: (instrument: InstrumentComparison) => string | null
}

interface SortState {
  rowId: MetricId
  direction: 'asc' | 'desc'
}

/**
 * The content shared by every glossary popover on this page — duplicated from
 * `InvestmentPrimitives`'s private `GlossaryBody` rather than imported, since
 * that file only exports the `Metric` card layout and this table needs the
 * label mounted inline in a `<th>`/table cell instead.
 */
function GlossaryBody({ entry }: { entry: GlossaryEntry }) {
  const { t } = useTranslation('investments')
  return (
    <div className="flex flex-col gap-1.5 text-left">
      <p className="text-xs font-semibold text-foreground">{t(entry.shortKey)}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">{t(entry.bodyKey)}</p>
      {entry.scaleKey && (
        <p className="text-xs leading-relaxed text-muted-foreground/80">{t(entry.scaleKey)}</p>
      )}
      {entry.caveatKey && (
        <p className="text-xs leading-relaxed text-flow-out/90">{t(entry.caveatKey)}</p>
      )}
      {entry.sourceKey && (
        <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground/70">
          {t(entry.sourceKey)}
        </p>
      )}
    </div>
  )
}

/**
 * A row label that is both the glossary trigger and the sort control. The two
 * affordances share one cell but must not share one click target — tapping the
 * label sorts the columns, tapping the `?` opens the popover, and neither may
 * trigger the other, so the popover trigger stops its click from bubbling.
 */
function RowLabel({
  entry,
  sort,
  onSort,
}: {
  entry: GlossaryEntry
  sort: SortState['direction'] | null
  onSort: () => void
}) {
  const { t } = useTranslation('investments')
  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={onSort}
        className={cn(
          'inline-flex items-center gap-1 rounded-sm text-left text-xs font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
          sort && 'text-primary',
        )}
      >
        {t(entry.labelKey)}
        {sort && (
          <HugeiconsIcon
            icon={sort === 'asc' ? ArrowUp01Icon : ArrowDown01Icon}
            strokeWidth={2}
            className="size-3 shrink-0"
          />
        )}
      </button>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t('compare.help', { metric: t(entry.labelKey) })}
            onClick={(event) => event.stopPropagation()}
            className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <HugeiconsIcon icon={HelpCircleIcon} strokeWidth={2} className="size-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[min(22rem,calc(100vw-2rem))] max-h-[min(24rem,70vh)] overflow-y-auto"
          collisionPadding={12}
          onClick={(event) => event.stopPropagation()}
        >
          <GlossaryBody entry={entry} />
        </PopoverContent>
      </Popover>
    </div>
  )
}

function formatDefault(value: number | string | null): ReactNode {
  if (value == null) return <span className="text-muted-foreground">—</span>
  if (typeof value === 'number') return value.toFixed(2)
  return value
}

/** Sortable, `null`-last comparator shared by both directions. */
function compareValues(a: number | string | null, b: number | string | null): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

/**
 * Rows-as-metrics, columns-as-tickers table for the risk-adjusted and
 * valuation tiles on the comparison page — the same component reused for
 * both per the plan, since the only thing that differs is which rows and
 * title get passed in.
 *
 * Metrics as rows rather than tickers, deliberately: five compared instruments
 * fit across the screen as columns, while the metric list (14+ rows) scrolls
 * naturally down the page instead of forcing a second, horizontal scrollbar.
 */
export function MetricTable({
  instruments,
  rows,
  title,
  loading = false,
  className,
}: {
  instruments: InstrumentComparison[]
  rows: MetricTableRow[]
  title: string
  loading?: boolean
  className?: string
}) {
  const { t } = useTranslation('investments')
  const [sort, setSort] = useState<SortState | null>(null)

  const sortedInstruments = useMemo(() => {
    if (!sort) return instruments
    const row = rows.find((r) => r.id === sort.rowId)
    if (!row) return instruments
    const withValues = instruments.map((instrument) => ({
      instrument,
      value: row.naReason?.(instrument) ? null : row.getValue(instrument),
    }))
    withValues.sort((a, b) =>
      sort.direction === 'asc' ? compareValues(a.value, b.value) : compareValues(b.value, a.value),
    )
    return withValues.map((entry) => entry.instrument)
  }, [instruments, rows, sort])

  function toggleSort(rowId: MetricId) {
    setSort((current) => {
      if (!current || current.rowId !== rowId) return { rowId, direction: 'desc' }
      if (current.direction === 'desc') return { rowId, direction: 'asc' }
      return null
    })
  }

  function bestSymbol(row: MetricTableRow): string | null {
    if (row.higherIsBetter == null) return null
    const candidates = instruments
      .filter((instrument) => !instrument.is_benchmark && !row.naReason?.(instrument))
      .map((instrument) => ({ instrument, value: row.getValue(instrument) }))
      .filter((entry): entry is { instrument: InstrumentComparison; value: number } =>
        typeof entry.value === 'number',
      )
    if (candidates.length < 2) return null
    const best = candidates.reduce((acc, entry) =>
      row.higherIsBetter ? (entry.value > acc.value ? entry : acc) : entry.value < acc.value ? entry : acc,
    )
    return best.instrument.symbol
  }

  if (instruments.length === 0 && !loading) {
    return (
      <Tile title={title} className={className}>
        <TileEmpty>{t('empty.title')}</TileEmpty>
      </Tile>
    )
  }

  if (loading) {
    return (
      <Tile title={title} className={className}>
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-6 w-full" />
          {rows.map((row) => (
            <Skeleton key={row.id} className="h-7 w-full" />
          ))}
        </div>
      </Tile>
    )
  }

  return (
    <Tile title={title} className={className} bodyClassName="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>
              {/* Corner cell: intentionally blank, row labels carry their own heading. */}
            </TableHead>
            {sortedInstruments.map((instrument) => {
              const index = instruments.indexOf(instrument)
              return (
                <TableHead key={instrument.symbol} className="text-end">
                  <span className="inline-flex items-center justify-end gap-1.5">
                    <span
                      aria-hidden="true"
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: seriesColor(index) }}
                    />
                    {instrument.symbol}
                    {instrument.is_benchmark && (
                      <Badge variant="outline" className="text-[0.6rem]">
                        {t('compare.picker.benchmark')}
                      </Badge>
                    )}
                  </span>
                </TableHead>
              )
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const entry = GLOSSARY[row.id]
            const winner = bestSymbol(row)
            return (
              <TableRow key={row.id}>
                <TableCell>
                  <RowLabel
                    entry={entry}
                    sort={sort?.rowId === row.id ? sort.direction : null}
                    onSort={() => toggleSort(row.id)}
                  />
                </TableCell>
                {sortedInstruments.map((instrument) => {
                  const reason = row.naReason?.(instrument) ?? null
                  const value = reason ? null : row.getValue(instrument)
                  const content = reason
                    ? <span className="text-muted-foreground">{reason}</span>
                    : row.format
                      ? row.format(value, instrument)
                      : formatDefault(value)
                  const isWinner = winner === instrument.symbol && !instrument.is_benchmark
                  return (
                    <TableCell key={instrument.symbol} className="text-end tabular-nums">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
                          isWinner &&
                            'bg-gradient-to-r from-flow-in/24 to-flow-in/8 font-semibold text-flow-in shadow-[inset_0_1px_0_color-mix(in_oklab,white_35%,transparent)] ring-1 ring-flow-in/35',
                        )}
                      >
                        {isWinner && (
                          <HugeiconsIcon
                            icon={ArrowUp01Icon}
                            strokeWidth={2.5}
                            aria-hidden="true"
                            className="size-3 shrink-0 text-flow-in"
                          />
                        )}
                        {content}
                      </span>
                    </TableCell>
                  )
                })}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Tile>
  )
}
