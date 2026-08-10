import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { CompanyProfile } from '../investmentsApi'
import { fmtCompactMoney, fmtCompactNumber, fmtMoney, fmtRatio } from './researchFormat'

/**
 * Bento cell A2 — a 2x2 chip grid beside the hero.
 *
 * The four numbers you price a company by before opening any table. Kept as
 * chips rather than a table so the row reads at a glance and the hero card
 * keeps its weight.
 */
function Chip({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border/70 bg-muted/25 px-3 py-2.5">
      <span className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className="truncate font-medium tabular-nums">{value}</span>
      {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}

export function SnapshotChips({
  profile,
  className,
}: {
  profile: CompanyProfile
  className?: string
}) {
  const { t } = useTranslation('investments')
  const currency = profile.currency ?? 'USD'

  return (
    <Card size="sm" className={cn('p-4 sm:p-5', className)}>
      <div className="grid h-full grid-cols-2 gap-2.5">
        <Chip
          label={t('research.stats.marketCap')}
          value={fmtCompactMoney(profile.market_cap, currency)}
        />
        <Chip
          label={t('research.stats.avgVolume')}
          value={fmtCompactNumber(profile.average_volume)}
        />
        <Chip label={t('research.stats.beta')} value={fmtRatio(profile.beta)} />
        <Chip
          label={t('research.stats.recommendation')}
          value={
            profile.recommendation ? profile.recommendation.replace(/_/g, ' ') : '—'
          }
          hint={
            profile.target_mean_price != null
              ? t('research.targetHint', {
                  value: fmtMoney(profile.target_mean_price, currency),
                })
              : undefined
          }
        />
      </div>
    </Card>
  )
}
