/**
 * Shared reading of "is this bank connection healthy?".
 *
 * Lives apart from BankSyncPage because the Connections page is not the only
 * place that has to know: a consent can lapse on any day, and a user who never
 * opens that page would otherwise just see their transactions quietly stop
 * arriving. The dashboard uses the same helpers to raise the alarm.
 */
import type { BankConnection, ConnectionStatus } from './bankSyncApi'

/** Whole days from now until `value`; negative once it is in the past. */
export function daysUntil(value: string | null): number | null {
  if (!value) return null
  const ms = new Date(value).getTime() - Date.now()
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

/** Statuses that only a fresh authorisation at the bank can clear. */
export const NEEDS_REAUTH: ConnectionStatus[] = ['expired', 'revoked', 'error']

export function needsReauth(connection: BankConnection): boolean {
  return NEEDS_REAUTH.includes(connection.status)
}

export type ConnectionNotice =
  | 'premature'
  | 'expired'
  | 'revoked'
  | 'error'
  | 'expiring'

/** How many days out an upcoming expiry starts being worth mentioning. */
export const EXPIRY_WARNING_DAYS = 7

/**
 * Which warning a connection deserves, or null when it is healthy.
 *
 * `premature` is the case Enable Banking documents as EXPIRED_SESSION: the bank
 * can drop a session well before the `valid_until` we agreed — a second
 * authorisation for the same customer, a KYC prompt, a certificate rotation on
 * their side. The consent date still reads as in the future, so without calling
 * it out separately the notice contradicts the date shown right next to it.
 */
export function noticeKind(connection: BankConnection): ConnectionNotice | null {
  const expiresIn = daysUntil(connection.consent_valid_until)

  if (connection.status === 'expired') {
    return expiresIn !== null && expiresIn > 0 ? 'premature' : 'expired'
  }
  if (connection.status === 'revoked') return 'revoked'
  if (connection.status === 'error') return 'error'
  if (
    connection.status === 'active' &&
    expiresIn !== null &&
    expiresIn <= EXPIRY_WARNING_DAYS
  ) {
    return 'expiring'
  }
  return null
}
