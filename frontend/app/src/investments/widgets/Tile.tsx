import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * One cell of the investments bento.
 *
 * The overview is a grid of small, self-contained answers rather than a long
 * page of sections, so the tiles need to be visually interchangeable: same
 * surface, same padding, same heading treatment, whatever is inside them. That
 * uniformity is what lets the grid be asymmetric — a tile can be twice as wide
 * as its neighbour and still read as a peer.
 *
 * Denser than the rest of the app on purpose (`p-3`, small headings): this is a
 * monitoring surface, and the section theming in `index.css` tightens the
 * corner radius to match.
 */
export function Tile({
  title,
  action,
  footer,
  className,
  bodyClassName,
  bodyStyle,
  allowOverflow = false,
  children,
}: {
  title?: ReactNode
  /** Sits opposite the title — a range switcher, a count, a link. */
  action?: ReactNode
  footer?: ReactNode
  className?: string
  bodyClassName?: string
  /**
   * Inline style for the body, for dimensions that must apply even if an
   * arbitrary-value Tailwind class (e.g. `h-[120px]`) hasn't been picked up
   * by the dev-time JIT scanner yet — inline `style` always wins.
   */
  bodyStyle?: CSSProperties
  /**
   * Let content escape the tile's bounds. The tile clips its children so
     * the rounded corner is clean, which also clips a chart tooltip the
     * moment it reaches an edge — so any tile hosting a chart has to opt
     * out. `overflow-visible` wins when set.
   */
  allowOverflow?: boolean
  children: ReactNode
}) {
  return (
    <section
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-xl bg-card p-3 shadow-card',
        allowOverflow && 'overflow-visible',
        className,
      )}
    >
      {(title || action) && (
        <header className="mb-2.5 flex min-h-6 shrink-0 items-center justify-between gap-2">
          {title && <TileTitle>{title}</TileTitle>}
          {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
        </header>
      )}
      <div className={cn('min-w-0 flex-1', bodyClassName)} style={bodyStyle}>
        {children}
      </div>
      {footer && (
        <footer className="mt-2.5 shrink-0 border-t border-border/60 pt-2 text-xs text-muted-foreground">
          {footer}
        </footer>
      )}
    </section>
  )
}

/** The one heading treatment every tile uses. */
export function TileTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="truncate text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </h2>
  )
}

/** A tile with nothing to show yet — kept quiet rather than shouting an error. */
export function TileEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="flex h-full min-h-16 items-center justify-center px-2 text-center text-xs text-muted-foreground">
      {children}
    </p>
  )
}
