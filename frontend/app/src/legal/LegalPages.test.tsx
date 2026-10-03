import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { PrivacyPage } from './PrivacyPage'
import { TermsPage } from './TermsPage'

function mockLegal(body: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body }),
  )
}

function renderPage(page: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{page}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('legal pages', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the operator details served by the backend', async () => {
    mockLegal({
      operator: 'Jane Doe',
      contact_email: 'jane@example.com',
      jurisdiction: 'Ireland',
      configured: true,
    })
    renderPage(<PrivacyPage />)

    expect(await screen.findByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'jane@example.com' })[0]).toHaveAttribute(
      'href',
      'mailto:jane@example.com',
    )
    expect(screen.queryByText(/This page is not configured/)).not.toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/legal')
  })

  it('uses the configured jurisdiction in the terms', async () => {
    mockLegal({
      operator: 'Jane Doe',
      contact_email: 'jane@example.com',
      jurisdiction: 'Ireland',
      configured: true,
    })
    renderPage(<TermsPage />)

    expect(await screen.findByText(/laws of Ireland/)).toBeInTheDocument()
  })

  it('warns the operator when nothing is configured and never shows a person', async () => {
    mockLegal({ operator: null, contact_email: null, jurisdiction: null, configured: false })
    renderPage(<PrivacyPage />)

    expect(await screen.findByText(/This page is not configured/)).toBeInTheDocument()
    expect(screen.getByText('LEGAL_OPERATOR_NAME')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /@/ })).not.toBeInTheDocument()
  })
})
