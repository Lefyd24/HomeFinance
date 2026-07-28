import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Wrap a header button's label in this so the button collapses to its icon on
 * narrow screens instead of squeezing the title beside it.
 *
 * `sr-only` rather than `hidden`: the text stays in the accessibility tree, so
 * the button keeps its name for screen readers and no aria-label is needed.
 * The squaring-off of the button around the leftover icon is done by
 * `.page-header-actions` in index.css.
 */
export function PageHeaderActionLabel({ children }: { children: ReactNode }) {
  return <span className="sr-only sm:not-sr-only">{children}</span>
}

export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 sm:gap-4 mb-6', className)}>
      <div className="min-w-0">
        <h1 className="text-lg sm:text-xl font-bold font-heading text-foreground tracking-tight">
          {title}
        </h1>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      {action && (
        <div className="page-header-actions flex shrink-0 items-center gap-2">{action}</div>
      )}
    </div>
  )
}
