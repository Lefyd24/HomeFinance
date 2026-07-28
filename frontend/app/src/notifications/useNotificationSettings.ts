import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as notificationsApi from './notificationsApi'
import type { NotificationRuleInput, NotificationSettingsUpdate } from './notificationsApi'

const keys = {
  settings: ['notifications', 'settings'] as const,
  rules: ['notifications', 'rules'] as const,
  pushStatus: ['notifications', 'push-status'] as const,
}

export function useNotificationSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: notificationsApi.getSettings })
}

export function useNotificationRules() {
  return useQuery({ queryKey: keys.rules, queryFn: notificationsApi.listRules })
}

export function usePushStatus() {
  return useQuery({ queryKey: keys.pushStatus, queryFn: notificationsApi.getPushStatus })
}

export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: NotificationSettingsUpdate) => notificationsApi.updateSettings(payload),
    onSuccess: (data) => queryClient.setQueryData(keys.settings, data),
  })
}

export function useCreateNotificationRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: NotificationRuleInput) => notificationsApi.createRule(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.rules }),
  })
}

export function useUpdateNotificationRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<NotificationRuleInput> }) =>
      notificationsApi.updateRule(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.rules }),
  })
}

export function useDeleteNotificationRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => notificationsApi.deleteRule(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.rules }),
  })
}
