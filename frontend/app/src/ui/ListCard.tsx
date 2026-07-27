import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function ListCard({
  children,
  className,
  as: Comp = 'li',
}: {
  children: ReactNode
  className?: string
  as?: 'li' | 'div' | 'article'
}) {
  return (
    <Comp
      className={cn(
        'rounded-xl border border-border bg-card p-4 shadow-sm transition-colors',
        className,
      )}
    >
      {children}
    </Comp>
  )
}
