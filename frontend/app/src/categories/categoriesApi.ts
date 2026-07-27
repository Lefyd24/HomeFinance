import { apiFetch } from '../lib/apiClient'

export type CategoryType = 'income' | 'expense' | 'transfer'

export interface Category {
  id: number
  user_id: number | null
  name: string
  type: CategoryType
  color: string
  icon: string | null
  parent_id: number | null
  is_system: boolean
  created_at: string
}

export interface CategoryInput {
  name: string
  type: CategoryType
  color?: string
  icon?: string | null
  parent_id?: number | null
}

export function listCategories(): Promise<Category[]> {
  return apiFetch<Category[]>('/categories/')
}

export function createCategory(input: CategoryInput): Promise<Category> {
  return apiFetch<Category>('/categories/', { method: 'POST', body: JSON.stringify(input) })
}

export function updateCategory(id: number, input: Partial<CategoryInput>): Promise<Category> {
  return apiFetch<Category>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(input) })
}

export function deleteCategory(id: number): Promise<void> {
  return apiFetch<void>(`/categories/${id}`, { method: 'DELETE' })
}
