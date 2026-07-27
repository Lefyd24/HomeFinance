const formatters = new Map<string, Intl.NumberFormat>()

function getFormatter(currency: string): Intl.NumberFormat {
  const key = currency.toUpperCase()
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: key,
      currencyDisplay: 'symbol',
    })
    formatters.set(key, formatter)
  }
  return formatter
}

/** German/EU style: `1.200,00 €` (symbol after the amount). */
export function formatCurrency(amount: number, currency = 'EUR'): string {
  // Intl uses a narrow/no-break space before the symbol; normalize to a regular space.
  return getFormatter(currency).format(amount).replace(/\u00a0|\u202f/g, ' ')
}

export function formatDate(value: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('el-GR', options ?? { day: '2-digit', month: 'short', year: 'numeric' }).format(
    date,
  )
}

export function formatSignedCurrency(amount: number, type: 'income' | 'expense' | 'transfer', currency = 'EUR') {
  const formatted = formatCurrency(amount, currency)
  if (type === 'income') return `+${formatted}`
  if (type === 'expense') return `−${formatted}`
  return formatted
}

/** First/last day of current calendar month as YYYY-MM-DD. */
export function currentMonthRange(now = new Date()): { start_date: string; end_date: string } {
  const y = now.getFullYear()
  const m = now.getMonth()
  const start = new Date(y, m, 1)
  const end = new Date(y, m + 1, 0)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { start_date: iso(start), end_date: iso(end) }
}

export function rangeForPreset(preset: '1M' | '3M' | '6M' | '1Y', now = new Date()) {
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const months = preset === '1M' ? 1 : preset === '3M' ? 3 : preset === '6M' ? 6 : 12
  const start = new Date(end.getFullYear(), end.getMonth() - (months - 1), 1)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { start_date: iso(start), end_date: iso(end) }
}

export const currencyFormatter = {
  format: (amount: number) => formatCurrency(amount),
}
