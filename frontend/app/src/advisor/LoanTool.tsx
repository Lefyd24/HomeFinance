import { useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { CheckmarkCircle02Icon, Coins01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { formatCurrency } from '../lib/format'
import { StatCard, StatStrip } from '../ui/StatStrip'
import { baseAxisStyle, compactNumber, seriesHoverSafe, tooltipStyle, useChartTheme } from '../reports/chartTheme'
import { ToolPanel, EmptyResults, InfoBanner } from './ToolPanel'
import * as advisorApi from './advisorApi'
import type { EarlyPayoffResponse, LoanAmortizationResponse } from './advisorApi'

export function LoanTool() {
  const [tab, setTab] = useState('amortization')

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="mb-4">
        <TabsTrigger value="amortization">Amortization</TabsTrigger>
        <TabsTrigger value="early-payoff">Early payoff</TabsTrigger>
      </TabsList>
      <TabsContent value="amortization">
        <AmortizationTab />
      </TabsContent>
      <TabsContent value="early-payoff">
        <EarlyPayoffTab />
      </TabsContent>
    </Tabs>
  )
}

function AmortizationTab() {
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
      grid: { left: '3%', right: '4%', top: 20, bottom: '10%', containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: result.schedule.map((s) => `Month ${s.month}`),
        ...baseAxisStyle(theme),
      },
      yAxis: {
        type: 'value' as const,
        ...baseAxisStyle(theme),
        axisLabel: { color: theme.muted, fontSize: 11, formatter: compactNumber },
      },
      series: [
        {
          name: 'Remaining balance',
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
  }, [result, theme])

  const interestRatio = result ? Math.round((result.total_interest / result.principal) * 100) : 0

  return (
    <ToolPanel
      title="Loan amortization"
      description="Your monthly payment and total interest over the life of the loan. Early on, most of your payment goes to interest; over time, more goes to principal."
      form={
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="loan-principal">Loan amount</Label>
              <Input id="loan-principal" type="number" min={1000} value={principal} onChange={(e) => setPrincipal(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="loan-rate">Interest rate %</Label>
              <Input id="loan-rate" type="number" min={0} max={30} step={0.1} value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="loan-years">Loan term (years)</Label>
              <Input id="loan-years" type="number" min={1} max={50} value={years} onChange={(e) => setYears(e.target.value)} />
            </div>
          </div>
          <Button className="w-full" disabled={loading} onClick={() => void calculate()}>
            Calculate payment
          </Button>
        </div>
      }
      results={
        result ? (
          <div className="flex flex-col gap-4">
            <StatStrip className="sm:grid-cols-3 xl:grid-cols-3">
              <StatCard label="Monthly" value={formatCurrency(result.monthly_payment)} hint={`${years} years`} tone="primary" />
              <StatCard label="Total interest" value={formatCurrency(result.total_interest)} hint={`${interestRatio}%`} tone="destructive" />
              <StatCard label="Total paid" value={formatCurrency(result.total_payments)} hint="Principal + interest" />
            </StatStrip>
            <div className="rounded-lg bg-muted/30 p-3.5 text-xs text-muted-foreground">
              Over {years} years at {rate}%, you pay <strong className="text-foreground">{formatCurrency(result.total_interest)}</strong> in
              interest — {interestRatio}% on top of what you borrowed.
            </div>
          </div>
        ) : (
          <EmptyResults>
            <HugeiconsIcon icon={Coins01Icon} strokeWidth={1.5} className="mb-3 size-10 text-muted-foreground/50" />
            Enter your loan details and calculate to see the payment breakdown.
          </EmptyResults>
        )
      }
      chart={
        chartOption && (
          <>
            <h2 className="mb-2 font-heading text-lg font-semibold">Loan balance over time</h2>
            <ReactECharts option={chartOption} style={{ height: 320, width: '100%' }} opts={{ renderer: 'svg' }} notMerge />
          </>
        )
      }
    />
  )
}

function EarlyPayoffTab() {
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
      toast.error('Calculation error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ToolPanel
      title="Early payoff"
      description="How extra monthly payments shrink your principal faster — and cut the interest that would otherwise accumulate."
      form={
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payoff-principal">Remaining balance</Label>
              <Input id="payoff-principal" type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payoff-rate">Interest rate %</Label>
              <Input id="payoff-rate" type="number" step={0.1} value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payoff-years">Remaining years</Label>
              <Input id="payoff-years" type="number" value={years} onChange={(e) => setYears(e.target.value)} />
            </div>
          </div>
          <div className="rounded-lg border border-success/30 bg-success/5 p-3">
            <Label htmlFor="payoff-extra" className="text-success">Extra monthly payment</Label>
            <Input id="payoff-extra" type="number" min={0} className="mt-1.5" value={extra} onChange={(e) => setExtra(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">Amount above your regular payment</p>
          </div>
          <Button className="w-full" disabled={loading} onClick={() => void calculate()}>
            Calculate savings
          </Button>
        </div>
      }
      results={
        result ? (
          <div className="flex flex-col gap-4">
            <Alert>
              <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} />
              <AlertDescription>
                <strong>Save {formatCurrency(result.interest_saved)}</strong> by paying {formatCurrency(result.extra_monthly_payment)} extra
                each month.
              </AlertDescription>
            </Alert>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-success/10 p-3 text-center">
                <p className="text-xs text-muted-foreground">Time saved</p>
                <p className="text-xl font-bold text-success">{result.years_saved} yrs</p>
                <p className="text-xs text-muted-foreground">{result.months_saved} months</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground">New term</p>
                <p className="text-xl font-bold">{Math.round(result.new_term_months / 12)} yrs</p>
                <p className="text-xs text-muted-foreground">vs {years} yrs</p>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Original</span>
                <span>{formatCurrency(result.original_monthly_payment)}/mo</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>New</span>
                <span>{formatCurrency(result.new_monthly_payment)}/mo</span>
              </div>
              <div className="flex justify-between font-medium text-success">
                <span>Save</span>
                <span>{formatCurrency(result.interest_saved)}</span>
              </div>
            </div>
            <InfoBanner>Extra payments go directly to principal, reducing future interest.</InfoBanner>
          </div>
        ) : (
          <EmptyResults>
            <HugeiconsIcon icon={Coins01Icon} strokeWidth={1.5} className="mb-3 size-10 text-muted-foreground/50" />
            Set an extra payment amount and calculate to see the savings.
          </EmptyResults>
        )
      }
    />
  )
}
