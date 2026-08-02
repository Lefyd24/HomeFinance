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

export interface NotificationSettings {
  email_enabled: boolean
  push_enabled: boolean
  default_days_before: number
  quiet_hours_start: number | null
  quiet_hours_end: number | null
  smtp_host: string | null
  smtp_port: number | null
  smtp_user: string | null
  smtp_from: string | null
  smtp_use_tls: boolean
  smtp_password_set: boolean
}

export interface NotificationSettingsUpdate {
  email_enabled?: boolean
  push_enabled?: boolean
  default_days_before?: number
  quiet_hours_start?: number | null
  quiet_hours_end?: number | null
  smtp_host?: string | null
  smtp_port?: number | null
  smtp_user?: string | null
  smtp_from?: string | null
  smtp_use_tls?: boolean
  smtp_password?: string
}

export type NotificationRuleType =
  | 'balance_below'
  | 'budget_percent'
  | 'scheduled_report'
  | 'investment_return_below'
  | 'investment_scheduled'
export type ScheduleKind = 'every_n_days' | 'weekly' | 'monthly'
export type ReportType = 'spending' | 'cashflow' | 'income'

export interface NotificationRule {
  id: number
  user_id: number
  type: NotificationRuleType
  name: string
  target_id: number | null
  threshold: number | null
  report_type: ReportType | null
  schedule_kind: ScheduleKind | null
  schedule_value: number | null
  channels: string
  is_active: boolean
  created_at: string
}

export interface NotificationRuleInput {
  type: NotificationRuleType
  name: string
  target_id?: number | null
  threshold?: number | null
  report_type?: ReportType | null
  schedule_kind?: ScheduleKind | null
  schedule_value?: number | null
  channels: string
  is_active: boolean
}

export interface PushStatus {
  vapid_configured: boolean
  push_enabled: boolean
  subscription_count: number
}

export interface TestNotificationResult {
  email: boolean
  push: boolean
  push_detail: string | null
  email_detail: string | null
}

export interface RunNotificationsResult {
  evaluated: number
  sent: number
  skipped_dedupe: number
  skipped_quiet: number
  failed: number
  pending: unknown[]
  message: string
}

export interface PushSubscriptionPayload {
  endpoint: string
  p256dh: string
  auth: string
  user_agent?: string
}

export function getSettings(): Promise<NotificationSettings> {
  return apiFetch<NotificationSettings>('/notifications/settings')
}

export function updateSettings(
  payload: NotificationSettingsUpdate,
): Promise<NotificationSettings> {
  return apiFetch<NotificationSettings>('/notifications/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function listRules(): Promise<NotificationRule[]> {
  return apiFetch<NotificationRule[]>('/notifications/rules')
}

export function createRule(payload: NotificationRuleInput): Promise<NotificationRule> {
  return apiFetch<NotificationRule>('/notifications/rules', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateRule(
  id: number,
  payload: Partial<NotificationRuleInput>,
): Promise<NotificationRule> {
  return apiFetch<NotificationRule>(`/notifications/rules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function deleteRule(id: number): Promise<void> {
  return apiFetch<void>(`/notifications/rules/${id}`, { method: 'DELETE' })
}

export function getVapidPublicKey(): Promise<{ key: string | null }> {
  return apiFetch<{ key: string | null }>('/notifications/push/vapid-public-key')
}

export function subscribePush(payload: PushSubscriptionPayload): Promise<void> {
  return apiFetch<void>('/notifications/push/subscribe', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function unsubscribePush(endpoint: string): Promise<void> {
  return apiFetch<void>('/notifications/push/unsubscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint }),
  })
}

export function getPushStatus(): Promise<PushStatus> {
  return apiFetch<PushStatus>('/notifications/push/status')
}

export function runNotificationsNow(): Promise<RunNotificationsResult> {
  return apiFetch<RunNotificationsResult>('/notifications/run', { method: 'POST' })
}

export function sendTestNotification(
  channel: 'email' | 'push' | 'all',
): Promise<TestNotificationResult> {
  return apiFetch<TestNotificationResult>('/notifications/test', {
    method: 'POST',
    body: JSON.stringify({ channel }),
  })
}
