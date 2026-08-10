import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { FlashIcon, FloppyDiskIcon, Search01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Textarea } from '@/components/ui/textarea'
import { todayIsoDate } from '../../lib/format'
import { useSymbolSearch } from '../useInvestments'
import type { BenchmarkOption } from '../comparisonApi'
import type { ContributionFreq, DividendTreatment, ScenarioKind, ScenarioSpecIn } from '../scenariosApi'

const CURRENCIES = ['EUR', 'USD', 'GBP']
const CONTRIBUTION_FREQS: ContributionFreq[] = ['none', 'weekly', 'monthly', 'quarterly']
const DIVIDEND_TREATMENTS: DividendTreatment[] = ['reinvest', 'cash', 'ignore']
const NONE_VALUE = '__none__'

function specToInput(spec: {
  kind: ScenarioKind
  symbol: string
  amount: number
  currency: string
  startDate: string
  endDate: string
  contributionAmount: number
  contributionFreq: ContributionFreq
  benchmark: string | null
  costBps: number
  costFlat: number
  dividendTreatment: DividendTreatment
  dividendWithholdingPct: number
}): ScenarioSpecIn {
  return {
    symbol: spec.symbol,
    start_date: spec.startDate,
    end_date: spec.kind === 'forward' ? null : spec.endDate || null,
    initial_amount: spec.amount,
    currency: spec.currency,
    contribution_amount: spec.contributionAmount,
    contribution_freq: spec.contributionFreq,
    benchmark: spec.benchmark,
    cost_bps: spec.costBps,
    cost_flat: spec.costFlat,
    dividend_treatment: spec.dividendTreatment,
    dividend_withholding_pct: spec.dividendWithholdingPct,
    kind: spec.kind,
  }
}

/**
 * The whole point of this page is fast iteration ("try another date"), so the
 * form stays on screen with the result rendered below it rather than routing
 * away — see docs/investments/02-backtesting-sandbox.md §5.1.
 */
export function BacktestForm({
  benchmarkOptions,
  onRun,
  running,
  errorMessage,
  canSave,
  saving,
  onSave,
}: {
  benchmarkOptions: BenchmarkOption[]
  onRun: (spec: ScenarioSpecIn) => void
  running: boolean
  errorMessage: string | null
  canSave: boolean
  saving: boolean
  onSave: (name: string, note: string) => void
}) {
  const { t } = useTranslation('investments')

  const [kind, setKind] = useState<ScenarioKind>('backtest')
  const [symbol, setSymbol] = useState('')
  const [symbolOpen, setSymbolOpen] = useState(false)
  const [symbolQuery, setSymbolQuery] = useState('')
  const { data: symbolResults, isFetching: symbolSearching } = useSymbolSearch(symbolQuery)
  const [amount, setAmount] = useState(5000)
  const [currency, setCurrency] = useState('EUR')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState(todayIsoDate())
  const [contributionAmount, setContributionAmount] = useState(0)
  const [contributionFreq, setContributionFreq] = useState<ContributionFreq>('none')
  const [benchmark, setBenchmark] = useState<string | null>('^GSPC')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [costBps, setCostBps] = useState(10)
  const [costFlat, setCostFlat] = useState(0)
  const [dividendTreatment, setDividendTreatment] = useState<DividendTreatment>('reinvest')
  const [dividendWithholdingPct, setDividendWithholdingPct] = useState(0)

  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveNote, setSaveNote] = useState('')

  const canRun = symbol.trim().length > 0 && amount > 0 && startDate.length > 0

  function handleRun() {
    if (!canRun) return
    onRun(
      specToInput({
        kind,
        symbol: symbol.trim().toUpperCase(),
        amount,
        currency,
        startDate,
        endDate,
        contributionAmount,
        contributionFreq,
        benchmark,
        costBps,
        costFlat,
        dividendTreatment,
        dividendWithholdingPct,
      }),
    )
  }

  function handleSave() {
    if (!saveName.trim()) return
    onSave(saveName.trim(), saveNote.trim())
    setSaveOpen(false)
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4">
      <Field>
        <FieldLabel>{t('backtest.form.mode')}</FieldLabel>
        <ToggleGroup
          type="single"
          value={kind}
          onValueChange={(next) => next && setKind(next as ScenarioKind)}
          variant="outline"
          size="sm"
          spacing={0}
          aria-label={t('backtest.form.mode')}
        >
          <ToggleGroupItem value="backtest" className="px-3 text-xs">
            {t('backtest.form.modeBacktest')}
          </ToggleGroupItem>
          <ToggleGroupItem value="forward" className="px-3 text-xs">
            {t('backtest.form.modeForward')}
          </ToggleGroupItem>
        </ToggleGroup>
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="backtest-symbol">{t('backtest.form.ticker')}</FieldLabel>
          <Popover open={symbolOpen} onOpenChange={setSymbolOpen}>
            <PopoverTrigger asChild>
              <Button
                id="backtest-symbol"
                type="button"
                variant="outline"
                className="w-full justify-start font-normal"
              >
                <HugeiconsIcon icon={Search01Icon} strokeWidth={2} data-icon="inline-start" className="size-4" />
                {symbol || t('backtest.form.tickerPlaceholder')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder={t('search.placeholder')}
                  value={symbolQuery}
                  onValueChange={setSymbolQuery}
                />
                <CommandList>
                  {symbolQuery.trim().length < 2 ? (
                    <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                      {t('search.idleDescription')}
                    </p>
                  ) : (
                    <>
                      <CommandEmpty>{symbolSearching ? t('news.loading') : t('search.emptyTitle')}</CommandEmpty>
                      {symbolResults?.map((result) => (
                        <CommandItem
                          key={result.symbol}
                          value={result.symbol}
                          onSelect={() => {
                            setSymbol(result.symbol)
                            setSymbolOpen(false)
                            setSymbolQuery('')
                          }}
                        >
                          <span className="font-medium">{result.symbol}</span>
                          {result.name && (
                            <span className="min-w-0 flex-1 truncate text-muted-foreground">{result.name}</span>
                          )}
                        </CommandItem>
                      ))}
                    </>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </Field>

        <Field>
          <FieldLabel htmlFor="backtest-amount">{t('backtest.form.amount')}</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="backtest-amount"
              type="number"
              min={0}
              step="100"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
            <InputGroupAddon align="inline-end">
              <span className="text-xs text-muted-foreground">{currency}</span>
            </InputGroupAddon>
          </InputGroup>
        </Field>

        <Field>
          <FieldLabel htmlFor="backtest-currency">{t('backtest.form.currency')}</FieldLabel>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="backtest-currency" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="backtest-start">{t('backtest.form.from')}</FieldLabel>
          <Input
            id="backtest-start"
            type="date"
            value={startDate}
            max={todayIsoDate()}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Field>

        {kind === 'backtest' && (
          <Field>
            <FieldLabel htmlFor="backtest-end">{t('backtest.form.to')}</FieldLabel>
            <Input
              id="backtest-end"
              type="date"
              value={endDate}
              max={todayIsoDate()}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </Field>
        )}

        <Field>
          <FieldLabel htmlFor="backtest-benchmark">{t('backtest.form.benchmark')}</FieldLabel>
          <Select
            value={benchmark ?? NONE_VALUE}
            onValueChange={(next) => setBenchmark(next === NONE_VALUE ? null : next)}
          >
            <SelectTrigger id="backtest-benchmark" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>{t('compare.picker.benchmarkNone')}</SelectItem>
              {benchmarkOptions.map((option) => (
                <SelectItem key={option.symbol} value={option.symbol}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="backtest-contrib-freq">{t('backtest.form.contribute')}</FieldLabel>
          <Select value={contributionFreq} onValueChange={(next) => setContributionFreq(next as ContributionFreq)}>
            <SelectTrigger id="backtest-contrib-freq" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTRIBUTION_FREQS.map((freq) => (
                <SelectItem key={freq} value={freq}>
                  {t(`backtest.form.contributionFreq.${freq}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {contributionFreq !== 'none' && (
          <Field>
            <FieldLabel htmlFor="backtest-contrib-amount">{t('backtest.form.contributionAmount')}</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="backtest-contrib-amount"
                type="number"
                min={0}
                step="10"
                value={contributionAmount}
                onChange={(e) => setContributionAmount(Number(e.target.value))}
              />
              <InputGroupAddon align="inline-end">
                <span className="text-xs text-muted-foreground">{currency}</span>
              </InputGroupAddon>
            </InputGroup>
          </Field>
        )}
      </div>

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" type="button" className="w-fit px-0 text-xs text-muted-foreground">
            {advancedOpen ? t('backtest.form.advancedHide') : t('backtest.form.advancedShow')}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="backtest-cost-bps">{t('backtest.form.costBps')}</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="backtest-cost-bps"
                type="number"
                min={0}
                step="1"
                value={costBps}
                onChange={(e) => setCostBps(Number(e.target.value))}
              />
              <InputGroupAddon align="inline-end">
                <span className="text-xs text-muted-foreground">bps</span>
              </InputGroupAddon>
            </InputGroup>
          </Field>
          <Field>
            <FieldLabel htmlFor="backtest-cost-flat">{t('backtest.form.costFlat')}</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="backtest-cost-flat"
                type="number"
                min={0}
                step="1"
                value={costFlat}
                onChange={(e) => setCostFlat(Number(e.target.value))}
              />
              <InputGroupAddon align="inline-end">
                <span className="text-xs text-muted-foreground">{currency}</span>
              </InputGroupAddon>
            </InputGroup>
          </Field>
          <Field>
            <FieldLabel htmlFor="backtest-dividends">{t('backtest.form.dividends')}</FieldLabel>
            <Select
              value={dividendTreatment}
              onValueChange={(next) => setDividendTreatment(next as DividendTreatment)}
            >
              <SelectTrigger id="backtest-dividends" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIVIDEND_TREATMENTS.map((treatment) => (
                  <SelectItem key={treatment} value={treatment}>
                    {t(`backtest.form.dividendTreatment.${treatment}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {dividendTreatment === 'cash' && (
            <Field>
              <FieldLabel htmlFor="backtest-withholding">{t('backtest.form.withholding')}</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="backtest-withholding"
                  type="number"
                  min={0}
                  max={100}
                  step="1"
                  value={dividendWithholdingPct}
                  onChange={(e) => setDividendWithholdingPct(Number(e.target.value))}
                />
                <InputGroupAddon align="inline-end">
                  <span className="text-xs text-muted-foreground">%</span>
                </InputGroupAddon>
              </InputGroup>
            </Field>
          )}
        </CollapsibleContent>
      </Collapsible>

      {errorMessage && (
        <FieldError className="rounded-lg border border-destructive/30 bg-destructive/5 p-2">
          {errorMessage}
        </FieldError>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
        <Button type="button" onClick={handleRun} disabled={!canRun || running}>
          <HugeiconsIcon icon={FlashIcon} strokeWidth={2} data-icon="inline-start" />
          {running ? t('backtest.form.running') : t('backtest.form.run')}
        </Button>

        <Popover open={saveOpen} onOpenChange={setSaveOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" disabled={!canSave || saving}>
              <HugeiconsIcon icon={FloppyDiskIcon} strokeWidth={2} data-icon="inline-start" />
              {saving ? t('backtest.form.saving') : t('backtest.form.save')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="flex flex-col gap-3">
              <Field>
                <FieldLabel htmlFor="backtest-save-name">{t('backtest.form.saveName')}</FieldLabel>
                <Input
                  id="backtest-save-name"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder={t('backtest.form.saveNamePlaceholder')}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="backtest-save-note">{t('backtest.form.saveNote')}</FieldLabel>
                <Textarea
                  id="backtest-save-note"
                  value={saveNote}
                  onChange={(e) => setSaveNote(e.target.value)}
                  rows={3}
                />
              </Field>
              <Button type="button" size="sm" onClick={handleSave} disabled={!saveName.trim()}>
                {t('backtest.form.save')}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
