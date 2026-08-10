import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { CompanyProfile } from '../investmentsApi'

/**
 * Bento cell B1 — the business summary.
 *
 * Yahoo's longBusinessSummary is routinely 200+ words, which is why the old
 * layout ended in a wall of grey text. Clamped to five lines with an explicit
 * expand, so the card contributes a predictable height to the grid.
 */
export function AboutCard({
  profile,
  className,
}: {
  profile: CompanyProfile
  className?: string
}) {
  const { t } = useTranslation('investments')
  const [expanded, setExpanded] = useState(false)

  if (!profile.summary) return null

  return (
    <Card size="sm" className={cn('flex flex-col', className)}>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-muted-foreground">
          {t('research.aboutTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2">
        <p
          className={cn(
            'text-sm leading-relaxed text-muted-foreground [text-align:justify] [hyphens:auto]',
            !expanded && 'line-clamp-5',
          )}
        >
          {profile.summary}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="self-start px-0 text-xs"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? t('research.showLess') : t('research.showMore')}
        </Button>
      </CardContent>
    </Card>
  )
}
