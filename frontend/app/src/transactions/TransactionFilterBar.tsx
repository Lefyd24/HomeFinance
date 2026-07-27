import { useMemo, useState, type ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  ArrowDownLeft01Icon,
  ArrowUpRight01Icon,
  BankIcon,
  Calendar03Icon,
  Cancel01Icon,
  Exchange01Icon,
  Search01Icon,
  Tag01Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { formatDate } from '../lib/format'
import type { TransactionFilters, TransactionType } from './transactionsApi'

export interface DatePreset {
  label: string
  range: { start_date: string; end_date: string }
}

interface PickerOption {
  value: string
  label: string
  color?: string | null
}

/** A filter that reads as a sentence fragment: "Account: Revolut". */
function PickerButton({
  icon,
  label,
  value,
  active,
}: {
  icon: IconSvgElement
  label: string
  value?: string
  active: boolean
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        'h-9 justify-between gap-2 font-normal',
        active && 'border-primary/40 bg-primary/8 text-foreground',
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <HugeiconsIcon
          icon={icon}
          strokeWidth={2}
          className={cn('shrink-0', active ? 'text-primary' : 'text-muted-foreground')}
        />
        <span className="truncate">
          {active ? (
            <>
              <span className="text-muted-foreground">{label}: </span>
              <span className="font-medium">{value}</span>
            </>
          ) : (
            label
          )}
        </span>
      </span>
      <HugeiconsIcon
        icon={ArrowDown01Icon}
        strokeWidth={2}
        className="shrink-0 text-muted-foreground"
      />
    </Button>
  )
}

function OptionPicker({
  icon,
  label,
  options,
  value,
  onChange,
  searchPlaceholder,
  allLabel,
}: {
  icon: IconSvgElement
  label: string
  options: PickerOption[]
  value: string | undefined
  onChange: (value: string | undefined) => void
  searchPlaceholder: string
  allLabel: string
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="min-w-0 [&>button]:w-full">
          <PickerButton
            icon={icon}
            label={label}
            value={selected?.label}
            active={Boolean(selected)}
          />
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>Nothing matches that.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={allLabel}
                onSelect={() => {
                  onChange(undefined)
                  setOpen(false)
                }}
              >
                <span className="text-muted-foreground">{allLabel}</span>
              </CommandItem>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                  className={cn(option.value === value && 'bg-accent')}
                >
                  {option.color && (
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: option.color }}
                      aria-hidden
                    />
                  )}
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function DateRangePicker({
  startDate,
  endDate,
  presets,
  onChange,
}: {
  startDate?: string
  endDate?: string
  presets: DatePreset[]
  onChange: (range: { start_date?: string; end_date?: string }) => void
}) {
  const [open, setOpen] = useState(false)

  const summary = useMemo(() => {
    const matched = presets.find(
      (p) => p.range.start_date === startDate && p.range.end_date === endDate,
    )
    if (matched) return matched.label
    if (startDate && endDate) return `${formatDate(startDate)} – ${formatDate(endDate)}`
    if (startDate) return `From ${formatDate(startDate)}`
    if (endDate) return `Until ${formatDate(endDate)}`
    return undefined
  }, [startDate, endDate, presets])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="min-w-0 [&>button]:w-full">
          <PickerButton
            icon={Calendar03Icon}
            label="Period"
            value={summary}
            active={Boolean(summary)}
          />
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            {presets.map((preset) => {
              const active =
                preset.range.start_date === startDate && preset.range.end_date === endDate
              return (
                <Button
                  key={preset.label}
                  variant={active ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    onChange(preset.range)
                    setOpen(false)
                  }}
                >
                  {preset.label}
                </Button>
              )
            })}
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              From
              <Input
                type="date"
                value={startDate ?? ''}
                onChange={(e) => onChange({ start_date: e.target.value, end_date: endDate })}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              To
              <Input
                type="date"
                value={endDate ?? ''}
                onChange={(e) => onChange({ start_date: startDate, end_date: e.target.value })}
              />
            </label>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange({ start_date: undefined, end_date: undefined })
              setOpen(false)
            }}
          >
            Clear period
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function FilterChip({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 py-0.5 ps-2.5 pe-1 text-xs">
      {children}
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
      >
        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3" />
        <span className="sr-only">Remove filter</span>
      </button>
    </span>
  )
}

export interface TransactionFilterBarProps {
  filters: TransactionFilters
  onFiltersChange: (updater: (prev: TransactionFilters) => TransactionFilters) => void
  searchInput: string
  onSearchInputChange: (value: string) => void
  accounts: PickerOption[]
  categories: PickerOption[]
  datePresets: DatePreset[]
  onClearAll: () => void
  resultCount?: number
  isLoading?: boolean
}

const TYPE_TABS: Array<{
  value: string
  label: string
  icon?: IconSvgElement
  onClass: string
}> = [
  { value: 'all', label: 'All', onClass: 'data-[state=on]:text-foreground' },
  {
    value: 'income',
    label: 'In',
    icon: ArrowDownLeft01Icon,
    onClass: 'data-[state=on]:text-flow-in',
  },
  {
    value: 'expense',
    label: 'Out',
    icon: ArrowUpRight01Icon,
    onClass: 'data-[state=on]:text-flow-out',
  },
  {
    value: 'transfer',
    label: 'Moved',
    icon: Exchange01Icon,
    onClass: 'data-[state=on]:text-flow-move',
  },
]

/**
 * One toolbar line for the controls, one line for what is currently applied.
 * Applied filters are removable chips so a narrowed view can be widened one
 * step at a time instead of only being cleared wholesale.
 */
export function TransactionFilterBar({
  filters,
  onFiltersChange,
  searchInput,
  onSearchInputChange,
  accounts,
  categories,
  datePresets,
  onClearAll,
  resultCount,
  isLoading,
}: TransactionFilterBarProps) {
  const set = (patch: Partial<TransactionFilters>) =>
    onFiltersChange((prev) => ({ ...prev, ...patch, page: 1 }))

  const selectedAccount = accounts.find((a) => a.value === String(filters.account_id))
  const selectedCategory = categories.find((c) => c.value === String(filters.category_id))
  const periodLabel = datePresets.find(
    (p) => p.range.start_date === filters.start_date && p.range.end_date === filters.end_date,
  )?.label

  const chips: Array<{ key: string; node: ReactNode; remove: () => void }> = []
  if (searchInput) {
    chips.push({
      key: 'search',
      node: (
        <>
          <span className="text-muted-foreground">Matching</span> “{searchInput}”
        </>
      ),
      remove: () => onSearchInputChange(''),
    })
  }
  if (filters.type) {
    chips.push({
      key: 'type',
      node: (
        <>
          <span className="text-muted-foreground">Type</span>{' '}
          {TYPE_TABS.find((t) => t.value === filters.type)?.label}
        </>
      ),
      remove: () => set({ type: undefined }),
    })
  }
  if (selectedAccount) {
    chips.push({
      key: 'account',
      node: (
        <>
          <span className="text-muted-foreground">Account</span> {selectedAccount.label}
        </>
      ),
      remove: () => set({ account_id: undefined }),
    })
  }
  if (selectedCategory) {
    chips.push({
      key: 'category',
      node: (
        <>
          {selectedCategory.color && (
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: selectedCategory.color }}
              aria-hidden
            />
          )}
          <span className="text-muted-foreground">Category</span> {selectedCategory.label}
        </>
      ),
      remove: () => set({ category_id: undefined }),
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <InputGroup className="h-9 lg:max-w-xs">
          <InputGroupAddon>
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search descriptions…"
            value={searchInput}
            onChange={(e) => onSearchInputChange(e.target.value)}
            aria-label="Search transactions"
          />
          {searchInput && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                variant="ghost"
                onClick={() => onSearchInputChange('')}
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                <span className="sr-only">Clear search</span>
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>

        <ToggleGroup
          type="single"
          spacing={0}
          value={filters.type ?? 'all'}
          onValueChange={(value) =>
            set({ type: !value || value === 'all' ? undefined : (value as TransactionType) })
          }
          className="h-9 shrink-0 border border-border bg-muted/60 p-0.5"
        >
          {TYPE_TABS.map((tab) => (
            <ToggleGroupItem
              key={tab.value}
              value={tab.value}
              className={cn(
                'h-8 rounded-md px-3 text-muted-foreground hover:bg-transparent hover:text-foreground',
                'data-[state=on]:bg-background data-[state=on]:shadow-sm',
                tab.onClass,
              )}
            >
              {tab.icon && (
                <HugeiconsIcon icon={tab.icon} strokeWidth={2} data-icon="inline-start" />
              )}
              {tab.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:ms-auto lg:flex lg:items-center">
          <DateRangePicker
            startDate={filters.start_date}
            endDate={filters.end_date}
            presets={datePresets}
            onChange={(range) => set(range)}
          />
          <OptionPicker
            icon={BankIcon}
            label="Account"
            allLabel="All accounts"
            searchPlaceholder="Find an account…"
            options={accounts}
            value={filters.account_id ? String(filters.account_id) : undefined}
            onChange={(value) => set({ account_id: value ? Number(value) : undefined })}
          />
          <OptionPicker
            icon={Tag01Icon}
            label="Category"
            allLabel="All categories"
            searchPlaceholder="Find a category…"
            options={categories}
            value={filters.category_id ? String(filters.category_id) : undefined}
            onChange={(value) => set({ category_id: value ? Number(value) : undefined })}
          />
        </div>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">
            {isLoading
              ? 'Filtering…'
              : `${resultCount ?? 0} match${resultCount === 1 ? '' : 'es'}`}
            {periodLabel ? ` in ${periodLabel.toLowerCase()}` : ''}
          </span>
          {chips.map((chip) => (
            <FilterChip key={chip.key} onRemove={chip.remove}>
              {chip.node}
            </FilterChip>
          ))}
          <Button variant="ghost" size="sm" className="h-7 ms-auto" onClick={onClearAll}>
            Clear all
          </Button>
        </div>
      )}
    </div>
  )
}
