import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '../../lib/format'
import { Tile } from './Tile'
import { MetricWithHelp } from '../InvestmentPrimitives'
import { GLOSSARY } from '../metricGlossary'
import type { Sensitivity } from '../scenariosApi'

function pct(value: number, min: number, max: number): number {
  if (max <= min) return 50
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
}

/**
 * "You picked one date." Nine identical runs, entry dates ±7/14/21/30 days
 * either side of the one the user chose — turns hindsight into a measurement
 * instead of a disclaimer. See docs/investments/02-backtesting-sandbox.md §5.3.
 * Backtest scenarios only; a forward scenario has no alternative entry dates.
 */
export function SensitivityStrip({
  sensitivity,
  currency,
  chosenDate,
}: {
  sensitivity: Sensitivity
  currency: string
  chosenDate: string
}) {
  const { t } = useTranslation('investments')
  const { min, p25, median, p75, max, chosen_percentile, entry_dates } = sensitivity
  const chosen = entry_dates.find((e) => e.date === chosenDate) ?? entry_dates[0]

  return (
    <Tile title={t('backtest.sensitivity.title')}>
      <div className="flex flex-col gap-4">
        <div className="relative h-10">
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted" />
          {entry_dates.map((entryDate) => {
            const isChosen = entryDate.date === chosen?.date
            return (
              <div
                key={entryDate.date}
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${pct(entryDate.final_value, min, max)}%` }}
                title={`${formatDate(entryDate.date)}: ${formatCurrency(entryDate.final_value, currency)}`}
              >
                <span
                  className={cn(
                    'block rounded-full',
                    isChosen ? 'size-3.5 bg-primary ring-2 ring-primary/30' : 'size-2 bg-muted-foreground/50',
                  )}
                />
              </div>
            )
          })}
        </div>
        <div className="flex justify-between text-[0.65rem] text-muted-foreground">
          <span>{formatCurrency(min, currency)}</span>
          <span>{t('backtest.sensitivity.median', { value: formatCurrency(median, currency) })}</span>
          <span>{formatCurrency(max, currency)}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 border-t border-border/60 pt-2 sm:grid-cols-5">
          <MetricWithHelp
            label={t('backtest.sensitivity.p25')}
            value={formatCurrency(p25, currency)}
            entry={GLOSSARY.entrySensitivity}
            size="sm"
          />
          <MetricWithHelp
            label={t('backtest.sensitivity.p75')}
            value={formatCurrency(p75, currency)}
            entry={GLOSSARY.entrySensitivity}
            size="sm"
          />
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('backtest.sensitivity.caption', {
            min: formatCurrency(min, currency),
            max: formatCurrency(max, currency),
            percentile: Math.round(chosen_percentile),
          })}
        </p>
      </div>
    </Tile>
  )
}
