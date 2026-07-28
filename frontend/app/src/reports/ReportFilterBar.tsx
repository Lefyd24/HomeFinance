import { CalendarRange, Check, ChevronDown, Download, Tags, Wallet, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useAccounts } from '../accounts/useAccounts'
import { useCategories } from '../categories/useCategories'
import { formatDate } from '../lib/format'
import { RANGE_PRESETS, type ReportFilters } from './useReportFilters'
import { downloadReportCsv } from './reportsPageApi'

/** Which CSV the Export button pulls, per tab. */
const EXPORT_FOR_TAB: Record<string, string> = {
  overview: 'spending',
  cashflow: 'cashflow',
  spending: 'spending',
  budgets: 'spending',
  debt: 'spending',
}

export function ReportFilterBar({ filters }: { filters: ReportFilters }) {
  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories()

  async function handleExport() {
    try {
      await downloadReportCsv(EXPORT_FOR_TAB[filters.tab] ?? 'spending', filters.params)
    } catch {
      toast.error('Export failed. Try again in a moment.')
    }
  }

  return (
    <div className="sticky top-0 z-20 -mx-3 mb-6 px-3 py-3 sm:-mx-4 sm:px-4 lg:-mx-6 lg:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="report-filter-group">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm">
              <CalendarRange data-icon="inline-start" />
              {RANGE_PRESETS.find((preset) => preset.key === filters.range)?.label}
              <ChevronDown data-icon="inline-end" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-1">
            <div className="flex flex-col">
              {RANGE_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => filters.setRange(preset.key)}
                  className={cn(
                    'flex items-center justify-between rounded-md px-2.5 py-2 text-sm hover:bg-accent',
                    filters.range === preset.key && 'font-semibold',
                  )}
                >
                  {preset.label}
                  {filters.range === preset.key && <Check className="size-4" />}
                </button>
              ))}
            </div>
            {filters.range === 'custom' && (
              <>
                <Separator className="my-1" />
                <div className="flex items-center gap-2 p-2">
                  <Input
                    type="date"
                    aria-label="Start date"
                    value={filters.startDate}
                    max={filters.endDate}
                    onChange={(event) => filters.setCustomDates(event.target.value, filters.endDate)}
                  />
                  <Input
                    type="date"
                    aria-label="End date"
                    value={filters.endDate}
                    min={filters.startDate}
                    onChange={(event) => filters.setCustomDates(filters.startDate, event.target.value)}
                  />
                </div>
              </>
            )}
          </PopoverContent>
        </Popover>

        <MultiSelect
          icon={Wallet}
          label="Accounts"
          options={(accounts ?? []).map((account) => ({ id: account.id, name: account.name }))}
          selected={filters.accountIds}
          onToggle={filters.toggleAccount}
          onClear={filters.clearAccounts}
          emptyLabel="No accounts yet"
        />

        <MultiSelect
          icon={Tags}
          label="Categories"
          options={(categories ?? []).map((category) => ({ id: category.id, name: category.name }))}
          selected={filters.categoryIds}
          onToggle={filters.toggleCategory}
          onClear={filters.clearCategories}
          emptyLabel="No categories yet"
        />
        </div>

        {filters.hasDimensionFilters && (
          <Button variant="ghost" size="sm" onClick={filters.reset}>
            <X data-icon="inline-start" />
            Clear filters
          </Button>
        )}

        <div className="flex-1" />

        <p className="hidden text-xs text-muted-foreground tabular-nums lg:block">
          {formatDate(filters.startDate)} — {formatDate(filters.endDate)}
        </p>

        <Button variant="success" size="sm" onClick={() => void handleExport()}>
          <Download data-icon="inline-start" />
          Export CSV
        </Button>
      </div>
    </div>
  )
}

function MultiSelect({
  icon: Icon,
  label,
  options,
  selected,
  onToggle,
  onClear,
  emptyLabel,
}: {
  icon: typeof Wallet
  label: string
  options: Array<{ id: number; name: string }>
  selected: number[]
  onToggle: (id: number) => void
  onClear: () => void
  emptyLabel: string
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          <Icon data-icon="inline-start" />
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="ms-1 tabular-nums">
              {selected.length}
            </Badge>
          )}
          <ChevronDown data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-semibold text-muted-foreground">{label}</span>
          {selected.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              Clear
            </Button>
          )}
        </div>
        <Separator />
        <div className="flex max-h-64 flex-col overflow-y-auto p-1">
          {options.length === 0 ? (
            <p className="px-2.5 py-3 text-sm text-muted-foreground">{emptyLabel}</p>
          ) : (
            options.map((option) => (
              <label
                key={option.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-accent"
              >
                <Checkbox
                  checked={selected.includes(option.id)}
                  onCheckedChange={() => onToggle(option.id)}
                />
                <span className="truncate">{option.name}</span>
              </label>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
