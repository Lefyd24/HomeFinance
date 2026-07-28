import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../lib/queryKeys'
import * as accountsApi from './accountsApi'
import type { AccountInput } from './accountsApi'

export function useAccounts() {
  return useQuery({ queryKey: queryKeys.accounts, queryFn: accountsApi.listAccounts })
}

export function useCreateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AccountInput) => accountsApi.createAccount(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
  })
}

export function useUpdateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<AccountInput> }) =>
      accountsApi.updateAccount(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
  })
}

export function useDeleteAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => accountsApi.deleteAccount(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
  })
}
