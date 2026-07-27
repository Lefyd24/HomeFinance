import { apiFetch } from '../lib/apiClient'

export interface NotificationLogEntry {
  id: number
  user_id: number
  dedupe_key: string
  type: string
  title: string
  body: string | null
  channels_sent: string | null
  created_at: string
}

export function getNotificationLog(): Promise<NotificationLogEntry[]> {
  return apiFetch<NotificationLogEntry[]>('/notifications/log')
}
