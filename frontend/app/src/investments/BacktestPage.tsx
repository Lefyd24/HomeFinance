import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { FlashIcon } from '@hugeicons/core-free-icons'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { InvestmentsBreadcrumb } from './InvestmentPrimitives'
import { ApiError } from '../lib/apiClient'
import { useComparisonBenchmarks } from './useComparison'
import { useCreateScenario, usePreviewScenario } from './useScenarios'
import { BacktestForm } from './widgets/BacktestForm'
import { BacktestResultView } from './widgets/BacktestResultView'
import type { ScenarioSpecIn } from './scenariosApi'

/**
 * Create + preview, one page. The result renders below the form rather than
 * on its own route, so trying another entry date is a click, not a
 * navigation — see docs/investments/02-backtesting-sandbox.md §5.1.
 */
export function BacktestPage() {
  const { t } = useTranslation('investments')
  const navigate = useNavigate()
  const { data: benchmarkOptions } = useComparisonBenchmarks()
  const preview = usePreviewScenario()
  const create = useCreateScenario()

  const [lastSpec, setLastSpec] = useState<ScenarioSpecIn | null>(null)
  const [runCount, setRunCount] = useState(0)

  function handleRun(spec: ScenarioSpecIn) {
    setLastSpec(spec)
    preview.mutate(spec, {
      onSuccess: () => setRunCount((n) => n + 1),
    })
  }

  async function handleSave(name: string, note: string) {
    if (!lastSpec) return
    try {
      const created = await create.mutateAsync({ ...lastSpec, name, note: note || undefined })
      toast.success(t('backtest.toasts.saved'))
      navigate(`/investments/scenarios/${created.id}`)
    } catch {
      toast.error(t('backtest.toasts.saveFailed'))
    }
  }

  const errorMessage =
    preview.error instanceof ApiError ? preview.error.detail || preview.error.message : preview.error ? t('backtest.errors.generic') : null

  return (
    <PageContainer wide className="flex flex-col gap-5">
      <div>
        <InvestmentsBreadcrumb current={t('backtest.title')} />
        <PageHeader title={t('backtest.title')} description={t('backtest.description')} className="mb-0" />
      </div>

      <BacktestForm
        benchmarkOptions={benchmarkOptions ?? []}
        onRun={handleRun}
        running={preview.isPending}
        errorMessage={errorMessage}
        canSave={Boolean(preview.data) && !preview.isPending}
        saving={create.isPending}
        onSave={(name, note) => void handleSave(name, note)}
      />

      {preview.isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      ) : preview.data && lastSpec ? (
        <BacktestResultView
          result={preview.data}
          symbol={lastSpec.symbol}
          benchmarkSymbol={lastSpec.benchmark}
          currency={lastSpec.currency}
          kind={lastSpec.kind}
          resultKey={`preview-${runCount}`}
        />
      ) : (
        <Empty className="glass-panel border border-dashed py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={FlashIcon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>{t('backtest.empty.title')}</EmptyTitle>
            <EmptyDescription>{t('backtest.empty.description')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </PageContainer>
  )
}
