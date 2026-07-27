import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Select } from './Select'

describe('Select', () => {
  it('shows the selected value and calls onValueChange when an option is picked', async () => {
    const onValueChange = vi.fn()
    render(
      <Select
        value="checking"
        onValueChange={onValueChange}
        placeholder="Choose account type"
        options={[
          { value: 'checking', label: 'Checking' },
          { value: 'savings', label: 'Savings' },
        ]}
      />,
    )
    expect(screen.getByText('Checking')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(await screen.findByText('Savings'))

    expect(onValueChange).toHaveBeenCalledWith('savings')
  })
})
