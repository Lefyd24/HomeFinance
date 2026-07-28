/**
 * Report filter state, mirrored into the URL.
 *
 * Keeping range/accounts/categories/tab in the query string means a filtered
 * view can be bookmarked, reloaded, or pasted to someone else and come back
 * identical — which is what "save this view" actually needs to mean.
 */
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ReportParams } from './reportsPageApi'

export const RANGE_PRESETS = [
  { key: 'mtd', label: 'Month to date' },
  { key: '30d', label: 'Last 30 days' },
  { key: '3m', label: 'Last 3 months' },
  { key: '6m', label: 'Last 6 months' },
  { key: 'ytd', label: 'Year to date' },
  { key: '1y', label: 'Last 12 months' },
  { key: 'custom', label: 'Custom' },
] as const

export type RangeKey = (typeof RANGE_PRESETS)[number]['key']

const DEFAULT_RANGE: RangeKey = '6m'

function iso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function computeRange(range: RangeKey, today = new Date()): { start: string; end: string } {
  const end = iso(today)
  const y = today.getFullYear()
  const m = today.getMonth()
  const d = today.getDate()

  switch (range) {
    case 'mtd':
      return { start: iso(new Date(y, m, 1)), end }
    case '30d':
      return { start: iso(new Date(y, m, d - 30)), end }
    case '3m':
      return { start: iso(new Date(y, m - 3, d)), end }
    case '6m':
      return { start: iso(new Date(y, m - 6, d)), end }
    case 'ytd':
      return { start: iso(new Date(y, 0, 1)), end }
    case '1y':
      return { start: iso(new Date(y - 1, m, d)), end }
    default:
      return { start: iso(new Date(y, m - 6, d)), end }
  }
}

/**
 * The equivalent window immediately before the current one, so every headline
 * number can be stated as a change rather than a bare total.
 */
export function previousPeriod(params: ReportParams): ReportParams {
  const start = new Date(params.start_date)
  const end = new Date(params.end_date)
  const spanDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000))

  const prevEnd = new Date(start)
  prevEnd.setDate(prevEnd.getDate() - 1)
  const prevStart = new Date(prevEnd)
  prevStart.setDate(prevStart.getDate() - spanDays)

  return { ...params, start_date: iso(prevStart), end_date: iso(prevEnd) }
}

function parseIds(value: string | null): number[] {
  if (!value) return []
  return value
    .split(',')
    .map((part) => Number(part))
    .filter((n) => Number.isInteger(n) && n > 0)
}

export interface ReportFilters {
  range: RangeKey
  startDate: string
  endDate: string
  accountIds: number[]
  categoryIds: number[]
  tab: string
  params: ReportParams
  /** True when anything narrows the data beyond the date window. */
  hasDimensionFilters: boolean
  setRange: (range: RangeKey) => void
  setCustomDates: (start: string, end: string) => void
  toggleAccount: (id: number) => void
  toggleCategory: (id: number) => void
  clearAccounts: () => void
  clearCategories: () => void
  setTab: (tab: string) => void
  reset: () => void
}

export function useReportFilters(defaultTab = 'overview'): ReportFilters {
  const [searchParams, setSearchParams] = useSearchParams()

  const range = (searchParams.get('range') as RangeKey | null) ?? DEFAULT_RANGE
  const tab = searchParams.get('tab') ?? defaultTab

  // Keep the raw strings around: they are what the query params compare by, so
  // memoising on them avoids a fresh array identity on every render.
  const accountsParam = searchParams.get('accounts') ?? ''
  const categoriesParam = searchParams.get('categories') ?? ''
  const accountIds = useMemo(() => parseIds(accountsParam), [accountsParam])
  const categoryIds = useMemo(() => parseIds(categoriesParam), [categoriesParam])

  const computed = computeRange(range === 'custom' ? DEFAULT_RANGE : range)
  const startDate = range === 'custom' ? (searchParams.get('from') ?? computed.start) : computed.start
  const endDate = range === 'custom' ? (searchParams.get('to') ?? computed.end) : computed.end

  const update = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          mutate(next)
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const toggleId = useCallback(
    (key: 'accounts' | 'categories', id: number) => {
      update((next) => {
        const current = parseIds(next.get(key))
        const updated = current.includes(id)
          ? current.filter((value) => value !== id)
          : [...current, id]
        if (updated.length) next.set(key, updated.join(','))
        else next.delete(key)
      })
    },
    [update],
  )

  const params = useMemo<ReportParams>(
    () => ({
      start_date: startDate,
      end_date: endDate,
      ...(accountsParam ? { account_ids: accountsParam } : {}),
      ...(categoriesParam ? { category_ids: categoriesParam } : {}),
    }),
    [startDate, endDate, accountsParam, categoriesParam],
  )

  return {
    range,
    startDate,
    endDate,
    accountIds,
    categoryIds,
    tab,
    params,
    hasDimensionFilters: accountIds.length > 0 || categoryIds.length > 0,
    setRange: (next) =>
      update((search) => {
        search.set('range', next)
        if (next !== 'custom') {
          search.delete('from')
          search.delete('to')
        } else {
          search.set('from', startDate)
          search.set('to', endDate)
        }
      }),
    setCustomDates: (start, end) =>
      update((search) => {
        search.set('range', 'custom')
        search.set('from', start)
        search.set('to', end)
      }),
    toggleAccount: (id) => toggleId('accounts', id),
    toggleCategory: (id) => toggleId('categories', id),
    clearAccounts: () => update((search) => search.delete('accounts')),
    clearCategories: () => update((search) => search.delete('categories')),
    setTab: (next) => update((search) => search.set('tab', next)),
    reset: () =>
      update((search) => {
        search.delete('accounts')
        search.delete('categories')
        search.delete('from')
        search.delete('to')
        search.set('range', DEFAULT_RANGE)
      }),
  }
}
