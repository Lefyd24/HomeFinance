import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../lib/queryKeys'
import * as accountsApi from './accountsApi'
import type { AccountInput } from './accountsApi'

/**
 * Every account, active or not.
 *
 * This is the right hook for anything that *selects* an account — filters,
 * pickers, rule targets. A deactivated account still owns its transactions, so
 * hiding it from a filter would make that history unreachable, which is the
 * opposite of what deactivating is for.
 */
export function useAccounts() {
  return useQuery({ queryKey: queryKeys.accounts, queryFn: accountsApi.listAccounts })
}

/**
 * Only the accounts still in use.
 *
 * The right hook for anything that *describes* the current state of your money
 * — balances, totals, the dashboard. Derived from the same query, so it shares
 * one cache entry with `useAccounts` rather than issuing a second request.
 */
export function useActiveAccounts() {
  return useQuery({
    queryKey: queryKeys.accounts,
    queryFn: accountsApi.listAccounts,
    select: (accounts) => accounts.filter((account) => account.is_active),
  })
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

export function useSetAccountActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      accountsApi.setAccountActive(id, isActive),
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
