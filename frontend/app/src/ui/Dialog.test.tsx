import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dialog } from './Dialog'

describe('Dialog', () => {
  it('renders title and children when open, and closes on request', async () => {
    const onOpenChange = vi.fn()
    render(
      <Dialog open title="Add account" onOpenChange={onOpenChange}>
        <p>Form goes here</p>
      </Dialog>,
    )
    expect(screen.getByRole('heading', { name: 'Add account' })).toBeInTheDocument()
    expect(screen.getByText('Form goes here')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('renders nothing when closed', () => {
    render(
      <Dialog open={false} title="Add account" onOpenChange={() => {}}>
        <p>Hidden</p>
      </Dialog>,
    )
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument()
  })
})
