import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Tile, TileEmpty } from './Tile'
import type { Signal, TechnicalResponse } from '../technicalApi'

type Group = 'trend' | 'momentum' | 'volume'

/** Which category each indicator id belongs to, for the grouped/collapsible
 * layout — see docs/investments/03-technical-analysis.md §6.1's "Trend
 * signals / Momentum signals / Volume signals" grouping. */
const SIGNAL_GROUP: Record<string, Group> = {
  priceVsSma200: 'trend',
  smaCross: 'trend',
  adx: 'trend',
  rsi: 'momentum',
  macd: 'momentum',
  bollinger: 'momentum',
  obv: 'volume',
}

const GROUP_ORDER: Group[] = ['trend', 'momentum', 'volume']

/** `adx` is a context row (direction is always 0) — style it apart from the
 * bullish/bearish/neutral signals rather than folding it into "neutral". */
function stateKeyFor(signal: Signal): 'bullish' | 'bearish' | 'neutral' | 'context' {
  if (signal.id === 'adx') return 'context'
  if (signal.direction > 0) return 'bullish'
  if (signal.direction < 0) return 'bearish'
  return 'neutral'
}

function chipClass(stateKey: ReturnType<typeof stateKeyFor>): string {
  if (stateKey === 'bullish') return 'bg-flow-in/12 text-flow-in'
  if (stateKey === 'bearish') return 'bg-flow-out/12 text-flow-out'
  return 'bg-muted text-muted-foreground'
}

/** No dedicated i18n key for a bare "weak/moderate/strong" word exists — the
 * locale only has full sentences (`regime.strength*`) — so this is a small
 * inline fallback rather than a new shared key. Exported so `IndicatorPane`'s
 * RSI caption (which reuses the same `signal.detail_key` templates that
 * interpolate `{{state}}`) stays in sync with this panel instead of carrying
 * a second copy of the same three-way split. */
export function adxStrengthLabel(adx: number): string {
  if (adx < 20) return 'weak'
  if (adx < 25) return 'moderate'
  return 'strong'
}

function SignalRow({
  signal,
  regimeAdx,
  varianceP,
}: {
  signal: Signal
  regimeAdx?: number | null
  varianceP?: number | null
}) {
  const { t } = useTranslation('investments')
  const stateKey = stateKeyFor(signal)
  const adxValue = regimeAdx ?? signal.value ?? 0
  const lowConfidence = signal.confidence === 'low'

  const detail = t(signal.detail_key, {
    rsi: signal.value?.toFixed(1) ?? '—',
    adx: (regimeAdx ?? signal.value ?? 0).toFixed(1),
    p: (varianceP ?? signal.value ?? 0).toFixed(3),
    state: adxStrengthLabel(adxValue),
  })

  return (
    <li
      className={cn(
        'flex flex-col gap-1 rounded-lg p-2',
        stateKey === 'context' && 'bg-muted/40',
        lowConfidence && 'opacity-60',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-xs font-medium text-foreground">
            {t(`technical.signals.ids.${signal.id}`)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs tabular-nums text-muted-foreground">
            {signal.value != null ? signal.value.toFixed(2) : '—'}
          </span>
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-medium tabular-nums',
              chipClass(stateKey),
            )}
          >
            {t(`technical.signals.states.${stateKey}`)}
          </span>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{detail}</p>
      {lowConfidence && (
        <p className="text-[0.65rem] leading-relaxed text-muted-foreground/70">
          {t('technical.signals.lowConfidenceNote')}
        </p>
      )}
    </li>
  )
}

function SignalGroup({
  group,
  signals,
  regimeAdx,
  varianceP,
}: {
  group: Group
  signals: Signal[]
  regimeAdx?: number | null
  varianceP?: number | null
}) {
  const { t } = useTranslation('investments')
  const positive = signals.filter((s) => s.direction > 0).length
  const negative = signals.filter((s) => s.direction < 0).length

  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 rounded-lg py-1.5 text-left">
        <span className="text-xs font-semibold text-foreground">
          {t(`technical.signals.groups.${group}`)}
        </span>
        <span className="flex items-center gap-2 text-[0.65rem] text-muted-foreground">
          {positive > 0 && <span className="text-flow-in">{positive}▲</span>}
          {negative > 0 && <span className="text-flow-out">{negative}▼</span>}
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={2}
            className="size-3.5 transition-transform group-data-[state=open]:rotate-180"
          />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="flex flex-col gap-1.5 pb-1">
          {signals.map((signal) => (
            <SignalRow key={signal.id} signal={signal} regimeAdx={regimeAdx} varianceP={varianceP} />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

/**
 * The confluence read-out: a hero stacked bar showing how many indicators
 * agree, then the same signals grouped into trend/momentum/volume
 * `Collapsible` sections — "confluence, never one indicator in isolation",
 * made structural per docs/investments/03-technical-analysis.md Part 4.
 */
export function SignalPanel({
  signals,
  confluence,
  loading,
  regimeAdx,
  varianceP,
}: {
  signals: TechnicalResponse['signals']
  confluence: TechnicalResponse['confluence']
  loading: boolean
  /** Interpolation value for detail strings like `technical.signals.detail.adx.context` — supplied
   * by the caller since a single signal row doesn't carry the full regime block. */
  regimeAdx?: number | null
  /** Interpolation value for `technical.signals.detail.rsi.random_walk`'s `{{p}}`. */
  varianceP?: number | null
}) {
  const { t } = useTranslation('investments')
  const hasData = !loading && signals.length > 0
  const total = Math.max(1, confluence.positive + confluence.negative + confluence.neutral)

  const groups = GROUP_ORDER.map((group) => ({
    group,
    signals: signals.filter((s) => SIGNAL_GROUP[s.id] === group),
  })).filter((g) => g.signals.length > 0)

  return (
    <Tile
      title={t('technical.signals.title')}
      footer={<p className="italic">{t('technical.signals.footer')}</p>}
    >
      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
      ) : !hasData ? (
        <TileEmpty>No signals available for this period.</TileEmpty>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="bg-flow-in transition-[flex-basis] duration-500 motion-reduce:transition-none"
                style={{ flexBasis: `${(confluence.positive / total) * 100}%` }}
              />
              <div
                className="bg-flow-out transition-[flex-basis] duration-500 motion-reduce:transition-none"
                style={{ flexBasis: `${(confluence.negative / total) * 100}%` }}
              />
              <div
                className="bg-muted-foreground/40 transition-[flex-basis] duration-500 motion-reduce:transition-none"
                style={{ flexBasis: `${(confluence.neutral / total) * 100}%` }}
              />
            </div>
            <p className="text-sm font-semibold text-foreground">
              {t('technical.signals.confluenceHeading', {
                positive: confluence.positive,
                negative: confluence.negative,
                neutral: confluence.neutral,
              })}
            </p>
          </div>

          <div className="flex flex-col gap-3 divide-y divide-border/60">
            {groups.map(({ group, signals: groupSignals }) => (
              <div key={group} className="pt-3 first:pt-0">
                <SignalGroup group={group} signals={groupSignals} regimeAdx={regimeAdx} varianceP={varianceP} />
              </div>
            ))}
          </div>
        </div>
      )}
    </Tile>
  )
}
