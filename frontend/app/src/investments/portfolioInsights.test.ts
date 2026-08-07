import { describe, expect, it } from 'vitest'
import {
  aggregateTotals,
  buildInsights,
  cashDrag,
  concentration,
  mergeHistory,
  sharedCurrency,
  topContributors,
  topMovers,
} from './portfolioInsights'
import type {
  InvestmentAccount,
  PortfolioPosition,
  PortfolioSnapshot,
} from './investmentsApi'

function account(overrides: Partial<InvestmentAccount> = {}): InvestmentAccount {
  return {
    id: 1,
    user_id: 1,
    name: 'Broker',
    provider: 'freedom24',
    currency: 'EUR',
    balance: 1000,
    icon: null,
    is_active: true,
    last_synced_at: null,
    sync_status: 'ok',
    sync_error: null,
    total_cost_basis: 800,
    total_market_value: 900,
    total_return_pct: 12.5,
    total_unrealized_pnl: 100,
    cash_balance: 100,
    positions_value: 900,
    day_change: 10,
    day_change_pct: 1.1,
    position_count: 2,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function position(overrides: Partial<PortfolioPosition> = {}): PortfolioPosition {
  return {
    id: 1,
    account_id: 1,
    symbol: 'AAA',
    name: 'Alpha',
    quantity: 10,
    avg_price: 10,
    current_price: 12,
    market_value: 120,
    currency: 'EUR',
    synced_at: '2026-01-01T00:00:00Z',
    cost_basis: 100,
    unrealized_pnl: 20,
    unrealized_return_pct: 20,
    market_value_base: 120,
    cost_basis_base: 100,
    unrealized_pnl_base: 20,
    fx_rate: 1,
    day_change: 2,
    day_change_pct: 1.5,
    exchange: 'XETRA',
    weight_pct: 50,
    ...overrides,
  }
}

function snapshot(date: string, total: number, positions: number): PortfolioSnapshot {
  return {
    date,
    total_value: total,
    cash_balance: total - positions,
    positions_value: positions,
    currency: 'EUR',
  }
}

describe('sharedCurrency', () => {
  it('returns the currency when every account agrees', () => {
    expect(sharedCurrency([account(), account({ id: 2 })])).toBe('EUR')
  })

  it('returns null when they disagree', () => {
    expect(sharedCurrency([account(), account({ id: 2, currency: 'USD' })])).toBeNull()
  })

  it('returns null with no accounts', () => {
    expect(sharedCurrency([])).toBeNull()
  })
})

describe('aggregateTotals', () => {
  it('sums accounts that share a currency', () => {
    const totals = aggregateTotals([account(), account({ id: 2 })])
    expect(totals).not.toBeNull()
    expect(totals?.value).toBe(2000)
    expect(totals?.invested).toBe(1800)
    expect(totals?.cash).toBe(200)
    expect(totals?.pnl).toBe(200)
    expect(totals?.returnPct).toBeCloseTo(12.5)
    expect(totals?.accountCount).toBe(2)
  })

  // Adding euros to dollars would be worse than showing nothing.
  it('refuses to aggregate across currencies', () => {
    expect(aggregateTotals([account(), account({ id: 2, currency: 'USD' })])).toBeNull()
  })

  it('excludes unquoted accounts from the day figure', () => {
    const totals = aggregateTotals([
      account({ total_market_value: 900, day_change: 10 }),
      account({ id: 2, total_market_value: 500, day_change: null, day_change_pct: null }),
    ])
    // Only the quoted account contributes: 10 on an open of 890.
    expect(totals?.dayChange).toBe(10)
    expect(totals?.dayChangePct).toBeCloseTo((10 / 890) * 100)
  })

  it('reports no day figure when nothing is quoted', () => {
    const totals = aggregateTotals([account({ day_change: null, day_change_pct: null })])
    expect(totals?.dayChange).toBeNull()
    expect(totals?.dayChangePct).toBeNull()
  })

  it('leaves the return undefined rather than dividing by a zero cost basis', () => {
    expect(aggregateTotals([account({ total_cost_basis: 0 })])?.returnPct).toBeNull()
  })
})

describe('mergeHistory', () => {
  it('sums matching dates across accounts', () => {
    const merged = mergeHistory(
      [
        [snapshot('2026-01-01', 100, 80), snapshot('2026-01-02', 110, 90)],
        [snapshot('2026-01-01', 50, 40), snapshot('2026-01-02', 60, 50)],
      ],
      'EUR',
    )
    expect(merged).toHaveLength(2)
    expect(merged[0]).toMatchObject({ date: '2026-01-01', total_value: 150, positions_value: 120 })
    expect(merged[1]).toMatchObject({ date: '2026-01-02', total_value: 170, positions_value: 140 })
  })

  // A date only one account reported would draw as a crash in the chart.
  it('drops dates that not every account reported', () => {
    const merged = mergeHistory(
      [
        [snapshot('2026-01-01', 100, 80), snapshot('2026-01-02', 110, 90)],
        [snapshot('2026-01-02', 60, 50)],
      ],
      'EUR',
    )
    expect(merged.map((s) => s.date)).toEqual(['2026-01-02'])
  })

  it('sorts a single series by date', () => {
    const merged = mergeHistory([[snapshot('2026-01-02', 110, 90), snapshot('2026-01-01', 100, 80)]], 'EUR')
    expect(merged.map((s) => s.date)).toEqual(['2026-01-01', '2026-01-02'])
  })

  it('handles no series at all', () => {
    expect(mergeHistory([], 'EUR')).toEqual([])
  })
})

describe('topMovers', () => {
  it('splits by direction, biggest move first, and skips unquoted holdings', () => {
    const positions = [
      position({ id: 1, symbol: 'UP1', day_change_pct: 2 }),
      position({ id: 2, symbol: 'UP2', day_change_pct: 5 }),
      position({ id: 3, symbol: 'DOWN1', day_change_pct: -1 }),
      position({ id: 4, symbol: 'DOWN2', day_change_pct: -4 }),
      position({ id: 5, symbol: 'NOQUOTE', day_change_pct: null }),
      position({ id: 6, symbol: 'FLAT', day_change_pct: 0 }),
    ]
    const movers = topMovers(positions)

    expect(movers.gainers.map((p) => p.symbol)).toEqual(['UP2', 'UP1'])
    expect(movers.losers.map((p) => p.symbol)).toEqual(['DOWN2', 'DOWN1'])
    // Flat is quoted but is neither a gainer nor a loser.
    expect(movers.quoted).toBe(5)
    expect(movers.total).toBe(6)
  })

  it('copes with nothing quoted', () => {
    const movers = topMovers([position({ day_change_pct: null })])
    expect(movers.gainers).toEqual([])
    expect(movers.losers).toEqual([])
    expect(movers.quoted).toBe(0)
  })
})

describe('topContributors', () => {
  it('ranks by money made, preferring the account-currency figure', () => {
    const positions = [
      position({ id: 1, symbol: 'BIG', unrealized_pnl: 1, unrealized_pnl_base: 500 }),
      position({ id: 2, symbol: 'SMALL', unrealized_pnl_base: 5 }),
      position({ id: 3, symbol: 'BAD', unrealized_pnl_base: -300 }),
    ]
    const { best, worst } = topContributors(positions)
    expect(best.map((p) => p.symbol)).toEqual(['BIG', 'SMALL'])
    expect(worst.map((p) => p.symbol)).toEqual(['BAD'])
  })

  it('falls back to the native figure when there is no converted one', () => {
    const { best } = topContributors([
      position({ symbol: 'NATIVE', unrealized_pnl: 42, unrealized_pnl_base: null }),
    ])
    expect(best.map((p) => p.symbol)).toEqual(['NATIVE'])
  })
})

describe('concentration', () => {
  it('flags a portfolio riding on one name', () => {
    const result = concentration([
      position({ id: 1, symbol: 'BIG', market_value_base: 700 }),
      position({ id: 2, symbol: 'A', market_value_base: 150 }),
      position({ id: 3, symbol: 'B', market_value_base: 150 }),
    ])
    expect(result.largest?.symbol).toBe('BIG')
    expect(result.largestPct).toBeCloseTo(70)
    expect(result.isConcentrated).toBe(true)
  })

  it('leaves an evenly-spread portfolio unflagged', () => {
    const result = concentration(
      ['A', 'B', 'C', 'D', 'E'].map((symbol, i) =>
        position({ id: i, symbol, market_value_base: 100 }),
      ),
    )
    expect(result.largestPct).toBeCloseTo(20)
    expect(result.isConcentrated).toBe(false)
    expect(result.effectiveHoldings).toBeCloseTo(5)
  })

  it('does not divide by zero on an empty or worthless portfolio', () => {
    expect(concentration([])).toMatchObject({ largest: null, largestPct: 0, hhi: 0 })
    expect(concentration([position({ market_value_base: 0 })])).toMatchObject({ largest: null })
  })
})

describe('cashDrag', () => {
  const totals = (value: number, cash: number) => ({
    currency: 'EUR',
    value,
    invested: value - cash,
    cash,
    costBasis: 0,
    pnl: 0,
    returnPct: null,
    dayChange: null,
    dayChangePct: null,
    positionCount: 0,
    accountCount: 1,
  })

  it('flags a large idle balance', () => {
    expect(cashDrag(totals(1000, 400))).toEqual({ pct: 40, isHigh: true })
  })

  it('leaves a small one alone', () => {
    expect(cashDrag(totals(1000, 50))).toEqual({ pct: 5, isHigh: false })
  })

  it('reports zero for an empty portfolio rather than NaN', () => {
    expect(cashDrag(totals(0, 0))).toEqual({ pct: 0, isHigh: false })
  })
})

describe('buildInsights', () => {
  const totals = aggregateTotals([account()])!

  it('says nothing when there is nothing to say', () => {
    expect(buildInsights(totals, [])).toEqual([])
  })

  it('calls out a concentrated portfolio', () => {
    const insights = buildInsights(totals, [
      position({ id: 1, symbol: 'BIG', market_value_base: 900 }),
      position({ id: 2, symbol: 'SMALL', market_value_base: 100 }),
    ])
    const concentrated = insights.find((i) => i.id === 'concentration')
    expect(concentrated).toMatchObject({ tone: 'watch', values: { symbol: 'BIG', pct: '90' } })
    expect(insights.find((i) => i.id === 'diversified')).toBeUndefined()
  })

  it('notes a spread portfolio instead', () => {
    const insights = buildInsights(
      totals,
      ['A', 'B', 'C', 'D', 'E'].map((symbol, i) =>
        position({ id: i, symbol, market_value_base: 100 }),
      ),
    )
    expect(insights.find((i) => i.id === 'diversified')?.tone).toBe('good')
  })

  it('mentions partial quote coverage rather than implying full coverage', () => {
    const insights = buildInsights(totals, [
      position({ id: 1, day_change_pct: 1 }),
      position({ id: 2, day_change_pct: null }),
    ])
    expect(insights.find((i) => i.id === 'staleQuotes')).toMatchObject({
      values: { quoted: 1, total: 2 },
    })
  })

  it('stays quiet about quotes when every holding has one', () => {
    const insights = buildInsights(totals, [position({ id: 1, day_change_pct: 1 })])
    expect(insights.find((i) => i.id === 'staleQuotes')).toBeUndefined()
  })
})
