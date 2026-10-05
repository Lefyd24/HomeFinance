import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as apiKeysApi from './apiKeysApi'
import { ApiKeysPage } from './ApiKeysPage'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ApiKeysPage />
    </QueryClientProvider>,
  )
}

const readKey: apiKeysApi.ApiKey = {
  id: 1,
  name: 'Home dashboard',
  scope: 'read',
  key_prefix: 'pf_abcde',
  last_four: 'wxyz',
  created_at: '2024-03-01T00:00:00Z',
  last_used_at: null,
}

describe('ApiKeysPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lists keys with scope, masked value and last used', async () => {
    vi.spyOn(apiKeysApi, 'listApiKeys').mockResolvedValue([
      readKey,
      { ...readKey, id: 2, name: 'Backup script', scope: 'full', last_used_at: '2024-03-05T10:30:00Z' },
    ])
    renderPage()

    expect(await screen.findByText('Home dashboard')).toBeInTheDocument()
    expect(screen.getByText('Backup script')).toBeInTheDocument()
    expect(screen.getByText('Read-only', { selector: '[data-slot="badge"]' })).toBeInTheDocument()
    expect(screen.getByText('Full access', { selector: '[data-slot="badge"]' })).toBeInTheDocument()
    expect(screen.getAllByText('pf_abcde…wxyz')).toHaveLength(2)
    expect(screen.getByText('Never')).toBeInTheDocument()
    expect(screen.getByText('2 of 10 keys in use.')).toBeInTheDocument()
  })

  it('shows an empty state and the usage guide', async () => {
    vi.spyOn(apiKeysApi, 'listApiKeys').mockResolvedValue([])
    renderPage()

    expect(await screen.findByText(/No API keys yet/i)).toBeInTheDocument()
    expect(screen.getByText('What you can do with API keys')).toBeInTheDocument()
    expect(screen.getAllByText('/accounts/').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/X-API-Key/).length).toBeGreaterThan(0)
  })

  it('creates a key with the chosen scope and reveals it once', async () => {
    vi.spyOn(apiKeysApi, 'listApiKeys').mockResolvedValue([])
    const create = vi.spyOn(apiKeysApi, 'createApiKey').mockResolvedValue({
      key: 'pf_secret-value',
      api_key: { ...readKey, scope: 'full' },
    })

    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /new key/i }))
    await user.type(screen.getByLabelText('Name'), '  Backup script ')
    await user.click(screen.getByLabelText(/full access/i))
    await user.click(screen.getByRole('button', { name: 'Create key' }))

    await vi.waitFor(() =>
      expect(create).toHaveBeenCalledWith({ name: 'Backup script', scope: 'full' }, expect.anything()),
    )
    expect(await screen.findByDisplayValue('pf_secret-value')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /i've copied the key/i }))
    expect(screen.queryByDisplayValue('pf_secret-value')).not.toBeInTheDocument()
  })

  it('defaults new keys to read-only and needs a name', async () => {
    vi.spyOn(apiKeysApi, 'listApiKeys').mockResolvedValue([])
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /new key/i }))
    expect(screen.getByLabelText(/read-only/i)).toBeChecked()
    expect(screen.getByRole('button', { name: 'Create key' })).toBeDisabled()
  })

  it('revokes a key after confirmation', async () => {
    vi.spyOn(apiKeysApi, 'listApiKeys').mockResolvedValue([readKey])
    const revoke = vi.spyOn(apiKeysApi, 'revokeApiKey').mockResolvedValue(undefined)

    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Revoke' }))
    await user.click(await screen.findByRole('button', { name: 'Revoke key' }))

    await vi.waitFor(() => expect(revoke).toHaveBeenCalledWith(1, expect.anything()))
  })

  it('disables creation at the key limit', async () => {
    const keys = Array.from({ length: apiKeysApi.MAX_API_KEYS }, (_, i) => ({ ...readKey, id: i + 1, name: `k${i}` }))
    vi.spyOn(apiKeysApi, 'listApiKeys').mockResolvedValue(keys)
    renderPage()

    await screen.findByText('k0')
    expect(screen.getByRole('button', { name: /new key/i })).toBeDisabled()
  })
})
