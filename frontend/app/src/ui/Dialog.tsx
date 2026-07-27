import type { ReactNode } from 'react'
import {
  Dialog as ShadcnDialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface DialogProps {
  open: boolean
  title: string
  onOpenChange: (open: boolean) => void
  children: ReactNode
  className?: string
}

export function Dialog({ open, title, onOpenChange, children, className }: DialogProps) {
  return (
    <ShadcnDialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          // Mobile: bottom sheet; sm+: centered modal
          'bottom-0 top-auto start-0 end-0 translate-x-0 translate-y-0 max-w-none w-full rounded-t-2xl rounded-b-none',
          'sm:bottom-auto sm:top-1/2 sm:start-1/2 sm:end-auto sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-md sm:rounded-xl sm:w-full',
          'max-h-[90vh] overflow-y-auto',
          className,
        )}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </ShadcnDialog>
  )
}
