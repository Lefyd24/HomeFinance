import type { LucideIcon } from 'lucide-react'
import { isValidElement, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

function EmptyStateIcon({ icon }: { icon: LucideIcon | ReactNode }) {
  return (
    <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg:not([class*='size-'])]:size-[22px]">
      {isValidElement(icon) ? icon : (() => {
        const Icon = icon as LucideIcon
        return <Icon size={22} />
      })()}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon | ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center gap-3 rounded-xl border border-dashed border-border bg-card/50 px-6 py-12',
        className,
      )}
    >
      {icon != null && <EmptyStateIcon icon={icon} />}
      <div className="space-y-1">
        <p className="font-semibold text-foreground">{title}</p>
        {description && <p className="text-sm text-muted-foreground max-w-sm">{description}</p>}
      </div>
      {action}
    </div>
  )
}
