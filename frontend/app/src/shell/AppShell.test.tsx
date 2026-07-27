import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '@/components/theme-provider'
import { AuthProvider } from '../auth/AuthContext'
import { AppShell } from './AppShell'

describe('AppShell', () => {
  it('renders nav items and the routed page content', () => {
    render(
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <AuthProvider>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/dashboard" element={<p>Dashboard content</p>} />
              </Route>
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </ThemeProvider>,
    )

    expect(screen.getByText('Dashboard content')).toBeInTheDocument()
    expect(screen.getAllByText('Home Finance').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Transactions').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Overview').length).toBeGreaterThan(0)
    expect(screen.getAllByLabelText('Change theme').length).toBeGreaterThan(0)
    expect(screen.getAllByLabelText('Account menu').length).toBeGreaterThan(0)
  })
})
