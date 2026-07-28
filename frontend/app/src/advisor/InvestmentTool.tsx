import { useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { ChartLineData01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency } from '../lib/format'
import { StatCard, StatStrip } from '../ui/StatStrip'
import { baseAxisStyle, compactNumber, seriesHoverSafe, tooltipStyle, useChartTheme } from '../reports/chartTheme'
import { ToolPanel, EmptyResults, InfoBanner } from './ToolPanel'
import * as advisorApi from './advisorApi'
import type { InvestmentCalculationResponse, RetirementProjectionResponse } from './advisorApi'

export function InvestmentTool() {
  const [tab, setTab] = useState('compound')

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="mb-4">
        <TabsTrigger value="compound">Compound</TabsTrigger>
        <TabsTrigger value="retirement">Retirement</TabsTrigger>
        <TabsTrigger value="compare">Compare</TabsTrigger>
      </TabsList>
      <TabsContent value="compound">
        <CompoundTab />
      </TabsContent>
      <TabsContent value="retirement">
        <RetirementTab />
      </TabsContent>
      <TabsContent value="compare">
        <CompareTab />
      </TabsContent>
    </Tabs>
  )
}

function CompoundTab() {
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
      toast.error('Calculation error')
    } finally {
      setLoading(false)
    }
  }

  const theme = useChartTheme()
  const chartOption = useMemo(() => {
    if (!result) return null
    return {
      tooltip: { trigger: 'axis' as const, ...tooltipStyle(theme) },
      legend: { data: ['Total balance', 'Your contributions'], bottom: 0, textStyle: { color: theme.muted, fontSize: 11 } },
      grid: { left: '3%', right: '4%', top: 20, bottom: '14%', containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: result.yearly_breakdown.map((y) => `Year ${y.year}`),
        ...baseAxisStyle(theme),
      },
      yAxis: {
        type: 'value' as const,
        ...baseAxisStyle(theme),
        axisLabel: { color: theme.muted, fontSize: 11, formatter: compactNumber },
      },
      series: [
        {
          name: 'Total balance',
          type: 'line' as const,
          ...seriesHoverSafe,
          data: result.yearly_breakdown.map((y) => y.balance),
          smooth: true,
          areaStyle: { opacity: 0.12 },
          itemStyle: { color: theme.neutral },
          lineStyle: { width: 2, color: theme.neutral },
        },
        {
          name: 'Your contributions',
          type: 'line' as const,
          ...seriesHoverSafe,
          data: result.yearly_breakdown.map((y) => y.contributions),
          itemStyle: { color: theme.positive },
          lineStyle: { width: 2, type: 'dashed' as const, color: theme.positive },
        },
      ],
    }
  }, [result, theme])

  const interestPortion = result ? Math.round((result.total_interest_earned / result.final_balance) * 100) : 0
  const totalContributed = (Number.parseFloat(principal) || 0) + (Number.parseFloat(monthly) || 0) * 12 * (Number.parseInt(years, 10) || 0)
  const multiplier = result ? result.final_balance / totalContributed : 0
  const yearsNum = Number.parseInt(years, 10) || 1
  const rateNum = Number.parseFloat(rate) || 1

  let insight = ''
  if (multiplier >= 3) insight = `Excellent growth! Your money grows ${multiplier.toFixed(2)}x over ${yearsNum} years — compounding is working strongly in your favor.`
  else if (multiplier >= 2) insight = `Good growth — your investment more than doubles, with ${interestPortion}% coming from compound interest.`
  else if (multiplier >= 1.5) insight = 'Moderate growth. Consider increasing monthly contributions or a longer horizon.'
  else insight = 'Conservative growth. A longer period or higher-return option would accelerate this.'

  return (
    <ToolPanel
      title="Compound growth"
      description="See how your money grows over time with compound interest — earnings that go on to earn more."
      form={
        <div className="flex flex-col gap-4">
          <InfoBanner>
            Your money earns interest, and that interest also earns interest — creating exponential growth over years.
          </InfoBanner>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-principal">Starting amount</Label>
              <Input id="inv-principal" type="number" min={0} step={100} value={principal} onChange={(e) => setPrincipal(e.target.value)} />
              <p className="text-xs text-muted-foreground">One-time deposit now</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-monthly">Monthly deposit</Label>
              <Input id="inv-monthly" type="number" min={0} step={50} value={monthly} onChange={(e) => setMonthly(e.target.value)} />
              <p className="text-xs text-muted-foreground">Regular contributions</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-rate">Annual return</Label>
              <Input id="inv-rate" type="number" min={0} max={30} step={0.5} value={rate} onChange={(e) => setRate(e.target.value)} />
              <p className="text-xs text-muted-foreground">Stocks: 7–10%, bonds: 3–5%</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-years">Investment period</Label>
              <Input id="inv-years" type="number" min={1} max={50} value={years} onChange={(e) => setYears(e.target.value)} />
              <p className="text-xs text-muted-foreground">Years to grow</p>
            </div>
          </div>
          <Button className="w-full" disabled={loading} onClick={() => void calculate()}>
            Calculate growth
          </Button>
        </div>
      }
      results={
        result ? (
          <div className="flex flex-col gap-4">
            <StatStrip className="sm:grid-cols-3 xl:grid-cols-3">
              <StatCard label="Final balance" value={formatCurrency(result.final_balance)} hint={`${yearsNum} years`} tone="primary" />
              <StatCard label="Contributed" value={formatCurrency(result.total_contributions)} hint="Your deposits" />
              <StatCard label="Interest" value={formatCurrency(result.total_interest_earned)} hint={`${interestPortion}%`} tone="success" />
            </StatStrip>

            <div className="rounded-lg border border-border bg-muted/30 p-3.5">
              <p className="text-sm font-medium">Analysis</p>
              <p className="mt-1 text-xs text-muted-foreground">{insight}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Return: </span>
                  <span className="font-medium">{result.effective_return.toFixed(1)}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Multiplier: </span>
                  <span className="font-medium">{multiplier.toFixed(2)}x</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Monthly: </span>
                  <span className="font-medium">{formatCurrency(Number.parseFloat(monthly) || 0)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Rule of 72: </span>
                  <span className="font-medium">~{Math.round(72 / rateNum)} yrs</span>
                </div>
              </div>
            </div>

            <InfoBanner>
              <strong>Tip:</strong> At {rate}%, the Rule of 72 says your money doubles in ~{Math.round(72 / rateNum)} years.
            </InfoBanner>
          </div>
        ) : (
          <EmptyResults>
            <HugeiconsIcon icon={ChartLineData01Icon} strokeWidth={1.5} className="mb-3 size-10 text-muted-foreground/50" />
            Fill in your numbers and calculate to see growth results here.
          </EmptyResults>
        )
      }
      chart={
        chartOption && (
          <>
            <h2 className="mb-2 font-heading text-lg font-semibold">Investment growth over time</h2>
            <ReactECharts option={chartOption} style={{ height: 320, width: '100%' }} opts={{ renderer: 'svg' }} notMerge />
          </>
        )
      }
    />
  )
}

function RetirementTab() {
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
      toast.error('Calculation error')
    } finally {
      setLoading(false)
    }
  }

  const theme = useChartTheme()
  const chartOption = useMemo(() => {
    if (!result) return null
    const currentAge = Number.parseInt(age, 10) || 0
    return {
      tooltip: { trigger: 'axis' as const, ...tooltipStyle(theme) },
      grid: { left: '3%', right: '4%', top: 20, bottom: '10%', containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: result.yearly_projection.map((_, i) => `Age ${currentAge + i + 1}`),
        ...baseAxisStyle(theme),
      },
      yAxis: {
        type: 'value' as const,
        ...baseAxisStyle(theme),
        axisLabel: { color: theme.muted, fontSize: 11, formatter: compactNumber },
      },
      series: [
        {
          name: 'Projected balance',
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
  }, [result, theme, age])

  let adequacy = ''
  if (result) {
    if (result.monthly_retirement_income >= 3000) adequacy = 'Your projected retirement income is excellent and should provide a comfortable lifestyle.'
    else if (result.monthly_retirement_income >= 2000) adequacy = 'Good retirement outlook. Consider increasing contributions to build more security.'
    else if (result.monthly_retirement_income >= 1000) adequacy = 'Moderate retirement income. You may want to increase savings or delay retirement.'
    else adequacy = 'Your projected income is below typical needs. Consider significantly increasing contributions.'
  }

  return (
    <ToolPanel
      title="Retirement projection"
      description={'Estimates your retirement balance and monthly income using the "4% rule" — a guideline for safe 30-year withdrawals.'}
      form={
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ret-age">Current age</Label>
              <Input id="ret-age" type="number" min={18} max={80} value={age} onChange={(e) => setAge(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ret-retire-age">Retirement age</Label>
              <Input id="ret-retire-age" type="number" min={30} max={90} value={retireAge} onChange={(e) => setRetireAge(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ret-savings">Current savings</Label>
              <Input id="ret-savings" type="number" min={0} value={savings} onChange={(e) => setSavings(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ret-monthly">Monthly contribution</Label>
              <Input id="ret-monthly" type="number" min={0} value={monthly} onChange={(e) => setMonthly(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ret-rate">Expected return %</Label>
              <Input id="ret-rate" type="number" min={0} max={15} step={0.5} value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ret-inflation">Expected inflation %</Label>
            <Input id="ret-inflation" type="number" min={0} max={10} step={0.5} value={inflation} onChange={(e) => setInflation(e.target.value)} />
            <p className="text-xs text-muted-foreground">Average: 2–3%. Withdrawal rate uses the safe 4% rule.</p>
          </div>
          <Button className="w-full" disabled={loading} onClick={() => void calculate()}>
            Calculate retirement
          </Button>
        </div>
      }
      results={
        result ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl bg-primary/10 p-4">
              <p className="text-xs text-muted-foreground">Balance at {retireAge}</p>
              <p className="font-heading text-2xl font-bold tabular-nums text-primary">{formatCurrency(result.retirement_balance)}</p>
              <p className="text-xs text-muted-foreground">{formatCurrency(result.retirement_balance_today_dollars)} in today's money</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-success/10 p-3">
                <p className="text-xs text-muted-foreground">Monthly income</p>
                <p className="text-lg font-bold text-success">{formatCurrency(result.monthly_retirement_income)}</p>
                <p className="text-xs text-muted-foreground">4% rule</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Years to retire</p>
                <p className="text-lg font-bold">{result.years_to_retirement}</p>
                <p className="text-xs text-muted-foreground">{age} → {retireAge}</p>
              </div>
            </div>
            <div className="rounded-lg bg-muted/30 p-3.5">
              <p className="text-sm font-medium">Outlook</p>
              <p className="mt-1 text-xs text-muted-foreground">{adequacy}</p>
            </div>
            {result.milestones.length > 0 && (
              <div className="rounded-lg border border-border">
                <p className="border-b border-border px-3.5 py-2.5 text-sm font-medium">Milestones</p>
                <div className="flex flex-col gap-1 p-3.5">
                  {result.milestones.map((m) => (
                    <div key={m.target} className="flex justify-between text-sm">
                      <span>{formatCurrency(m.target)}</span>
                      <span className="text-muted-foreground">Age {m.age}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <InfoBanner>
              <strong>4% rule:</strong> {formatCurrency(result.retirement_balance)} supports {formatCurrency(result.monthly_retirement_income)}/month.
            </InfoBanner>
          </div>
        ) : (
          <EmptyResults>
            <HugeiconsIcon icon={ChartLineData01Icon} strokeWidth={1.5} className="mb-3 size-10 text-muted-foreground/50" />
            Fill in your timeline and calculate to project your retirement.
          </EmptyResults>
        )
      }
      chart={
        chartOption && (
          <>
            <h2 className="mb-2 font-heading text-lg font-semibold">Retirement savings projection</h2>
            <ReactECharts option={chartOption} style={{ height: 320, width: '100%' }} opts={{ renderer: 'svg' }} notMerge />
          </>
        )
      }
    />
  )
}

interface ScenarioInput {
  key: 'conservative' | 'moderate' | 'aggressive'
  label: string
  emoji: string
  monthly: string
  rate: string
}

function CompareTab() {
  const [principal, setPrincipal] = useState('10000')
  const [years, setYears] = useState('20')
  const [scenarios, setScenarios] = useState<ScenarioInput[]>([
    { key: 'conservative', label: 'Conservative (low risk)', emoji: '🟢', monthly: '300', rate: '4' },
    { key: 'moderate', label: 'Moderate (balanced)', emoji: '🔵', monthly: '500', rate: '7' },
    { key: 'aggressive', label: 'Aggressive (high risk)', emoji: '🔴', monthly: '700', rate: '10' },
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
      toast.error('Comparison error')
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
      legend: { data: results.map((r) => r.scenario.label), bottom: 0, textStyle: { color: theme.muted, fontSize: 11 } },
      grid: { left: '3%', right: '4%', top: 20, bottom: '16%', containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: results[0]!.data.yearly_breakdown.map((y) => `Year ${y.year}`),
        ...baseAxisStyle(theme),
      },
      yAxis: {
        type: 'value' as const,
        ...baseAxisStyle(theme),
        axisLabel: { color: theme.muted, fontSize: 11, formatter: compactNumber },
      },
      series: results.map((r, i) => ({
        name: r.scenario.label,
        type: 'line' as const,
        ...seriesHoverSafe,
        data: r.data.yearly_breakdown.map((y) => y.balance),
        smooth: true,
        itemStyle: { color: colors[i] },
        lineStyle: { width: 2, color: colors[i] },
      })),
    }
  }, [results, theme])

  return (
    <ToolPanel
      title="Compare strategies"
      description="See how contribution amounts and return rates affect your final balance, side by side."
      form={
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cmp-principal">Initial investment</Label>
              <Input id="cmp-principal" type="number" min={0} value={principal} onChange={(e) => setPrincipal(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cmp-years">Investment period</Label>
              <Input id="cmp-years" type="number" min={1} max={50} value={years} onChange={(e) => setYears(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            {scenarios.map((s) => (
              <div key={s.key} className="rounded-lg bg-muted/30 p-3">
                <p className="mb-2 text-sm font-medium">{s.emoji} {s.label}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Monthly</Label>
                    <Input type="number" value={s.monthly} onChange={(e) => updateScenario(s.key, { monthly: e.target.value })} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Return %</Label>
                    <Input type="number" value={s.rate} onChange={(e) => updateScenario(s.key, { rate: e.target.value })} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Button className="w-full" disabled={loading} onClick={() => void compare()}>
            Compare strategies
          </Button>
        </div>
      }
      results={
        results && best ? (
          <div className="flex flex-col gap-4">
            <Alert>
              <AlertDescription>
                <strong>{best.scenario.label}</strong> yields the highest returns: {formatCurrency(best.data.final_balance)}
              </AlertDescription>
            </Alert>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scenario</TableHead>
                  <TableHead>Monthly</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Final balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.scenario.key} className={r.scenario.key === best.scenario.key ? 'bg-success/10' : undefined}>
                    <TableCell className="font-medium">{r.scenario.label.split(' ')[0]}</TableCell>
                    <TableCell>{formatCurrency(Number.parseFloat(r.scenario.monthly) || 0)}</TableCell>
                    <TableCell>{r.scenario.rate}%</TableCell>
                    <TableCell className="font-bold">{formatCurrency(r.data.final_balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="rounded-lg bg-muted/30 p-3.5 text-xs text-muted-foreground">
              The difference between {results[0]!.scenario.label.split(' ')[0]} and {best.scenario.label.split(' ')[0]} is{' '}
              <strong>{formatCurrency(best.data.final_balance - results[0]!.data.final_balance)}</strong> over {years} years.
            </div>
          </div>
        ) : (
          <EmptyResults>
            <HugeiconsIcon icon={ChartLineData01Icon} strokeWidth={1.5} className="mb-3 size-10 text-muted-foreground/50" />
            Set up your scenarios and compare to see which wins.
          </EmptyResults>
        )
      }
      chart={
        chartOption && (
          <>
            <h2 className="mb-2 font-heading text-lg font-semibold">Scenario comparison over time</h2>
            <ReactECharts option={chartOption} style={{ height: 320, width: '100%' }} opts={{ renderer: 'svg' }} notMerge />
          </>
        )
      }
    />
  )
}
