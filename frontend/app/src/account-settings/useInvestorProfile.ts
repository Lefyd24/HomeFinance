import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { queryKeys } from '../lib/queryKeys'
import * as api from './investorProfileApi'

export function useInvestorProfile() {
  return useQuery({
    queryKey: queryKeys.investorProfile,
    queryFn: api.getInvestorProfile,
  })
}

export function useInvestorProfileOptions() {
  return useQuery({
    queryKey: queryKeys.investorProfileOptions,
    queryFn: api.getInvestorProfileOptions,
    // Enum values only change with a deploy.
    staleTime: Infinity,
  })
}

export function useInvestorProfileRevisions() {
  return useQuery({
    queryKey: queryKeys.investorProfileRevisions,
    queryFn: () => api.getInvestorProfileRevisions(),
  })
}

/** Invalidate everything a profile write can change — the profile and its history. */
function useProfileInvalidation() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.investorProfile })
    void queryClient.invalidateQueries({ queryKey: queryKeys.investorProfileRevisions })
  }
}

export function useUpdateInvestorProfile() {
  const invalidate = useProfileInvalidation()
  return useMutation({
    mutationFn: (body: api.InvestorProfileUpdate) => api.updateInvestorProfile(body),
    onSuccess: invalidate,
  })
}

export function useUndoInvestorProfileRevision() {
  const invalidate = useProfileInvalidation()
  return useMutation({
    mutationFn: (revisionId: number) => api.undoInvestorProfileRevision(revisionId),
    onSuccess: invalidate,
  })
}
