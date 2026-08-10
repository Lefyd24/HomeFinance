import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { ChartLineData01Icon, Search01Icon } from '@hugeicons/core-free-icons'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { formatCurrency } from '../lib/format'
import { DeltaPct, InvestmentsBreadcrumb } from './InvestmentPrimitives'
import { useSymbolSearch, useCompanyProfile } from './useInvestments'
import { useTechnical, useSimulation } from './useTechnical'
import type { DriftMode, SimulationModel, TechnicalPeriod } from './technicalApi'
import { RegimeStrip } from './widgets/RegimeStrip'
import { PriceChart, LevelsList } from './widgets/PriceChart'
import { IndicatorPane } from './widgets/IndicatorPane'
import { SignalPanel } from './widgets/SignalPanel'
import { MonteCarloFan } from './widgets/MonteCarloFan'
import { OutcomeHistogram } from './widgets/OutcomeHistogram'
import { Tile } from './widgets/Tile'

/**
 * Search-then-select, never keystroke-then-fetch: `useTechnical`/`useSimulation`
 * pull a full price history plus every indicator and a 10k-path simulation, so
 * firing that on every letter typed (as a plain bound `<Input>` would) hammers
 * the API for no reason. The committed `symbol` only changes on an explicit
 * selection (or Enter), matching `TickerPicker`'s search-combobox pattern.
 */
function TickerSelect({ symbol, onSelect }: { symbol: string; onSelect: (symbol: string) => void }) {
  const { t } = useTranslation('investments')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { data: results, isFetching } = useSymbolSearch(query)

  function commit(raw: string) {
    const next = raw.trim().toUpperCase()
    if (!next) return
    onSelect(next)
    setQuery('')
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" className="min-w-40 justify-start gap-2 bg-background hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring">
          <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="size-3.5 text-muted-foreground" />
          {symbol || t('search.placeholder')}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t('search.placeholder')}
            value={query}
            onValueChange={setQuery}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !results?.length) commit(query)
            }}
          />
          <CommandList>
            {query.trim().length < 2 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                {t('search.idleDescription')}
              </p>
            ) : (
              <>
                <CommandEmpty>{isFetching ? t('news.loading') : t('search.emptyTitle')}</CommandEmpty>
                {results?.map((result) => (
                  <CommandItem key={result.symbol} value={result.symbol} onSelect={() => commit(result.symbol)}>
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
  )
}

const VALID_PERIODS: TechnicalPeriod[] = ['3m', '6m', '1y', '2y', '5y']
const DEFAULT_PERIOD: TechnicalPeriod = '1y'
const DEFAULT_HORIZON = 30
const VALID_HORIZONS = [30, 90, 180, 365]

function parsePeriod(value: string | null): TechnicalPeriod {
  return VALID_PERIODS.includes(value as TechnicalPeriod) ? (value as TechnicalPeriod) : DEFAULT_PERIOD
}

function parseHorizon(value: string | null): number {
  const n = Number(value)
  return VALID_HORIZONS.includes(n) ? n : DEFAULT_HORIZON
}

function parseModel(value: string | null): SimulationModel {
  return value === 'gbm' || value === 'student_t' ? value : 'bootstrap'
}

function parseDrift(value: string | null): DriftMode {
  return value === 'historical' || value === 'risk_free' ? value : 'zero'
}

function formatCompact(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  if (Math.abs(value) >= 1e12) return `${(value / 1e12).toFixed(2)}T`
  if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(2)}B`
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(2)}M`
  if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(1)}K`
  return value.toFixed(2)
}

/**
 * A dashboard of technical indicators plus a distributional forward view for
 * one instrument. Every indicator here is a confirming/conflicting signal
 * with a context-aware explanation, never a buy/sell instruction — see
 * docs/investments/00-research-foundations.md Part D and
 * docs/investments/03-technical-analysis.md.
 */
export function TechnicalPage() {
  const { t } = useTranslation('investments')
  const [params, setParams] = useSearchParams()

  const symbol = (params.get('symbol') ?? '').trim().toUpperCase()
  const period = parsePeriod(params.get('period'))
  const horizon = parseHorizon(params.get('horizon'))
  const model = parseModel(params.get('model'))
  const drift = parseDrift(params.get('drift'))

  function updateParams(next: {
    symbol?: string
    period?: TechnicalPeriod
    horizon?: number
    model?: SimulationModel
    drift?: DriftMode
  }) {
    const merged = new URLSearchParams(params)
    if (next.symbol !== undefined) merged.set('symbol', next.symbol)
    if (next.period !== undefined) merged.set('period', next.period)
    if (next.horizon !== undefined) merged.set('horizon', String(next.horizon))
    if (next.model !== undefined) merged.set('model', next.model)
    if (next.drift !== undefined) merged.set('drift', next.drift)
    setParams(merged, { replace: true })
  }

  const { data: technical, isLoading: technicalLoading, isError, error } = useTechnical(symbol, period)
  const { data: simulation, isLoading: simulationLoading } = useSimulation(symbol, {
    horizon,
    model,
    drift,
  })
  const { data: profile, isLoading: profileLoading } = useCompanyProfile(symbol || null)

  const regime = technical?.regime ?? null
  const isTrending = regime?.adx != null && regime.adx >= 25
  const obvSignal = technical?.signals.find((s) => s.id === 'obv')
  const obvDivergenceActive = Boolean(obvSignal?.detail_key.includes('divergence'))
  const vr5 = regime?.variance_ratio.find((v) => v.q === 5) ?? regime?.variance_ratio[0] ?? null

  const lastPrice = useMemo(() => {
    const bars = technical?.price ?? []
    return bars.length > 0 ? bars[bars.length - 1].close : null
  }, [technical?.price])

  const displayName = profile?.name ?? profile?.short_name ?? technical?.meta.name ?? null
  const companyCurrency = profile?.currency ?? technical?.meta.currency ?? undefined

  const historicalTail = useMemo(
    () => (technical?.price ?? []).slice(-90).map((bar) => ({ date: bar.date, close: bar.close })),
    [technical?.price],
  )

  const showEmpty = symbol.length === 0

  return (
    <PageContainer wide className="flex flex-col gap-5">
      <div>
        <InvestmentsBreadcrumb current={t('technical.title')} />
        <PageHeader
          title={t('technical.title')}
          description={t('technical.description')}
          className="mb-0"
          action={
            symbol ? (
              profileLoading ? (
                <div className="flex flex-col items-end gap-1.5">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ) : (
                <div className="flex flex-col items-end gap-1">
                  {displayName && (
                    <p className="max-w-56 truncate text-sm font-medium text-foreground/90">{displayName}</p>
                  )}
                  {lastPrice != null && (
                    <span className="font-heading text-2xl font-semibold tabular-nums tracking-tight">
                      {companyCurrency ? formatCurrency(lastPrice, companyCurrency) : lastPrice.toFixed(2)}
                    </span>
                  )}
                  <div className="flex items-center gap-2">
                    {profile?.market_cap != null && (
                      <span className="text-xs text-muted-foreground">
                        {formatCompact(profile.market_cap)}
                      </span>
                    )}
                    {profile?.day_change_pct != null && (
                      <DeltaPct pct={profile.day_change_pct} className="text-sm" />
                    )}
                  </div>
                </div>
              )
            ) : undefined
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
        <TickerSelect symbol={symbol} onSelect={(next) => updateParams({ symbol: next })} />
        <ToggleGroup
          type="single"
          value={period}
          onValueChange={(next) => next && updateParams({ period: next as TechnicalPeriod })}
          variant="outline"
          size="sm"
        >
          {VALID_PERIODS.map((p) => (
            <ToggleGroupItem key={p} value={p} className="px-3">
              {t(`technical.periods.${p}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {showEmpty ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={ChartLineData01Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>{t('technical.title')}</EmptyTitle>
            <EmptyDescription>{t('technical.description')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : isError ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t('technical.error', { symbol })}</EmptyTitle>
            <EmptyDescription>{error instanceof Error ? error.message : ''}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          <RegimeStrip regime={regime} bars={technical?.meta.bars ?? 0} loading={technicalLoading} symbol={symbol} />

          <PriceChart
            overlays={technical?.overlays ?? []}
            price={technical?.price ?? []}
            levels={technical?.levels ?? []}
            crossovers={technical?.crossovers ?? []}
            loading={technicalLoading}
          />

          {technical && technical.levels.length > 0 && (
            <Tile title={t('technical.levels.title')} footer={<p>{t('technical.levels.caption')}</p>}>
              <LevelsList levels={technical.levels} />
            </Tile>
          )}

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <IndicatorPane kind="rsi" panes={technical?.panes ?? []} loading={technicalLoading} trending={isTrending} />
            <IndicatorPane kind="macd" panes={technical?.panes ?? []} loading={technicalLoading} />
            <IndicatorPane
              kind="obv"
              panes={technical?.panes ?? []}
              price={technical?.price ?? []}
              loading={technicalLoading}
              divergenceActive={obvDivergenceActive}
            />
          </div>

          <SignalPanel
            signals={technical?.signals ?? []}
            confluence={technical?.confluence ?? { positive: 0, negative: 0, neutral: 0, note_key: '' }}
            loading={technicalLoading}
            regimeAdx={regime?.adx}
            varianceP={vr5?.p}
          />

          <MonteCarloFan
            data={simulation}
            loading={simulationLoading}
            symbol={symbol}
            horizon={horizon}
            model={model}
            drift={drift}
            onHorizonChange={(h) => updateParams({ horizon: h })}
            onModelChange={(m) => updateParams({ model: m })}
            onDriftChange={(d) => updateParams({ drift: d })}
            currency={technical?.meta.currency ?? undefined}
            historicalTail={historicalTail}
          />

          <OutcomeHistogram data={simulation} loading={simulationLoading} currency={technical?.meta.currency ?? undefined} />

          {technical?.meta.warnings.includes('short_history') && (
            <p className="text-xs text-muted-foreground">
              {t('technical.states.insufficientHistory', { bars: technical.meta.bars })}
            </p>
          )}
          {technical?.meta.quote_type === 'crypto' && (
            <p className="text-xs text-muted-foreground">{t('technical.states.crypto')}</p>
          )}

          <footer className="flex flex-col gap-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
            <p>{t('technical.footer.priceBasis')}</p>
            <p className="font-medium text-foreground/80">{t('technical.footer.disclaimer')}</p>
          </footer>
        </div>
      )}
    </PageContainer>
  )
}
