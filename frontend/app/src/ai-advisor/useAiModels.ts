import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getModels, refreshModels } from './aiChatApi'

export const AI_MODELS_KEY = ['ai', 'models'] as const

/** The tool-capable model catalogue. The server caches it for a day, so an hour here is plenty. */
export function useAiModels(enabled = true) {
  return useQuery({
    queryKey: AI_MODELS_KEY,
    queryFn: getModels,
    staleTime: 60 * 60 * 1000,
    enabled,
  })
}

export function useRefreshAiModels() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: refreshModels,
    onSuccess: (data) => client.setQueryData(AI_MODELS_KEY, data),
  })
}
