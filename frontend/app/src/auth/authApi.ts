import { apiFetch } from '../lib/apiClient'

export interface Token {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface User {
  id: number
  email: string
  full_name: string | null
  is_active: boolean
  is_admin: boolean
  email_verified: boolean
  created_at: string
}

export interface RegisterInput {
  email: string
  password: string
  full_name?: string
  invite_code: string
}

export async function login(email: string, password: string): Promise<Token> {
  return apiFetch<Token>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
  })
}

export async function register(input: RegisterInput): Promise<User> {
  return apiFetch<User>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function getMe(): Promise<User> {
  return apiFetch<User>('/auth/me')
}

export async function refresh(refreshToken: string): Promise<Token> {
  return apiFetch<Token>(`/auth/refresh?refresh_token=${encodeURIComponent(refreshToken)}`, {
    method: 'POST',
  })
}

export async function logout(): Promise<void> {
  await apiFetch<void>('/auth/logout', { method: 'POST' })
}

export async function forgotPassword(email: string): Promise<void> {
  await apiFetch<void>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await apiFetch<void>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, new_password: newPassword }),
  })
}

export async function verifyEmail(token: string): Promise<void> {
  await apiFetch<void>('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
  })
}

export async function resendVerification(email: string): Promise<void> {
  await apiFetch<void>('/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}
