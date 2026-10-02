import { useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useAdvisor } from './advisorContext'
import { AdvisorChat } from './AdvisorChat'

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
      className={cn(
        'glass-popover fixed z-50 flex flex-col overflow-hidden bg-popover',
        // Phone: the whole screen, clear of the notch and home indicator.
        'inset-0 h-dvh pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
        // Desktop: a card that sits just above the speed dial.
        'origin-bottom-right lg:inset-auto lg:bottom-28 lg:end-6 lg:h-[min(40rem,calc(100dvh-8.5rem))] lg:w-[26rem] lg:rounded-3xl lg:border lg:pb-0 lg:pt-0 lg:shadow-2xl',
      )}
    >
      <AdvisorChat onClose={close} />
    </motion.section>
  )
}
