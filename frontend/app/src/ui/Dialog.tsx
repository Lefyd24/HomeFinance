import type { ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import {
  Dialog as ShadcnDialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export type DialogTone = 'default' | 'primary' | 'in' | 'out' | 'move' | 'warning' | 'destructive'

const toneBand: Record<DialogTone, string> = {
  default: 'bg-muted/50',
  primary: 'bg-primary/8',
  in: 'bg-flow-in/8',
  out: 'bg-flow-out/8',
  move: 'bg-flow-move/8',
  warning: 'bg-warning/10',
  destructive: 'bg-destructive/8',
}

const toneMark: Record<DialogTone, string> = {
  default: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/15 text-primary',
  in: 'bg-flow-in/15 text-flow-in',
  out: 'bg-flow-out/15 text-flow-out',
  move: 'bg-flow-move/15 text-flow-move',
  warning: 'bg-warning/20 text-warning',
  destructive: 'bg-destructive/15 text-destructive',
}

interface DialogProps {
  open: boolean
  title: string
  onOpenChange: (open: boolean) => void
  children: ReactNode
  /** One line under the title saying what this dialog does. */
  description?: string
  /** Shown in a tinted mark beside the title. */
  icon?: IconSvgElement
  /** Tints the header band — match it to what the dialog acts on. */
  tone?: DialogTone
  /** Actions pinned to the bottom; the body scrolls independently. */
  footer?: ReactNode
  className?: string
}

/**
 * The app's modal shell. A tinted header band carries the icon, title and a
 * one-line explanation; the body scrolls on its own so long forms never push
 * their actions off screen; the footer stays put.
 *
 * On phones it docks to the bottom edge as a sheet, which is where thumbs are.
 */
export function Dialog({
  open,
  title,
  onOpenChange,
  children,
  description,
  icon,
  tone = 'default',
  footer,
  className,
}: DialogProps) {
  return (
    <ShadcnDialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'flex flex-col gap-0 overflow-hidden p-0',
          // Mobile: bottom sheet; sm+: centered modal
          'bottom-0 top-auto start-0 end-0 w-full max-w-none translate-x-0 translate-y-0 rounded-t-2xl rounded-b-none',
          'sm:bottom-auto sm:top-1/2 sm:start-1/2 sm:end-auto sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl',
          'max-h-[90vh] sm:max-h-[85vh]',
          className,
        )}
      >
        <DialogHeader
          className={cn(
            'shrink-0 flex-row items-start gap-3 border-b px-4 py-3.5 pe-12',
            toneBand[tone],
          )}
        >
          {icon && (
            <span
              className={cn(
                'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg',
                toneMark[tone],
              )}
              aria-hidden
            >
              <HugeiconsIcon icon={icon} strokeWidth={2} />
            </span>
          )}
          <div className="flex min-w-0 flex-col gap-1">
            <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
            {description && (
              <DialogDescription className="text-xs leading-relaxed">
                {description}
              </DialogDescription>
            )}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>

        {footer && (
          <DialogFooter className="mx-0 mb-0 shrink-0 rounded-none border-t bg-muted/40 px-4 py-3">
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </ShadcnDialog>
  )
}
