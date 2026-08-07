import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../lib/queryKeys'
import * as scenariosApi from './scenariosApi'
import type {
  ListScenariosParams,
  ScenarioCreateInput,
  ScenarioPatchInput,
  ScenarioSpecIn,
} from './scenariosApi'

/** Preview never persists, so nothing to cache — it's a plain mutation the caller drives by hand. */
export function usePreviewScenario() {
  return useMutation({
    mutationFn: (spec: ScenarioSpecIn) => scenariosApi.previewScenario(spec),
  })
}

export function useCreateScenario() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ScenarioCreateInput) => scenariosApi.createScenario(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scenarios'] }),
  })
}

export function useScenarios(filters?: ListScenariosParams) {
  return useQuery({
    queryKey: queryKeys.scenarios(filters),
    queryFn: () => scenariosApi.listScenarios(filters),
    staleTime: 60_000,
  })
}

export function useScenario(id: number | null) {
  return useQuery({
    queryKey: queryKeys.scenario(id ?? -1),
    queryFn: () => scenariosApi.getScenario(id as number),
    enabled: id != null,
  })
}

export function usePatchScenario() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: ScenarioPatchInput }) =>
      scenariosApi.patchScenario(id, input),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['scenarios'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.scenario(id) })
    },
  })
}

export function useDeleteScenario() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => scenariosApi.deleteScenario(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scenarios'] }),
  })
}

export function useRebuildScenario() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => scenariosApi.rebuildScenario(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scenario(id) })
      queryClient.invalidateQueries({ queryKey: ['scenarios'] })
    },
  })
}

export function useTrackRecord() {
  return useQuery({
    queryKey: queryKeys.scenarioTrackRecord,
    queryFn: scenariosApi.getTrackRecord,
    staleTime: 60_000,
  })
}
