import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { ListCard } from '../ui/ListCard'
import { Select } from '../ui/Select'
import { useMediaQuery } from '../ui/useMediaQuery'
import { formatCurrency, formatDate } from '../lib/format'
import type { Category } from '../categories/categoriesApi'
import type { ImportPreviewRow } from './importApi'

const NO_CATEGORY = 'none'
const PAGE_SIZES = [10, 25, 50, 100]
const DEFAULT_PAGE_SIZE = 25

interface ImportPreviewRowsProps {
  rows: ImportPreviewRow[]
  categories: Category[]
  currency: string
  isIncluded: (row: ImportPreviewRow) => boolean
  categoryFor: (row: ImportPreviewRow) => number | null
  onToggle: (rowId: number, included: boolean) => void
  onToggleMany: (rowIds: number[], included: boolean) => void
  onCategoryChange: (rowId: number, categoryId: number | null) => void
}

function matchesSearch(row: ImportPreviewRow, needle: string): boolean {
  if (!needle) return true
  const haystack = [row.description, row.date, formatDate(row.date), Math.abs(row.amount).toFixed(2)]
    .join(' ')
    .toLowerCase()
  return haystack.includes(needle)
}

export function ImportPreviewRows({
  rows,
  categories,
  currency,
  isIncluded,
  categoryFor,
  onToggle,
  onToggleMany,
  onCategoryChange,
}: ImportPreviewRowsProps) {
  const { t } = useTranslation('import')
  const isWide = useMediaQuery('(min-width: 640px)')
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [requestedPage, setRequestedPage] = useState(1)

  const needle = search.trim().toLowerCase()
  const filtered = useMemo(() => rows.filter((r) => matchesSearch(r, needle)), [rows, needle])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  // Rows can shrink under the user (search, flipping signs); never sit past the end.
  const page = Math.min(requestedPage, pageCount)
  const start = (page - 1) * pageSize
  const pageRows = filtered.slice(start, start + pageSize)

  const includedCount = filtered.filter(isIncluded).length
  const allIncluded = filtered.length > 0 && includedCount === filtered.length
  const someIncluded = includedCount > 0 && !allIncluded

  function categoryOptions(row: ImportPreviewRow) {
    return [
      { value: NO_CATEGORY, label: t('review.noCategory') },
      ...categories.filter((c) => c.type === row.type).map((c) => ({ value: String(c.id), label: c.name })),
    ]
  }

  function categorySelect(row: ImportPreviewRow, included: boolean) {
    const categoryId = categoryFor(row)
    return (
      <Select
        value={categoryId == null ? NO_CATEGORY : String(categoryId)}
        onValueChange={(value) => onCategoryChange(row.id, value === NO_CATEGORY ? null : Number(value))}
        options={categoryOptions(row)}
        placeholder={t('review.category')}
        disabled={!included}
      />
    )
  }

  const amountClass = (row: ImportPreviewRow) =>
    cn('tabular-nums shrink-0', row.amount < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400')

  const selectAll = (
    <Checkbox
      checked={allIncluded ? true : someIncluded ? 'indeterminate' : false}
      onCheckedChange={(value) => onToggleMany(filtered.map((r) => r.id), value === true)}
      disabled={filtered.length === 0}
      aria-label={needle ? t('table.selectAllMatching') : t('table.selectAll')}
    />
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search
            size={16}
            aria-hidden="true"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setRequestedPage(1)
            }}
            placeholder={t('table.searchPlaceholder')}
            aria-label={t('table.search')}
            className="pl-9"
          />
        </div>
        {!isWide && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            {selectAll}
            {needle ? t('table.selectAllMatching') : t('table.selectAll')}
          </label>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="glass-panel rounded-xl p-6 text-center text-sm text-muted-foreground">
          {t('table.noMatches')}
        </p>
      ) : isWide ? (
        <div className="glass-panel rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">{selectAll}</TableHead>
                <TableHead>{t('table.date')}</TableHead>
                <TableHead>{t('table.description')}</TableHead>
                <TableHead className="text-right">{t('table.amount')}</TableHead>
                <TableHead className="w-56">{t('table.category')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row) => {
                const included = isIncluded(row)
                return (
                  <TableRow key={row.id} className={cn(!included && 'opacity-60')}>
                    <TableCell>
                      <Checkbox
                        checked={included}
                        onCheckedChange={(value) => onToggle(row.id, value === true)}
                        aria-label={t('review.include', { description: row.description })}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(row.date)}</TableCell>
                    <TableCell className="max-w-72">
                      <span className="flex items-center gap-2">
                        <span className="truncate">{row.description}</span>
                        {row.is_duplicate && <Badge variant="outline">{t('review.duplicateBadge')}</Badge>}
                      </span>
                    </TableCell>
                    <TableCell className={cn('text-right', amountClass(row))}>
                      {formatCurrency(row.amount, currency)}
                    </TableCell>
                    <TableCell>{categorySelect(row, included)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {pageRows.map((row) => {
            const included = isIncluded(row)
            return (
              <ListCard key={row.id} className={cn('flex flex-col gap-2 py-3', !included && 'opacity-60')}>
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
                  <span className={amountClass(row)}>{formatCurrency(row.amount, currency)}</span>
                </div>
                <div className="pl-7">{categorySelect(row, included)}</div>
              </ListCard>
            )
          })}
        </ul>
      )}

      {filtered.length > 0 && (
        <nav
          aria-label={t('table.pagination')}
          className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"
        >
          <span>
            {t('table.showing', { from: start + 1, to: start + pageRows.length, total: filtered.length })}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-24">
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value))
                  setRequestedPage(1)
                }}
                options={PAGE_SIZES.map((n) => ({ value: String(n), label: t('table.perPage', { count: n }) }))}
                placeholder={t('table.rowsPerPage')}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRequestedPage(page - 1)}
              disabled={page <= 1}
            >
              {t('table.previous')}
            </Button>
            <span aria-live="polite">{t('table.page', { page, pages: pageCount })}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRequestedPage(page + 1)}
              disabled={page >= pageCount}
            >
              {t('table.next')}
            </Button>
          </div>
        </nav>
      )}
    </div>
  )
}
