import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function StatStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3', className)}>
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
          : 'bg-card text-foreground border-border'

  return (
    <div className={cn('rounded-xl border p-4 shadow-sm', surface, className)}>
      <p className={cn('text-sm', tone === 'primary' ? 'opacity-80' : 'text-muted-foreground')}>{label}</p>
      <div className="text-2xl font-bold font-heading tracking-tight mt-1">{value}</div>
      {hint && (
        <p className={cn('text-xs mt-1', tone === 'primary' ? 'opacity-70' : 'text-muted-foreground')}>{hint}</p>
      )}
    </div>
  )
}
