import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as categoriesApi from './categoriesApi'
import { CategoriesPage } from './CategoriesPage'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <CategoriesPage />
    </QueryClientProvider>,
  )
}

describe('CategoriesPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lists categories grouped by type', async () => {
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([
      {
        id: 1,
        user_id: 1,
        name: 'Groceries',
        type: 'expense',
        color: '#3B82F6',
        icon: null,
        parent_id: null,
        is_system: false,
        created_at: '',
      },
      {
        id: 2,
        user_id: 1,
        name: 'Salary',
        type: 'income',
        color: '#22C55E',
        icon: null,
        parent_id: null,
        is_system: false,
        created_at: '',
      },
    ])

    renderPage()

    expect(await screen.findByText('Groceries')).toBeInTheDocument()
    expect(screen.getByText('Salary')).toBeInTheDocument()
  })
})
