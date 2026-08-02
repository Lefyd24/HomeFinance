import { cn } from '@/lib/utils'

/**
 * The within-tool switcher (Compound / Retirement / Compare / …). Deliberately
 * not another `Tabs` — the page-level tool switcher already owns the filled,
 * primary-colored (blue) look, so a second row of the same pill would read as
 * one long ambiguous strip. This is a compact segmented control that hugs its
 * content (`self-start`, since flex-col parents stretch children by default)
 * and marks the active option in the app's chart-orange, a color already
 * vetted for colour-vision deficiency and used nowhere else as a fill, so the
 * two nav levels are unmistakably different at a glance.
 */
export function SecondaryNav<T extends string>({
  value,
  onValueChange,
  options,
  className,
}: {
  value: T
  onValueChange: (value: T) => void
  options: { value: T; label: string }[]
  className?: string
}) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex max-w-full shrink-0 self-start gap-1 overflow-x-auto rounded-lg border border-border bg-background p-1',
        '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(opt.value)}
            className={cn(
              'relative shrink-0 whitespace-nowrap rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors',
              active
                ? 'bg-[#eb6834] text-white shadow-sm dark:bg-[#d95926]'
                : 'text-foreground/65 hover:bg-muted hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
