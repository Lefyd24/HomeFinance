/**
 * Number formatting for the company research page.
 *
 * One module so precision is decided once: ratios 2dp, percentages 1dp, money
 * and large counts compact. Every helper tolerates null/undefined and the
 * non-finite values that slip out of ratio maths, rendering an em dash rather
 * than "NaN" — the backend already nulls these, this is the second line.
 */
import type { CSSProperties } from 'react'
import { formatCurrency } from '../../lib/format'

const DASH = '—'

/**
 * Recharts' `<Tooltip>` renders outside the component tree via a portal-free
 * absolutely-positioned div, so it does not pick up Tailwind's `bg-popover`
 * utilities — it needs literal CSS. Pinned to the theme tokens (not a fixed
 * white) so it stays legible in dark mode instead of defaulting to Recharts'
 * white-on-white-adjacent box.
 */
export const CHART_TOOLTIP_STYLE: CSSProperties = {
  background: 'var(--color-popover)',
  color: 'var(--color-popover-foreground)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-lg, 0.75rem)',
  fontSize: '0.75rem',
  padding: '0.5rem 0.625rem',
  boxShadow: '0 4px 16px rgb(0 0 0 / 0.12)',
}

export const CHART_TOOLTIP_LABEL_STYLE: CSSProperties = {
  color: 'var(--color-popover-foreground)',
  fontWeight: 600,
  marginBottom: '0.25rem',
}

export const CHART_TOOLTIP_ITEM_STYLE: CSSProperties = {
  color: 'var(--color-popover-foreground)',
}

function finite(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return value
}

export function fmtRatio(value: number | null | undefined): string {
  const n = finite(value)
  return n == null ? DASH : n.toFixed(2)
}

export function fmtPct(
  value: number | null | undefined,
  options: { decimals?: number; signed?: boolean } = {},
): string {
  const n = finite(value)
  if (n == null) return DASH
  const { decimals = 1, signed = false } = options
  // Intl's percent formatter (not a manual *100 + toFixed) sidesteps float
  // drift like -0.0715 * 100 === -7.149999999999999, which would otherwise
  // round the wrong way. Locale is pinned so output never depends on the
  // host's default locale (fails under a non-English OS/CI locale otherwise).
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: signed ? 'always' : 'auto',
  }).format(n)
}

export function fmtInt(value: number | null | undefined): string {
  const n = finite(value)
  return n == null ? DASH : Math.round(n).toLocaleString()
}

export function fmtCompactNumber(value: number | null | undefined): string {
  const n = finite(value)
  if (n == null) return DASH
  // Locale pinned to 'en-US' for the same reason as fmtPct — compact notation
  // (K/M/B) reads as digits-and-letters, not a translated word, under it.
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n)
}

export function fmtCompactMoney(
  value: number | null | undefined,
  currency: string,
): string {
  const n = finite(value)
  if (n == null) return DASH
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(n)
  } catch {
    return formatCurrency(n, currency)
  }
}

export function fmtMoney(value: number | null | undefined, currency: string): string {
  const n = finite(value)
  return n == null ? DASH : formatCurrency(n, currency)
}

/** Sign -> the app's existing flow colour tokens. Never introduce new colours. */
export function deltaClass(value: number | null | undefined): string {
  const n = finite(value)
  if (n == null || n === 0) return 'text-muted-foreground'
  return n > 0 ? 'text-flow-in' : 'text-flow-out'
}

/** Where `value` sits between `low` and `high`, 0-100. Null when unplottable. */
export function pctOfRange(
  value: number | null | undefined,
  low: number | null | undefined,
  high: number | null | undefined,
): number | null {
  const v = finite(value)
  const lo = finite(low)
  const hi = finite(high)
  if (v == null || lo == null || hi == null || hi <= lo) return null
  return Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100))
}
