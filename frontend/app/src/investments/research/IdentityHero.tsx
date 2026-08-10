import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { StarIcon } from '@hugeicons/core-free-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { DeltaPct } from '../InvestmentPrimitives'
import type { CompanyProfile } from '../investmentsApi'
import { fmtMoney, pctOfRange } from './researchFormat'

/**
 * Bento cell A1 — the page's visual anchor.
 *
 * Identity, price and the 52-week range bar in one card. The range bar turns
 * two numbers that used to sit in a definition list into the one thing you
 * actually want at a glance: where today's price sits in the year.
 */
export function IdentityHero({
  profile,
  isWatched,
  onToggleWatch,
  className,
}: {
  profile: CompanyProfile
  isWatched: boolean
  onToggleWatch: () => void
  className?: string
}) {
  const { t } = useTranslation('investments')
  const currency = profile.currency ?? 'USD'
  const breadcrumb = [profile.sector, profile.industry].filter(Boolean)
  const markerPct = pctOfRange(
    profile.current_price,
    profile.fifty_two_week_low,
    profile.fifty_two_week_high,
  )

  return (
    <Card size="sm" className={cn('flex flex-col justify-between gap-4 p-4 sm:p-5', className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
              {profile.symbol}
            </h2>
            {profile.quote_type && (
              <Badge variant="secondary" className="capitalize">
                {profile.quote_type}
              </Badge>
            )}
            {profile.exchange && <Badge variant="outline">{profile.exchange}</Badge>}
          </div>
          <p className="truncate text-base text-foreground">
            {profile.name ?? profile.short_name ?? profile.symbol}
          </p>
          {breadcrumb.length > 0 && (
            <p className="text-xs text-muted-foreground">{breadcrumb.join(' › ')}</p>
          )}
        </div>

        <div className="flex items-start gap-2">
          <div className="flex flex-col items-end gap-0.5">
            <span className="font-heading text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">
              {fmtMoney(profile.current_price, currency)}
            </span>
            <DeltaPct pct={profile.day_change_pct} className="text-sm" />
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggleWatch}
            aria-label={isWatched ? t('research.removeWatch') : t('research.saveWatch')}
            title={isWatched ? t('research.removeWatch') : t('research.saveWatch')}
            className={isWatched ? 'text-yellow-500 hover:text-yellow-600' : 'text-muted-foreground'}
          >
            <HugeiconsIcon
              icon={StarIcon}
              strokeWidth={2}
              style={isWatched ? { fill: 'currentColor' } : { fill: 'none' }}
            />
          </Button>
        </div>
      </div>

      {markerPct != null && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
            <span>{t('research.stats.weekLow')}</span>
            <span>{t('research.rangeBarLabel')}</span>
            <span>{t('research.stats.weekHigh')}</span>
          </div>
          <div className="relative h-1.5 rounded-full bg-gradient-to-r from-flow-out/35 via-muted to-flow-in/35">
            <span
              data-testid="range-marker"
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground shadow-sm"
              style={{ left: `${markerPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs tabular-nums text-muted-foreground">
            <span>{fmtMoney(profile.fifty_two_week_low, currency)}</span>
            <span>{fmtMoney(profile.fifty_two_week_high, currency)}</span>
          </div>
        </div>
      )}
    </Card>
  )
}
