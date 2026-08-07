import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Tile, TileEmpty } from './Tile'
import type { Insight, InsightTone } from '../portfolioInsights'

/** Tone is reinforcement — the sentence already says which way things went. */
const TONE_DOT: Record<InsightTone, string> = {
  good: 'bg-flow-in',
  watch: 'bg-flow-out',
  neutral: 'bg-muted-foreground/50',
}

/**
 * The portfolio, in sentences.
 *
 * Every other tile shows figures, and figures assume you already know what a
 * 41% weight or a 0.31 concentration index implies. This one does the last step
 * — "most of your money rides on one company" — so the page is readable by
 * someone who has never opened a brokerage statement.
 *
 * It only says things that are true of this portfolio, so an empty tile is a
 * correct outcome rather than a gap to be padded with generic advice. Nothing
 * here is a recommendation: it describes what is, and stops.
 */
export function PlainEnglishTile({
  insights,
  loading,
  className,
}: {
  insights: Insight[]
  loading: boolean
  className?: string
}) {
  const { t } = useTranslation('investments')

  return (
    <Tile title={t('tiles.plainEnglish')} className={className}>
      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      ) : insights.length === 0 ? (
        <TileEmpty>{t('tiles.noInsights')}</TileEmpty>
      ) : (
        <ul className="flex flex-col gap-2">
          {insights.map((insight) => (
            <li key={insight.id} className="flex items-start gap-2 text-xs leading-relaxed">
              <span
                aria-hidden="true"
                className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', TONE_DOT[insight.tone])}
              />
              <span className="min-w-0">{t(insight.messageKey, insight.values)}</span>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  )
}
