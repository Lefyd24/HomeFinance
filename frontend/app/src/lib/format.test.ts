import { describe, expect, it } from 'vitest'
import { formatCurrency } from './format'

describe('formatCurrency', () => {
  it('formats ISO-4217 currencies with a symbol', () => {
    expect(formatCurrency(1200, 'EUR')).toBe('1.200,00 €')
    expect(formatCurrency(42.5, 'USD')).toBe('42,50 $')
  })

  it('falls back to a decimal amount plus code for non-ISO broker currencies', () => {
    expect(formatCurrency(1234.5, 'USDT')).toBe('1.234,50 USDT')
    expect(formatCurrency(0.0012, 'BTC/USD')).toBe('0,00 BTC/USD')
  })

  it('does not throw for empty or unusual currency strings', () => {
    expect(() => formatCurrency(10, '')).not.toThrow()
    expect(formatCurrency(10, '')).toBe('10,00 €')
  })
})
