import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function PageContainer({
  children,
  className,
  wide = false,
}: {
  children: ReactNode
  className?: string
  wide?: boolean
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6',
        wide ? 'max-w-7xl' : 'max-w-6xl',
        className,
      )}
    >
      {children}
    </div>
  )
}
