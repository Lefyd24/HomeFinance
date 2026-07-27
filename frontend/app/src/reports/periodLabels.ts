/**
 * The API returns period keys in whatever shape the grouping produced
 * (`2026-03`, `2026-03-14`, `2026-W11`, `2026`). Axes should show the human
 * form of those, not the raw key.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatPeriodLabel(period: string): string {
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(period)
  if (monthMatch) {
    const month = MONTHS[Number(monthMatch[2]) - 1] ?? monthMatch[2]
    return `${month} ${monthMatch[1].slice(2)}`
  }

  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(period)
  if (dayMatch) {
    const month = MONTHS[Number(dayMatch[2]) - 1] ?? dayMatch[2]
    return `${Number(dayMatch[3])} ${month}`
  }

  const weekMatch = /^(\d{4})-W?(\d{1,2})$/.exec(period)
  if (weekMatch) return `W${Number(weekMatch[2])} ${weekMatch[1].slice(2)}`

  return period
}
