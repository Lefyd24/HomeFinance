import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../lib/queryKeys'
import * as trackersApi from './trackersApi'
import type { TrackerInput, TrackerTransactionInput, TrackerUpdateInput } from './trackersApi'

export function useTrackers(activeOnly = false) {
  return useQuery({
    queryKey: [...queryKeys.trackers, activeOnly ? 'active' : 'all'] as const,
    queryFn: () => trackersApi.listTrackers(activeOnly),
  })
}

export function useTrackerTransactions(trackerId: number | null) {
  return useQuery({
    queryKey: [...queryKeys.trackers, trackerId, 'transactions'] as const,
    queryFn: () => trackersApi.listTrackerTransactions(trackerId!),
    enabled: trackerId != null,
  })
}

export function useCreateTracker() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: TrackerInput) => trackersApi.createTracker(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.trackers }),
  })
}

export function useUpdateTracker() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: TrackerUpdateInput }) =>
      trackersApi.updateTracker(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.trackers }),
  })
}

export function useDeleteTracker() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => trackersApi.deleteTracker(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.trackers }),
  })
}

export function useAddTrackerTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: TrackerTransactionInput }) =>
      trackersApi.addTrackerTransaction(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trackers })
      // A real transaction was created, so the ledger and account balances moved.
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts })
    },
  })
}

export function useRemoveTrackerTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, transactionId }: { id: number; transactionId: number }) =>
      trackersApi.removeTrackerTransaction(id, transactionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trackers })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}
