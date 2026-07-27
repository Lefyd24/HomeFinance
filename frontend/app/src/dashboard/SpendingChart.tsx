import ReactECharts from 'echarts-for-react'
import type { SpendingReport } from './reportsApi'

interface SpendingChartProps {
  report: SpendingReport | undefined
}

export function SpendingChart({ report }: SpendingChartProps) {
  if (!report || report.labels.length === 0) {
    return <p className="text-muted-foreground text-sm">No spending data for this period.</p>
  }

  const option = {
    tooltip: { trigger: 'item' as const },
    series: [
      {
        type: 'pie' as const,
        radius: ['40%', '70%'],
        data: report.labels.map((name, index) => ({
          name,
          value: report.data[index] ?? 0,
        })),
      },
    ],
  }

  return (
    <ReactECharts
      option={option}
      style={{ height: 280, width: '100%' }}
      opts={{ renderer: 'svg' }}
    />
  )
}
