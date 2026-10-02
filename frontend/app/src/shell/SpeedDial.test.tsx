import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import * as aiChatApi from '../ai-advisor/aiChatApi'
import { AdvisorPopup } from '../ai-advisor/AdvisorPopup'
import { AdvisorProvider } from '../ai-advisor/AdvisorProvider'
import { SpeedDial } from './SpeedDial'

vi.mock('../transactions/TransactionFormDialog', () => ({
  TransactionFormDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="quick add form" /> : null,
}))

function renderDial() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AdvisorProvider>
          <SpeedDial />
          <AdvisorPopup />
        </AdvisorProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

const mainButton = () => screen.getByRole('button', { name: /quick actions/i })

describe('SpeedDial', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    vi.spyOn(aiChatApi, 'getChatStatus').mockResolvedValue({
      configured: true,
      investment_tools_enabled: false,
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it('fans out labelled actions and folds them away again', async () => {
    renderDial()
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()

    await userEvent.click(mainButton())
    expect(await screen.findByRole('menuitem', { name: 'Add transaction' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Finance Assistant' })).toBeInTheDocument()
    expect(mainButton()).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(mainButton())
    await waitFor(() => expect(screen.queryByRole('menuitem')).not.toBeInTheDocument())
  })

  it('closes on Escape', async () => {
    renderDial()
    await userEvent.click(mainButton())
    await screen.findByRole('menuitem', { name: 'Add transaction' })

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menuitem')).not.toBeInTheDocument())
  })

  it('opens the quick-add form from its petal and folds away', async () => {
    renderDial()
    await userEvent.click(mainButton())
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Add transaction' }))

    expect(screen.getByRole('dialog', { name: 'quick add form' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('menuitem')).not.toBeInTheDocument())
  })

  it('opens the advisor popup from its petal', async () => {
    renderDial()
    await userEvent.click(mainButton())
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Finance Assistant' }))

    expect(await screen.findByRole('dialog', { name: 'Finance Assistant' })).toBeVisible()
  })

  it('leaves out the advisor when the server has it switched off', async () => {
    vi.spyOn(aiChatApi, 'getChatStatus').mockResolvedValue({
      configured: false,
      investment_tools_enabled: false,
    })
    renderDial()
    await userEvent.click(mainButton())

    expect(await screen.findByRole('menuitem', { name: 'Add transaction' })).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('menuitem', { name: 'Finance Assistant' })).not.toBeInTheDocument(),
    )
  })
})
