import { CalendarRange, Check, ChevronDown, Tags, Wallet, X } from 'lucide-react'
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

// The Export CSV button used to live at the end of this bar. It was removed on
// request; `downloadReportCsv` is still exported from ./reportsPageApi if it
// needs to come back somewhere else.

export function ReportFilterBar({ filters }: { filters: ReportFilters }) {
  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories()

  return (
    // Pinned to the top of the page scroller with its own opaque chrome. It was
    // already sticky, but fully transparent, so page content slid visibly through
    // it and it read as scrolling along with everything else.
    <div className="glass-bar sticky top-0 z-20 -mx-3 mb-6 border-b px-3 py-2.5 sm:-mx-4 sm:px-4 lg:-mx-6 lg:px-6">
      {/* One row at every width. It used to wrap, which stacked the three filters
          into a block on a phone. Nothing is collapsed or hidden — all three keep
          their labels — and the group scrolls if a long custom range needs it. */}
      <div className="flex items-center gap-2">
        <div className="report-filter-group">
        <Popover>
          <PopoverTrigger asChild>
            {/* Icon and chevron are decoration; dropping them on a phone is what
                buys all three filters a single row with their labels intact. */}
            <Button variant="ghost" size="sm">
              <CalendarRange data-icon="inline-start" className="max-sm:hidden" />
              {RANGE_PRESETS.find((preset) => preset.key === filters.range)?.label}
              <ChevronDown data-icon="inline-end" className="max-sm:hidden" />
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
          <Button variant="ghost" size="sm" className="shrink-0" onClick={filters.reset}>
            <X data-icon="inline-start" />
            <span className="sr-only sm:not-sr-only">Clear filters</span>
          </Button>
        )}

        <div className="hidden flex-1 lg:block" />

        <p className="hidden text-xs text-muted-foreground tabular-nums lg:block">
          {formatDate(filters.startDate)} — {formatDate(filters.endDate)}
        </p>
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
          <Icon data-icon="inline-start" className="max-sm:hidden" />
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="ms-1 tabular-nums">
              {selected.length}
            </Badge>
          )}
          <ChevronDown data-icon="inline-end" className="max-sm:hidden" />
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
