/**
 * Number and time formatters for the advisor's cost and model UI.
 *
 * They follow the app's current i18n language rather than a hard-coded locale,
 * so a switch to Greek moves the decimal comma along with the labels.
 */
import i18n from '../i18n/config'

function locale(): string {
  return (i18n.resolvedLanguage ?? i18n.language ?? 'en').slice(0, 2)
}

/** 1234 -> "1.2k", 980 -> "980", 1_000_000 -> "1M" (locale decimal separator). */
export function formatTokens(count: number): string {
  if (count < 1000) return String(count)
  if (count >= 1_000_000) {
    const millions = count / 1_000_000
    return `${millions.toLocaleString(locale(), { maximumFractionDigits: millions < 10 ? 1 : 0 })}M`
  }
  const thousands = count / 1000
  return `${thousands.toLocaleString(locale(), { maximumFractionDigits: thousands < 10 ? 1 : 0 })}k`
}

/** Model costs are often fractions of a cent: keep two significant digits below a cent. */
export function formatUsd(amount: number): string {
  if (amount === 0) return '$0'
  if (amount < 0.01) return `$${amount.toLocaleString(locale(), { maximumSignificantDigits: 2 })}`
  return `$${amount.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toLocaleString(locale(), { maximumFractionDigits: 1 })} s`
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
}

/** "google/gemini-2.5-flash" -> "gemini-2.5-flash". */
export const shortModel = (id: string): string => id.split('/').at(-1) ?? id

/** "$0.30 / $2.50" for a model's input/output price per 1M tokens, or null when unknown. */
export function formatPrice(input: number | null, output: number | null): string | null {
  if (input === null || output === null) return null
  const f = (value: number) => `$${value.toLocaleString(locale(), { maximumFractionDigits: 2 })}`
  return `${f(input)} / ${f(output)}`
}

/** "3 hours ago" / "πριν από 3 ώρες" for an ISO timestamp. */
export function formatAgo(iso: string, now = Date.now()): string {
  const minutes = Math.round((new Date(iso).getTime() - now) / 60_000)
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' })
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute')
  if (Math.abs(minutes) < 24 * 60) return rtf.format(Math.round(minutes / 60), 'hour')
  return rtf.format(Math.round(minutes / (24 * 60)), 'day')
}
