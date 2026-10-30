import { describe, expect, it } from 'vitest'
import { buildWaterfall, rangeStartDate } from './performanceView'
import type { PerformanceBreakdown } from './investmentsApi'

const breakdown: PerformanceBreakdown = {
  unrealized: 300,
  realized: 100,
  dividends: 50,
  taxes: -20,
  fees: -30,
  fees_estimated: -10,
  fx_and_other: -10,
  total_gain: 390,
  net_invested: 1000,
}

describe('buildWaterfall', () => {
  const steps = buildWaterfall(breakdown)

  it('lifts each delta bar to the running total and ends at current value', () => {
    const by = Object.fromEntries(steps.map((s) => [s.key, s]))
    expect(by.netInvested).toMatchObject({ base: 0, size: 1000, total: true })
    expect(by.unrealized).toMatchObject({ base: 1000, size: 300 })
    expect(by.realized).toMatchObject({ base: 1300, size: 100 })
    expect(by.dividends).toMatchObject({ base: 1400, size: 50 })
    // A loss hangs from the previous level down: base is the lower edge.
    expect(by.fees).toMatchObject({ base: 1420, size: 30, value: -30 })
    expect(by.taxes).toMatchObject({ base: 1400, size: 20 })
    expect(by.fxAndOther).toMatchObject({ base: 1390, size: 10 })
    expect(by.currentValue).toMatchObject({ base: 0, size: 1390, total: true })
  })

  it('current value equals net invested plus total gain', () => {
    expect(steps[steps.length - 1].size).toBe(breakdown.net_invested + breakdown.total_gain)
  })
})

describe('rangeStartDate', () => {
  const today = new Date(2026, 9, 30)

  it('maps ranges to a start date', () => {
    expect(rangeStartDate('1m', today)).toBe('2026-09-30')
    expect(rangeStartDate('3m', today)).toBe('2026-07-30')
    expect(rangeStartDate('1y', today)).toBe('2025-10-30')
  })

  it('maps ytd to Jan 1 of the current year', () => {
    expect(rangeStartDate('ytd', today)).toBe('2026-01-01')
  })

  it('sends no start date for all', () => {
    expect(rangeStartDate('all', today)).toBeUndefined()
  })
})
