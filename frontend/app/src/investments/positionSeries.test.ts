import { describe, expect, it } from 'vitest'
import {
  drawdownSeries,
  hasCandleData,
  journeyStats,
  movingAverage,
  toJourneyPoints,
} from './positionSeries'
import type { PositionHistoryPoint } from './investmentsApi'

function day(
  date: string,
  price: number | null,
  overrides: Partial<PositionHistoryPoint> = {},
): PositionHistoryPoint {
  return {
    date,
    quantity: 0,
    price,
    open: null,
    high: null,
    low: null,
    value: null,
    invested: null,
    fees: 0,
    ...overrides,
  }
}

describe('toJourneyPoints', () => {
  it('derives average cost per unit in the per-unit view', () => {
    const points = toJourneyPoints(
      [day('2026-01-02', 12, { quantity: 3, invested: 30, value: 36 })],
      'price',
    )

    expect(points[0].cost).toBe(10)
    expect(points[0].market).toBe(12)
    expect(points[0].pnl).toBe(2)
    expect(points[0].pnlPct).toBe(20)
  })

  it('leaves both lines null before the position existed', () => {
    // The pre-entry stretch is the instrument only — a zero here would draw a
    // line along the axis claiming the holding was worthless rather than absent.
    const points = toJourneyPoints([day('2026-01-02', 12)], 'price')

    expect(points[0].cost).toBeNull()
    expect(points[0].pnl).toBeNull()
  })
})

describe('movingAverage', () => {
  it('is null until the window is full, then averages the last n values', () => {
    expect(movingAverage([1, 2, 3, 4], 3)).toEqual([null, null, 2, 3])
  })

  it('skips gaps rather than restarting or poisoning the window', () => {
    expect(movingAverage([1, null, 3, 5], 2)).toEqual([null, null, 2, 4])
  })
})

describe('drawdownSeries', () => {
  it('measures the fall from the running peak, not from the start', () => {
    expect(drawdownSeries([100, 80, 120, 60])).toEqual([0, -20, 0, -50])
  })
})

describe('journeyStats', () => {
  const series = [
    day('2026-01-01', 100),
    day('2026-01-02', 110),
    day('2026-01-03', 88),
    day('2026-01-04', 99),
  ]

  it('reports the window return, deepest drawdown and the two extreme days', () => {
    const stats = journeyStats(toJourneyPoints(series, 'price'))

    expect(stats.periodReturnPct).toBeCloseTo(-1, 6)
    expect(stats.maxDrawdownPct).toBeCloseTo(-20, 6)
    expect(stats.best?.date).toBe('2026-01-04')
    expect(stats.worst?.date).toBe('2026-01-03')
    expect(stats.upDays).toBe(2)
    expect(stats.totalDays).toBe(3)
  })

  it('measures the instrument, not the holding, so a top-up is not a +100% day', () => {
    const topUp = [
      day('2026-01-01', 10, { quantity: 1, value: 10, invested: 10 }),
      day('2026-01-02', 10, { quantity: 2, value: 20, invested: 20 }),
    ]

    const stats = journeyStats(toJourneyPoints(topUp, 'value'))

    expect(stats.periodReturnPct).toBe(0)
    expect(stats.best?.pct).toBe(0)
  })

  it('says nothing rather than something wrong when there is one price', () => {
    expect(journeyStats(toJourneyPoints([day('2026-01-01', 10)], 'price')).periodReturnPct).toBeNull()
  })
})

describe('hasCandleData', () => {
  it('is false when the source only carried closes', () => {
    expect(hasCandleData(toJourneyPoints(new Array(10).fill(day('2026-01-01', 10)), 'price'))).toBe(
      false,
    )
  })

  it('is true once enough days carry a real range', () => {
    const bars = new Array(6)
      .fill(null)
      .map((_, i) => day(`2026-01-0${i + 1}`, 10, { open: 9, high: 11, low: 8 }))

    expect(hasCandleData(toJourneyPoints(bars, 'price'))).toBe(true)
  })
})
