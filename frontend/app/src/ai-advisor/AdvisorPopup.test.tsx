import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import * as aiChatApi from './aiChatApi'
import { useAdvisor } from './advisorContext'
import { AdvisorPopup } from './AdvisorPopup'
import { AdvisorProvider } from './AdvisorProvider'

function OpenButton() {
  const { open } = useAdvisor()
  return <button onClick={() => open()}>open advisor</button>
}

function renderPopup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AdvisorProvider>
          <OpenButton />
          <AdvisorPopup />
        </AdvisorProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

/** The popup stays mounted while closed, so "closed" means hidden from the user. */
const popup = () => screen.queryByRole('dialog', { name: 'Finance Assistant' })

describe('AdvisorPopup', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    vi.spyOn(aiChatApi, 'getChatStatus').mockResolvedValue({
      configured: true,
      investment_tools_enabled: false,
    })
    vi.spyOn(aiChatApi, 'streamChat').mockImplementation(async (_messages, onEvent) => {
      onEvent({ type: 'token', content: 'Two thousand euro.' })
      onEvent({ type: 'done' })
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it('is hidden until opened, and closes again', async () => {
    renderPopup()
    expect(popup()).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'open advisor' }))
    expect(await screen.findByRole('dialog', { name: 'Finance Assistant' })).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: /close assistant/i }))
    await waitFor(() => expect(popup()).not.toBeInTheDocument())
  })

  it('closes on Escape', async () => {
    renderPopup()
    await userEvent.click(screen.getByRole('button', { name: 'open advisor' }))
    await screen.findByRole('dialog', { name: 'Finance Assistant' })

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(popup()).not.toBeInTheDocument())
  })

  it('keeps the conversation when closed and reopened', async () => {
    renderPopup()
    await userEvent.click(screen.getByRole('button', { name: 'open advisor' }))

    const input = await screen.findByLabelText(/ask about your finances/i)
    await waitFor(() => expect(input).not.toBeDisabled())
    await userEvent.type(input, 'What did I spend?{Enter}')
    await screen.findByText('Two thousand euro.')

    await userEvent.click(screen.getByRole('button', { name: /close assistant/i }))
    await waitFor(() => expect(popup()).not.toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'open advisor' }))

    expect(await screen.findByText('Two thousand euro.')).toBeVisible()
    expect(aiChatApi.streamChat).toHaveBeenCalledTimes(1)
  })
})
