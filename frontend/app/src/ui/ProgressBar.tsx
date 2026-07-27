import { cn } from '@/lib/utils'

export function ProgressBar({
  value,
  variant = 'primary',
  className,
}: {
  value: number
  variant?: 'primary' | 'success' | 'warning' | 'destructive'
  className?: string
}) {
  const clamped = Math.max(0, Math.min(value, 100))
  const tone =
    variant === 'destructive'
      ? 'bg-destructive'
      : variant === 'warning'
        ? 'bg-amber-500'
        : variant === 'success'
          ? 'bg-emerald-500'
          : 'bg-primary'

  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted border border-border', className)}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-500', tone)} style={{ width: `${clamped}%` }} />
    </div>
  )
}

export function progressVariantForPercent(percent: number): 'primary' | 'warning' | 'destructive' {
  if (percent >= 100) return 'destructive'
  if (percent >= 80) return 'warning'
  return 'primary'
}
