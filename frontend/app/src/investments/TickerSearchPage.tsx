import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { ChartLineData01Icon, News01Icon, Search01Icon } from '@hugeicons/core-free-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { cn } from '@/lib/utils'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { formatCurrency } from '../lib/format'
import {
  DeltaPct,
  InvestmentsBreadcrumb,
  MarketDataProviderSwitch,
} from './InvestmentPrimitives'
import { useInvestmentAccounts, useSymbolSearch } from './useInvestments'
import {
  isMarketDataProviderReady,
  parseMarketDataProvider,
  type MarketDataProviderId,
  type SymbolSearchResult,
} from './investmentsApi'

const MIN_QUERY_LENGTH = 2

/**
 * Instrument lookup against the selected market-data provider.
 *
 * The query and provider live in the URL so a search can be linked to, and every
 * hit links on to that symbol's news — the two market-data subpages are meant
 * to be used together, not in isolation.
 */
export function TickerSearchPage() {
  const { t } = useTranslation('investments')
  const [params, setParams] = useSearchParams()
  const submitted = params.get('q') ?? ''
  const provider = parseMarketDataProvider(params.get('provider'))
  const providerReady = isMarketDataProviderReady(provider)
  const [draft, setDraft] = useState(submitted)

  useEffect(() => setDraft(submitted), [submitted])

  const { data: accounts = [] } = useInvestmentAccounts()
  const { data: results = [], isLoading, isError, error } = useSymbolSearch(submitted, {
    minLength: MIN_QUERY_LENGTH,
    provider,
  })

  const updateParams = (next: {
    q?: string | null
    provider?: MarketDataProviderId | null
  }) => {
    const updated = new URLSearchParams(params)
    if ('q' in next) {
      if (next.q?.trim()) updated.set('q', next.q.trim())
      else updated.delete('q')
    }
    if ('provider' in next) {
      if (next.provider && next.provider !== 'yahoo') updated.set('provider', next.provider)
      else updated.delete('provider')
    }
    setParams(updated, { replace: true })
  }

  const submit = (value: string) => updateParams({ q: value })

  return (
    <PageContainer wide className="flex flex-col gap-5">
      <div>
        <InvestmentsBreadcrumb current={t('search.title')} />
        <PageHeader
          title={t('search.title')}
          description={t('search.description')}
          className="mb-0"
          action={
            <Button asChild size="sm" variant="secondary">
              <Link to="/investments/news">
                <HugeiconsIcon icon={News01Icon} strokeWidth={2} data-icon="inline-start" />
                <span className="sr-only sm:not-sr-only">{t('news.title')}</span>
              </Link>
            </Button>
          }
        />
      </div>

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-3 sm:p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t('providers.label')}
          </span>
          <MarketDataProviderSwitch
            value={provider}
            onChange={(next) => updateParams({ provider: next })}
          />
        </div>

        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            submit(draft)
          }}
        >
          <InputGroup className="flex-1 border-border/80 bg-background shadow-xs">
            <InputGroupAddon>
              <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
            </InputGroupAddon>
            <InputGroupInput
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t('search.placeholder')}
              aria-label={t('search.placeholder')}
              autoFocus
            />
          </InputGroup>
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            disabled={draft.trim().length < MIN_QUERY_LENGTH}
          >
            {t('search.action')}
          </Button>
        </form>
      </section>

      {!providerReady ? (
        <Empty className="border border-dashed bg-card/60 py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>
              {t('providers.comingSoonTitle', { provider: t(`providers.${provider}`) })}
            </EmptyTitle>
            <EmptyDescription>
              {t('providers.comingSoonDescription', { provider: t(`providers.${provider}`) })}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : accounts.length === 0 && provider === 'freedom24' ? (
        <Empty className="border border-dashed bg-card/60 py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>{t('search.needsAccountTitle')}</EmptyTitle>
            <EmptyDescription>{t('search.needsAccount')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : submitted.length < MIN_QUERY_LENGTH ? (
        <Empty className="border border-dashed bg-card/60 py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>{t('search.idleTitle')}</EmptyTitle>
            <EmptyDescription>{t('search.idleDescription')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : isError ? (
        <Empty className="border border-dashed bg-card/60 py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>{t('search.failedTitle')}</EmptyTitle>
            <EmptyDescription>
              {(error as Error)?.message || t('search.failedDescription')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : results.length === 0 ? (
        <Empty className="border border-dashed bg-card/60 py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>{t('search.emptyTitle')}</EmptyTitle>
            <EmptyDescription>
              {t('search.emptyDescription', { query: submitted })}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {t('search.resultCount', { count: results.length })}
          </p>

          <ul className="flex flex-col gap-2 md:hidden">
            {results.map((result) => (
              <li
                key={`${result.symbol}-${result.isin ?? ''}`}
                className="rounded-xl border border-border bg-card p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{result.symbol}</p>
                    {result.name && (
                      <p className="truncate text-xs text-muted-foreground">{result.name}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    {result.last_price != null && (
                      <span className="text-sm font-medium tabular-nums">
                        {formatCurrency(result.last_price, result.currency ?? 'USD')}
                      </span>
                    )}
                    <DeltaPct pct={result.day_change_pct} className="text-xs" />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {result.exchange && <Badge variant="outline">{result.exchange}</Badge>}
                  {result.instrument_type && (
                    <Badge variant="secondary" className="capitalize">
                      {result.instrument_type}
                    </Badge>
                  )}
                  <div className="ms-auto flex items-center gap-1">
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`/investments/research?symbol=${encodeURIComponent(result.symbol)}`}>
                        {t('search.viewResearch')}
                      </Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`/investments/news?symbol=${encodeURIComponent(result.symbol)}`}>
                        {t('search.viewNews')}
                      </Link>
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div
            className={cn(
              'hidden overflow-hidden rounded-xl border border-border md:block',
              'bg-card text-card-foreground shadow-xs',
            )}
          >
            <Table>
              <TableHeader className="bg-muted/70 [&_tr]:border-border">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="ps-3">{t('search.table.symbol')}</TableHead>
                  <TableHead>{t('search.table.name')}</TableHead>
                  <TableHead>{t('search.table.exchange')}</TableHead>
                  <TableHead>{t('search.table.type')}</TableHead>
                  <TableHead className="text-end">{t('search.table.lastPrice')}</TableHead>
                  <TableHead className="text-end">{t('search.table.dayChange')}</TableHead>
                  <TableHead className="pe-3 text-end">{t('search.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((result, index) => (
                  <SearchRow
                    key={`${result.symbol}-${result.isin ?? ''}`}
                    result={result}
                    striped={index % 2 === 1}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </PageContainer>
  )
}

function SearchRow({
  result,
  striped,
}: {
  result: SymbolSearchResult
  striped: boolean
}) {
  const { t } = useTranslation('investments')
  return (
    <TableRow className={cn(striped && 'bg-muted/35', 'hover:bg-muted/55')}>
      <TableCell className="ps-3 font-medium">
        {result.symbol}
        {result.isin && (
          <div className="text-xs font-normal text-muted-foreground">{result.isin}</div>
        )}
      </TableCell>
      <TableCell className="max-w-56 truncate text-foreground">{result.name ?? '—'}</TableCell>
      <TableCell>
        {result.exchange ? <Badge variant="outline">{result.exchange}</Badge> : '—'}
      </TableCell>
      <TableCell className="capitalize text-muted-foreground">
        {result.instrument_type ?? '—'}
      </TableCell>
      <TableCell className="text-end tabular-nums">
        {result.last_price != null
          ? formatCurrency(result.last_price, result.currency ?? 'USD')
          : '—'}
      </TableCell>
      <TableCell className="text-end">
        <DeltaPct pct={result.day_change_pct} />
      </TableCell>
      <TableCell className="pe-3 text-end">
        <div className="flex items-center justify-end gap-1">
          <Button asChild variant="secondary" size="sm">
            <Link to={`/investments/research?symbol=${encodeURIComponent(result.symbol)}`}>
              <HugeiconsIcon icon={ChartLineData01Icon} strokeWidth={2} data-icon="inline-start" />
              {t('search.viewResearch')}
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to={`/investments/news?symbol=${encodeURIComponent(result.symbol)}`}>
              <HugeiconsIcon icon={News01Icon} strokeWidth={2} data-icon="inline-start" />
              {t('search.viewNews')}
            </Link>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}
