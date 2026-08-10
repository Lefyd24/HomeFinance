import { describe, expect, it } from 'vitest'
import {
  deltaClass,
  fmtCompactNumber,
  fmtInt,
  fmtPct,
  fmtRatio,
  pctOfRange,
} from './researchFormat'

describe('researchFormat', () => {
  it('renders an em dash for nullish input', () => {
    expect(fmtRatio(null)).toBe('—')
    expect(fmtRatio(undefined)).toBe('—')
    expect(fmtPct(null)).toBe('—')
    expect(fmtInt(null)).toBe('—')
    expect(fmtCompactNumber(null)).toBe('—')
  })

  it('rejects non-finite numbers rather than printing NaN', () => {
    expect(fmtRatio(Number.NaN)).toBe('—')
    expect(fmtRatio(Number.POSITIVE_INFINITY)).toBe('—')
  })

  it('formats ratios to two decimals', () => {
    expect(fmtRatio(2.5264)).toBe('2.53')
    expect(fmtRatio(-0.5)).toBe('-0.50')
  })

  it('formats decimal fractions as percentages to one decimal', () => {
    expect(fmtPct(0.3262)).toBe('32.6%')
    expect(fmtPct(-0.0715)).toBe('-7.2%')
  })

  it('adds an explicit plus sign when signed', () => {
    expect(fmtPct(0.0452, { signed: true })).toBe('+4.5%')
    expect(fmtPct(-0.0452, { signed: true })).toBe('-4.5%')
    expect(fmtPct(0, { signed: true })).toBe('+0.0%')
  })

  it('honours a decimals override', () => {
    expect(fmtPct(0.0035, { decimals: 2 })).toBe('0.35%')
  })

  it('formats large counts compactly', () => {
    expect(fmtCompactNumber(466_822_987_776)).toBe('466.8B')
    expect(fmtCompactNumber(150_000)).toBe('150K')
  })

  it('maps sign to the flow colour tokens', () => {
    expect(deltaClass(1)).toBe('text-flow-in')
    expect(deltaClass(-1)).toBe('text-flow-out')
    expect(deltaClass(0)).toBe('text-muted-foreground')
    expect(deltaClass(null)).toBe('text-muted-foreground')
  })

  it('positions a value within a range as a clamped percentage', () => {
    expect(pctOfRange(150, 100, 200)).toBe(50)
    expect(pctOfRange(100, 100, 200)).toBe(0)
    expect(pctOfRange(250, 100, 200)).toBe(100)
    expect(pctOfRange(50, 100, 200)).toBe(0)
    expect(pctOfRange(150, null, 200)).toBeNull()
    expect(pctOfRange(150, 200, 200)).toBeNull()
  })
})
