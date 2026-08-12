import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowUp01Icon, ArrowDown01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { MetricWithHelp } from '../InvestmentPrimitives'
import { GLOSSARY } from '../metricGlossary'
import type { RegimeBlock } from '../technicalApi'

export type RegimeBadge = 'strongUp' | 'up' | 'sideways' | 'down' | 'strongDown'

const TREND_ICON = { up: ArrowUp01Icon, down: ArrowDown01Icon, sideways: ArrowRight01Icon } as const

const BADGE_CLASS: Record<RegimeBadge, string> = {
  strongUp: 'bg-flow-in/15 text-flow-in',
  up: 'bg-flow-in/10 text-flow-in/90',
  sideways: 'bg-muted text-muted-foreground',
  down: 'bg-flow-out/10 text-flow-out/90',
  strongDown: 'bg-flow-out/15 text-flow-out',
}

/**
 * The 5-way regime badge shared by the hero card and the executive summary —
 * derived once here so the two surfaces never disagree on what "strong
 * uptrend" means. `adx >= 25` is the same strong-trend threshold used
 * throughout docs/investments/03-technical-analysis.md.
 */
export function deriveRegimeBadge(regime: RegimeBlock): RegimeBadge {
  const strong = regime.adx != null && regime.adx >= 25
  if (regime.trend === 'up') return strong ? 'strongUp' : 'up'
  if (regime.trend === 'down') return strong ? 'strongDown' : 'down'
  return 'sideways'
}

/**
 * The framing that comes before any indicator on the technical-analysis page — loads
 * first (it's one small computation) so context appears before detail. Every downstream
 * RSI/MACD/etc. reading is meant to be read against this strip, per
 * docs/investments/03-technical-analysis.md Part 4's context-aware-explanation requirement.
 *
 * Rendered as a hero "answer before the working" card: a color-coded badge and a
 * plain-language summary sentence up top, then the supporting KPIs (ADX, volatility,
 * variance ratio, squeeze) below via `MetricWithHelp` so each one carries its own
 * glossary explanation.
 */
export function RegimeStrip({
  regime,
  bars,
  loading,
  symbol,
}: {
  regime: RegimeBlock | null
  bars: number
  loading: boolean
  symbol: string
}) {
  const { t } = useTranslation('investments')

  if (loading || !regime) {
    return <Skeleton className="h-40 w-full rounded-xl" />
  }

  const vr5 = regime.variance_ratio.find((v) => v.q === 5) ?? regime.variance_ratio[0] ?? null
  const vrSignificant = vr5 != null && Math.abs(vr5.z) > 1.96
  const vrTrending = vrSignificant && vr5!.vr > 1
  const vrMeanReverting = vrSignificant && vr5!.vr < 1

  const strengthKey =
    regime.adx == null ? null : regime.adx >= 25 ? 'strengthStrong' : regime.adx < 20 ? 'strengthWeak' : 'strengthModerate'

  const volKey =
    regime.vol_percentile_3y == null
      ? 'volatilityUnknown'
      : regime.vol_regime === 'low'
        ? 'volatilityCalm'
        : regime.vol_regime === 'elevated'
          ? 'volatilityElevated'
          : 'volatilityNormal'

  const volPhrase = t(`technical.regime.${volKey}`, {
    vol: regime.vol_annualized != null ? `${(regime.vol_annualized * 100).toFixed(0)}%` : '—',
    percentile: regime.vol_percentile_3y != null ? Math.round(regime.vol_percentile_3y) : undefined,
  })

  const badge = deriveRegimeBadge(regime)
  const isTrending = regime.adx != null && regime.adx >= 25

  const summary = t('technical.regime.summary', {
    symbol,
    trendPhrase: t(`technical.regime.heroBadge.${badge}`).toLowerCase(),
    volPhrase,
    weightHint: t(isTrending ? 'technical.regime.weightTrending' : 'technical.regime.weightRanging'),
  })

  const varianceValue = vr5 ? `p = ${vr5.p.toFixed(2)}` : '—'
  const varianceHint = vr5
    ? t(
        vrTrending
          ? 'technical.regime.randomWalkTrending'
          : vrMeanReverting
            ? 'technical.regime.randomWalkMeanReverting'
            : 'technical.regime.randomWalkInconclusive',
        { p: vr5.p.toFixed(2) },
      )
    : undefined

  const squeezeValue = regime.bollinger_squeeze
    ? t('technical.regime.squeezeYes', { percentile: Math.round(regime.squeeze_percentile ?? 0) })
    : t('technical.regime.squeezeNo')

  return (
    <section className="flex flex-col gap-4 rounded-xl bg-card p-4 shadow-card sm:p-5">
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold tabular-nums',
              BADGE_CLASS[badge],
            )}
          >
            <HugeiconsIcon icon={TREND_ICON[regime.trend]} strokeWidth={2.5} className="size-4" />
            {t(`technical.regime.heroBadge.${badge}`)}
          </span>
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t('technical.regime.heroTitle')}
          </span>
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-foreground/90">{summary}</p>
        {bars < 200 && (
          <p className="text-xs text-muted-foreground">{t('technical.states.insufficientHistory', { bars })}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 border-t border-border/60 pt-4 sm:grid-cols-4">
        <MetricWithHelp
          label={t('technical.regime.kpiAdxLabel')}
          value={regime.adx != null ? regime.adx.toFixed(0) : '—'}
          hint={strengthKey ? t(`technical.regime.${strengthKey}`, { adx: regime.adx?.toFixed(0) ?? '—' }) : undefined}
          entry={GLOSSARY.adx}
        />
        <MetricWithHelp
          label={t('technical.regime.kpiVolatilityLabel')}
          value={regime.vol_annualized != null ? `${(regime.vol_annualized * 100).toFixed(0)}%` : '—'}
          hint={
            regime.vol_percentile_3y != null
              ? `${Math.round(regime.vol_percentile_3y)}${t('technical.regime.percentileSuffix', { defaultValue: 'th percentile' })}`
              : undefined
          }
          entry={GLOSSARY.volatility}
        />
        <MetricWithHelp
          label={t('technical.regime.kpiVarianceLabel')}
          value={varianceValue}
          hint={varianceHint}
          entry={GLOSSARY.varianceRatio}
        />
        <MetricWithHelp
          label={t('technical.regime.kpiSqueezeLabel')}
          value={squeezeValue}
          entry={GLOSSARY.bollinger}
        />
      </div>
    </section>
  )
}
