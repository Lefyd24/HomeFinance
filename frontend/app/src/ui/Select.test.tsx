import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Select } from './Select'

describe('Select', () => {
  it(
    'shows the selected value and calls onValueChange when an option is picked',
    async () => {
      const user = userEvent.setup()
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

      await user.click(screen.getByRole('combobox'))
      const option = await screen.findByRole('option', { name: 'Savings' }, { timeout: 3000 })
      await user.click(option)

      expect(onValueChange).toHaveBeenCalledWith('savings')
    },
    10_000,
  )
})
