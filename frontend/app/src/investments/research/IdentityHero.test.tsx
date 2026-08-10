import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { IdentityHero } from './IdentityHero'
import type { CompanyProfile } from '../investmentsApi'

function profileFixture(overrides: Partial<CompanyProfile> = {}): CompanyProfile {
  return {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    short_name: 'Apple',
    exchange: 'NasdaqGS',
    quote_type: 'stock',
    currency: 'USD',
    sector: 'Technology',
    industry: 'Consumer Electronics',
    current_price: 190,
    day_change_pct: 2.7,
    fifty_two_week_low: 150,
    fifty_two_week_high: 210,
    earnings_history: [],
    ...overrides,
  } as unknown as CompanyProfile
}

describe('IdentityHero', () => {
  it('shows the ticker, name and sector breadcrumb', () => {
    render(<IdentityHero profile={profileFixture()} isWatched={false} onToggleWatch={vi.fn()} />)
    expect(screen.getByText('AAPL')).toBeInTheDocument()
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument()
    expect(screen.getByText(/Technology/)).toBeInTheDocument()
    expect(screen.getByText(/Consumer Electronics/)).toBeInTheDocument()
  })

  it('plots the current price within the 52-week range', () => {
    render(<IdentityHero profile={profileFixture()} isWatched={false} onToggleWatch={vi.fn()} />)
    const marker = screen.getByTestId('range-marker')
    // (190 - 150) / (210 - 150) = 66.67%
    expect(marker).toHaveStyle({ left: '66.66666666666666%' })
  })

  it('omits the range bar when the 52-week bounds are missing', () => {
    render(
      <IdentityHero
        profile={profileFixture({ fifty_two_week_low: null, fifty_two_week_high: null })}
        isWatched={false}
        onToggleWatch={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('range-marker')).not.toBeInTheDocument()
  })

  it('calls onToggleWatch when the star is pressed', async () => {
    const onToggleWatch = vi.fn()
    const user = userEvent.setup()
    render(<IdentityHero profile={profileFixture()} isWatched={false} onToggleWatch={onToggleWatch} />)
    await user.click(screen.getByRole('button', { name: /watch/i }))
    expect(onToggleWatch).toHaveBeenCalledOnce()
  })
})
