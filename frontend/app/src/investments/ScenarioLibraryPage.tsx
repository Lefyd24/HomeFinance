import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { FlashIcon } from '@hugeicons/core-free-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '../lib/format'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { DeltaPct, DeltaPill, InvestmentsBreadcrumb } from './InvestmentPrimitives'
import { useScenarios, useTrackRecord } from './useScenarios'
import { TrackRecordTile } from './widgets/TrackRecordTile'
import type { ScenarioKind, ScenarioStatus, ScenarioSummary } from './scenariosApi'

const KIND_FILTERS: Array<'all' | ScenarioKind> = ['all', 'backtest', 'forward']
const STATUS_FILTERS: Array<'all' | ScenarioStatus> = ['all', 'active', 'closed']
const SORTS: Array<'newest' | 'best' | 'worst'> = ['newest', 'best', 'worst']

function ScenarioCard({ scenario }: { scenario: ScenarioSummary }) {
  const { t } = useTranslation('investments')
  const positive = (scenario.last_return_pct ?? 0) >= 0
  const vsBenchmark =
    scenario.last_return_pct != null && scenario.last_benchmark_return_pct != null
      ? (scenario.last_return_pct - scenario.last_benchmark_return_pct) * 100
      : null

  return (
    <Link
      to={`/investments/scenarios/${scenario.id}`}
      className={cn(
        'glass-panel relative flex flex-col gap-2.5 rounded-xl border-2 border-l-[3px] p-3',
        'transition-[box-shadow,border-color,opacity] duration-200 ease-out motion-reduce:transition-none',
        positive ? 'border-l-flow-in/70' : 'border-l-flow-out/60',
        'border-border/70 opacity-90 hover:border-primary/40 hover:opacity-100',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium leading-tight" title={scenario.name}>
            {scenario.name}
          </p>
          <span className="text-[0.65rem] text-muted-foreground">
            {t('scenarios.card.since', { date: formatDate(scenario.start_date) })}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Badge variant="outline" className="text-[0.65rem]">
            {scenario.symbol}
          </Badge>
          <Badge variant="secondary" className="text-[0.65rem]">
            {t(`scenarios.kind.${scenario.kind}`)}
          </Badge>
        </div>
      </div>

      {scenario.status === 'error' ? (
        <p className="text-xs text-flow-out">{scenario.last_error ?? t('scenarios.card.error')}</p>
      ) : (
        <>
          <div className="flex items-end justify-between gap-2">
            <span className="font-heading text-lg font-semibold leading-none tabular-nums tracking-tight">
              {scenario.last_value != null ? formatCurrency(scenario.last_value, scenario.currency) : '—'}
            </span>
            <DeltaPill pct={scenario.last_return_pct != null ? scenario.last_return_pct * 100 : null} />
          </div>
          {vsBenchmark != null && (
            <div className="flex items-center gap-1 text-[0.7rem] text-muted-foreground">
              <span>{t('scenarios.card.vsBenchmark')}</span>
              <DeltaPct pct={vsBenchmark} />
            </div>
          )}
        </>
      )}

      {scenario.status === 'closed' && <Badge variant="outline" className="w-fit text-[0.6rem]">{t('scenarios.status.closed')}</Badge>}
    </Link>
  )
}

/**
 * Every hypothetical the user has saved, plus the aggregate honesty read-out
 * at the top — docs/investments/02-backtesting-sandbox.md §5.5.
 */
export function ScenarioLibraryPage() {
  const { t } = useTranslation('investments')
  const [params, setParams] = useSearchParams()
  const kind = params.get('kind') ?? 'all'
  const status = params.get('status') ?? 'all'
  const sort = params.get('sort') ?? 'newest'

  function setFilter(key: 'kind' | 'status' | 'sort', value: string) {
    const merged = new URLSearchParams(params)
    merged.set(key, value)
    setParams(merged, { replace: true })
  }
  const setKind = (v: string) => setFilter('kind', v)
  const setStatus = (v: string) => setFilter('status', v)
  const setSort = (v: string) => setFilter('sort', v)

  const { data: scenarios, isLoading } = useScenarios({
    kind: kind === 'all' ? undefined : (kind as ScenarioKind),
    status: status === 'all' ? undefined : (status as ScenarioStatus),
    sort: sort as 'newest' | 'best' | 'worst',
  })
  const { data: trackRecord, isLoading: trackRecordLoading } = useTrackRecord()

  return (
    <PageContainer wide className="flex flex-col gap-5">
      <div>
        <InvestmentsBreadcrumb current={t('scenarios.title')} />
        <PageHeader
          title={t('scenarios.title')}
          description={t('scenarios.description')}
          className="mb-0"
          action={
            <Button asChild size="sm">
              <Link to="/investments/backtest">
                <HugeiconsIcon icon={FlashIcon} strokeWidth={2} data-icon="inline-start" />
                {t('scenarios.newScenario')}
              </Link>
            </Button>
          }
        />
      </div>

      <TrackRecordTile trackRecord={trackRecord} loading={trackRecordLoading} />

      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          type="single"
          value={kind}
          onValueChange={(next) => next && setKind(next)}
          variant="outline"
          size="sm"
          spacing={0}
        >
          {KIND_FILTERS.map((k) => (
            <ToggleGroupItem key={k} value={k} className="px-3 text-xs">
              {t(`scenarios.filters.kind.${k}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup
          type="single"
          value={status}
          onValueChange={(next) => next && setStatus(next)}
          variant="outline"
          size="sm"
          spacing={0}
        >
          {STATUS_FILTERS.map((s) => (
            <ToggleGroupItem key={s} value={s} className="px-3 text-xs">
              {t(`scenarios.filters.status.${s}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger size="sm" className="ms-auto w-32 bg-background/60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`scenarios.filters.sort.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : !scenarios || scenarios.length === 0 ? (
        <Empty className="glass-panel border border-dashed py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={FlashIcon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>{t('scenarios.empty.title')}</EmptyTitle>
            <EmptyDescription>{t('scenarios.empty.description')}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="grid w-full max-w-lg grid-cols-2 gap-3 opacity-40">
              <div className="glass-panel rounded-xl border border-dashed border-border/70 p-3">
                <p className="text-sm font-medium">{t('scenarios.empty.exampleOne.name')}</p>
                <p className="text-xs text-muted-foreground">{t('scenarios.empty.exampleOne.detail')}</p>
              </div>
              <div className="glass-panel rounded-xl border border-dashed border-border/70 p-3">
                <p className="text-sm font-medium">{t('scenarios.empty.exampleTwo.name')}</p>
                <p className="text-xs text-muted-foreground">{t('scenarios.empty.exampleTwo.detail')}</p>
              </div>
            </div>
            <Button asChild size="sm" className="mt-3">
              <Link to="/investments/backtest">{t('scenarios.newScenario')}</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {scenarios.map((scenario) => (
            <ScenarioCard key={scenario.id} scenario={scenario} />
          ))}
        </div>
      )}
    </PageContainer>
  )
}
