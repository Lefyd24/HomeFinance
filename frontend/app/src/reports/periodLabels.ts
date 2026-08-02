import type { TFunction } from 'i18next'

const MONTH_KEYS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const

function monthLabel(t: TFunction<'reports'>, monthIndex: number): string {
  const key = MONTH_KEYS[monthIndex - 1]
  return key ? t(`months.${key}`) : String(monthIndex)
}

/**
 * The API returns period keys in whatever shape the grouping produced
 * (`2026-03`, `2026-03-14`, `2026-W11`, `2026`). Axes should show the human
 * form of those, not the raw key.
 */
export function formatPeriodLabel(period: string, t: TFunction<'reports'>): string {
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(period)
  if (monthMatch) {
    const month = monthLabel(t, Number(monthMatch[2]))
    return t('periodLabel.monthYear', { month, year: monthMatch[1].slice(2) })
  }

  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(period)
  if (dayMatch) {
    const month = monthLabel(t, Number(dayMatch[2]))
    return t('periodLabel.monthDay', { day: Number(dayMatch[3]), month })
  }

  const weekMatch = /^(\d{4})-W?(\d{1,2})$/.exec(period)
  if (weekMatch) {
    return t('periodLabel.week', { week: Number(weekMatch[2]), year: weekMatch[1].slice(2) })
  }

  return period
}
