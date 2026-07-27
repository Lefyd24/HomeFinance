import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../auth/AuthContext'
import { AppShell } from './AppShell'

describe('AppShell', () => {
  it('renders nav items and the routed page content', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/dashboard" element={<p>Dashboard content</p>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(screen.getByText('Dashboard content')).toBeInTheDocument()
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0) // bottom bar + sidebar both render the label
    expect(screen.getAllByText('Transactions').length).toBeGreaterThan(0)
  })
})
