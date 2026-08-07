/**
 * Plain-language registry for every metric shown on the ticker comparison page.
 *
 * One entry per metric id so an explanation is never written twice, or written
 * inconsistently between the risk table and the valuation table. Copy lives in
 * `locales/{en,el}/investments.json` under `compare.metrics.<id>`; this file only
 * holds the *keys*, never literal English strings — see docs/investments/01-ticker-comparison.md §4.1.
 */

export type MetricId =
  | 'sharpe'
  | 'sortino'
  | 'calmar'
  | 'martin'
  | 'volatility'
  | 'maxDrawdown'
  | 'timeUnderWater'
  | 'ulcerIndex'
  | 'var95'
  | 'cvar95'
  | 'beta'
  | 'alpha'
  | 'rSquared'
  | 'upCapture'
  | 'downCapture'
  | 'informationRatio'
  | 'trackingError'
  | 'correlation'
  | 'downsideCorrelation'
  | 'diversificationRatio'
  | 'cagr'
  | 'cumulativeReturn'
  | 'trailingPe'
  | 'forwardPe'
  | 'priceToBook'
  | 'evToEbitda'
  | 'evToSales'
  | 'dividendYield'
  | 'payoutRatio'
  | 'fcfYield'
  | 'roe'
  | 'debtToEquity'
  | 'expenseRatio'
  | 'psr'
  | 'twr'
  | 'mwr'
  | 'deflatedSharpe'
  | 'entrySensitivity'
  | 'costDrag'

export interface GlossaryEntry {
  labelKey: string
  shortKey: string
  bodyKey: string
  scaleKey?: string
  sourceKey?: string
  caveatKey?: string
}

function entry(id: MetricId, opts: { scale?: boolean; caveat?: boolean } = {}): GlossaryEntry {
  const base = `compare.metrics.${id}`
  return {
    labelKey: `${base}.label`,
    shortKey: `${base}.short`,
    bodyKey: `${base}.body`,
    scaleKey: opts.scale ? `${base}.scale` : undefined,
    caveatKey: opts.caveat ? `${base}.caveat` : undefined,
    sourceKey: 'compare.source.computed',
  }
}

/** Same registry mechanism, `backtest.metrics.<id>` copy — see docs/investments/02-backtesting-sandbox.md §5.8. */
function backtestEntry(id: MetricId): GlossaryEntry {
  const base = `backtest.metrics.${id}`
  return {
    labelKey: `${base}.label`,
    shortKey: `${base}.short`,
    bodyKey: `${base}.body`,
    sourceKey: 'compare.source.computed',
  }
}

export const GLOSSARY: Record<MetricId, GlossaryEntry> = {
  sharpe: entry('sharpe', { scale: true, caveat: true }),
  sortino: entry('sortino', { scale: true }),
  calmar: entry('calmar', { scale: true }),
  martin: entry('martin', { scale: true }),
  volatility: entry('volatility'),
  maxDrawdown: entry('maxDrawdown'),
  timeUnderWater: entry('timeUnderWater'),
  ulcerIndex: entry('ulcerIndex'),
  var95: entry('var95'),
  cvar95: entry('cvar95'),
  beta: entry('beta', { caveat: true }),
  alpha: entry('alpha', { caveat: true }),
  rSquared: entry('rSquared'),
  upCapture: entry('upCapture'),
  downCapture: entry('downCapture'),
  informationRatio: entry('informationRatio'),
  trackingError: entry('trackingError'),
  correlation: entry('correlation', { scale: true }),
  downsideCorrelation: entry('downsideCorrelation', { caveat: true }),
  diversificationRatio: entry('diversificationRatio'),
  cagr: entry('cagr'),
  cumulativeReturn: entry('cumulativeReturn'),
  trailingPe: entry('trailingPe', { caveat: true }),
  forwardPe: entry('forwardPe', { caveat: true }),
  priceToBook: entry('priceToBook', { caveat: true }),
  evToEbitda: entry('evToEbitda'),
  evToSales: entry('evToSales'),
  dividendYield: entry('dividendYield', { caveat: true }),
  payoutRatio: entry('payoutRatio'),
  fcfYield: entry('fcfYield'),
  roe: entry('roe', { caveat: true }),
  debtToEquity: entry('debtToEquity'),
  expenseRatio: entry('expenseRatio', { caveat: true }),
  psr: entry('psr', { caveat: true }),
  twr: backtestEntry('twr'),
  mwr: backtestEntry('mwr'),
  deflatedSharpe: backtestEntry('deflatedSharpe'),
  entrySensitivity: backtestEntry('entrySensitivity'),
  costDrag: backtestEntry('costDrag'),
}
