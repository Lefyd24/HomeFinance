import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { ListCard } from '../ui/ListCard'
import { Select } from '../ui/Select'
import { formatCurrency, formatDate } from '../lib/format'
import type { Category } from '../categories/categoriesApi'
import type { ImportPreviewRow } from './importApi'

const NO_CATEGORY = 'none'

interface ImportPreviewRowsProps {
  rows: ImportPreviewRow[]
  categories: Category[]
  currency: string
  isIncluded: (row: ImportPreviewRow) => boolean
  categoryFor: (row: ImportPreviewRow) => number | null
  onToggle: (rowId: number, included: boolean) => void
  onCategoryChange: (rowId: number, categoryId: number | null) => void
}

export function ImportPreviewRows({
  rows,
  categories,
  currency,
  isIncluded,
  categoryFor,
  onToggle,
  onCategoryChange,
}: ImportPreviewRowsProps) {
  const { t } = useTranslation('import')
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => {
        const included = isIncluded(row)
        const categoryId = categoryFor(row)
        const options = [
          { value: NO_CATEGORY, label: t('review.noCategory') },
          ...categories
            .filter((c) => c.type === row.type)
            .map((c) => ({ value: String(c.id), label: c.name })),
        ]
        return (
          <ListCard
            key={row.id}
            className={cn('flex flex-col gap-2 py-3 sm:flex-row sm:items-center', !included && 'opacity-60')}
          >
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <Checkbox
                className="mt-1"
                checked={included}
                onCheckedChange={(value) => onToggle(row.id, value === true)}
                aria-label={t('review.include', { description: row.description })}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-foreground">{row.description}</p>
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {formatDate(row.date)}
                  {row.is_duplicate && <Badge variant="outline">{t('review.duplicateBadge')}</Badge>}
                </p>
              </div>
              <span
                className={cn(
                  'tabular-nums shrink-0',
                  row.amount < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400',
                )}
              >
                {formatCurrency(row.amount, currency)}
              </span>
            </div>
            <div className="pl-7 sm:pl-0 sm:w-56">
              <Select
                value={categoryId == null ? NO_CATEGORY : String(categoryId)}
                onValueChange={(value) => onCategoryChange(row.id, value === NO_CATEGORY ? null : Number(value))}
                options={options}
                placeholder={t('review.category')}
                disabled={!included}
              />
            </div>
          </ListCard>
        )
      })}
    </ul>
  )
}
