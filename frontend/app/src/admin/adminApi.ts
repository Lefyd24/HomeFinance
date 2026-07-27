import { apiFetch } from '../lib/apiClient'

export interface AdminUser {
  id: number
  email: string
  full_name: string | null
  is_active: boolean
  is_admin: boolean
  email_verified: boolean
  created_at: string
}

export interface InviteCode {
  id: number
  label: string | null
  created_by_user_id: number
  expires_at: string | null
  used_at: string | null
  used_by_user_id: number | null
  revoked_at: string | null
  created_at: string
  status: string
}

export function listUsers(): Promise<AdminUser[]> {
  return apiFetch<AdminUser[]>('/admin/users')
}

export function listInvites(): Promise<InviteCode[]> {
  return apiFetch<InviteCode[]>('/admin/invites')
}
