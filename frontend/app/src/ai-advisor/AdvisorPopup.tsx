import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useAdvisor } from './advisorContext'
import { AdvisorChat } from './AdvisorChat'
import { MIN_SIZE, usePanelSize } from './usePanelSize'

const OPEN = { opacity: 1, scale: 1, y: 0, visibility: 'visible' } as const
const CLOSED = {
  opacity: 0,
  scale: 0.94,
  y: 24,
  transitionEnd: { visibility: 'hidden' },
} as const

/**
 * The advisor as a floating chat panel — full screen on a phone, a card above
 * the speed dial on desktop.
 *
 * It stays mounted while closed (hidden and inert), so the scroll position and
 * a half-typed question survive closing it as well as the transcript does.
 */
export function AdvisorPopup() {
  const { t } = useTranslation('advisor')
  const { isOpen, close } = useAdvisor()
  const panelRef = useRef<HTMLElement>(null)
  const reduceMotion = useReducedMotion()
  const { size, handleProps } = usePanelSize(panelRef)

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, close])

  // Ready to type on desktop. On a touch screen focusing would raise the
  // keyboard over the suggestions before anyone has seen them.
  useEffect(() => {
    if (!isOpen || !window.matchMedia('(pointer: fine)').matches) return
    panelRef.current?.querySelector('textarea')?.focus({ preventScroll: true })
  }, [isOpen])

  return (
    <motion.section
      ref={panelRef}
      role="dialog"
      aria-label={t('aiAdvisor.popup.title')}
      aria-hidden={!isOpen}
      inert={!isOpen}
      initial={false}
      animate={isOpen ? OPEN : CLOSED}
      transition={
        reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32, mass: 0.9 }
      }
      // Only the desktop classes read these, so a size chosen on a wide screen never
      // squeezes the full-screen phone layout.
      style={
        size
          ? ({ '--advisor-w': `${size.width}px`, '--advisor-h': `${size.height}px` } as CSSProperties)
          : undefined
      }
      className={cn(
        'glass-popover fixed z-50 flex flex-col overflow-hidden bg-popover',
        // Phone: the whole screen, clear of the notch and home indicator.
        'inset-0 h-dvh pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
        // Desktop: a card that sits just above the speed dial.
        'origin-bottom-right lg:inset-auto lg:bottom-28 lg:end-6 lg:h-[var(--advisor-h,min(40rem,calc(100dvh-8.5rem)))] lg:w-[var(--advisor-w,26rem)] lg:rounded-3xl lg:border lg:pb-0 lg:pt-0 lg:shadow-2xl',
      )}
    >
      {/* Desktop only: the panel is anchored bottom-right, so the free corner is top-left. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('aiAdvisor.popup.resize')}
        title={t('aiAdvisor.popup.resize')}
        aria-valuemin={MIN_SIZE.width}
        aria-valuenow={size?.width}
        tabIndex={0}
        {...handleProps}
        className="group absolute start-0 top-0 z-10 hidden size-6 cursor-nwse-resize touch-none items-start justify-start rounded-tl-3xl p-1.5 focus-visible:outline-2 focus-visible:outline-ring lg:flex"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 10 10"
          className="size-2.5 text-muted-foreground/50 transition-colors group-hover:text-foreground group-focus-visible:text-foreground"
        >
          <path d="M1 9V1h8M1 5.5 5.5 1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <AdvisorChat onClose={close} />
    </motion.section>
  )
}
