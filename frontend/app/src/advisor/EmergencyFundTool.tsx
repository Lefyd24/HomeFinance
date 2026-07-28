import { useState } from 'react'
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

const STATUS_EXPLANATION: Record<string, string> = {
  excellent: 'You have a robust emergency fund that can cover extended periods without income. Great job!',
  good: 'Your emergency fund is solid. Consider continuing to build toward 6+ months for extra security.',
  fair: 'Your emergency fund is below recommended levels. Prioritize building this up before other investments.',
  critical: 'Your emergency fund is critically low. Focus on saving at least 1–2 months of expenses immediately.',
}

export function EmergencyFundTool() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<EmergencyFundRecommendation | null>(null)

  async function load() {
    setLoading(true)
    try {
      const data = await advisorApi.getEmergencyFundRecommendation()
      setResult(data)
    } catch {
      toast.error('Error loading recommendation')
    } finally {
      setLoading(false)
    }
  }

  const noData = result && (result.status === 'unknown' || result.monthly_expenses <= 0)
  const monthsCovered = result?.current_coverage.months_covered ?? 0

  return (
    <ToolPanel
      title="Emergency fund"
      description="Financial experts recommend 3–6 months of essential expenses saved for unexpected medical bills, repairs, or job loss."
      form={
        <div className="flex flex-col gap-4">
          <div className="rounded-lg bg-info/10 p-3.5">
            <p className="mb-2 text-sm font-medium">Why you need one</p>
            <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
              <li><strong className="text-foreground">3 months:</strong> Minimum safety net for stable jobs</li>
              <li><strong className="text-foreground">6 months:</strong> Recommended for most people</li>
              <li><strong className="text-foreground">12 months:</strong> For freelancers or volatile income</li>
            </ul>
          </div>
          <p className="text-sm text-muted-foreground">
            We'll analyze your actual spending over the last 6 months to calculate a personalized recommendation.
          </p>
          <Button className="w-full" disabled={loading} onClick={() => void load()}>
            <HugeiconsIcon icon={Shield01Icon} strokeWidth={2} data-icon="inline-start" />
            Analyze my spending
          </Button>
        </div>
      }
      results={
        !result ? (
          <EmptyResults>
            <HugeiconsIcon icon={Shield01Icon} strokeWidth={1.5} className="mb-3 size-10 text-muted-foreground/50" />
            Run the analysis to see your emergency fund recommendation.
          </EmptyResults>
        ) : noData ? (
          <div className="flex flex-col gap-4">
            <Alert variant="destructive">
              <AlertDescription>
                <strong>Not enough data.</strong> {result.message || 'We need more expense transactions to calculate a recommendation.'}
              </AlertDescription>
            </Alert>
            <div className="rounded-lg bg-muted/30 p-3.5 text-sm">
              <p>To calculate your emergency fund needs, make sure you have:</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted-foreground">
                <li>Expense transactions recorded in your accounts</li>
                <li>At least a few weeks of spending data</li>
                <li>Transactions categorized for better analysis</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Alert>
              <AlertDescription>
                <strong>{result.message}</strong>
                <p className="mt-1 text-xs">{STATUS_EXPLANATION[result.status] ?? ''}</p>
              </AlertDescription>
            </Alert>

            <div className="rounded-lg bg-muted/30 p-3.5">
              <p className="text-xs text-muted-foreground">Current emergency fund coverage</p>
              <p
                className={`font-heading text-2xl font-bold tabular-nums ${
                  monthsCovered >= 6 ? 'text-success' : monthsCovered >= 3 ? 'text-info' : 'text-amber-500'
                }`}
              >
                {monthsCovered.toFixed(1)} months
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatCurrency(result.current_liquid_assets)} in liquid assets · monthly expenses average{' '}
                {formatCurrency(result.monthly_expenses)}
              </p>
              <ProgressBar
                value={Math.min(result.current_coverage.percentage_of_recommended, 100)}
                variant={monthsCovered >= 6 ? 'success' : monthsCovered >= 3 ? 'primary' : 'warning'}
                className="mt-3"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {result.current_coverage.percentage_of_recommended.toFixed(0)}% of recommended 6-month target
              </p>
            </div>

            <div className="rounded-lg bg-muted/30 p-3.5">
              <p className="mb-1 text-sm font-medium">Your emergency fund targets</p>
              <p className="mb-3 text-xs text-muted-foreground">Based on monthly expenses of {formatCurrency(result.monthly_expenses)}</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: 'Minimum', value: result.recommendations.minimum, met: monthsCovered >= 3 },
                  { label: 'Recommended', value: result.recommendations.recommended, met: monthsCovered >= 6 },
                  { label: 'Maximum', value: result.recommendations.maximum, met: monthsCovered >= 12 },
                ].map((tier) => (
                  <div key={tier.label} className="rounded-lg border border-border p-2">
                    <p className="text-xs font-medium">{tier.label}</p>
                    <p className="text-lg font-bold">{formatCurrency(tier.value)}</p>
                    {tier.met && (
                      <Badge variant="secondary" className="mt-1 text-[10px]">
                        Met
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
                    Savings plans to reach 6-month goal{' '}
                    <Badge variant="outline" className="ms-2">
                      Gap: {formatCurrency(result.gap_to_recommended)}
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
                            {plan.months} months {i === 1 && <Badge variant="secondary" className="ms-1 text-[10px]">Recommended</Badge>}
                          </span>
                          <span className="font-bold text-primary">{formatCurrency(plan.monthly_savings)}/month</span>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            ) : (
              <Alert>
                <AlertDescription>Congratulations! You've reached your recommended emergency fund target.</AlertDescription>
              </Alert>
            )}
          </div>
        )
      }
    />
  )
}
