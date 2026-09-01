/**
 * Rendering an investment report to a PDF file, on demand.
 *
 * `@react-pdf/renderer` and its font machinery weigh several hundred kilobytes
 * — more than the rest of the investments sub-app put together — and almost
 * nobody exports on any given visit. So every path here reaches the renderer
 * through a dynamic `import()`: the chunk is fetched the first time someone
 * presses Export and never on a cold page load.
 */
import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { queryKeys } from '../../lib/queryKeys'
import { getNews } from '../investmentsApi'
import { getTechnical } from '../technicalApi'
import type { CompanyHistory, CompanyProfile, HistoryPeriod, NewsItem } from '../investmentsApi'
import type { TechnicalResponse } from '../technicalApi'
import type { ComparisonResponse } from '../comparisonApi'
import type { Translate } from './ComparisonReportDocument'

const NEWS_LIMIT = 6

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** `2026-09-01`, for a filename that sorts chronologically in a folder. */
function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Trim anything a filesystem would object to out of a ticker. */
function safeSymbol(symbol: string): string {
  return symbol.replace(/[^A-Za-z0-9._-]+/g, '-')
}

function useExportRunner() {
  const { t } = useTranslation('investments')
  const [isExporting, setIsExporting] = useState(false)

  const translate: Translate = useCallback((key, options) => String(t(key, options ?? {})), [t])

  const run = useCallback(
    async (produce: (translate: Translate) => Promise<Blob>, filename: string) => {
      if (isExporting) return
      setIsExporting(true)
      const toastId = toast.loading(t('pdf.toasts.preparing'))
      try {
        const blob = await produce(translate)
        triggerDownload(blob, filename)
        toast.success(t('pdf.toasts.ready', { filename }), { id: toastId })
      } catch (error) {
        // The real reason is only useful to a developer; the user gets one line
        // and the console keeps the detail.
        console.error('PDF export failed', error)
        toast.error(t('pdf.toasts.failed'), { id: toastId })
      } finally {
        setIsExporting(false)
      }
    },
    [isExporting, t, translate],
  )

  return { run, isExporting }
}

/** Export the ticker comparison currently on screen. */
export function useExportComparisonPdf() {
  const { run, isExporting } = useExportRunner()

  const exportComparison = useCallback(
    (comparison: ComparisonResponse) => {
      const generatedAt = new Date()
      const symbols = comparison.instruments
        .filter((instrument) => !instrument.is_benchmark)
        .map((instrument) => safeSymbol(instrument.symbol))
      const filename = `comparison-${symbols.join('-')}-${comparison.meta.period}-${isoDay(generatedAt)}.pdf`

      return run(async (translate) => {
        const [{ pdf }, { buildComparisonReport }] = await Promise.all([
          import('@react-pdf/renderer'),
          import('./ComparisonReportDocument'),
        ])
        return pdf(buildComparisonReport({ comparison, t: translate, generatedAt })).toBlob()
      }, filename)
    },
    [run],
  )

  return { exportComparison, isExporting }
}

/**
 * Export a company research report.
 *
 * Technical signals and news are lazy on the page (each costs a rate-limited
 * request, and `TechnicalSignalsRow`/`CompanyNewsCard` only ask for them once
 * scrolled into view). Fetching them through the query cache here reuses
 * whatever the page already loaded and only hits the network for the parts it
 * did not — and a failure on either is not a reason to fail the export, so
 * both are allowed to come back missing.
 */
export function useExportCompanyPdf() {
  const { run, isExporting } = useExportRunner()
  const queryClient = useQueryClient()

  const exportCompany = useCallback(
    ({
      profile,
      history,
      period,
    }: {
      profile: CompanyProfile
      history?: CompanyHistory
      period: HistoryPeriod
    }) => {
      const generatedAt = new Date()
      const filename = `${safeSymbol(profile.symbol)}-research-${isoDay(generatedAt)}.pdf`

      return run(async (translate) => {
        const newsOptions = {
          symbol: profile.symbol,
          limit: NEWS_LIMIT,
          provider: 'yahoo' as const,
        }
        // `enabled` is part of the key `CompanyNewsCard`'s `useNews` builds, so
        // it has to be here too or this would miss that cache entry and refetch.
        const newsQueryKey = queryKeys.investmentNews({ ...newsOptions, enabled: true })

        const [technical, news, { pdf }, { buildCompanyReport }] = await Promise.all([
          queryClient
            .fetchQuery({
              queryKey: queryKeys.investmentTechnical(profile.symbol, '1y'),
              queryFn: () => getTechnical(profile.symbol, '1y'),
              staleTime: 5 * 60_000,
            })
            .catch((): TechnicalResponse | undefined => undefined),
          queryClient
            .fetchQuery({
              queryKey: newsQueryKey,
              queryFn: () => getNews(newsOptions),
              staleTime: 60_000,
            })
            .then((page) => page.items as NewsItem[])
            .catch((): NewsItem[] => []),
          import('@react-pdf/renderer'),
          import('./CompanyReportDocument'),
        ])

        return pdf(
          buildCompanyReport({
            profile,
            history,
            technical,
            news,
            period,
            t: translate,
            generatedAt,
          }),
        ).toBlob()
      }, filename)
    },
    [queryClient, run],
  )

  return { exportCompany, isExporting }
}
