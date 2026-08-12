/**
 * The arithmetic behind the holding chart, kept out of the drawing code.
 *
 * A price line and a shaded band say "it went up a bit" and nothing else. The
 * figures that make a holding chart worth opening — how far below its own peak
 * it has been, how violent the ride was, which single day did the damage — are
 * all derived from the same daily series the chart already has, so they are
 * computed here once, tested here, and read by both the chart and the strip of
 * numbers under it.
 *
 * Everything ignores days with no price rather than treating them as zero: a
 * market holiday is an absence of information, not a move to nothing.
 */
import type { PositionHistoryPoint } from './investmentsApi'

/** Which pair of numbers is being compared — see the chart's own docstring. */
export type JourneyView = 'price' | 'value'

export interface JourneyPoint {
  date: string
  /** The series being charted: price per unit, or total position value. */
  market: number | null
  /** Its twin: average cost per unit, or total invested. */
  cost: number | null
  /** market − cost. Null before the position existed. */
  pnl: number | null
  /** The same as a percentage of cost. */
  pnlPct: number | null
  quantity: number
  price: number | null
  value: number | null
  invested: number | null
  /** The day's range, for candles. Null on days that printed no bar. */
  open: number | null
  high: number | null
  low: number | null
}

export function toJourneyPoints(
  series: PositionHistoryPoint[],
  view: JourneyView,
): JourneyPoint[] {
  return series.map((point) => {
    // Average cost per unit — the break-even price, and the per-unit twin of
    // the invested-capital line: flat after one buy, stepped after several.
    const avgCost =
      point.invested != null && point.quantity > 0 ? point.invested / point.quantity : null
    const market = view === 'price' ? point.price : point.value
    const cost = view === 'price' ? avgCost : point.invested
    const pnl = market != null && cost != null ? market - cost : null
    return {
      date: point.date,
      market,
      cost,
      pnl,
      pnlPct: pnl != null && cost ? (pnl / cost) * 100 : null,
      quantity: point.quantity,
      price: point.price,
      value: point.value,
      invested: point.invested,
      open: point.open,
      high: point.high,
      low: point.low,
    }
  })
}

/**
 * Simple moving average over the last `window` known values.
 *
 * Null until enough history has accumulated, and null-tolerant in the middle:
 * a gap in the source shortens the window rather than poisoning it, which is
 * the behaviour every charting package uses and the only one that survives a
 * series assembled from trade days plus market days.
 */
export function movingAverage(values: (number | null)[], window: number): (number | null)[] {
  const out: (number | null)[] = []
  const buffer: number[] = []
  for (const value of values) {
    if (value != null) {
      buffer.push(value)
      if (buffer.length > window) buffer.shift()
    }
    out.push(
      buffer.length === window ? buffer.reduce((sum, v) => sum + v, 0) / window : null,
    )
  }
  return out
}

/**
 * The underwater curve: how far below its own running peak the series is, as a
 * negative percentage.
 *
 * This is the one line that answers "what would holding this have felt like",
 * which a price chart hides — a position can end the year up and still have
 * spent August 30% under water.
 */
export function drawdownSeries(values: (number | null)[]): (number | null)[] {
  let peak: number | null = null
  return values.map((value) => {
    if (value == null || value <= 0) return null
    peak = peak == null ? value : Math.max(peak, value)
    return ((value - peak) / peak) * 100
  })
}

export interface JourneyStats {
  /** First to last known price in the window, as a percentage. */
  periodReturnPct: number | null
  /** The deepest peak-to-trough fall, as a negative percentage. */
  maxDrawdownPct: number | null
  /** Annualised standard deviation of daily returns, as a percentage. */
  volatilityPct: number | null
  best: { date: string; pct: number } | null
  worst: { date: string; pct: number } | null
  /** How many of the charted days closed up, out of how many moved at all. */
  upDays: number
  totalDays: number
}

/** 252 trading days a year — the convention the rest of the app's analytics uses. */
const TRADING_DAYS = 252

/**
 * The window's character in five numbers, from the price line only.
 *
 * Deliberately the *instrument's* series rather than the position's value: a
 * top-up doubles the value overnight without the instrument having moved, and
 * counting that as a +100% day would make every one of these figures a lie.
 */
export function journeyStats(points: JourneyPoint[]): JourneyStats {
  const priced = points.filter((point) => point.price != null && point.price > 0)
  const empty: JourneyStats = {
    periodReturnPct: null,
    maxDrawdownPct: null,
    volatilityPct: null,
    best: null,
    worst: null,
    upDays: 0,
    totalDays: 0,
  }
  if (priced.length < 2) return empty

  const returns: { date: string; pct: number }[] = []
  for (let i = 1; i < priced.length; i += 1) {
    const previous = priced[i - 1].price as number
    const current = priced[i].price as number
    if (previous <= 0) continue
    returns.push({ date: priced[i].date, pct: (current / previous - 1) * 100 })
  }
  if (returns.length === 0) return empty

  const first = priced[0].price as number
  const last = priced[priced.length - 1].price as number
  const drawdowns = drawdownSeries(priced.map((point) => point.price))
  const finite = drawdowns.filter((value): value is number => value != null)

  const mean = returns.reduce((sum, r) => sum + r.pct, 0) / returns.length
  const variance =
    returns.reduce((sum, r) => sum + (r.pct - mean) ** 2, 0) / Math.max(returns.length - 1, 1)
  const best = returns.reduce((top, r) => (r.pct > top.pct ? r : top), returns[0])
  const worst = returns.reduce((low, r) => (r.pct < low.pct ? r : low), returns[0])

  return {
    periodReturnPct: (last / first - 1) * 100,
    maxDrawdownPct: finite.length ? Math.min(...finite) : null,
    volatilityPct: Math.sqrt(variance) * Math.sqrt(TRADING_DAYS),
    best,
    worst,
    upDays: returns.filter((r) => r.pct > 0).length,
    totalDays: returns.length,
  }
}

/** True when enough days carry a real high/low for candles to mean anything. */
export function hasCandleData(points: JourneyPoint[]): boolean {
  let bars = 0
  for (const point of points) {
    if (point.open != null && point.high != null && point.low != null && point.price != null) {
      bars += 1
      if (bars >= 5) return true
    }
  }
  return false
}
