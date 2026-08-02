import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon, SearchIcon } from '@hugeicons/core-free-icons'
import { CategoryIcon, type IconKey } from './categoryIcons'
import { cn } from '@/lib/utils'

const ICON_GROUPS: { label: string; keys: IconKey[] }[] = [
  { label: 'General', keys: ['default'] },
  { label: 'Food & Dining', keys: ['food', 'groceries', 'dining', 'takeaway', 'drinks', 'coffee', 'bakery', 'dessert', 'fastfood'] },
  { label: 'Transport', keys: ['transport', 'car', 'fuel', 'parking', 'bicycle', 'bike', 'train', 'taxi'] },
  { label: 'Home & Utilities', keys: ['home', 'rent', 'mortgage', 'maintenance', 'electricity', 'water', 'gas', 'energy', 'lighting'] },
  { label: 'Tech & Subscriptions', keys: ['utilities', 'internet', 'phone', 'computer', 'laptop', 'subscriptions', 'electronics'] },
  { label: 'Shopping & Fashion', keys: ['shopping', 'clothing', 'clothes', 'fashion', 'beauty'] },
  { label: 'Health & Medical', keys: ['health', 'medical', 'hospital', 'pharmacy', 'medication', 'dental', 'emergency'] },
  { label: 'Entertainment', keys: ['entertainment', 'movies', 'music', 'albums', 'headphones', 'party', 'celebration', 'birthday'] },
  { label: 'Sports & Fitness', keys: ['sports', 'fitness', 'gym', 'yoga', 'walking'] },
  { label: 'Education', keys: ['education', 'books', 'notebook', 'stationery', 'learning'] },
  { label: 'Travel & Vacation', keys: ['travel', 'flight', 'luggage', 'holiday', 'umbrella', 'hotel', 'adventure'] },
  { label: 'Household', keys: ['cleaning', 'laundry', 'tools', 'repairs', 'garden', 'flowers', 'plants'] },
  { label: 'Pets & Nature', keys: ['pets', 'petfood'] },
  { label: 'Gifts & Charity', keys: ['gift', 'presents', 'charity', 'donation', 'helping'] },
  { label: 'Income', keys: ['salary', 'income', 'work', 'freelance', 'investment', 'allowance', 'cashback', 'bonus', 'savings', 'piggybank', 'dividend', 'bank', 'banknote', 'card', 'safe'] },
  { label: 'Returns', keys: ['interest', 'profit', 'portfolio', 'discount', 'coupon', 'voucher', 'currency', 'foreign', 'cash', 'exchange', 'transaction', 'swap'] },
  { label: 'Transfers & Bills', keys: ['transfer', 'invoice', 'giftcard'] },
  { label: 'Goals & Protection', keys: ['goal', 'target', 'tax', 'insurance', 'achievement'] },
]

interface IconPickerProps {
  value: string
  onChange: (icon: string) => void
  color: string
  disabled?: boolean
}

export function IconPicker({ value, onChange, color, disabled }: IconPickerProps) {
  const { t } = useTranslation('categories')
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const iconLabel = (key: string) => {
    const translated = t(`icons.${key}`, { defaultValue: '' })
    return translated || key.charAt(0).toUpperCase() + key.slice(1)
  }

  const handleSelect = (key: string) => {
    onChange(key)
    setOpen(false)
    setSearch('')
  }

  const allKeys = ICON_GROUPS.flatMap((g) => g.keys)
  const noResults =
    search !== '' &&
    !allKeys.some(
      (k) => k.toLowerCase().includes(search.toLowerCase()) || iconLabel(k).toLowerCase().includes(search.toLowerCase()),
    )

  // Catch wheel events on the popover and redirect them to the scroll container.
  // Without this, Radix Portal popovers can lose wheel/touch scroll to the page body.
  const handleWheelCapture = (e: React.WheelEvent) => {
    const el = scrollRef.current
    if (!el) return
    const atTop = el.scrollTop === 0
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight
    if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) return // let outer scroll
    e.stopPropagation()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className="flex w-full items-center gap-3 rounded-lg border bg-muted/40 p-2 h-auto justify-start"
        >
          <CategoryIcon icon={value} color={color} className="size-11 shrink-0" size={22} />
          <div className="flex flex-1 items-center justify-between gap-2 min-w-0">
            <div className="min-w-0 text-left">
              <p className="text-sm font-medium truncate">{iconLabel(value)}</p>
              <p className="text-xs text-muted-foreground truncate">{t('form.clickToChangeIcon')}</p>
            </div>
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              strokeWidth={2}
              className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')}
            />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={4}
        avoidCollisions
        collisionBoundary={[]}
        className="w-[min(calc(100vw-1.5rem),380px)] p-0 rounded-xl overflow-hidden"
        onWheelCapture={handleWheelCapture}
      >
        {/* Search bar */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <HugeiconsIcon icon={SearchIcon} strokeWidth={2} className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('form.searchIcons')}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
            autoFocus
          />
        </div>

        {/* Scrollable grid */}
        <div
          ref={scrollRef}
          className="max-h-[min(60dvh,440px)] overflow-y-auto overscroll-contain"
        >
          {ICON_GROUPS.map((group) => {
            const visible = search
              ? group.keys.filter(
                  (k) => k.toLowerCase().includes(search.toLowerCase()) || iconLabel(k).toLowerCase().includes(search.toLowerCase()),
                )
              : group.keys
            if (visible.length === 0) return null
            return (
              <div key={group.label}>
                <div className="sticky top-0 z-10 bg-popover px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </div>
                <div className="grid grid-cols-5 sm:grid-cols-6 gap-1.5 px-2 pb-2.5">
                  {visible.map((key) => {
                    const selected = value === key
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleSelect(key)}
                        className={cn(
                          'flex flex-col items-center gap-1 rounded-lg p-2 transition-colors',
                          selected ? 'bg-primary/20 ring-2 ring-primary/50 ring-inset' : 'hover:bg-muted/70',
                        )}
                        aria-pressed={selected}
                        aria-label={iconLabel(key)}
                        title={iconLabel(key)}
                      >
                        <CategoryIcon icon={key} color={selected ? color : 'var(--muted-foreground)'} size={18} />
                        <span className="text-[10px] leading-[1.2] text-muted-foreground truncate w-full text-center">{iconLabel(key)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {noResults && (
            <div className="py-10 text-center text-sm text-muted-foreground">{t('form.noIconsFound')}</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
