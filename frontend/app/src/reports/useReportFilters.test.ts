import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { computeRange, previousPeriod } from './useReportFilters'

// Same reasoning as lib/dateRange.test.ts: the bug only shows east of UTC.
const nodeEnv = (globalThis as unknown as { process: { env: Record<string, string | undefined> } })
  .process.env
const ORIGINAL_TZ = nodeEnv.TZ

beforeAll(() => {
  nodeEnv.TZ = 'Europe/Athens'
})

afterAll(() => {
  nodeEnv.TZ = ORIGINAL_TZ
})

describe('computeRange', () => {
  it('month-to-date starts on the 1st and ends today (31-day month)', () => {
    expect(computeRange('mtd', new Date(2026, 7, 31, 23, 59))).toEqual({
      start: '2026-08-01',
      end: '2026-08-31',
    })
  })

  it('month-to-date on the 1st is a single day', () => {
    expect(computeRange('mtd', new Date(2026, 7, 1, 0, 0))).toEqual({
      start: '2026-08-01',
      end: '2026-08-01',
    })
  })

  it('year-to-date starts on 1 January', () => {
    expect(computeRange('ytd', new Date(2026, 1, 28))).toEqual({
      start: '2026-01-01',
      end: '2026-02-28',
    })
  })
})

describe('previousPeriod', () => {
  it('ends the day before the current window starts', () => {
    const prev = previousPeriod({ start_date: '2026-08-01', end_date: '2026-08-31' })
    expect(prev).toEqual({ start_date: '2026-07-01', end_date: '2026-07-31' })
  })

  it('crosses a leap February without losing a day', () => {
    const prev = previousPeriod({ start_date: '2028-03-01', end_date: '2028-03-31' })
    expect(prev).toEqual({ start_date: '2028-01-30', end_date: '2028-02-29' })
  })
})
