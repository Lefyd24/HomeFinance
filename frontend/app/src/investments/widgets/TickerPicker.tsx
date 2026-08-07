import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon, Cancel01Icon } from '@hugeicons/core-free-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { seriesColor } from '../chartConfig'
import { useSymbolSearch } from '../useInvestments'
import type { BenchmarkOption, ComparisonPeriod } from '../comparisonApi'

const PERIODS: ComparisonPeriod[] = ['1m', '3m', '6m', 'ytd', '1y', '3y', '5y', '10y', 'max']

/**
 * Currency conversion is a stretch feature here, so the choice is a short
 * fixed list rather than every ISO code — the values line up with the ones
 * the account-connect flow already offers, so nothing new to learn.
 */
const CURRENCIES = ['USD', 'EUR', 'GBP']

const NONE_VALUE = '__none__'

/**
 * The one control surface for a comparison: which instruments, against what
 * benchmark, over what period, priced in what currency.
 *
 * Selection order is meaningful, not incidental — it is the same order every
 * other tile in this feature walks `seriesColor(index)` in, so a ticker's
 * color is fixed the moment it is added and stays that color in the chart,
 * the table, everywhere. That is why symbols are chips in a row rather than
 * a multi-select: the row *is* the color legend.
 */
export function TickerPicker({
  symbols,
  onSymbolsChange,
  benchmark,
  onBenchmarkChange,
  benchmarkOptions,
  period,
  onPeriodChange,
  currency,
  onCurrencyChange,
  quickAddSymbols,
  maxSymbols = 5,
}: {
  symbols: string[]
  onSymbolsChange: (next: string[]) => void
  benchmark: string | null
  onBenchmarkChange: (next: string | null) => void
  benchmarkOptions: BenchmarkOption[]
  period: ComparisonPeriod
  onPeriodChange: (next: ComparisonPeriod) => void
  currency: string
  onCurrencyChange: (next: string) => void
  quickAddSymbols: string[]
  maxSymbols?: number
}) {
  const { t } = useTranslation('investments')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { data: results, isFetching } = useSymbolSearch(query)

  const atMax = symbols.length >= maxSymbols

  function isSelected(symbol: string): boolean {
    const upper = symbol.toUpperCase()
    return symbols.some((s) => s.toUpperCase() === upper)
  }

  function addSymbol(rawSymbol: string) {
    const symbol = rawSymbol.trim().toUpperCase()
    if (!symbol || atMax || isSelected(symbol)) return
    onSymbolsChange([...symbols, symbol])
    setQuery('')
    setOpen(false)
  }

  function removeSymbol(symbol: string) {
    onSymbolsChange(symbols.filter((s) => s !== symbol))
  }

  return (
    <div className="glass-panel flex flex-col gap-3 rounded-xl border border-border/80 p-3 sm:p-3.5">
      {/* Selection + add trigger — the color legend for every other tile. Each
          chip is tinted with its own series color so the legend reads before
          a single number has loaded. */}
      <div className="flex flex-wrap items-center gap-2">
        {symbols.map((symbol, index) => {
          const color = seriesColor(index)
          return (
            <Badge
              key={symbol}
              variant="outline"
              className="h-8 gap-1.5 rounded-full border pe-1.5 ps-3 text-sm font-semibold shadow-xs"
              style={{
                backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)`,
                borderColor: `color-mix(in oklab, ${color} 42%, var(--border))`,
                color: `color-mix(in oklab, ${color} 62%, var(--foreground))`,
              }}
            >
              {symbol}
              <button
                type="button"
                onClick={() => removeSymbol(symbol)}
                aria-label={t('compare.picker.remove', { symbol })}
                className="inline-flex size-4.5 shrink-0 items-center justify-center rounded-full text-current/70 transition-colors hover:bg-foreground/10 hover:text-current"
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3" />
              </button>
            </Badge>
          )
        })}

        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            if (!next) setQuery('')
          }}
        >
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 rounded-full border border-dashed border-border text-muted-foreground hover:border-primary/50 hover:bg-primary/6 hover:text-primary"
            >
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" className="size-3.5" />
              {t('compare.picker.addTicker')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder={t('search.placeholder')}
                value={query}
                onValueChange={setQuery}
              />
              <CommandList>
                {atMax ? (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                    {t('compare.picker.maxReached')}
                  </p>
                ) : query.trim().length < 2 ? (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                    {t('search.idleDescription')}
                  </p>
                ) : (
                  <>
                    <CommandEmpty>{isFetching ? t('news.loading') : t('search.emptyTitle')}</CommandEmpty>
                    {results?.map((result) => (
                      <CommandItem
                        key={result.symbol}
                        value={result.symbol}
                        disabled={isSelected(result.symbol)}
                        onSelect={() => addSymbol(result.symbol)}
                      >
                        <span className="font-medium">{result.symbol}</span>
                        {result.name && (
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">{result.name}</span>
                        )}
                      </CommandItem>
                    ))}
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {quickAddSymbols.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{t('compare.picker.quickAdd')}</span>
          {quickAddSymbols.map((symbol) => {
            const disabled = atMax || isSelected(symbol)
            return (
              <button
                key={symbol}
                type="button"
                disabled={disabled}
                onClick={() => addSymbol(symbol)}
                className={cn(
                  'rounded-full border border-border/70 bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/6 hover:text-primary',
                  disabled && 'pointer-events-none opacity-40',
                )}
              >
                {symbol}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 border-t border-border/60 pt-3">
        <div className="flex flex-col gap-1">
          <span className="text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t('compare.picker.benchmark')}
          </span>
          <Select
            value={benchmark ?? NONE_VALUE}
            onValueChange={(next) => onBenchmarkChange(next === NONE_VALUE ? null : next)}
          >
            <SelectTrigger size="sm" className="min-w-28 bg-background/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>{t('compare.picker.benchmarkNone')}</SelectItem>
              {benchmarkOptions.map((option) => (
                <SelectItem key={option.symbol} value={option.symbol}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t('compare.picker.period')}
          </span>
          <ToggleGroup
            type="single"
            value={period}
            onValueChange={(next) => {
              if (next) onPeriodChange(next as ComparisonPeriod)
            }}
            variant="outline"
            size="sm"
            spacing={0}
            aria-label={t('compare.picker.period')}
            className="flex-wrap bg-background/60"
          >
            {PERIODS.map((p) => (
              <ToggleGroupItem key={p} value={p} className="px-2.5 text-xs">
                {t(`compare.periods.${p}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t('compare.picker.currency')}
          </span>
          <Select value={currency} onValueChange={onCurrencyChange}>
            <SelectTrigger size="sm" className="w-20 bg-background/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
