import { describe, expect, it } from 'vitest'
import { IMPORT_TEMPLATE_CSV } from './importTemplate'

describe('import template', () => {
  it('uses the column names the parser recognises', () => {
    expect(IMPORT_TEMPLATE_CSV.split('\n')[0]).toBe('date,description,amount')
  })

  it('shows both money in and money out', () => {
    const amounts = IMPORT_TEMPLATE_CSV.trim().split('\n').slice(1).map((l) => Number(l.split(',')[2]))
    expect(amounts.some((a) => a > 0)).toBe(true)
    expect(amounts.some((a) => a < 0)).toBe(true)
  })
})
