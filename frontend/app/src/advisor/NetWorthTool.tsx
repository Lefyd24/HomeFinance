import { useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import ReactECharts from 'echarts-for-react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { ChartLineData01Icon, Clock01Icon, ChartUpIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate } from '../lib/format'
import {
  baseAxisStyle,
  compactNumber,
  normalizeChartOption,
  polarityItemStyle,
  polarityLineStyle,
  seriesHoverSafe,
  tooltipStyle,
  useChartTheme,
  type ChartTheme,
} from '../reports/chartTheme'
import { useMediaQuery } from '../ui/useMediaQuery'
import { ToolPanel, EmptyResults, InfoBanner } from './ToolPanel'
import * as advisorApi from './advisorApi'
import type { NetWorth, NetWorthHistoryEntry, NetWorthProjection } from './advisorApi'

/**
 * Grid, tooltip and pointer shared by both charts.
 *
 * The old fixed percentage margins left a phone with about half its width for
 * plot area once the axis labels had taken theirs; the padding is in pixels
 * here and tighter on a small screen, and money is spelled out in the tooltip
 * rather than shortened the way the axis has to be.
 */
function responsiveFrame(theme: ChartTheme, compact: boolean) {
  return {
    grid: {
      left: compact ? 2 : 6,
      right: compact ? 4 : 10,
      top: 26,
      bottom: 4,
      containLabel: true,
    },
    tooltip: {
      trigger: 'axis' as const,
      ...tooltipStyle(theme),
      valueFormatter: (value: number | null) => (value == null ? '—' : formatCurrency(value)),
    },
    axisPointer: {
      lineStyle: { color: theme.axis, type: 'dashed' as const },
      label: { backgroundColor: theme.surface, color: theme.ink, fontSize: 11 },
    },
  }
}

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
  const compact = !useMediaQuery('(min-width: 640px)')

  /**
   * Net worth month by month, with the month-on-month change underneath it.
   *
   * The line alone says where the number ended up and hides how it got there —
   * a flat year and a year of one big gain against eleven small losses draw
   * nearly the same curve. The bars are that missing half: one per month,
   * green when the month added and red when it took away, on their own axis
   * because a €400 monthly change and a €40,000 balance cannot share a scale.
   */
  const historyChart = useMemo(() => {
    if (view !== 'history' || !history) return null
    const seriesName = t('netWorthTool.history.seriesNetWorth')
    const changeName = t('netWorthTool.history.seriesChange')
    const values = history.map((d) => d.net_worth)
    const changes = values.map((value, index) => (index === 0 ? null : value - values[index - 1]!))
    const average = values.reduce((sum, v) => sum + v, 0) / (values.length || 1)

    return {
      ...responsiveFrame(theme, compact),
      xAxis: {
        type: 'category' as const,
        data: history.map((d) => formatDate(d.date, { month: 'short', year: '2-digit' })),
        ...baseAxisStyle(theme),
        axisLabel: { color: theme.muted, fontSize: compact ? 9 : 11, hideOverlap: true },
      },
      yAxis: [
        {
          type: 'value' as const,
          scale: true,
          ...baseAxisStyle(theme),
          axisLabel: { color: theme.muted, fontSize: compact ? 9 : 11, formatter: compactNumber },
        },
        {
          type: 'value' as const,
          ...baseAxisStyle(theme),
          splitLine: { show: false },
          axisLabel: { show: false },
          // Half the panel, so the bars read as a footnote to the line rather
          // than competing with it.
          max: (value: { max: number; min: number }) =>
            Math.max(Math.abs(value.max), Math.abs(value.min)) * 2.6,
          min: (value: { max: number; min: number }) =>
            -Math.max(Math.abs(value.max), Math.abs(value.min)) * 2.6,
        },
      ],
      series: [
        {
          name: changeName,
          type: 'bar' as const,
          yAxisIndex: 1,
          ...seriesHoverSafe,
          data: changes.map((change) => ({
            value: change,
            itemStyle: {
              color: (change ?? 0) >= 0 ? theme.positive : theme.negative,
              opacity: 0.45,
            },
          })),
          barMaxWidth: 14,
        },
        {
          name: seriesName,
          type: 'line' as const,
          ...seriesHoverSafe,
          data: values,
          smooth: true,
          symbolSize: 5,
          areaStyle: { opacity: 0.14, color: theme.neutral },
          itemStyle: { color: theme.neutral },
          lineStyle: { width: 2, color: theme.neutral },
          // The two months worth naming, and the level the year hovered
          // around — read off the chart rather than hunted for in it.
          markPoint: {
            symbolSize: 42,
            label: { fontSize: 9, color: theme.ink, formatter: (p: { value: number }) => compactNumber(p.value) },
            itemStyle: { color: 'transparent', borderColor: theme.grid, borderWidth: 1 },
            data: [
              { type: 'max' as const, name: t('netWorthTool.history.peak') },
              { type: 'min' as const, name: t('netWorthTool.history.trough') },
            ],
          },
          markLine: {
            silent: true,
            symbol: 'none' as const,
            lineStyle: { color: theme.muted, type: 'dashed' as const, opacity: 0.6 },
            label: {
              formatter: t('netWorthTool.history.average'),
              fontSize: 9,
              color: theme.muted,
              position: 'insideEndTop' as const,
            },
            data: [{ yAxis: average }],
          },
        },
      ],
    }
  }, [view, history, theme, t, compact])

  /**
   * Where the current savings rate lands you, drawn as an extension of today
   * rather than as a chart of its own.
   *
   * Everything after "now" is dashed and sits on a shaded band, because it is
   * arithmetic on an assumption, not a record of anything. The flat line at
   * today's net worth is what makes the projection legible: the gap between
   * the two lines at any month is what the saving is expected to add by then.
   */
  const projectionChart = useMemo(() => {
    if (view !== 'projection' || !projection) return null
    const seriesName = t('netWorthTool.projection.seriesProjectedNetWorth')
    const values = [
      projection.current_net_worth,
      ...projection.projections.map((p) => p.projected_net_worth),
    ]
    const labels = [
      t('charts.now'),
      ...projection.projections.map((p) => formatDate(p.date, { month: 'short' })),
    ]
    const positive = projection.total_growth >= 0

    return {
      ...responsiveFrame(theme, compact),
      xAxis: {
        type: 'category' as const,
        data: labels,
        boundaryGap: false,
        ...baseAxisStyle(theme),
        axisLabel: { color: theme.muted, fontSize: compact ? 9 : 11, hideOverlap: true },
      },
      yAxis: {
        type: 'value' as const,
        scale: true,
        ...baseAxisStyle(theme),
        axisLabel: { color: theme.muted, fontSize: compact ? 9 : 11, formatter: compactNumber },
      },
      series: [
        {
          name: seriesName,
          type: 'line' as const,
          ...seriesHoverSafe,
          data: values,
          smooth: true,
          showSymbol: false,
          areaStyle: { opacity: 0.12 },
          itemStyle: polarityItemStyle(theme, positive ? 'positive' : 'negative'),
          lineStyle: {
            ...polarityLineStyle(theme, positive ? 'positive' : 'negative'),
            type: 'dashed' as const,
          },
          markArea: {
            silent: true,
            itemStyle: { color: theme.grid, opacity: 0.5 },
            label: {
              show: !compact,
              position: 'insideTop' as const,
              color: theme.muted,
              fontSize: 10,
              formatter: t('netWorthTool.projection.projectedBand'),
            },
            data: [[{ xAxis: labels[0] }, { xAxis: labels[labels.length - 1] }]],
          },
          markLine: {
            silent: true,
            symbol: 'none' as const,
            lineStyle: { color: theme.muted, type: 'solid' as const, opacity: 0.5 },
            label: {
              formatter: t('netWorthTool.projection.todayLine'),
              fontSize: 9,
              color: theme.muted,
              position: 'insideStartTop' as const,
            },
            data: [{ yAxis: projection.current_net_worth }],
          },
        },
      ],
    }
  }, [view, projection, theme, t, compact])

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
            <ReactECharts
              option={normalizeChartOption(historyChart)}
              style={{ height: compact ? 260 : 340, width: '100%' }}
              opts={{ renderer: 'svg' }}
              notMerge
            />
            <p className="mt-1 text-[0.7rem] text-muted-foreground">
              {t('netWorthTool.history.chartHint')}
            </p>
          </>
        ) : projectionChart ? (
          <>
            <h2 className="mb-2 font-heading text-lg font-semibold">{t('netWorthTool.projection.chartTitle')}</h2>
            <ReactECharts
              option={normalizeChartOption(projectionChart)}
              style={{ height: compact ? 260 : 340, width: '100%' }}
              opts={{ renderer: 'svg' }}
              notMerge
            />
            <p className="mt-1 text-[0.7rem] text-muted-foreground">
              {t('netWorthTool.projection.chartHint')}
            </p>
          </>
        ) : undefined
      }
    />
  )
}
