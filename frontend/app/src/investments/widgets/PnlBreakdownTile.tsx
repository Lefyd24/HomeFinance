import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from 'recharts'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBalance } from '../../lib/format'
import { useBalanceVisibility } from '../../ui/BalanceVisibilityContext'
import { DeltaAmount } from '../InvestmentPrimitives'
import { polarityColor, useChartMotion } from '../chartConfig'
import { buildWaterfall } from '../performanceView'
import { PerformanceError } from './PerformanceTile'
import { Tile } from './Tile'
import type { PortfolioPerformance } from '../investmentsApi'

const config = {
  base: { label: 'base' },
  size: { label: 'size' },
} satisfies ChartConfig

/**
 * All-time: how net invested became current value. A horizontal waterfall
 * (invisible base bar + visible bar) with the same numbers listed underneath,
 * which is also what a screen reader gets.
 */
export function PnlBreakdownTile({
  performance,
  currency,
  loading,
  error,
  className,
}: {
  performance: PortfolioPerformance | undefined
  currency: string
  loading: boolean
  error: Error | null
  className?: string
}) {
  const { t } = useTranslation('investments')
  const { hidden } = useBalanceVisibility()
  const motion = useChartMotion()
  const money = (value: number) => formatBalance(value, currency, hidden)

  const steps = useMemo(
    () =>
      performance
        ? buildWaterfall(performance.breakdown)
            // A step that moved nothing would only be a blank row.
            .filter((step) => step.total || step.value !== 0)
            .map((step) => ({
              ...step,
              label: t(`performance.pnl.steps.${step.key}`),
            }))
        : [],
    [performance, t],
  )
  const feesEstimated = performance?.breakdown.fees_estimated ?? 0

  return (
    <Tile title={t('performance.pnl.title')} className={className} footer={t('performance.pnl.caption')}>
      {loading ? (
        <Skeleton className="h-[16rem] w-full rounded-lg" />
      ) : error ? (
        <PerformanceError error={error} />
      ) : (
        <>
          <ChartContainer config={config} className="aspect-auto h-[14rem] w-full">
            <BarChart data={steps} layout="vertical" margin={{ left: 4, right: 56, top: 4, bottom: 0 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="label"
                tickLine={false}
                axisLine={false}
                width={96}
                interval={0}
                tick={{ fontSize: 11 }}
              />
              <Bar {...motion} dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
              <Bar {...motion} dataKey="size" stackId="w" radius={2}>
                {steps.map((step) => (
                  <Cell
                    key={step.key}
                    fill={step.total ? 'var(--muted-foreground)' : polarityColor(step.value)}
                    fillOpacity={step.total ? 0.55 : 0.85}
                  />
                ))}
                <LabelList
                  dataKey="value"
                  position="right"
                  fontSize={11}
                  className="tabular-nums fill-foreground"
                  formatter={(value) => money(Number(value))}
                />
              </Bar>
            </BarChart>
          </ChartContainer>

          <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            {steps.map((step) => (
              <li key={step.key} className="flex items-baseline justify-between gap-2">
                <span className="text-muted-foreground">{step.label}</span>
                <span className="text-end">
                  {step.total ? (
                    <span className="font-medium tabular-nums">{money(step.value)}</span>
                  ) : (
                    <DeltaAmount amount={step.value} format={money} />
                  )}
                  {step.key === 'fees' && feesEstimated !== 0 && (
                    <span className="block text-[0.65rem] text-muted-foreground">
                      {t('performance.pnl.feesEstimated', { amount: money(Math.abs(feesEstimated)) })}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Tile>
  )
}
