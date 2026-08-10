import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { LinkSquare02Icon } from '@hugeicons/core-free-icons'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { CompanyProfile } from '../investmentsApi'
import { fmtInt } from './researchFormat'

/**
 * Bento cell B2 — the company's identifying facts.
 *
 * `first_trade_date` is Yahoo's first-trade date, NOT a founding year — Yahoo
 * exposes no founding year at all, so the label must stay "First traded".
 */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/50 py-1.5 last:border-0">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-end text-sm font-medium">{children}</dd>
    </div>
  )
}

export function CompanyFactsCard({
  profile,
  className,
}: {
  profile: CompanyProfile
  className?: string
}) {
  const { t } = useTranslation('investments')
  const location = [profile.city, profile.state, profile.country].filter(Boolean).join(', ')

  return (
    <Card size="sm" className={cn('flex flex-col', className)}>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-muted-foreground">
          {t('research.factsTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        <dl className="flex flex-col">
          <Fact label={t('research.headquarters')}>{location || '—'}</Fact>
          <Fact label={t('research.stats.employees')}>{fmtInt(profile.employees)}</Fact>
          <Fact label={t('research.firstTraded')}>
            {profile.first_trade_date
              ? new Date(profile.first_trade_date).toLocaleDateString()
              : '—'}
          </Fact>
          <Fact label={t('search.table.exchange')}>{profile.exchange ?? '—'}</Fact>
          <Fact label={t('research.currency')}>{profile.currency ?? '—'}</Fact>
          <Fact label={t('research.website')}>
            {profile.website ? (
              <a
                href={profile.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                {profile.website.replace(/^https?:\/\/(www\.)?/, '')}
                <HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={2} className="size-3" />
              </a>
            ) : (
              '—'
            )}
          </Fact>
        </dl>
      </CardContent>
    </Card>
  )
}
