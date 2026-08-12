import { useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import ReactECharts from 'echarts-for-react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { ChartLineData01Icon, Clock01Icon, ChartUpIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate } from '../lib/format'
import { baseAxisStyle, compactNumber, polarityItemStyle, polarityLineStyle, seriesHoverSafe, tooltipStyle, useChartTheme } from '../reports/chartTheme'
import { ToolPanel, EmptyResults, InfoBanner } from './ToolPanel'
import * as advisorApi from './advisorApi'
import type { NetWorth, NetWorthHistoryEntry, NetWorthProjection } from './advisorApi'

export function NetWorthTool() {
  const { t } = useTranslation('advisor')
  const [current, setCurrent] = useState<NetWorth | null>(null)
  const [view, setView] = useState<'current' | 'history' | 'projection'>('current')
  const [history, setHistory] = useState<NetWorthHistoryEntry[] | null>(null)
  const [projection, setProjection] = useState<NetWorthProjection | null>(null)
  const [loading, setLoading] = useState(false)

  async function loadCurrent() {
    setLoading(true)
    try {
      setCurrent(await advisorApi.getNetWorth())
      setView('current')
    } catch {
      toast.error(t('netWorthTool.loadCurrentError'))
    } finally {
      setLoading(false)
    }
  }

  async function loadHistory() {
    setLoading(true)
    try {
      setHistory(await advisorApi.getNetWorthHistory(12))
      setView('history')
    } catch {
      toast.error(t('netWorthTool.loadHistoryError'))
    } finally {
      setLoading(false)
    }
  }

  async function loadProjection() {
    setLoading(true)
    try {
      setProjection(await advisorApi.getNetWorthProjection(12))
      setView('projection')
    } catch {
      toast.error(t('netWorthTool.loadProjectionError'))
    } finally {
      setLoading(false)
    }
  }

  const theme = useChartTheme()

  const historyChart = useMemo(() => {
    if (view !== 'history' || !history) return null
    const seriesName = t('netWorthTool.history.seriesNetWorth')
    return {
      tooltip: { trigger: 'axis' as const, ...tooltipStyle(theme) },
      grid: { left: '3%', right: '4%', top: 20, bottom: '10%', containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: history.map((d) => formatDate(d.date, { month: 'short', year: '2-digit' })),
        ...baseAxisStyle(theme),
      },
      yAxis: { type: 'value' as const, ...baseAxisStyle(theme), axisLabel: { color: theme.muted, fontSize: 11, formatter: compactNumber } },
      series: [
        {
          name: seriesName,
          type: 'line' as const,
          ...seriesHoverSafe,
          data: history.map((d) => d.net_worth),
          smooth: true,
          areaStyle: { opacity: 0.15 },
          itemStyle: { color: theme.neutral },
          lineStyle: { width: 2, color: theme.neutral },
        },
      ],
    }
  }, [view, history, theme, t])

  const projectionChart = useMemo(() => {
    if (view !== 'projection' || !projection) return null
    const seriesName = t('netWorthTool.projection.seriesProjectedNetWorth')
    return {
      tooltip: { trigger: 'axis' as const, ...tooltipStyle(theme) },
      grid: { left: '3%', right: '4%', top: 20, bottom: '10%', containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: [t('charts.now'), ...projection.projections.map((p) => formatDate(p.date, { month: 'short' }))],
        ...baseAxisStyle(theme),
      },
      yAxis: { type: 'value' as const, ...baseAxisStyle(theme), axisLabel: { color: theme.muted, fontSize: 11, formatter: compactNumber } },
      series: [
        {
          name: seriesName,
          type: 'line' as const,
          ...seriesHoverSafe,
          data: [projection.current_net_worth, ...projection.projections.map((p) => p.projected_net_worth)],
          smooth: true,
          areaStyle: { opacity: 0.15 },
          itemStyle: polarityItemStyle(theme, 'positive'),
          lineStyle: polarityLineStyle(theme, 'positive'),
        },
      ],
    }
  }, [view, projection, theme, t])

  let healthMessage = ''
  if (current) {
    if (current.debt_to_asset_ratio < 20) healthMessage = t('netWorthTool.health.excellent')
    else if (current.debt_to_asset_ratio < 40) healthMessage = t('netWorthTool.health.good')
    else if (current.debt_to_asset_ratio < 60) healthMessage = t('netWorthTool.health.moderate')
    else healthMessage = t('netWorthTool.health.high')
  }

  const historyChange = history && history.length > 0 ? history[history.length - 1]!.net_worth - history[0]!.net_worth : 0

  return (
    <ToolPanel
      title={t('netWorthTool.title')}
      description={t('netWorthTool.description')}
      form={
        <div className="flex flex-col gap-3">
          <InfoBanner>
            <Trans ns="advisor" i18nKey="netWorthTool.infoBanner" components={{ strong: <strong /> }} />
          </InfoBanner>
          <Button className="w-full" disabled={loading} onClick={() => void loadCurrent()}>
            <HugeiconsIcon icon={ChartLineData01Icon} strokeWidth={2} data-icon="inline-start" />
            {t('netWorthTool.currentButton')}
          </Button>
          <Button className="w-full" variant="outline" disabled={loading} onClick={() => void loadHistory()}>
            <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} data-icon="inline-start" />
            {t('netWorthTool.historyButton')}
          </Button>
          <Button className="w-full" variant="outline" disabled={loading} onClick={() => void loadProjection()}>
            <HugeiconsIcon icon={ChartUpIcon} strokeWidth={2} data-icon="inline-start" />
            {t('netWorthTool.projectionButton')}
          </Button>
        </div>
      }
      results={
        view === 'current' && current ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl bg-gradient-to-r from-info/15 to-primary/15 p-4">
              <p className="text-xs text-muted-foreground">{t('netWorthTool.netWorth')}</p>
              <p className={`font-heading text-2xl font-bold tabular-nums ${current.net_worth >= 0 ? 'text-success' : 'text-destructive'}`}>
                {formatCurrency(current.net_worth)}
              </p>
              <p className="text-xs text-muted-foreground">{t('netWorthTool.asOf', { date: formatDate(current.calculated_at) })}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-success/10 p-3">
                <p className="text-xs text-muted-foreground">{t('netWorthTool.totalAssets')}</p>
                <p className="text-lg font-bold text-success">{formatCurrency(current.total_assets)}</p>
                {Object.entries(current.assets_breakdown).map(([k, v]) => (
                  <div key={k} className="mt-1 flex justify-between text-xs">
                    <span className="capitalize">{k.replace(/_/g, ' ')}</span>
                    <span>{formatCurrency(v)}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-lg bg-destructive/10 p-3">
                <p className="text-xs text-muted-foreground">{t('netWorthTool.totalLiabilities')}</p>
                <p className="text-lg font-bold text-destructive">{formatCurrency(current.total_liabilities)}</p>
                {Object.entries(current.liabilities_breakdown).map(([k, v]) => (
                  <div key={k} className="mt-1 flex justify-between text-xs">
                    <span className="capitalize">{k.replace(/_/g, ' ')}</span>
                    <span>{formatCurrency(v)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg bg-muted/30 p-3.5">
              <p className="text-sm">
                <strong>{t('netWorthTool.debtToAssetRatio')}</strong> {current.debt_to_asset_ratio.toFixed(1)}%
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{healthMessage}</p>
            </div>
          </div>
        ) : view === 'history' && history ? (
          <div className="flex flex-col gap-3">
            <InfoBanner>{t('netWorthTool.history.infoBanner')}</InfoBanner>
            <div className="rounded-lg bg-muted/30 p-3.5 text-sm">
              <strong>{t('netWorthTool.history.changeLabel')}</strong>
              <span className={historyChange >= 0 ? 'text-success' : 'text-destructive'}>
                {historyChange >= 0 ? '+' : ''}
                {formatCurrency(historyChange)}
              </span>
            </div>
          </div>
        ) : view === 'projection' && projection ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg bg-muted/30 p-3.5">
              <p className="text-xs text-muted-foreground">{t('netWorthTool.projection.growthLabel')}</p>
              <p className="text-xl font-bold text-success">{formatCurrency(projection.total_growth)}</p>
              <p className="text-xs text-muted-foreground">
                {t('netWorthTool.projection.growthHint', { amount: formatCurrency(projection.monthly_savings_rate) })}
              </p>
            </div>
            <div className="rounded-lg bg-success/10 p-3.5">
              <p className="text-sm">{t('netWorthTool.projection.projectedIn12Months')}</p>
              <p className="text-xl font-bold">{formatCurrency(projection.final_projected_net_worth)}</p>
            </div>
            <InfoBanner>{t('netWorthTool.projection.infoBanner')}</InfoBanner>
          </div>
        ) : (
          <EmptyResults>
            <HugeiconsIcon icon={ChartLineData01Icon} strokeWidth={1.5} className="mb-3 size-10 text-muted-foreground/50" />
            {t('netWorthTool.emptyResults')}
          </EmptyResults>
        )
      }
      chart={
        historyChart ? (
          <>
            <h2 className="mb-2 font-heading text-lg font-semibold">{t('netWorthTool.history.chartTitle')}</h2>
            <ReactECharts option={historyChart} style={{ height: 320, width: '100%' }} opts={{ renderer: 'svg' }} notMerge />
          </>
        ) : projectionChart ? (
          <>
            <h2 className="mb-2 font-heading text-lg font-semibold">{t('netWorthTool.projection.chartTitle')}</h2>
            <ReactECharts option={projectionChart} style={{ height: 320, width: '100%' }} opts={{ renderer: 'svg' }} notMerge />
          </>
        ) : undefined
      }
    />
  )
}
