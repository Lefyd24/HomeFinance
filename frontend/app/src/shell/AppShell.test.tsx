import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '../auth/AuthContext'
import { AppShell } from './AppShell'

describe('AppShell', () => {
  it('renders nav items and the routed page content', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <TooltipProvider>
            <MemoryRouter initialEntries={['/dashboard']}>
              <AuthProvider>
                <Routes>
                  <Route element={<AppShell />}>
                    <Route path="/dashboard" element={<p>Dashboard content</p>} />
                  </Route>
                </Routes>
              </AuthProvider>
            </MemoryRouter>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>,
    )

    expect(screen.getByText('Dashboard content')).toBeInTheDocument()
    expect(screen.getAllByText('Home Finance').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Transactions').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Overview').length).toBeGreaterThan(0)
    expect(screen.getAllByLabelText('Change theme').length).toBeGreaterThan(0)
    expect(screen.getAllByLabelText('Account menu').length).toBeGreaterThan(0)
    // Notifications moved out of the sidebar and into the top bar.
    expect(screen.getAllByLabelText('Notifications').length).toBeGreaterThan(0)
    expect(screen.queryByText('Import')).not.toBeInTheDocument()
  })
})
