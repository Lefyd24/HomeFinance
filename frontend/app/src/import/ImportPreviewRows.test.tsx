import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImportPreviewRows } from './ImportPreviewRows'
import type { ImportPreviewRow } from './importApi'

function makeRows(count: number): ImportPreviewRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    line: i + 2,
    date: '2026-07-01',
    description: i === 29 ? 'Needle in haystack' : `Shop ${i + 1}`,
    amount: -(i + 1),
    type: 'expense' as const,
    category_id: null,
    is_duplicate: false,
  }))
}

function renderRows(rows: ImportPreviewRow[], onToggleMany = vi.fn()) {
  render(
    <ImportPreviewRows
      rows={rows}
      categories={[]}
      currency="EUR"
      isIncluded={() => true}
      categoryFor={() => null}
      onToggle={vi.fn()}
      onToggleMany={onToggleMany}
      onCategoryChange={vi.fn()}
    />,
  )
  return onToggleMany
}

describe('ImportPreviewRows', () => {
  it('shows one page of rows at a time and pages forward and back', async () => {
    renderRows(makeRows(30))
    expect(screen.getByText('1–25 of 30')).toBeInTheDocument()
    expect(screen.getByText('Shop 25')).toBeInTheDocument()
    expect(screen.queryByText('Shop 26')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText('26–30 of 30')).toBeInTheDocument()
    expect(screen.getByText('Shop 26')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: /previous/i }))
    expect(screen.getByText('1–25 of 30')).toBeInTheDocument()
  })

  it('filters across all pages and returns to page one', async () => {
    renderRows(makeRows(30))
    await userEvent.click(screen.getByRole('button', { name: /next/i }))
    await userEvent.type(screen.getByRole('searchbox', { name: /search rows/i }), 'needle')
    expect(screen.getByText('1–1 of 1')).toBeInTheDocument()
    expect(screen.getByText('Needle in haystack')).toBeInTheDocument()
    expect(screen.queryByText('Shop 1')).not.toBeInTheDocument()
  })

  it('says so when nothing matches', async () => {
    renderRows(makeRows(3))
    await userEvent.type(screen.getByRole('searchbox', { name: /search rows/i }), 'zzz')
    expect(screen.getByText(/no rows match/i)).toBeInTheDocument()
  })

  it('selects or clears every matching row, not just the visible page', async () => {
    const onToggleMany = renderRows(makeRows(30))
    // All rows are included, so the toolbar checkbox is checked; clicking it clears all 30.
    await userEvent.click(screen.getByRole('checkbox', { name: /select all rows/i }))
    expect(onToggleMany).toHaveBeenCalledWith(
      Array.from({ length: 30 }, (_, i) => i + 1),
      false,
    )
  })
})
