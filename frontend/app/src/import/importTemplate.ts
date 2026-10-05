export const IMPORT_TEMPLATE_FILENAME = 'home-finance-import-template.csv'

/**
 * Negative = money out, positive = money in — the parser's default sign convention.
 * Dates are ISO, so the template imports with the "year first" date format.
 */
export const IMPORT_TEMPLATE_CSV =
  [
    'date,description,amount',
    '2026-01-05,Salary,1500.00',
    '2026-01-06,Supermarket,-42.30',
    '2026-01-07,Electricity bill,-61.15',
  ].join('\n') + '\n'

export function downloadImportTemplate(): void {
  const blob = new Blob([IMPORT_TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = IMPORT_TEMPLATE_FILENAME
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
