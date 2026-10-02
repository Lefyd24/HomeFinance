import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { currentMonthRange, rangeForPreset, toLocalIsoDate } from './format'

/**
 * These ranges are built from `new Date(y, m, d)`, which is midnight *local*
 * time. Serialising that with `toISOString()` converts to UTC first, so for
 * anyone east of Greenwich every boundary slid one day earlier — the month
 * range came back as "last day of the previous month" through "second-to-last
 * day of this month", silently dropping a day of data off both ends.
 *
 * The app's users are in Greece (UTC+2/+3), so the tests pin that timezone.
 * Under UTC the buggy and correct implementations agree, which is exactly why
 * this went unnoticed.
 */
// Reached through globalThis because the app's tsconfig has no Node types —
// Node re-reads process.env.TZ on the next Date construction, so mutating it
// here is enough to move the whole file into Athens time.
const nodeEnv = (globalThis as unknown as { process: { env: Record<string, string | undefined> } })
  .process.env
const ORIGINAL_TZ = nodeEnv.TZ

beforeAll(() => {
  nodeEnv.TZ = 'Europe/Athens'
})

afterAll(() => {
  nodeEnv.TZ = ORIGINAL_TZ
})

describe('toLocalIsoDate', () => {
  it('uses local calendar fields, not the UTC instant', () => {
    // Local midnight on Aug 1 is 2026-07-31T21:00Z in Athens.
    expect(toLocalIsoDate(new Date(2026, 7, 1))).toBe('2026-08-01')
  })

  it('zero-pads single-digit months and days', () => {
    expect(toLocalIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('currentMonthRange', () => {
  it('spans the whole 31-day month', () => {
    expect(currentMonthRange(new Date(2026, 7, 15, 12))).toEqual({
      start_date: '2026-08-01',
      end_date: '2026-08-31',
    })
  })

  it('spans the whole 30-day month', () => {
    expect(currentMonthRange(new Date(2026, 3, 10, 9))).toEqual({
      start_date: '2026-04-01',
      end_date: '2026-04-30',
    })
  })

  it('handles February in a non-leap year', () => {
    expect(currentMonthRange(new Date(2026, 1, 3))).toEqual({
      start_date: '2026-02-01',
      end_date: '2026-02-28',
    })
  })

  it('handles February in a leap year', () => {
    expect(currentMonthRange(new Date(2028, 1, 3))).toEqual({
      start_date: '2028-02-01',
      end_date: '2028-02-29',
    })
  })

  it('is correct on the first instant of the month', () => {
    expect(currentMonthRange(new Date(2026, 7, 1, 0, 0, 0))).toEqual({
      start_date: '2026-08-01',
      end_date: '2026-08-31',
    })
  })

  it('is correct on the last instant of the month', () => {
    expect(currentMonthRange(new Date(2026, 7, 31, 23, 59, 59))).toEqual({
      start_date: '2026-08-01',
      end_date: '2026-08-31',
    })
  })
})

describe('rangeForPreset', () => {
  it('1M is the current month end to end', () => {
    expect(rangeForPreset('1M', new Date(2026, 7, 15))).toEqual({
      start_date: '2026-08-01',
      end_date: '2026-08-31',
    })
  })

  it('3M starts two months back and ends on the last day of this month', () => {
    expect(rangeForPreset('3M', new Date(2026, 7, 15))).toEqual({
      start_date: '2026-06-01',
      end_date: '2026-08-31',
    })
  })

  it('1Y crosses the year boundary without losing a day', () => {
    expect(rangeForPreset('1Y', new Date(2026, 1, 20))).toEqual({
      start_date: '2025-03-01',
      end_date: '2026-02-28',
    })
  })
})
