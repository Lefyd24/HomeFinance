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
        'glass-panel rounded-xl border p-4 transition-colors',
        className,
      )}
    >
      {children}
    </Comp>
  )
}
