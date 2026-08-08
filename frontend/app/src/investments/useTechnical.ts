import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../lib/queryKeys'
import * as technicalApi from './technicalApi'
import type { DriftMode, SimulationModel, TechnicalPeriod } from './technicalApi'

export function useTechnical(symbol: string, period: TechnicalPeriod) {
  return useQuery({
    queryKey: queryKeys.investmentTechnical(symbol, period),
    queryFn: () => technicalApi.getTechnical(symbol, period),
    enabled: Boolean(symbol),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
  })
}

export function useSimulation(
  symbol: string,
  options: { horizon: number; model: SimulationModel; drift: DriftMode; paths?: number; targetPrice?: number | null },
) {
  const { horizon, model, drift, paths, targetPrice } = options
  return useQuery({
    queryKey: queryKeys.investmentSimulation(symbol, horizon, model, drift, targetPrice),
    queryFn: () => technicalApi.simulateTechnical(symbol, { horizon, model, drift, paths, targetPrice }),
    enabled: Boolean(symbol),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
  })
}
