import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as importApi from './importApi'

export function useImportPreview(batchId: number | null, accountId: number | null, invertSigns: boolean) {
  return useQuery({
    queryKey: ['import-preview', batchId, accountId, invertSigns],
    queryFn: () =>
      importApi.getImportPreview(batchId as number, {
        accountId: accountId ?? undefined,
        invertSigns,
      }),
    enabled: batchId != null,
    // Keep the old rows on screen while switching account / sign so the list
    // doesn't flash empty.
    placeholderData: keepPreviousData,
  })
}

export function useConfirmImport() {
  const queryClient = useQueryClient()
  return useMutation({
    // Wrapped so TanStack's extra mutation-context argument never reaches the API call.
    mutationFn: (input: importApi.ConfirmImportInput) => importApi.confirmImport(input),
    // New transactions move balances, budgets, reports and the dashboard.
    onSuccess: () => queryClient.invalidateQueries(),
  })
}
