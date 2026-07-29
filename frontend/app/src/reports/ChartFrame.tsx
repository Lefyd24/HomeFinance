import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import ReactECharts from 'echarts-for-react'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { normalizeChartOption } from './chartTheme'

/**
 * Every chart on the page sits in the same frame: a title that names the
 * series (so a single-series chart needs no legend box), one line of plain
 * language saying how to read it, and a single slot that holds either the
 * chart, its loading skeleton, or a sentence explaining why it is empty.
 */
export function ChartFrame({
  title,
  hint,
  action,
  loading,
  isEmpty,
  emptyMessage,
  height = 300,
  className,
  children,
}: {
  title: string
  hint?: string
  action?: ReactNode
  loading?: boolean
  isEmpty?: boolean
  emptyMessage?: string
  height?: number
  className?: string
  children: ReactNode
}) {
  const { t } = useTranslation('reports')
  const resolvedEmpty = emptyMessage ?? t('chart.defaultEmpty')
  return (
    <Card className={cn('h-full', className)}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {hint && <CardDescription>{hint}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="w-full rounded-lg" style={{ height }} />
        ) : isEmpty ? (
          <div
            className="flex items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground"
            style={{ height }}
          >
            {resolvedEmpty}
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}

/**
 * ECharts with the settings every chart here wants: SVG output (crisp at any
 * zoom, and readable in a screenshot), no stale-option merging, and a height
 * the caller controls.
 */
export function Chart({ option, height = 300 }: { option: object; height?: number }) {
  return (
    <ReactECharts
      option={normalizeChartOption(option)}
      notMerge
      opts={{ renderer: 'svg' }}
      style={{ height, width: '100%' }}
    />
  )
}
