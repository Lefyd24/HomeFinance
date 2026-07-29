import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactECharts from 'echarts-for-react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { ChartLineData01Icon, Csv01Icon, Xls01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency } from '../lib/format'
import { StatCard, StatStrip } from '../ui/StatStrip'
import { baseAxisStyle, compactNumber, seriesHoverSafe, tooltipStyle, useChartTheme } from '../reports/chartTheme'
import { ToolPanel, EmptyResults, InfoBanner } from './ToolPanel'
import { SecondaryNav } from './SecondaryNav'
import { downloadCsv, downloadExcel } from './exportTable'
import * as advisorApi from './advisorApi'
import type { InvestmentCalculationResponse, RetirementProjectionResponse, SelfSustainingResponse } from './advisorApi'

type InvestmentTab = 'compound' | 'retirement' | 'compare' | 'self-sustaining'

export function InvestmentTool() {
  const { t } = useTranslation('advisor')
  const [tab, setTab] = useState<InvestmentTab>('compound')

  const investmentTabs = useMemo(
    () => [
      { value: 'compound' as const, label: t('secondaryNav.investment.compound') },
      { value: 'retirement' as const, label: t('secondaryNav.investment.retirement') },
      { value: 'compare' as const, label: t('secondaryNav.investment.compare') },
      { value: 'self-sustaining' as const, label: t('secondaryNav.investment.selfSustaining') },
    ],
    [t],
  )

  return (
    <div className="flex flex-col gap-4">
      <SecondaryNav value={tab} onValueChange={setTab} options={investmentTabs} />
      {tab === 'compound' && <CompoundTab />}
      {tab === 'retirement' && <RetirementTab />}
      {tab === 'compare' && <CompareTab />}
      {tab === 'self-sustaining' && <SelfSustainingTab />}
    </div>
  )
}

function CompoundTab() {
  const { t } = useTranslation('advisor')
  const [principal, setPrincipal] = useState('10000')
  const [monthly, setMonthly] = useState('500')
  const [rate, setRate] = useState('7')
  const [years, setYears] = useState('20')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<InvestmentCalculationResponse | null>(null)

  async function calculate() {
    setLoading(true)
    try {
      const data = await advisorApi.calculateInvestment({
        principal: Number.parseFloat(principal) || 0,
        annual_rate: (Number.parseFloat(rate) || 0) / 100,
        years: Number.parseInt(years, 10) || 1,
        monthly_contribution: Number.parseFloat(monthly) || 0,
      })
      setResult(data)
    } catch {
      toast.error(t('investmentTool.compound.calculationError'))
    } finally {
      setLoading(false)
    }
  }

  const theme = useChartTheme()
  const chartOption = useMemo(() => {
    if (!result) return null
    const legendBalance = t('investmentTool.compound.legendBalance')
    const legendContributions = t('investmentTool.compound.legendContributions')
    return {
      tooltip: { trigger: 'axis' as const, ...tooltipStyle(theme) },
      legend: { data: [legendBalance, legendContributions], bottom: 0, textStyle: { color: theme.muted, fontSize: 11 } },
      grid: { left: '3%', right: '4%', top: 20, bottom: '14%', containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: result.yearly_breakdown.map((y) => t('charts.year', { n: y.year })),
        ...baseAxisStyle(theme),
      },
      yAxis: {
        type: 'value' as const,
        ...baseAxisStyle(theme),
        axisLabel: { color: theme.muted, fontSize: 11, formatter: compactNumber },
      },
      series: [
        {
          name: legendBalance,
          type: 'line' as const,
          ...seriesHoverSafe,
          data: result.yearly_breakdown.map((y) => y.balance),
          smooth: true,
          areaStyle: { opacity: 0.12 },
          itemStyle: { color: theme.neutral },
          lineStyle: { width: 2, color: theme.neutral },
        },
        {
          name: legendContributions,
          type: 'line' as const,
          ...seriesHoverSafe,
          data: result.yearly_breakdown.map((y) => y.contributions),
          itemStyle: { color: theme.positive },
          lineStyle: { width: 2, type: 'dashed' as const, color: theme.positive },
        },
      ],
    }
  }, [result, theme, t])

  const interestPortion = result ? Math.round((result.total_interest_earned / result.final_balance) * 100) : 0
  const totalContributed = (Number.parseFloat(principal) || 0) + (Number.parseFloat(monthly) || 0) * 12 * (Number.parseInt(years, 10) || 0)
  const multiplier = result ? result.final_balance / totalContributed : 0
  const yearsNum = Number.parseInt(years, 10) || 1
  const rateNum = Number.parseFloat(rate) || 1

  const rule72Years = Math.round(72 / rateNum)

  let insight = ''
  if (multiplier >= 3)
    insight = t('investmentTool.compound.insight.excellent', { multiplier: multiplier.toFixed(2), years: yearsNum })
  else if (multiplier >= 2) insight = t('investmentTool.compound.insight.good', { percent: interestPortion })
  else if (multiplier >= 1.5) insight = t('investmentTool.compound.insight.moderate')
  else insight = t('investmentTool.compound.insight.conservative')

  return (
    <ToolPanel
      title={t('investmentTool.compound.title')}
      description={t('investmentTool.compound.description')}
      form={
        <div className="flex flex-col gap-4">
          <InfoBanner>{t('investmentTool.compound.infoBanner')}</InfoBanner>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-principal">{t('investmentTool.compound.startingAmountLabel')}</Label>
              <Input id="inv-principal" type="number" min={0} step={100} value={principal} onChange={(e) => setPrincipal(e.target.value)} />
              <p className="text-xs text-muted-foreground">{t('investmentTool.compound.startingAmountHint')}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-monthly">{t('investmentTool.compound.monthlyDepositLabel')}</Label>
              <Input id="inv-monthly" type="number" min={0} step={50} value={monthly} onChange={(e) => setMonthly(e.target.value)} />
              <p className="text-xs text-muted-foreground">{t('investmentTool.compound.monthlyDepositHint')}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-rate">{t('investmentTool.compound.annualReturnLabel')}</Label>
              <Input id="inv-rate" type="number" min={0} max={30} step={0.5} value={rate} onChange={(e) => setRate(e.target.value)} />
              <p className="text-xs text-muted-foreground">{t('investmentTool.compound.annualReturnHint')}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-years">{t('investmentTool.compound.investmentPeriodLabel')}</Label>
              <Input id="inv-years" type="number" min={1} max={50} value={years} onChange={(e) => setYears(e.target.value)} />
              <p className="text-xs text-muted-foreground">{t('investmentTool.compound.investmentPeriodHint')}</p>
            </div>
          </div>
          <Button className="w-full" disabled={loading} onClick={() => void calculate()}>
            {t('investmentTool.compound.calculateButton')}
          </Button>
        </div>
      }
      results={
        result ? (
          <div className="flex flex-col gap-4">
            <StatStrip className="sm:grid-cols-3 xl:grid-cols-3">
              <StatCard
                label={t('investmentTool.compound.finalBalance')}
                value={formatCurrency(result.final_balance)}
                hint={t('investmentTool.compound.finalBalanceHint', { years: yearsNum })}
                tone="primary"
              />
              <StatCard label={t('investmentTool.compound.contributed')} value={formatCurrency(result.total_contributions)} hint={t('investmentTool.compound.contributedHint')} />
              <StatCard label={t('investmentTool.compound.interest')} value={formatCurrency(result.total_interest_earned)} hint={`${interestPortion}%`} tone="success" />
            </StatStrip>

            <div className="rounded-lg border border-border bg-muted/30 p-3.5">
              <p className="text-sm font-medium">{t('investmentTool.compound.analysis')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{insight}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">{t('investmentTool.compound.returnLabel')}</span>
                  <span className="font-medium">{result.effective_return.toFixed(1)}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('investmentTool.compound.multiplierLabel')}</span>
                  <span className="font-medium">{multiplier.toFixed(2)}x</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('investmentTool.compound.monthlyLabel')}</span>
                  <span className="font-medium">{formatCurrency(Number.parseFloat(monthly) || 0)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('investmentTool.compound.ruleOf72Label')}</span>
                  <span className="font-medium">{t('investmentTool.compound.ruleOf72Value', { years: rule72Years })}</span>
                </div>
              </div>
            </div>

            <InfoBanner>
              <strong>{t('investmentTool.compound.tip')}</strong>{' '}
              {t('investmentTool.compound.tipText', { rate, years: rule72Years })}
            </InfoBanner>
          </div>
        ) : (
          <EmptyResults>
            <HugeiconsIcon icon={ChartLineData01Icon} strokeWidth={1.5} className="mb-3 size-10 text-muted-foreground/50" />
            {t('investmentTool.compound.emptyResults')}
          </EmptyResults>
        )
      }
      chart={
        chartOption && (
          <>
            <h2 className="mb-2 font-heading text-lg font-semibold">{t('investmentTool.compound.chartTitle')}</h2>
            <ReactECharts option={chartOption} style={{ height: 320, width: '100%' }} opts={{ renderer: 'svg' }} notMerge />
          </>
        )
      }
    />
  )
}

function RetirementTab() {
  const { t } = useTranslation('advisor')
  const [age, setAge] = useState('30')
  const [retireAge, setRetireAge] = useState('65')
  const [savings, setSavings] = useState('50000')
  const [monthly, setMonthly] = useState('800')
  const [rate, setRate] = useState('7')
  const [inflation, setInflation] = useState('2')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<RetirementProjectionResponse | null>(null)

  async function calculate() {
    setLoading(true)
    try {
      const data = await advisorApi.calculateRetirement({
        current_age: Number.parseInt(age, 10) || 18,
        retirement_age: Number.parseInt(retireAge, 10) || 65,
        current_savings: Number.parseFloat(savings) || 0,
        monthly_contribution: Number.parseFloat(monthly) || 0,
        annual_return: (Number.parseFloat(rate) || 0) / 100,
        inflation_rate: (Number.parseFloat(inflation) || 0) / 100,
      })
      setResult(data)
    } catch {
      toast.error(t('investmentTool.retirement.calculationError'))
    } finally {
      setLoading(false)
    }
  }

  const theme = useChartTheme()
  const chartOption = useMemo(() => {
    if (!result) return null
    const currentAge = Number.parseInt(age, 10) || 0
    const seriesName = t('investmentTool.retirement.seriesProjectedBalance')
    return {
      tooltip: { trigger: 'axis' as const, ...tooltipStyle(theme) },
      grid: { left: '3%', right: '4%', top: 20, bottom: '10%', containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: result.yearly_projection.map((_, i) => t('charts.age', { n: currentAge + i + 1 })),
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
          data: result.yearly_projection.map((y) => y.balance),
          smooth: true,
          areaStyle: { opacity: 0.15 },
          itemStyle: { color: theme.neutral },
          lineStyle: { width: 2, color: theme.neutral },
        },
      ],
    }
  }, [result, theme, age, t])

  let adequacy = ''
  if (result) {
    if (result.monthly_retirement_income >= 3000) adequacy = t('investmentTool.retirement.adequacy.excellent')
    else if (result.monthly_retirement_income >= 2000) adequacy = t('investmentTool.retirement.adequacy.good')
    else if (result.monthly_retirement_income >= 1000) adequacy = t('investmentTool.retirement.adequacy.moderate')
    else adequacy = t('investmentTool.retirement.adequacy.low')
  }

  return (
    <ToolPanel
      title={t('investmentTool.retirement.title')}
      description={t('investmentTool.retirement.description')}
      form={
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ret-age">{t('investmentTool.retirement.currentAgeLabel')}</Label>
              <Input id="ret-age" type="number" min={18} max={80} value={age} onChange={(e) => setAge(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ret-retire-age">{t('investmentTool.retirement.retirementAgeLabel')}</Label>
              <Input id="ret-retire-age" type="number" min={30} max={90} value={retireAge} onChange={(e) => setRetireAge(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ret-savings">{t('investmentTool.retirement.currentSavingsLabel')}</Label>
              <Input id="ret-savings" type="number" min={0} value={savings} onChange={(e) => setSavings(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ret-monthly">{t('investmentTool.retirement.monthlyContributionLabel')}</Label>
              <Input id="ret-monthly" type="number" min={0} value={monthly} onChange={(e) => setMonthly(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ret-rate">{t('investmentTool.retirement.expectedReturnLabel')}</Label>
              <Input id="ret-rate" type="number" min={0} max={15} step={0.5} value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ret-inflation">{t('investmentTool.retirement.expectedInflationLabel')}</Label>
            <Input id="ret-inflation" type="number" min={0} max={10} step={0.5} value={inflation} onChange={(e) => setInflation(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t('investmentTool.retirement.inflationHint')}</p>
          </div>
          <Button className="w-full" disabled={loading} onClick={() => void calculate()}>
            {t('investmentTool.retirement.calculateButton')}
          </Button>
        </div>
      }
      results={
        result ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl bg-primary/10 p-4">
              <p className="text-xs text-muted-foreground">{t('investmentTool.retirement.balanceAt', { age: retireAge })}</p>
              <p className="font-heading text-2xl font-bold tabular-nums text-primary">{formatCurrency(result.retirement_balance)}</p>
              <p className="text-xs text-muted-foreground">
                {t('investmentTool.retirement.todaysMoney', { amount: formatCurrency(result.retirement_balance_today_dollars) })}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-success/10 p-3">
                <p className="text-xs text-muted-foreground">{t('investmentTool.retirement.monthlyIncome')}</p>
                <p className="text-lg font-bold text-success">{formatCurrency(result.monthly_retirement_income)}</p>
                <p className="text-xs text-muted-foreground">{t('investmentTool.retirement.monthlyIncomeHint')}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">{t('investmentTool.retirement.yearsToRetire')}</p>
                <p className="text-lg font-bold">{result.years_to_retirement}</p>
                <p className="text-xs text-muted-foreground">{t('investmentTool.retirement.yearsToRetireHint', { from: age, to: retireAge })}</p>
              </div>
            </div>
            <div className="rounded-lg bg-muted/30 p-3.5">
              <p className="text-sm font-medium">{t('investmentTool.retirement.outlook')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{adequacy}</p>
            </div>
            {result.milestones.length > 0 && (
              <div className="rounded-lg border border-border">
                <p className="border-b border-border px-3.5 py-2.5 text-sm font-medium">{t('investmentTool.retirement.milestones')}</p>
                <div className="flex flex-col gap-1 p-3.5">
                  {result.milestones.map((m) => (
                    <div key={m.target} className="flex justify-between text-sm">
                      <span>{formatCurrency(m.target)}</span>
                      <span className="text-muted-foreground">{t('investmentTool.retirement.milestoneAge', { age: m.age })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <InfoBanner>
              <strong>{t('investmentTool.retirement.fourPercentRule')}</strong>{' '}
              {t('investmentTool.retirement.fourPercentRuleText', {
                balance: formatCurrency(result.retirement_balance),
                income: formatCurrency(result.monthly_retirement_income),
              })}
            </InfoBanner>
          </div>
        ) : (
          <EmptyResults>
            <HugeiconsIcon icon={ChartLineData01Icon} strokeWidth={1.5} className="mb-3 size-10 text-muted-foreground/50" />
            {t('investmentTool.retirement.emptyResults')}
          </EmptyResults>
        )
      }
      chart={
        chartOption && (
          <>
            <h2 className="mb-2 font-heading text-lg font-semibold">{t('investmentTool.retirement.chartTitle')}</h2>
            <ReactECharts option={chartOption} style={{ height: 320, width: '100%' }} opts={{ renderer: 'svg' }} notMerge />
          </>
        )
      }
    />
  )
}

interface ScenarioInput {
  key: 'conservative' | 'moderate' | 'aggressive'
  emoji: string
  monthly: string
  rate: string
}

function scenarioName(t: (key: string) => string, key: ScenarioInput['key']) {
  return t(`investmentTool.compare.scenarios.${key}`)
}

function CompareTab() {
  const { t } = useTranslation('advisor')
  const [principal, setPrincipal] = useState('10000')
  const [years, setYears] = useState('20')
  const [scenarios, setScenarios] = useState<ScenarioInput[]>([
    { key: 'conservative', emoji: '🟢', monthly: '300', rate: '4' },
    { key: 'moderate', emoji: '🔵', monthly: '500', rate: '7' },
    { key: 'aggressive', emoji: '🔴', monthly: '700', rate: '10' },
  ])
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<{ scenario: ScenarioInput; data: InvestmentCalculationResponse }[] | null>(null)

  function updateScenario(key: ScenarioInput['key'], patch: Partial<ScenarioInput>) {
    setScenarios((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)))
  }

  async function compare() {
    setLoading(true)
    try {
      const p = Number.parseFloat(principal) || 0
      const y = Number.parseInt(years, 10) || 1
      const data = await Promise.all(
        scenarios.map((s) =>
          advisorApi.calculateInvestment({
            principal: p,
            annual_rate: (Number.parseFloat(s.rate) || 0) / 100,
            years: y,
            monthly_contribution: Number.parseFloat(s.monthly) || 0,
          }),
        ),
      )
      setResults(scenarios.map((scenario, i) => ({ scenario, data: data[i]! })))
    } catch {
      toast.error(t('investmentTool.compare.comparisonError'))
    } finally {
      setLoading(false)
    }
  }

  const theme = useChartTheme()
  const best = results
    ? results.reduce((max, r) => (r.data.final_balance > max.data.final_balance ? r : max), results[0]!)
    : null

  const chartOption = useMemo(() => {
    if (!results) return null
    const colors = [theme.muted, theme.neutral, theme.positive]
    return {
      tooltip: { trigger: 'axis' as const, ...tooltipStyle(theme) },
      legend: { data: results.map((r) => scenarioName(t, r.scenario.key)), bottom: 0, textStyle: { color: theme.muted, fontSize: 11 } },
      grid: { left: '3%', right: '4%', top: 20, bottom: '16%', containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: results[0]!.data.yearly_breakdown.map((y) => t('charts.year', { n: y.year })),
        ...baseAxisStyle(theme),
      },
      yAxis: {
        type: 'value' as const,
        ...baseAxisStyle(theme),
        axisLabel: { color: theme.muted, fontSize: 11, formatter: compactNumber },
      },
      series: results.map((r, i) => ({
        name: scenarioName(t, r.scenario.key),
        type: 'line' as const,
        ...seriesHoverSafe,
        data: r.data.yearly_breakdown.map((y) => y.balance),
        smooth: true,
        itemStyle: { color: colors[i] },
        lineStyle: { width: 2, color: colors[i] },
      })),
    }
  }, [results, theme, t])

  return (
    <ToolPanel
      title={t('investmentTool.compare.title')}
      description={t('investmentTool.compare.description')}
      form={
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cmp-principal">{t('investmentTool.compare.initialInvestmentLabel')}</Label>
              <Input id="cmp-principal" type="number" min={0} value={principal} onChange={(e) => setPrincipal(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cmp-years">{t('investmentTool.compare.investmentPeriodLabel')}</Label>
              <Input id="cmp-years" type="number" min={1} max={50} value={years} onChange={(e) => setYears(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            {scenarios.map((s) => (
              <div key={s.key} className="rounded-lg bg-muted/30 p-3">
                <p className="mb-2 text-sm font-medium">
                  {s.emoji} {scenarioName(t, s.key)}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">{t('investmentTool.compare.monthlyLabel')}</Label>
                    <Input type="number" value={s.monthly} onChange={(e) => updateScenario(s.key, { monthly: e.target.value })} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">{t('investmentTool.compare.returnLabel')}</Label>
                    <Input type="number" value={s.rate} onChange={(e) => updateScenario(s.key, { rate: e.target.value })} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Button className="w-full" disabled={loading} onClick={() => void compare()}>
            {t('investmentTool.compare.compareButton')}
          </Button>
        </div>
      }
      results={
        results && best ? (
          <div className="flex flex-col gap-4">
            <Alert>
              <AlertDescription>
                <strong>{scenarioName(t, best.scenario.key)}</strong>{' '}
                {t('investmentTool.compare.bestYields', { amount: formatCurrency(best.data.final_balance) })}
              </AlertDescription>
            </Alert>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('investmentTool.compare.columnScenario')}</TableHead>
                  <TableHead>{t('investmentTool.compare.columnMonthly')}</TableHead>
                  <TableHead>{t('investmentTool.compare.columnRate')}</TableHead>
                  <TableHead>{t('investmentTool.compare.columnFinalBalance')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.scenario.key} className={r.scenario.key === best.scenario.key ? 'bg-success/10' : undefined}>
                    <TableCell className="font-medium">{scenarioName(t, r.scenario.key)}</TableCell>
                    <TableCell>{formatCurrency(Number.parseFloat(r.scenario.monthly) || 0)}</TableCell>
                    <TableCell>{r.scenario.rate}%</TableCell>
                    <TableCell className="font-bold">{formatCurrency(r.data.final_balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="rounded-lg bg-muted/30 p-3.5 text-xs text-muted-foreground">
              {t('investmentTool.compare.differenceSummary', {
                from: scenarioName(t, results[0]!.scenario.key),
                to: scenarioName(t, best.scenario.key),
                amount: formatCurrency(best.data.final_balance - results[0]!.data.final_balance),
                years,
              })}
            </div>
          </div>
        ) : (
          <EmptyResults>
            <HugeiconsIcon icon={ChartLineData01Icon} strokeWidth={1.5} className="mb-3 size-10 text-muted-foreground/50" />
            {t('investmentTool.compare.emptyResults')}
          </EmptyResults>
        )
      }
      chart={
        chartOption && (
          <>
            <h2 className="mb-2 font-heading text-lg font-semibold">{t('investmentTool.compare.chartTitle')}</h2>
            <ReactECharts option={chartOption} style={{ height: 320, width: '100%' }} opts={{ renderer: 'svg' }} notMerge />
          </>
        )
      }
    />
  )
}

function SelfSustainingTab() {
  const { t } = useTranslation('advisor')
  const [initial, setInitial] = useState('10000')
  const [monthly, setMonthly] = useState('300')
  const [rate, setRate] = useState('6')
  const [withdrawal, setWithdrawal] = useState('1000')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SelfSustainingResponse | null>(null)

  async function calculate() {
    setLoading(true)
    try {
      const data = await advisorApi.calculateSelfSustaining({
        initial_investment: Number.parseFloat(initial) || 0,
        monthly_contribution: Number.parseFloat(monthly) || 0,
        annual_rate: (Number.parseFloat(rate) || 0) / 100,
        monthly_withdrawal: Number.parseFloat(withdrawal) || 0,
      })
      setResult(data)
    } catch {
      toast.error(t('investmentTool.selfSustaining.calculationError'))
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  const theme = useChartTheme()
  const chartOption = useMemo(() => {
    if (!result) return null
    const legendBalance = t('investmentTool.selfSustaining.legendBalance')
    const legendContributions = t('investmentTool.selfSustaining.legendContributions')
    const legendTarget = t('investmentTool.selfSustaining.legendTargetCapital')
    return {
      tooltip: { trigger: 'axis' as const, ...tooltipStyle(theme) },
      legend: { data: [legendBalance, legendContributions, legendTarget], bottom: 0, textStyle: { color: theme.muted, fontSize: 11 } },
      grid: { left: '3%', right: '4%', top: 20, bottom: '16%', containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: result.yearly_breakdown.map((y) => t('charts.year', { n: y.year })),
        ...baseAxisStyle(theme),
      },
      yAxis: {
        type: 'value' as const,
        ...baseAxisStyle(theme),
        axisLabel: { color: theme.muted, fontSize: 11, formatter: compactNumber },
      },
      series: [
        {
          name: legendBalance,
          type: 'line' as const,
          ...seriesHoverSafe,
          data: result.yearly_breakdown.map((y) => y.balance),
          smooth: true,
          areaStyle: { opacity: 0.12 },
          itemStyle: { color: theme.neutral },
          lineStyle: { width: 2, color: theme.neutral },
        },
        {
          name: legendContributions,
          type: 'line' as const,
          ...seriesHoverSafe,
          data: result.yearly_breakdown.map((y) => y.contributions),
          itemStyle: { color: theme.positive },
          lineStyle: { width: 2, type: 'dashed' as const, color: theme.positive },
        },
        {
          name: legendTarget,
          type: 'line' as const,
          ...seriesHoverSafe,
          data: result.yearly_breakdown.map(() => result.target_capital),
          itemStyle: { color: theme.negative },
          lineStyle: { width: 1.5, type: 'dotted' as const, color: theme.negative },
          symbol: 'none',
        },
      ],
    }
  }, [result, theme, t])

  const sustainabilityChartOption = useMemo(() => {
    if (!result) return null
    const seriesName = t('investmentTool.selfSustaining.legendBalanceAfterWithdrawal')
    return {
      tooltip: { trigger: 'axis' as const, ...tooltipStyle(theme) },
      grid: { left: '3%', right: '4%', top: 20, bottom: '10%', containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: result.sustainability_check.map((s) => t('charts.month', { n: s.month })),
        ...baseAxisStyle(theme),
      },
      yAxis: {
        type: 'value' as const,
        ...baseAxisStyle(theme),
        axisLabel: { color: theme.muted, fontSize: 11, formatter: compactNumber },
        scale: true,
      },
      series: [
        {
          name: seriesName,
          type: 'line' as const,
          ...seriesHoverSafe,
          data: result.sustainability_check.map((s) => s.balance),
          smooth: true,
          areaStyle: { opacity: 0.12 },
          itemStyle: { color: theme.positive },
          lineStyle: { width: 2, color: theme.positive },
        },
      ],
    }
  }, [result, theme, t])

  function exportRows(): { headers: string[]; rows: (string | number)[][] } {
    const exp = t('investmentTool.selfSustaining.export', { returnObjects: true }) as Record<string, string>
    const headers = [
      exp.headerYear!,
      exp.headerBalance!,
      exp.headerContributions!,
      exp.headerInterestEarned!,
      exp.headerYearGrowth!,
      exp.headerTargetReached!,
    ]
    const rows = (result?.yearly_breakdown ?? []).map((y) => [
      y.year,
      y.balance,
      y.contributions,
      y.interest_earned,
      y.year_growth,
      y.target_reached ? exp.yes! : exp.no!,
    ])
    return { headers, rows }
  }

  function handleExportCsv() {
    if (!result) return
    const { headers, rows } = exportRows()
    downloadCsv('self-sustaining-portfolio', headers, rows)
  }

  function handleExportExcel() {
    if (!result) return
    const { headers, rows } = exportRows()
    downloadExcel('self-sustaining-portfolio', headers, rows)
  }

  const monthsRemainder = result ? result.months_to_goal % 12 : 0
  const yearsWhole = result ? Math.floor(result.months_to_goal / 12) : 0

  return (
    <ToolPanel
      title={t('investmentTool.selfSustaining.title')}
      description={t('investmentTool.selfSustaining.description')}
      form={
        <div className="flex flex-col gap-4">
          <InfoBanner>{t('investmentTool.selfSustaining.infoBanner')}</InfoBanner>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sust-initial">{t('investmentTool.selfSustaining.initialInvestmentLabel')}</Label>
              <Input id="sust-initial" type="number" min={0} step={100} value={initial} onChange={(e) => setInitial(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sust-monthly">{t('investmentTool.selfSustaining.monthlyContributionLabel')}</Label>
              <Input id="sust-monthly" type="number" min={0} step={50} value={monthly} onChange={(e) => setMonthly(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sust-rate">{t('investmentTool.selfSustaining.annualRateLabel')}</Label>
              <Input id="sust-rate" type="number" min={0.1} max={30} step={0.1} value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sust-withdrawal">{t('investmentTool.selfSustaining.monthlyWithdrawalLabel')}</Label>
              <Input id="sust-withdrawal" type="number" min={1} step={50} value={withdrawal} onChange={(e) => setWithdrawal(e.target.value)} />
            </div>
          </div>
          <Button className="w-full" disabled={loading} onClick={() => void calculate()}>
            {t('investmentTool.selfSustaining.calculateButton')}
          </Button>
        </div>
      }
      results={
        result ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl bg-primary/10 p-4">
              <p className="text-xs text-muted-foreground">{t('investmentTool.selfSustaining.targetCapital')}</p>
              <p className="font-heading text-2xl font-bold tabular-nums text-primary">{formatCurrency(result.target_capital)}</p>
              <p className="text-xs text-muted-foreground">
                {t('investmentTool.selfSustaining.targetCapitalDetail', {
                  interest: formatCurrency(result.monthly_interest_at_goal),
                  withdrawal: formatCurrency(Number.parseFloat(withdrawal) || 0),
                })}
              </p>
            </div>
            <StatStrip className="sm:grid-cols-3 xl:grid-cols-3">
              <StatCard
                label={t('investmentTool.selfSustaining.timeToGoal')}
                value={t('investmentTool.selfSustaining.timeToGoalValue', { years: yearsWhole, months: monthsRemainder })}
                hint={t('investmentTool.selfSustaining.timeToGoalHint', { months: result.months_to_goal })}
                tone="primary"
              />
              <StatCard
                label={t('investmentTool.selfSustaining.totalContributed')}
                value={formatCurrency(result.total_contributions)}
                hint={t('investmentTool.selfSustaining.totalContributedHint')}
              />
              <StatCard
                label={t('investmentTool.selfSustaining.interestEarned')}
                value={formatCurrency(result.total_interest_earned)}
                hint={t('investmentTool.selfSustaining.interestEarnedHint')}
                tone="success"
              />
            </StatStrip>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3.5 py-2.5">
              <p className="text-xs font-medium text-muted-foreground">{t('investmentTool.selfSustaining.exportHint')}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleExportCsv}>
                  <HugeiconsIcon icon={Csv01Icon} className="text-success" />
                  {t('investmentTool.selfSustaining.exportCsv')}
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportExcel}>
                  <HugeiconsIcon icon={Xls01Icon} className="text-primary" />
                  {t('investmentTool.selfSustaining.exportExcel')}
                </Button>
              </div>
            </div>

            <InfoBanner>
              <strong>{t('investmentTool.selfSustaining.sustainabilityCheck')}</strong>{' '}
              {t('investmentTool.selfSustaining.sustainabilityCheckText', {
                withdrawal: formatCurrency(Number.parseFloat(withdrawal) || 0),
                capital: formatCurrency(result.target_capital),
                remaining: formatCurrency(
                  result.sustainability_check[result.sustainability_check.length - 1]?.balance ?? result.target_capital,
                ),
              })}
            </InfoBanner>
          </div>
        ) : (
          <EmptyResults>
            <HugeiconsIcon icon={ChartLineData01Icon} strokeWidth={1.5} className="mb-3 size-10 text-muted-foreground/50" />
            {t('investmentTool.selfSustaining.emptyResults')}
          </EmptyResults>
        )
      }
      chart={
        chartOption && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="mb-2 font-heading text-lg font-semibold">{t('investmentTool.selfSustaining.chartTitleGrowth')}</h2>
              <ReactECharts option={chartOption} style={{ height: 320, width: '100%' }} opts={{ renderer: 'svg' }} notMerge />
            </div>
            {sustainabilityChartOption && (
              <div>
                <h2 className="mb-2 font-heading text-lg font-semibold">{t('investmentTool.selfSustaining.chartTitleSustainability')}</h2>
                <ReactECharts option={sustainabilityChartOption} style={{ height: 260, width: '100%' }} opts={{ renderer: 'svg' }} notMerge />
              </div>
            )}
          </div>
        )
      }
    />
  )
}
