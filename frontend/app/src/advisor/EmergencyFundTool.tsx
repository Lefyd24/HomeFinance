import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Shield01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { formatCurrency } from '../lib/format'
import { ProgressBar } from '../ui/ProgressBar'
import { ToolPanel, EmptyResults } from './ToolPanel'
import * as advisorApi from './advisorApi'
import type { EmergencyFundRecommendation } from './advisorApi'

export function EmergencyFundTool() {
  const { t } = useTranslation('advisor')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<EmergencyFundRecommendation | null>(null)

  async function load() {
    setLoading(true)
    try {
      const data = await advisorApi.getEmergencyFundRecommendation()
      setResult(data)
    } catch {
      toast.error(t('emergencyFund.loadError'))
    } finally {
      setLoading(false)
    }
  }

  const noData = result && (result.status === 'unknown' || result.monthly_expenses <= 0)
  const monthsCovered = result?.current_coverage.months_covered ?? 0

  const statusExplanation = (status: string) => {
    const key = `emergencyFund.status.${status}` as const
    return t(key, { defaultValue: '' })
  }

  const tierLabels = {
    minimum: t('emergencyFund.tiers.minimum'),
    recommended: t('emergencyFund.tiers.recommended'),
    maximum: t('emergencyFund.tiers.maximum'),
  }

  return (
    <ToolPanel
      title={t('emergencyFund.title')}
      description={t('emergencyFund.description')}
      form={
        <div className="flex flex-col gap-4">
          <div className="rounded-lg bg-info/10 p-3.5">
            <p className="mb-2 text-sm font-medium">{t('emergencyFund.whyYouNeedOne')}</p>
            <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
              <li>
                <strong className="text-foreground">{t('emergencyFund.reasons.threeMonths')}</strong> {t('emergencyFund.reasons.threeMonthsText')}
              </li>
              <li>
                <strong className="text-foreground">{t('emergencyFund.reasons.sixMonths')}</strong> {t('emergencyFund.reasons.sixMonthsText')}
              </li>
              <li>
                <strong className="text-foreground">{t('emergencyFund.reasons.twelveMonths')}</strong> {t('emergencyFund.reasons.twelveMonthsText')}
              </li>
            </ul>
          </div>
          <p className="text-sm text-muted-foreground">{t('emergencyFund.analyzeIntro')}</p>
          <Button className="w-full" disabled={loading} onClick={() => void load()}>
            <HugeiconsIcon icon={Shield01Icon} strokeWidth={2} data-icon="inline-start" />
            {t('emergencyFund.analyzeButton')}
          </Button>
        </div>
      }
      results={
        !result ? (
          <EmptyResults>
            <HugeiconsIcon icon={Shield01Icon} strokeWidth={1.5} className="mb-3 size-10 text-muted-foreground/50" />
            {t('emergencyFund.emptyResults')}
          </EmptyResults>
        ) : noData ? (
          <div className="flex flex-col gap-4">
            <Alert variant="destructive">
              <AlertDescription>
                <strong>{t('emergencyFund.notEnoughData')}</strong>{' '}
                {result.message || t('emergencyFund.notEnoughDataFallback')}
              </AlertDescription>
            </Alert>
            <div className="rounded-lg bg-muted/30 p-3.5 text-sm">
              <p>{t('emergencyFund.notEnoughDataHelp')}</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted-foreground">
                <li>{t('emergencyFund.notEnoughDataChecklist.expenses')}</li>
                <li>{t('emergencyFund.notEnoughDataChecklist.history')}</li>
                <li>{t('emergencyFund.notEnoughDataChecklist.categorized')}</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Alert>
              <AlertDescription>
                <strong>{result.message}</strong>
                <p className="mt-1 text-xs">{statusExplanation(result.status)}</p>
              </AlertDescription>
            </Alert>

            <div className="rounded-lg bg-muted/30 p-3.5">
              <p className="text-xs text-muted-foreground">{t('emergencyFund.currentCoverage')}</p>
              <p
                className={`font-heading text-2xl font-bold tabular-nums ${
                  monthsCovered >= 6 ? 'text-success' : monthsCovered >= 3 ? 'text-info' : 'text-amber-500'
                }`}
              >
                {t('emergencyFund.months', { count: monthsCovered.toFixed(1) })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('emergencyFund.coverageDetail', {
                  assets: formatCurrency(result.current_liquid_assets),
                  expenses: formatCurrency(result.monthly_expenses),
                })}
              </p>
              <ProgressBar
                value={Math.min(result.current_coverage.percentage_of_recommended, 100)}
                variant={monthsCovered >= 6 ? 'success' : monthsCovered >= 3 ? 'primary' : 'warning'}
                className="mt-3"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t('emergencyFund.percentOfTarget', {
                  percent: result.current_coverage.percentage_of_recommended.toFixed(0),
                })}
              </p>
            </div>

            <div className="rounded-lg bg-muted/30 p-3.5">
              <p className="mb-1 text-sm font-medium">{t('emergencyFund.targets')}</p>
              <p className="mb-3 text-xs text-muted-foreground">
                {t('emergencyFund.targetsBasedOn', { amount: formatCurrency(result.monthly_expenses) })}
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: tierLabels.minimum, value: result.recommendations.minimum, met: monthsCovered >= 3 },
                  { label: tierLabels.recommended, value: result.recommendations.recommended, met: monthsCovered >= 6 },
                  { label: tierLabels.maximum, value: result.recommendations.maximum, met: monthsCovered >= 12 },
                ].map((tier) => (
                  <div key={tier.label} className="rounded-lg border border-border p-2">
                    <p className="text-xs font-medium">{tier.label}</p>
                    <p className="text-lg font-bold">{formatCurrency(tier.value)}</p>
                    {tier.met && (
                      <Badge variant="secondary" className="mt-1 text-[10px]">
                        {t('emergencyFund.met')}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {result.gap_to_recommended > 0 ? (
              <Accordion type="single" collapsible defaultValue="plans">
                <AccordionItem value="plans">
                  <AccordionTrigger>
                    {t('emergencyFund.savingsPlansTitle')}{' '}
                    <Badge variant="outline" className="ms-2">
                      {t('emergencyFund.gapLabel', { amount: formatCurrency(result.gap_to_recommended) })}
                    </Badge>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-col gap-2">
                      {result.savings_plans.map((plan, i) => (
                        <div
                          key={plan.months}
                          className={`flex items-center justify-between rounded-lg p-3 text-sm ${
                            i === 1 ? 'ring-2 ring-success' : 'bg-muted/30'
                          }`}
                        >
                          <span className="font-medium">
                            {t('emergencyFund.monthsCount', { count: plan.months })}{' '}
                            {i === 1 && (
                              <Badge variant="secondary" className="ms-1 text-[10px]">
                                {t('emergencyFund.recommendedBadge')}
                              </Badge>
                            )}
                          </span>
                          <span className="font-bold text-primary">{t('emergencyFund.perMonth', { amount: formatCurrency(plan.monthly_savings) })}</span>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            ) : (
              <Alert>
                <AlertDescription>{t('emergencyFund.goalReached')}</AlertDescription>
              </Alert>
            )}
          </div>
        )
      }
    />
  )
}
