const currencyFormatters = new Map<string, Intl.NumberFormat>()
const currencySupport = new Map<string, boolean>()

const decimalFormatter = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function normalizeCurrencySpacing(value: string): string {
  // Intl uses a narrow/no-break space before the symbol; normalize to a regular space.
  return value.replace(/\u00a0|\u202f/g, ' ')
}

function isSupportedCurrency(currency: string): boolean {
  const cached = currencySupport.get(currency)
  if (cached !== undefined) return cached

  let supported = false
  if (/^[A-Z]{3}$/.test(currency)) {
    try {
      new Intl.NumberFormat('de-DE', { style: 'currency', currency })
      supported = true
    } catch {
      supported = false
    }
  }

  currencySupport.set(currency, supported)
  return supported
}

function getCurrencyFormatter(currency: string): Intl.NumberFormat {
  let formatter = currencyFormatters.get(currency)
  if (!formatter) {
    formatter = new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency,
      currencyDisplay: 'symbol',
    })
    currencyFormatters.set(currency, formatter)
  }
  return formatter
}

/** German/EU style: `1.200,00 €` (symbol after the amount). */
export function formatCurrency(amount: number, currency = 'EUR'): string {
  const key = (currency.trim() || 'EUR').toUpperCase()
  if (!isSupportedCurrency(key)) {
    return normalizeCurrencySpacing(`${decimalFormatter.format(amount)} ${key}`)
  }
  return normalizeCurrencySpacing(getCurrencyFormatter(key).format(amount))
}

export function formatDate(value: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('el-GR', options ?? { day: '2-digit', month: 'short', year: 'numeric' }).format(
    date,
  )
}

/** Masked stand-in for `formatCurrency`, in dot count roughly matching a real figure's width. */
const BALANCE_MASK = '*****'

/** `formatCurrency`, or a fixed-width mask when the caller is hiding balances. */
export function formatBalance(amount: number, currency: string | undefined, hidden: boolean): string {
  return hidden ? BALANCE_MASK : formatCurrency(amount, currency)
}

export function formatSignedCurrency(amount: number, type: 'income' | 'expense' | 'transfer', currency = 'EUR') {
  const formatted = formatCurrency(amount, currency)
  if (type === 'income') return `+${formatted}`
  if (type === 'expense') return `−${formatted}`
  return formatted
}

/**
 * A calendar date as YYYY-MM-DD, read off the *local* clock.
 *
 * Never use `toISOString().slice(0, 10)` for this. `new Date(y, m, d)` is
 * midnight local time, and `toISOString` converts to UTC before formatting, so
 * east of Greenwich every such date came out one day early — which is how the
 * month filters ended up starting on the last day of the previous month and
 * ending a day short. The bug is invisible in UTC, so it survived a long time.
 */
export function toLocalIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Today as YYYY-MM-DD on the user's own calendar. */
export function todayIsoDate(now = new Date()): string {
  return toLocalIsoDate(now)
}

/** First/last day of current calendar month as YYYY-MM-DD. */
export function currentMonthRange(now = new Date()): { start_date: string; end_date: string } {
  const y = now.getFullYear()
  const m = now.getMonth()
  // Day 0 of the next month is the last day of this one, so this is correct for
  // 28/29/30/31-day months alike without any length table.
  return {
    start_date: toLocalIsoDate(new Date(y, m, 1)),
    end_date: toLocalIsoDate(new Date(y, m + 1, 0)),
  }
}

export function rangeForPreset(preset: '1M' | '3M' | '6M' | '1Y', now = new Date()) {
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const months = preset === '1M' ? 1 : preset === '3M' ? 3 : preset === '6M' ? 6 : 12
  const start = new Date(end.getFullYear(), end.getMonth() - (months - 1), 1)
  return { start_date: toLocalIsoDate(start), end_date: toLocalIsoDate(end) }
}

export const currencyFormatter = {
  format: (amount: number) => formatCurrency(amount),
}
