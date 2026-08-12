import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { DeltaBar, DeltaPct, Metric, deltaScale } from '../InvestmentPrimitives'
import { Tile, TileEmpty } from './Tile'
import type { TrackRecord } from '../scenariosApi'

/**
 * The aggregate honesty instrument for the whole library — Barber & Odean
 * framing, never a compliment or a criticism (docs/investments/02-backtesting-sandbox.md §3.4).
 * Only counts closed/matured scenarios, so a freshly created forward scenario
 * never nudges this number.
 */
export function TrackRecordTile({ trackRecord, loading }: { trackRecord: TrackRecord | undefined; loading: boolean }) {
  const { t } = useTranslation('investments')

  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl bg-card p-3 shadow-card">
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    )
  }

  if (!trackRecord || trackRecord.count === 0) {
    return (
      <Tile title={t('scenarios.trackRecord.title')}>
        <TileEmpty>{t('scenarios.trackRecord.empty')}</TileEmpty>
      </Tile>
    )
  }

  const scale = deltaScale(trackRecord.scenarios.map((s) => s.excess_return_pct))
  const sorted = [...trackRecord.scenarios].sort(
    (a, b) => (b.excess_return_pct ?? 0) - (a.excess_return_pct ?? 0),
  )

  return (
    <Tile title={t('scenarios.trackRecord.title')}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label={t('scenarios.trackRecord.matured')} value={trackRecord.count} size="sm" />
          <Metric
            label={t('scenarios.trackRecord.hitRate')}
            value={
              trackRecord.hit_rate != null
                ? t('scenarios.trackRecord.hitRateValue', {
                    beating: trackRecord.count_beating_benchmark,
                    total: trackRecord.count,
                    pct: Math.round(trackRecord.hit_rate * 100),
                  })
                : '—'
            }
            size="sm"
          />
          <Metric
            label={t('scenarios.trackRecord.meanExcess')}
            value={<DeltaPct pct={trackRecord.mean_excess_return != null ? trackRecord.mean_excess_return * 100 : null} />}
            size="sm"
          />
          <Metric
            label={t('scenarios.trackRecord.medianExcess')}
            value={
              <DeltaPct pct={trackRecord.median_excess_return != null ? trackRecord.median_excess_return * 100 : null} />
            }
            size="sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          {sorted.map((entry) => (
            <div key={entry.id} className="flex items-center gap-2 text-xs">
              <span className="w-24 shrink-0 truncate text-muted-foreground" title={entry.name}>
                {entry.name}
              </span>
              <DeltaBar value={entry.excess_return_pct} scale={scale} className="flex-1" />
              <span className="w-16 shrink-0 text-end">
                <DeltaPct pct={entry.excess_return_pct != null ? entry.excess_return_pct * 100 : null} />
              </span>
            </div>
          ))}
        </div>

        <p className="border-t border-border/60 pt-2 text-xs leading-relaxed text-muted-foreground">
          {t(`scenarios.trackRecord.verdict.${trackRecord.verdict_key}`, {
            count: trackRecord.count,
            beating: trackRecord.count_beating_benchmark,
            pct: trackRecord.hit_rate != null ? Math.round(trackRecord.hit_rate * 100) : '—',
            meanExcess:
              trackRecord.mean_excess_return != null ? (trackRecord.mean_excess_return * 100).toFixed(1) : '—',
            pValue: trackRecord.hit_rate_p_value != null ? trackRecord.hit_rate_p_value.toFixed(2) : '—',
          })}
        </p>
      </div>
    </Tile>
  )
}
