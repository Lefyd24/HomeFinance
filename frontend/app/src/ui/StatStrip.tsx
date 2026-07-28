import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function StatStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    // Two columns on phones, not one: a single column pushed four cards' worth
    // of chrome above the page content, so you scrolled past the whole strip
    // before reaching anything you came for.
    <div className={cn('grid grid-cols-2 xl:grid-cols-4 gap-3', className)}>
      {children}
    </div>
  )
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
  className,
}: {
  label: string
  value: ReactNode
  hint?: string
  tone?: 'default' | 'primary' | 'success' | 'destructive'
  className?: string
}) {
  const surface =
    tone === 'primary'
      ? 'bg-primary text-primary-foreground border-transparent'
      : tone === 'success'
        ? 'bg-success/15 text-foreground border-success/30'
        : tone === 'destructive'
          ? 'bg-destructive/15 text-foreground border-destructive/30'
          : 'glass-panel text-foreground'

  return (
    <div className={cn('rounded-xl border p-3 sm:p-4', surface, className)}>
      <p className={cn('text-sm', tone === 'primary' ? 'opacity-80' : 'text-muted-foreground')}>{label}</p>
      {/* Currency values are the widest thing in here; step the size down and
          allow a break so a long total wraps inside the card instead of
          escaping it in a two-column phone layout. */}
      <div className="text-xl sm:text-2xl font-bold font-heading tracking-tight tabular-nums break-words mt-1">
        {value}
      </div>
      {hint && (
        <p className={cn('text-xs mt-1', tone === 'primary' ? 'opacity-70' : 'text-muted-foreground')}>{hint}</p>
      )}
    </div>
  )
}
