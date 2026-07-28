import { useCallback, useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import { Alert01Icon, Delete02Icon } from '@hugeicons/core-free-icons'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

export interface ConfirmOptions {
  title: string
  /** What happens, and what cannot be undone. Written in the app's voice. */
  description?: string
  /** Label the action, not the answer: "Delete debt", not "OK". */
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'destructive' | 'default'
  icon?: IconSvgElement
}

/**
 * Replaces window.confirm, which can't be styled, can't carry an icon, and
 * blocks the tab. Returns a promise so calling code keeps reading top to
 * bottom: `if (!(await confirm({...}))) return`.
 */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const settle = (value: boolean) => {
    resolver.current?.(value)
    resolver.current = null
    setOptions(null)
  }

  const tone = options?.tone ?? 'destructive'
  const icon = options?.icon ?? (tone === 'destructive' ? Delete02Icon : Alert01Icon)

  const confirmDialog = (
    <AlertDialog open={options != null} onOpenChange={(open) => !open && settle(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia
            className={cn(
              tone === 'destructive'
                ? 'bg-destructive/12 text-destructive'
                : 'bg-warning/15 text-warning',
            )}
          >
            <HugeiconsIcon icon={icon} strokeWidth={2} />
          </AlertDialogMedia>
          <AlertDialogTitle>{options?.title ?? ''}</AlertDialogTitle>
          {options?.description && (
            <AlertDialogDescription>{options.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>
            {options?.cancelLabel ?? 'Keep it'}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={tone === 'destructive' ? 'destructive' : 'default'}
            onClick={() => settle(true)}
          >
            {options?.confirmLabel ?? 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { confirm, confirmDialog }
}
