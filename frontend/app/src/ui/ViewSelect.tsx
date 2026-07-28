import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface ViewOption {
  value: string
  label: string
}

/**
 * The phone-sized stand-in for a tab strip: which view of a page you are on.
 *
 * A page with four or five views cannot fit them in one phone-width row without
 * either scrolling them out of sight or shrinking the labels past legibility, so
 * below `sm` those pages render this instead. Deliberately a separate component
 * from a plain `Select`: this is navigation, and it is styled to read as the
 * page's current state — tinted in the product colour, weighted — rather than as
 * an unfilled form field. Form selects elsewhere are untouched.
 */
export function ViewSelect({
  value,
  onValueChange,
  options,
  label,
  className,
}: {
  value: string
  onValueChange: (value: string) => void
  options: readonly ViewOption[]
  /** Accessible name — there is no visible label beside it. */
  label: string
  className?: string
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        aria-label={label}
        className={cn(
          'w-full justify-between font-semibold',
          'border-primary/35 bg-primary/10 text-primary',
          'hover:bg-primary/15 dark:bg-primary/15 dark:hover:bg-primary/20',
          // The trigger's own cva pins h-8; match the variant chain so tw-merge
          // replaces it rather than leaving two competing height rules.
          'data-[size=default]:h-10',
          // The chevron ships as text-muted-foreground; bring it into the tint.
          '[&_svg]:text-primary/70',
          className,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="min-w-(--radix-select-trigger-width) p-1">
        <SelectGroup>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className={cn(
                'py-2 font-medium',
                'data-[state=checked]:bg-primary/12 data-[state=checked]:font-semibold data-[state=checked]:text-primary',
              )}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
