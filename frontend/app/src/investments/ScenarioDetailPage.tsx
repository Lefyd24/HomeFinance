import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Delete02Icon, LockIcon, PencilEdit02Icon, Refresh01Icon } from '@hugeicons/core-free-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, FieldLabel } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { formatCurrency, formatDate } from '../lib/format'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { useConfirm } from '../ui/useConfirm'
import { InvestmentsBreadcrumb } from './InvestmentPrimitives'
import { useDeleteScenario, usePatchScenario, useRebuildScenario, useScenario } from './useScenarios'
import { BacktestResultView } from './widgets/BacktestResultView'

export function ScenarioDetailPage() {
  const { t } = useTranslation('investments')
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const scenarioId = id ? Number(id) : null
  const { data: scenario, isLoading } = useScenario(scenarioId)
  const patchScenario = usePatchScenario()
  const deleteScenario = useDeleteScenario()
  const rebuildScenario = useRebuildScenario()
  const { confirm, confirmDialog } = useConfirm()

  // `null` means "no local edits" — the field then mirrors `scenario.note`
  // directly rather than a copy synced via an effect, so a saved note never
  // needs reconciling with what the user typed.
  const [noteDraft, setNoteDraft] = useState<string | null>(null)
  const note = noteDraft ?? scenario?.note ?? ''
  const noteDirty = noteDraft != null && noteDraft !== (scenario?.note ?? '')

  if (isLoading || !scenario) {
    return (
      <PageContainer wide className="flex flex-col gap-5">
        <InvestmentsBreadcrumb current={t('scenarios.detailTitle')} />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </PageContainer>
    )
  }

  async function handleSaveNote() {
    if (!scenarioId) return
    try {
      await patchScenario.mutateAsync({ id: scenarioId, input: { note } })
      setNoteDraft(null)
      toast.success(t('scenarios.detail.noteSaved'))
    } catch {
      toast.error(t('scenarios.detail.noteSaveFailed'))
    }
  }

  async function handleToggleStatus() {
    if (!scenarioId || !scenario) return
    const nextStatus = scenario.status === 'closed' ? 'active' : 'closed'
    try {
      await patchScenario.mutateAsync({ id: scenarioId, input: { status: nextStatus } })
      toast.success(nextStatus === 'closed' ? t('scenarios.detail.closed') : t('scenarios.detail.reopened'))
    } catch {
      toast.error(t('scenarios.detail.actionFailed'))
    }
  }

  async function handleDelete() {
    if (!scenarioId || !scenario) return
    const ok = await confirm({
      title: t('scenarios.detail.deleteConfirm.title', { name: scenario.name }),
      description: t('scenarios.detail.deleteConfirm.description'),
      confirmLabel: t('scenarios.detail.deleteConfirm.confirm'),
    })
    if (!ok) return
    try {
      await deleteScenario.mutateAsync(scenarioId)
      toast.success(t('scenarios.detail.deleted'))
      navigate('/investments/scenarios')
    } catch {
      toast.error(t('scenarios.detail.actionFailed'))
    }
  }

  async function handleRebuild() {
    if (!scenarioId) return
    try {
      await rebuildScenario.mutateAsync(scenarioId)
      toast.success(t('scenarios.detail.rebuilt'))
    } catch {
      toast.error(t('scenarios.detail.actionFailed'))
    }
  }

  return (
    <PageContainer wide className="flex flex-col gap-5">
      <div>
        <InvestmentsBreadcrumb current={scenario.name} />
        <PageHeader
          title={scenario.name}
          description={t('scenarios.detail.subtitle', {
            symbol: scenario.symbol,
            date: formatDate(scenario.start_date),
          })}
          className="mb-0"
          action={
            <div className="flex flex-wrap items-center gap-2">
              {scenario.kind === 'forward' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleRebuild()}
                  disabled={rebuildScenario.isPending}
                >
                  <HugeiconsIcon icon={Refresh01Icon} strokeWidth={2} data-icon="inline-start" />
                  {t('scenarios.detail.rebuild')}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => void handleToggleStatus()}>
                {scenario.status === 'closed' ? t('scenarios.detail.reopen') : t('scenarios.detail.close')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => void handleDelete()}>
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} data-icon="inline-start" />
                {t('scenarios.detail.delete')}
              </Button>
            </div>
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{t(`scenarios.kind.${scenario.kind}`)}</Badge>
        <Badge variant="secondary">{t(`scenarios.status.${scenario.status}`)}</Badge>
      </div>

      <div className="glass-panel flex items-start gap-2 rounded-xl border border-border/80 p-3 text-xs text-muted-foreground">
        <HugeiconsIcon icon={LockIcon} strokeWidth={2} className="mt-0.5 size-3.5 shrink-0" />
        <span>{t('scenarios.detail.lockedNotice')}</span>
      </div>

      <div className="glass-panel flex flex-col gap-2 rounded-xl border border-border/80 p-3">
        <Field>
          <FieldLabel htmlFor="scenario-note" className="flex items-center gap-1.5">
            <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} className="size-3.5" />
            {t('scenarios.detail.note')}
          </FieldLabel>
          <Textarea
            id="scenario-note"
            value={note}
            onChange={(e) => setNoteDraft(e.target.value)}
            rows={3}
            placeholder={t('scenarios.detail.notePlaceholder')}
          />
        </Field>
        {noteDirty && (
          <div className="flex justify-end">
            <Button size="sm" onClick={() => void handleSaveNote()} disabled={patchScenario.isPending}>
              {t('scenarios.detail.saveNote')}
            </Button>
          </div>
        )}
      </div>

      {scenario.status === 'error' ? (
        <Empty className="glass-panel border border-dashed py-10">
          <EmptyHeader>
            <EmptyTitle>{t('scenarios.detail.errorTitle')}</EmptyTitle>
            <EmptyDescription>{scenario.last_error ?? ''}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : scenario.result ? (
        <>
          <BacktestResultView
            result={scenario.result}
            symbol={scenario.symbol}
            benchmarkSymbol={scenario.benchmark}
            currency={scenario.currency}
            kind={scenario.kind}
            resultKey={`scenario-${scenario.id}-${scenario.last_valued_on ?? ''}`}
          />

          {/* Backtests recompute on read and never persist a daily table (see
              docs/investments/02-backtesting-sandbox.md §3.2) — the recomputed
              `result.series` here is the same data the chart above already
              draws, so showing it again as a table would be a copy of the
              chart, not an audit trail. Only forward scenarios get one: their
              valuation history is written once per trading day by the nightly
              job, and that written history — not a recomputation of it — is
              what "audit trail" means for this feature. */}
          {scenario.kind === 'forward' && scenario.result.series.length > 0 && (
            <Collapsible className="glass-panel rounded-xl border border-border/80 p-3">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-fit px-0 text-xs text-muted-foreground">
                  {t('scenarios.detail.dailyTable')}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 max-h-80 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('scenarios.detail.table.date')}</TableHead>
                      <TableHead className="text-end">{t('scenarios.detail.table.value')}</TableHead>
                      <TableHead className="text-end">{t('scenarios.detail.table.invested')}</TableHead>
                      <TableHead className="text-end">{t('scenarios.detail.table.benchmark')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...scenario.result.series].reverse().map((point) => (
                      <TableRow key={point.date}>
                        <TableCell className="text-xs">{formatDate(point.date)}</TableCell>
                        <TableCell className="text-end text-xs tabular-nums">
                          {formatCurrency(point.value, scenario.currency)}
                        </TableCell>
                        <TableCell className="text-end text-xs tabular-nums text-muted-foreground">
                          {formatCurrency(point.invested, scenario.currency)}
                        </TableCell>
                        <TableCell className="text-end text-xs tabular-nums text-muted-foreground">
                          {point.benchmark_value != null ? formatCurrency(point.benchmark_value, scenario.currency) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CollapsibleContent>
            </Collapsible>
          )}
        </>
      ) : (
        <Empty className="glass-panel border border-dashed py-10">
          <EmptyHeader>
            <EmptyTitle>{t('scenarios.detail.noResultTitle')}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}

      {confirmDialog}
    </PageContainer>
  )
}
