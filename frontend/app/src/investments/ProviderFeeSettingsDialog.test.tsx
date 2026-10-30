import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ProviderFeeSettingsDialog } from './ProviderFeeSettingsDialog'

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }))

// The hooks live in the API module the dialog imports; replacing them keeps
// the test focused on the form's behaviour rather than on HTTP plumbing.
vi.mock('./providerSettingsApi', () => ({
  useProviderSettings: () => ({ data: undefined }),
  useUpdateProviderSettings: () => ({ mutateAsync, isPending: false }),
}))

function renderDialog(provider: 'freedom24' | 'binance' = 'freedom24') {
  return render(
    <ProviderFeeSettingsDialog open onOpenChange={() => {}} provider={provider} />,
  )
}

beforeEach(() => {
  mutateAsync.mockReset()
  mutateAsync.mockResolvedValue({})
})

describe('ProviderFeeSettingsDialog', () => {
  it('submits empty fields as null — not set, inferred from broker data', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(mutateAsync).toHaveBeenCalledTimes(1)
    expect(mutateAsync).toHaveBeenCalledWith({
      provider: 'freedom24',
      input: {
        commission_fixed: null,
        commission_pct: null,
        deposit_fee_fixed: null,
        deposit_fee_pct: null,
        withdrawal_fee_fixed: null,
        withdrawal_fee_pct: null,
      },
    })
  })

  it('rejects a percentage above 100 and makes no request', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.type(screen.getAllByLabelText('Percentage %')[0]!, '150')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(screen.getByText('Use a percentage between 0 and 100.')).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })
})
