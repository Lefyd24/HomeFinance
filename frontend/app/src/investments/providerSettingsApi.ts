import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/apiClient'
import type { InvestmentProvider } from './investmentsApi'

/**
 * The per-provider fee schedule the user can override.
 *
 * Every figure is nullable: `null` means "not set — inferred from the broker's
 * own sync data", which is usually good enough and always what an untouched
 * form submits.
 */
export interface ProviderSettings {
  provider: InvestmentProvider
  commission_fixed: number | null
  commission_pct: number | null
  deposit_fee_fixed: number | null
  deposit_fee_pct: number | null
  withdrawal_fee_fixed: number | null
  withdrawal_fee_pct: number | null
}

/** The PUT body — the same fields without `provider`, which is in the URL. */
export type ProviderSettingsInput = Omit<ProviderSettings, 'provider'>

export function listProviderSettings(): Promise<ProviderSettings[]> {
  return apiFetch<ProviderSettings[]>('/investments/provider-settings')
}

export function updateProviderSettings(
  provider: InvestmentProvider,
  input: ProviderSettingsInput,
): Promise<ProviderSettings> {
  return apiFetch<ProviderSettings>(`/investments/provider-settings/${provider}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export const providerSettingsQueryKey = ['investmentProviderSettings'] as const

/** `enabled` keeps card menus from fetching the schedule until a dialog opens. */
export function useProviderSettings(enabled = true) {
  return useQuery({
    queryKey: providerSettingsQueryKey,
    queryFn: listProviderSettings,
    enabled,
    staleTime: 60_000,
  })
}

export function useUpdateProviderSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ provider, input }: { provider: InvestmentProvider; input: ProviderSettingsInput }) =>
      updateProviderSettings(provider, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: providerSettingsQueryKey })
      // Fee schedules feed every performance figure (estimated costs), so any
      // cached performance query is now stale. `queryKeys` has no single
      // performance key to hang this on, hence the predicate.
      queryClient.invalidateQueries({
        predicate: (query) => String(query.queryKey[0]).includes('performance'),
      })
    },
  })
}
