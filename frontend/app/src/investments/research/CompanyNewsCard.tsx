import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useNews } from '../useInvestments'
import { useInViewOnce } from './useInViewOnce'

const NEWS_LIMIT = 6

function relativeTime(iso: string | null, locale: string): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const minutes = Math.round((then - Date.now()) / 60_000)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour')
  return rtf.format(Math.round(hours / 24), 'day')
}

/**
 * Bento cell E1 — the company's news, inline.
 *
 * Fetched lazily and separately from the profile so the headline data never
 * waits on it. Items open the original article; the full feed stays on the
 * market news page.
 */
export function CompanyNewsCard({
  symbol,
  className,
}: {
  symbol: string
  className?: string
}) {
  const { t, i18n } = useTranslation('investments')
  const [ref, inView] = useInViewOnce<HTMLDivElement>()
  const { data, isLoading, isError } = useNews({ symbol, limit: NEWS_LIMIT, enabled: inView })
  const items = data?.items ?? []

  return (
    <Card size="sm" className={cn('flex flex-col', className)}>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-sm font-semibold text-muted-foreground">
          {t('research.newsTitle')}
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to={`/investments/news?symbol=${encodeURIComponent(symbol)}`}>
            {t('research.viewAllNews')}
          </Link>
        </Button>
      </CardHeader>
      <CardContent ref={ref} className="flex-1">
        {isError ? (
          <p className="text-sm text-muted-foreground">{t('research.newsUnavailable')}</p>
        ) : !inView || isLoading ? (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: NEWS_LIMIT }, (_, index) => (
              <Skeleton key={index} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('research.newsEmpty')}</p>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <a
                key={item.story_id}
                href={item.url ?? '#'}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col gap-1.5 rounded-lg border border-border/70 p-3 transition-colors hover:bg-muted/40"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  {item.source && (
                    <Badge variant="outline" className="text-[0.65rem]">
                      {item.source}
                    </Badge>
                  )}
                  <span className="text-[0.65rem] text-muted-foreground">
                    {relativeTime(item.published_at, i18n.language)}
                  </span>
                </div>
                <p className="line-clamp-2 text-sm font-medium leading-snug">{item.title}</p>
                {item.summary && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{item.summary}</p>
                )}
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
