import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../lib/queryKeys'
import * as categoriesApi from './categoriesApi'
import type { CategoryInput } from './categoriesApi'

export function useCategories() {
  return useQuery({ queryKey: queryKeys.categories, queryFn: categoriesApi.listCategories })
}

export function useCreateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CategoryInput) => categoriesApi.createCategory(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.categories }),
  })
}
