import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '../auth/AuthContext'
import { AppShell } from './AppShell'

function renderShell(path: string, content: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <TooltipProvider>
          <MemoryRouter initialEntries={[path]}>
            <AuthProvider>
              <Routes>
                <Route element={<AppShell />}>
                  <Route path={path} element={<p>{content}</p>} />
                </Route>
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

describe('AppShell', () => {
  it('renders nav items and the routed page content', () => {
    renderShell('/dashboard', 'Dashboard content')

    expect(screen.getByText('Dashboard content')).toBeInTheDocument()
    expect(screen.getAllByText('Home Finance').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Transactions').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Overview').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Notifications').length).toBeGreaterThan(0)
    expect(screen.getAllByLabelText('Change theme').length).toBeGreaterThan(0)
    expect(screen.getAllByLabelText('Account menu').length).toBeGreaterThan(0)
    expect(screen.getAllByLabelText('Notifications').length).toBeGreaterThan(0)
    expect(screen.queryByText('Import')).not.toBeInTheDocument()
  })

  it('offers the investments section from the everyday shell', () => {
    renderShell('/dashboard', 'Dashboard content')

    expect(screen.getAllByText('Investments').length).toBeGreaterThan(0)
    expect(screen.queryByText('Back to Dashboard')).not.toBeInTheDocument()
  })

  // Entering investments swaps the whole nav rather than adding to it — the
  // everyday destinations should be gone, not merely pushed down.
  it('swaps to the investments nav inside the section', () => {
    renderShell('/investments', 'Investments content')

    expect(screen.getByText('Investments content')).toBeInTheDocument()
    expect(screen.getAllByText('Market news').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Ticker search').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Company research').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Portfolio').length).toBeGreaterThan(0)

    expect(screen.queryByText('Transactions')).not.toBeInTheDocument()
    expect(screen.queryByText('Budgets')).not.toBeInTheDocument()
    expect(screen.queryByText('Debts')).not.toBeInTheDocument()
  })

  it('replaces the investments entry point with the way out', () => {
    renderShell('/investments/news', 'News content')

    expect(screen.getAllByText('Back to Dashboard').length).toBeGreaterThan(0)
    // No "More" slot in the investments dock — every destination is on it.
    expect(screen.queryByLabelText('More navigation')).not.toBeInTheDocument()
  })
})
