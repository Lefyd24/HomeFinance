import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactECharts from 'echarts-for-react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { CheckmarkCircle02Icon, Coins01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { formatCurrency } from '../lib/format'
import { StatCard, StatStrip } from '../ui/StatStrip'
import { baseAxisStyle, compactNumber, seriesHoverSafe, tooltipStyle, useChartTheme } from '../reports/chartTheme'
import { ToolPanel, EmptyResults, InfoBanner } from './ToolPanel'
import { SecondaryNav } from './SecondaryNav'
import * as advisorApi from './advisorApi'
import type { EarlyPayoffResponse, LoanAmortizationResponse } from './advisorApi'

type LoanTab = 'amortization' | 'early-payoff'

export function LoanTool() {
  const { t } = useTranslation('advisor')
  const [tab, setTab] = useState<LoanTab>('amortization')

  const loanTabs = useMemo(
    () => [
      { value: 'amortization' as const, label: t('secondaryNav.loan.amortization') },
      { value: 'early-payoff' as const, label: t('secondaryNav.loan.earlyPayoff') },
    ],
    [t],
  )

  return (
    <div className="flex flex-col gap-4">
      <SecondaryNav value={tab} onValueChange={setTab} options={loanTabs} />
      {tab === 'amortization' && <AmortizationTab />}
      {tab === 'early-payoff' && <EarlyPayoffTab />}
    </div>
  )
}

function AmortizationTab() {
  const { t } = useTranslation('advisor')
  const [principal, setPrincipal] = useState('200000')
  const [rate, setRate] = useState('4.5')
  const [years, setYears] = useState('30')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<LoanAmortizationResponse | null>(null)

  async function calculate() {
    setLoading(true)
    try {
      const data = await advisorApi.calculateLoanAmortization({
        principal: Number.parseFloat(principal) || 0,
        annual_rate: (Number.parseFloat(rate) || 0) / 100,
        term_months: (Number.parseInt(years, 10) || 1) * 12,
      })
      setResult(data)
    } catch {
      toast.error(t('loanTool.amortization.calculationError'))
    } finally {
      setLoading(false)
    }
  }

  const theme = useChartTheme()
  const chartOption = useMemo(() => {
    if (!result) return null
    const seriesName = t('loanTool.amortization.seriesRemainingBalance')
    return {
      tooltip: { trigger: 'axis' as const, ...tooltipStyle(theme) },
      grid: { left: '3%', right: '4%', top: 20, bottom: '10%', containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: result.schedule.map((s) => t('charts.month', { n: s.month })),
        ...baseAxisStyle(theme),
      },
      yAxis: {
        type: 'value' as const,
        ...baseAxisStyle(theme),
        axisLabel: { color: theme.muted, fontSize: 11, formatter: compactNumber },
      },
      series: [
        {
          name: seriesName,
          type: 'line' as const,
          ...seriesHoverSafe,
          data: result.schedule.map((s) => s.balance),
          smooth: true,
          areaStyle: { opacity: 0.15 },
          itemStyle: { color: theme.neutral },
          lineStyle: { width: 2, color: theme.neutral },
        },
      ],
    }
  }, [result, theme, t])

  const interestRatio = result ? Math.round((result.total_interest / result.principal) * 100) : 0

  return (
    <ToolPanel
      title={t('loanTool.amortization.title')}
      description={t('loanTool.amortization.description')}
      form={
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="loan-principal">{t('loanTool.amortization.loanAmountLabel')}</Label>
              <Input id="loan-principal" type="number" min={1000} value={principal} onChange={(e) => setPrincipal(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="loan-rate">{t('loanTool.amortization.interestRateLabel')}</Label>
              <Input id="loan-rate" type="number" min={0} max={30} step={0.1} value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="loan-years">{t('loanTool.amortization.loanTermLabel')}</Label>
              <Input id="loan-years" type="number" min={1} max={50} value={years} onChange={(e) => setYears(e.target.value)} />
            </div>
          </div>
          <Button className="w-full" disabled={loading} onClick={() => void calculate()}>
            {t('loanTool.amortization.calculateButton')}
          </Button>
        </div>
      }
      results={
        result ? (
          <div className="flex flex-col gap-4">
            <StatStrip className="sm:grid-cols-3 xl:grid-cols-3">
              <StatCard
                label={t('loanTool.amortization.monthly')}
                value={formatCurrency(result.monthly_payment)}
                hint={t('loanTool.amortization.monthlyHint', { years })}
                tone="primary"
              />
              <StatCard label={t('loanTool.amortization.totalInterest')} value={formatCurrency(result.total_interest)} hint={`${interestRatio}%`} tone="destructive" />
              <StatCard label={t('loanTool.amortization.totalPaid')} value={formatCurrency(result.total_payments)} hint={t('loanTool.amortization.totalPaidHint')} />
            </StatStrip>
            <div className="rounded-lg bg-muted/30 p-3.5 text-xs text-muted-foreground">
              {t('loanTool.amortization.summary', {
                years,
                rate,
                amount: formatCurrency(result.total_interest),
                percent: interestRatio,
              })}
            </div>
          </div>
        ) : (
          <EmptyResults>
            <HugeiconsIcon icon={Coins01Icon} strokeWidth={1.5} className="mb-3 size-10 text-muted-foreground/50" />
            {t('loanTool.amortization.emptyResults')}
          </EmptyResults>
        )
      }
      chart={
        chartOption && (
          <>
            <h2 className="mb-2 font-heading text-lg font-semibold">{t('loanTool.amortization.chartTitle')}</h2>
            <ReactECharts option={chartOption} style={{ height: 320, width: '100%' }} opts={{ renderer: 'svg' }} notMerge />
          </>
        )
      }
    />
  )
}

function EarlyPayoffTab() {
  const { t } = useTranslation('advisor')
  const [principal, setPrincipal] = useState('200000')
  const [rate, setRate] = useState('4.5')
  const [years, setYears] = useState('30')
  const [extra, setExtra] = useState('200')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<EarlyPayoffResponse | null>(null)

  async function calculate() {
    setLoading(true)
    try {
      const data = await advisorApi.calculateEarlyPayoff({
        principal: Number.parseFloat(principal) || 0,
        annual_rate: (Number.parseFloat(rate) || 0) / 100,
        term_months: (Number.parseInt(years, 10) || 1) * 12,
        extra_monthly_payment: Number.parseFloat(extra) || 0,
      })
      setResult(data)
    } catch {
      toast.error(t('loanTool.earlyPayoff.calculationError'))
    } finally {
      setLoading(false)
    }
  }

  const newTermYears = result ? Math.round(result.new_term_months / 12) : 0

  return (
    <ToolPanel
      title={t('loanTool.earlyPayoff.title')}
      description={t('loanTool.earlyPayoff.description')}
      form={
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payoff-principal">{t('loanTool.earlyPayoff.remainingBalanceLabel')}</Label>
              <Input id="payoff-principal" type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payoff-rate">{t('loanTool.earlyPayoff.interestRateLabel')}</Label>
              <Input id="payoff-rate" type="number" step={0.1} value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payoff-years">{t('loanTool.earlyPayoff.remainingYearsLabel')}</Label>
              <Input id="payoff-years" type="number" value={years} onChange={(e) => setYears(e.target.value)} />
            </div>
          </div>
          <div className="rounded-lg border border-success/30 bg-success/5 p-3">
            <Label htmlFor="payoff-extra" className="text-success">
              {t('loanTool.earlyPayoff.extraPaymentLabel')}
            </Label>
            <Input id="payoff-extra" type="number" min={0} className="mt-1.5" value={extra} onChange={(e) => setExtra(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">{t('loanTool.earlyPayoff.extraPaymentHint')}</p>
          </div>
          <Button className="w-full" disabled={loading} onClick={() => void calculate()}>
            {t('loanTool.earlyPayoff.calculateButton')}
          </Button>
        </div>
      }
      results={
        result ? (
          <div className="flex flex-col gap-4">
            <Alert>
              <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} />
              <AlertDescription>
                <strong>{t('loanTool.earlyPayoff.saveAlert', { amount: formatCurrency(result.interest_saved) })}</strong>{' '}
                {t('loanTool.earlyPayoff.saveAlertDetail', { extra: formatCurrency(result.extra_monthly_payment) })}
              </AlertDescription>
            </Alert>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-success/10 p-3 text-center">
                <p className="text-xs text-muted-foreground">{t('loanTool.earlyPayoff.timeSaved')}</p>
                <p className="text-xl font-bold text-success">{t('loanTool.earlyPayoff.timeSavedValue', { years: result.years_saved })}</p>
                <p className="text-xs text-muted-foreground">{t('loanTool.earlyPayoff.timeSavedHint', { months: result.months_saved })}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground">{t('loanTool.earlyPayoff.newTerm')}</p>
                <p className="text-xl font-bold">{t('loanTool.earlyPayoff.newTermValue', { years: newTermYears })}</p>
                <p className="text-xs text-muted-foreground">{t('loanTool.earlyPayoff.newTermHint', { years })}</p>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('loanTool.earlyPayoff.original')}</span>
                <span>{t('loanTool.earlyPayoff.perMonth', { amount: formatCurrency(result.original_monthly_payment) })}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>{t('loanTool.earlyPayoff.new')}</span>
                <span>{t('loanTool.earlyPayoff.perMonth', { amount: formatCurrency(result.new_monthly_payment) })}</span>
              </div>
              <div className="flex justify-between font-medium text-success">
                <span>{t('loanTool.earlyPayoff.save')}</span>
                <span>{formatCurrency(result.interest_saved)}</span>
              </div>
            </div>
            <InfoBanner>{t('loanTool.earlyPayoff.tip')}</InfoBanner>
          </div>
        ) : (
          <EmptyResults>
            <HugeiconsIcon icon={Coins01Icon} strokeWidth={1.5} className="mb-3 size-10 text-muted-foreground/50" />
            {t('loanTool.earlyPayoff.emptyResults')}
          </EmptyResults>
        )
      }
    />
  )
}
