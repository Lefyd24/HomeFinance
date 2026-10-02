import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { Plus, ReceiptText, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAdvisor } from '../ai-advisor/advisorContext'
import { TransactionFormDialog } from '../transactions/TransactionFormDialog'

/** Distance from the main button to the centre of each petal, in px. */
const PETAL_RADIUS = 92
/** The petals fan across this many degrees, from straight up to sideways. */
const FAN_DEGREES = 90

interface Petal {
  key: string
  label: string
  icon: ReactNode
  onSelect: () => void
}

/**
 * Where petal `index` of `count` lands, relative to the main button.
 *
 * The fan opens toward the middle of the screen — up and inward — so labels
 * never run off the edge. Inward is left in LTR and right in RTL.
 */
function petalOffset(index: number, count: number, inwardSign: 1 | -1) {
  const degrees = count === 1 ? FAN_DEGREES / 2 : (index * FAN_DEGREES) / (count - 1)
  const radians = (degrees * Math.PI) / 180
  return {
    x: -inwardSign * PETAL_RADIUS * Math.sin(radians),
    y: -PETAL_RADIUS * Math.cos(radians),
  }
}

/**
 * The floating action button: tap it and labelled petals bloom out around it —
 * one to add a transaction, one to open the AI advisor.
 *
 * Closes on a tap outside, on Escape, on the main button, or on picking a petal.
 */
export function SpeedDial() {
  const { t, i18n } = useTranslation('nav')
  const { available, open: openAdvisor } = useAdvisor()
  const [isOpen, setIsOpen] = useState(false)
  const [addingTransaction, setAddingTransaction] = useState(false)
  const mainButtonRef = useRef<HTMLButtonElement>(null)
  const reduceMotion = useReducedMotion()
  const inwardSign = i18n.dir() === 'rtl' ? -1 : 1

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setIsOpen(false)
      mainButtonRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen])

  const choose = (action: () => void) => () => {
    setIsOpen(false)
    action()
  }

  const petals: Petal[] = [
    {
      key: 'add-transaction',
      label: t('speedDial.addTransaction'),
      icon: <ReceiptText />,
      onSelect: choose(() => setAddingTransaction(true)),
    },
    // Hidden rather than disabled when the server has the advisor switched
    // off: a petal that leads nowhere is just clutter.
    ...(available
      ? [
          {
            key: 'ai-advisor',
            label: t('speedDial.aiAdvisor'),
            icon: <Sparkles />,
            onSelect: choose(() => openAdvisor()),
          },
        ]
      : []),
  ]

  const spring = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 420, damping: 24 }

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="scrim"
            aria-hidden="true"
            className="fixed inset-0 z-[55] bg-background/60 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      <div
        className={cn(
          'fixed size-12',
          isOpen ? 'z-[60]' : 'z-30',
          // Clears the dock (3.5rem tall, sitting ~0.5rem above the safe
          // area) with a gap, in a browser tab and an installed PWA alike.
          'bottom-[max(4.5rem,calc(4rem+env(safe-area-inset-bottom)))] end-3',
          'lg:bottom-12 lg:end-6',
        )}
      >
        <AnimatePresence>
          {isOpen && (
            <>
              {/* A soft bloom behind the petals so they read as one flower. */}
              <motion.span
                key="bloom"
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-1/2 -ms-32 -mt-32 size-64 rounded-full bg-[radial-gradient(closest-side,var(--primary),transparent)] opacity-15"
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0 }}
                transition={spring}
              />

              <div key="petals" role="menu" aria-label={t('speedDial.label')}>
                {petals.map((petal, index) => {
                  const { x, y } = petalOffset(index, petals.length, inwardSign)
                  return (
                    <motion.div
                      key={petal.key}
                      className="absolute left-0 top-0 flex size-12 items-center justify-center"
                      initial={{ x: 0, y: 0, scale: 0, rotate: -90, opacity: 0 }}
                      animate={{ x, y, scale: 1, rotate: 0, opacity: 1 }}
                      exit={{ x: 0, y: 0, scale: 0, rotate: -90, opacity: 0 }}
                      transition={{ ...spring, delay: reduceMotion ? 0 : index * 0.05 }}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={petal.onSelect}
                        aria-label={petal.label}
                        className="flex size-12 items-center justify-center rounded-full border border-border/60 bg-card text-primary shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 [&_svg]:size-5"
                      >
                        {petal.icon}
                      </button>
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute end-full me-3 whitespace-nowrap rounded-full border border-border/60 bg-popover px-3 py-1.5 text-sm font-medium text-popover-foreground shadow-md"
                      >
                        {petal.label}
                      </span>
                    </motion.div>
                  )
                })}
              </div>
            </>
          )}
        </AnimatePresence>

        <button
          ref={mainButtonRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={isOpen ? t('speedDial.close') : t('speedDial.open')}
          onClick={() => setIsOpen((current) => !current)}
          className="relative flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-shadow hover:shadow-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95"
        >
          <motion.span className="flex" animate={{ rotate: isOpen ? 135 : 0 }} transition={spring}>
            <Plus className="size-6" strokeWidth={2.25} />
          </motion.span>
        </button>
      </div>

      <TransactionFormDialog open={addingTransaction} onOpenChange={setAddingTransaction} />
    </>
  )
}
