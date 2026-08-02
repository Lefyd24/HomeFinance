import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../lib/queryKeys'
import * as bankSyncApi from './bankSyncApi'

export function useBankConnections() {
  return useQuery({
    queryKey: queryKeys.bankConnections,
    queryFn: bankSyncApi.listConnections,
  })
}

export function useInstitutions(country: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.bankInstitutions(country),
    queryFn: () => bankSyncApi.listInstitutions(country),
    enabled,
    // The bank directory barely changes and the request is comparatively slow.
    staleTime: 1000 * 60 * 60,
  })
}

export function useStartConnection() {
  return useMutation({
    mutationFn: bankSyncApi.startConnection,
  })
}

export function useSyncConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => bankSyncApi.syncConnection(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bankConnections })
      // A sync rewrites balances and adds transactions, so anything showing
      // either is now stale.
      void queryClient.invalidateQueries({ queryKey: queryKeys.accounts })
      void queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

export function useDeleteConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, deleteAccounts }: { id: number; deleteAccounts: boolean }) =>
      bankSyncApi.deleteConnection(id, deleteAccounts),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bankConnections })
      void queryClient.invalidateQueries({ queryKey: queryKeys.accounts })
      void queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

export function useUnlinkAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ accountId, deleteAccount }: { accountId: number; deleteAccount: boolean }) =>
      bankSyncApi.unlinkAccount(accountId, deleteAccount),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bankConnections })
      void queryClient.invalidateQueries({ queryKey: queryKeys.accounts })
      void queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}
