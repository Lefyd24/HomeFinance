import { apiFetch } from '../lib/apiClient'

export interface AdminUser {
  id: number
  email: string
  full_name: string | null
  is_active: boolean
  is_admin: boolean
  email_verified: boolean
  created_at: string
  last_login_at: string | null
}

export interface InviteCode {
  id: number
  label: string | null
  created_by_user_id: number
  expires_at: string | null
  used_at: string | null
  used_by_user_id: number | null
  used_by_email: string | null
  revoked_at: string | null
  created_at: string
  status: string
}

export interface InviteCodeCreateInput {
  label?: string | null
  expires_in_days?: number | null
}

export interface InviteCodeCreated {
  code: string
  label: string | null
  expires_at: string | null
}

export function listUsers(): Promise<AdminUser[]> {
  return apiFetch<AdminUser[]>('/admin/users')
}

export function listInvites(): Promise<InviteCode[]> {
  return apiFetch<InviteCode[]>('/admin/invites')
}

export function createInvite(input: InviteCodeCreateInput): Promise<InviteCodeCreated> {
  return apiFetch<InviteCodeCreated>('/admin/invites', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function revokeInvite(id: number): Promise<InviteCode> {
  return apiFetch<InviteCode>(`/admin/invites/${id}/revoke`, { method: 'POST' })
}

export function setUserActive(id: number, isActive: boolean): Promise<AdminUser> {
  return apiFetch<AdminUser>(`/admin/users/${id}/active`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: isActive }),
  })
}

export function deleteInvite(id: number): Promise<void> {
  return apiFetch<void>(`/admin/invites/${id}`, { method: 'DELETE' })
}
