import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Alert02Icon,
  CheckmarkBadge01Icon,
  PencilEdit02Icon,
  RefreshIcon,
} from '@hugeicons/core-free-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { ApiError } from '../../lib/apiClient'
import { usePositionSymbolMapping, useSymbolSearch } from '../useInvestments'
import type { PositionHistory } from '../investmentsApi'

/**
 * Which listing priced this chart, how that was decided, and how to overrule it.
 *
 * A broker ticker has to be mapped onto Yahoo's before a market series can be
 * attached to a holding, and the mapping is a heuristic: `VIO.GR` could
 * plausibly resolve to a US company called VIO, and Freedom24's `.EU` covers
 * several venues that a suffix table cannot choose between. The backend
 * rejects a candidate whose currency disagrees with the broker's, which
 * catches the worst of it and still leaves cases it gets wrong.
 *
 * So the match is not just displayed, it is editable. Picking a ticker here
 * pins it for this holding — stored server-side, since positions are deleted
 * and re-inserted on every sync — and the whole chart is redrawn from the
 * instrument the user named. Every rejected candidate stays listed underneath
 * with the reason it lost, because the fastest way to know the guess was wrong
 * is usually to read what it was choosing between.
 */
export function TickerMatchPanel({
  history,
  accountId,
}: {
  history: PositionHistory
  accountId: number | null
}) {
  const { t } = useTranslation('investments')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { data: results, isFetching } = useSymbolSearch(query)
  const mapping = usePositionSymbolMapping(accountId, history.symbol)

  const matched = history.mapped_symbol != null
  const manual = history.mapping_source === 'manual'
  const rejected = history.mapping_checked.filter(([, outcome]) => outcome !== 'matched')
  const typed = query.trim().toUpperCase()

  async function apply(symbol: string | null) {
    try {
      await mapping.mutateAsync(symbol)
      setOpen(false)
      setQuery('')
      toast.success(
        symbol
          ? t('holding.history.mapping.saved', { ticker: symbol })
          : t('holding.history.mapping.reset'),
      )
    } catch (error) {
      toast.error(
        error instanceof ApiError && error.status === 400
          ? t('holding.history.mapping.rejected', { ticker: symbol })
          : t('holding.history.mapping.failed'),
      )
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-xl bg-card p-3 shadow-card">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <HugeiconsIcon
          icon={matched ? CheckmarkBadge01Icon : Alert02Icon}
          strokeWidth={2}
          className={cn(
            'size-4 shrink-0',
            matched ? 'text-[var(--flow-in)]' : 'text-[var(--flow-out)]',
          )}
        />
        <span className="text-xs font-medium">{t('holding.history.matchTitle')}</span>

        {matched ? (
          <>
            <Badge variant="outline" className="font-mono text-[0.65rem]">
              {history.symbol}
            </Badge>
            <span className="text-xs text-muted-foreground">→</span>
            <Badge variant="secondary" className="font-mono text-[0.65rem]">
              {history.mapped_symbol}
            </Badge>
            {history.mapped_currency && (
              <Badge variant="outline" className="text-[0.65rem]">
                {history.native_currency && history.native_currency !== history.mapped_currency
                  ? t('holding.history.currencyMismatch', {
                      broker: history.native_currency,
                      yahoo: history.mapped_currency,
                    })
                  : t('holding.history.currencyConfirmed', { currency: history.mapped_currency })}
              </Badge>
            )}
            {/* "We guessed" and "you told us" are different claims, and only
                one of them is worth double-checking. */}
            <Badge
              variant={manual ? 'default' : 'outline'}
              className="text-[0.65rem] font-normal"
            >
              {manual
                ? t('holding.history.mapping.manualBadge')
                : t('holding.history.mapping.autoBadge')}
            </Badge>
          </>
        ) : (
          <Badge variant="outline" className="text-[0.65rem]">
            {history.price_source === 'broker'
              ? t('holding.history.matchFallback')
              : t('holding.history.matchNone')}
          </Badge>
        )}

        <div className="ms-auto flex items-center gap-1">
          {manual && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              disabled={mapping.isPending || accountId == null}
              onClick={() => void apply(null)}
            >
              <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} data-icon="inline-start" className="size-3.5" />
              {t('holding.history.mapping.resetAction')}
            </Button>
          )}
          <Popover
            open={open}
            onOpenChange={(next) => {
              setOpen(next)
              if (!next) setQuery('')
            }}
          >
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={mapping.isPending || accountId == null}
              >
                <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} data-icon="inline-start" className="size-3.5" />
                {matched
                  ? t('holding.history.mapping.changeAction')
                  : t('holding.history.mapping.setAction')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(20rem,calc(100vw-2rem))] p-0" align="end">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder={t('holding.history.mapping.searchPlaceholder')}
                  value={query}
                  onValueChange={setQuery}
                />
                <CommandList>
                  {typed.length < 2 ? (
                    <p className="px-3 py-5 text-center text-xs text-muted-foreground">
                      {t('holding.history.mapping.searchHint')}
                    </p>
                  ) : (
                    <>
                      <CommandEmpty>
                        {isFetching
                          ? t('news.loading')
                          : t('holding.history.mapping.noResults')}
                      </CommandEmpty>
                      {results?.map((result) => (
                        <CommandItem
                          key={result.symbol}
                          value={result.symbol}
                          onSelect={() => void apply(result.symbol)}
                        >
                          <span className="font-mono text-xs font-medium">{result.symbol}</span>
                          {result.name && (
                            <span className="min-w-0 flex-1 truncate text-muted-foreground">
                              {result.name}
                            </span>
                          )}
                          {result.currency && (
                            <span className="shrink-0 text-[0.65rem] text-muted-foreground">
                              {result.currency}
                            </span>
                          )}
                        </CommandItem>
                      ))}
                      {/* Search is a convenience, not a gate: Yahoo's search
                          misses plenty of listings it will happily price, and
                          the server verifies whatever is typed anyway. */}
                      <CommandItem value={`__exact__${typed}`} onSelect={() => void apply(typed)}>
                        <span className="text-xs text-muted-foreground">
                          {t('holding.history.mapping.useExact', { ticker: typed })}
                        </span>
                      </CommandItem>
                    </>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {matched
          ? t('holding.history.sourceYahoo', { ticker: history.mapped_symbol })
          : history.price_source === 'broker'
            ? t('holding.history.sourceBroker')
            : t('holding.history.sourceNone')}
      </p>

      {rejected.length > 0 && (
        <ul className="flex flex-col gap-0.5 border-t border-border/60 pt-2 text-[0.7rem] text-muted-foreground">
          {rejected.map(([candidate, outcome, currency]) => (
            <li key={`${candidate}-${outcome}`} className="flex flex-wrap items-baseline gap-1.5">
              <span className="font-mono">{candidate}</span>
              <span>
                {outcome === 'currency'
                  ? t('holding.history.rejectCurrency', {
                      currency: currency ?? '—',
                      broker: history.native_currency ?? '—',
                    })
                  : outcome === 'no-data'
                    ? t('holding.history.rejectNoData')
                    : t('holding.history.rejectError')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
