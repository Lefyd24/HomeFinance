import { HugeiconsIcon } from '@hugeicons/react'
import {
  BankIcon,
  SafeBoxIcon,
  CreditCardIcon,
  Money01Icon,
  ChartIncreaseIcon,
  Wallet01Icon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import type { AccountType } from './accountsApi'

export const BANK_ICONS = [
  { value: 'alphabank.png', label: 'Alpha', file: 'alphabank.png' },
  { value: 'eurobank.jpg', label: 'Eurobank', file: 'eurobank.jpg' },
  { value: 'piraeus.png', label: 'Piraeus', file: 'piraeus.png' },
  { value: 'nationalbank.png', label: 'National', file: 'nationalbank.png' },
  { value: 'optimabank.jpg', label: 'Optima', file: 'optimabank.jpg' },
  { value: 'revolut.png', label: 'Revolut', file: 'revolut.png' },
  { value: 'freedom24.svg', label: 'Freedom24', file: 'freedom24.svg' },
  { value: 'binance.svg', label: 'Binance', file: 'binance.svg' },
] as const

export type BankIconValue = (typeof BANK_ICONS)[number]['value']

export function bankIconSrc(icon: string | null | undefined): string | null {
  if (!icon) return null
  const match = BANK_ICONS.find((b) => b.value === icon || b.file === icon)
  const file = match?.file ?? icon
  return `/assets/icons/banks/${file}`
}

/**
 * Each account type owns a hue, used consistently in its icon tint, its card's
 * top rule, and its slice of the allocation bar — so the same colour means the
 * same kind of account everywhere on the page.
 */
const TYPE_META: Record<
  AccountType,
  {
    label: string
    icon: typeof BankIcon
    tint: string
    /** Solid fill for bars and rules. */
    fill: string
    /** Soft glow on glass account cards. */
    ambient: string
    text: string
    /** Plural noun for section headings. */
    plural: string
  }
> = {
  checking: {
    label: 'Checking',
    plural: 'Checking accounts',
    icon: BankIcon,
    tint: 'bg-primary/15 text-primary',
    fill: 'bg-primary',
    ambient: 'bg-primary/30',
    text: 'text-primary',
  },
  savings: {
    label: 'Savings',
    plural: 'Savings',
    icon: SafeBoxIcon,
    tint: 'bg-success/15 text-success',
    fill: 'bg-success',
    ambient: 'bg-success/30',
    text: 'text-success',
  },
  credit: {
    label: 'Credit',
    plural: 'Credit',
    icon: CreditCardIcon,
    tint: 'bg-flow-out/15 text-flow-out',
    fill: 'bg-flow-out',
    ambient: 'bg-flow-out/25',
    text: 'text-flow-out',
  },
  cash: {
    label: 'Cash',
    plural: 'Cash',
    icon: Money01Icon,
    tint: 'bg-warning/20 text-warning',
    fill: 'bg-warning',
    ambient: 'bg-warning/25',
    text: 'text-warning',
  },
  investment: {
    label: 'Investment',
    plural: 'Investments',
    icon: ChartIncreaseIcon,
    tint: 'bg-flow-move/15 text-flow-move',
    fill: 'bg-flow-move',
    ambient: 'bg-flow-move/25',
    text: 'text-flow-move',
  },
}

export const ACCOUNT_TYPE_ORDER: AccountType[] = [
  'checking',
  'savings',
  'cash',
  'investment',
  'credit',
]

/**
 * `t` is optional so this can still be called from contexts without an
 * i18next instance handy; pass the `accounts` namespace's `t` (e.g. from
 * `useTranslation('accounts')`) to get translated labels.
 */
export function getAccountTypeMeta(type: AccountType, t?: (key: string, defaultValue: string) => string) {
  const meta = TYPE_META[type]
  if (!meta) {
    return {
      label: type,
      plural: type,
      icon: Wallet01Icon,
      tint: 'bg-muted text-muted-foreground',
      fill: 'bg-muted-foreground',
      ambient: 'bg-muted-foreground/20',
      text: 'text-muted-foreground',
    }
  }
  return {
    ...meta,
    label: t ? t(`types.${type}.label`, meta.label) : meta.label,
    plural: t ? t(`types.${type}.plural`, meta.plural) : meta.plural,
  }
}

export function AccountIcon({
  icon,
  type,
  className,
  imageClassName,
}: {
  icon?: string | null
  type: AccountType
  className?: string
  imageClassName?: string
}) {
  const meta = getAccountTypeMeta(type)
  const src = bankIconSrc(icon)

  if (src) {
    return (
      <div
        className={cn(
          'flex size-12 items-center justify-center overflow-hidden rounded-xl bg-white/80 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.9)] ring-1 ring-white/40 backdrop-blur-sm shrink-0 dark:bg-white/10 dark:ring-white/15',
          className,
        )}
      >
        <img src={src} alt="" className={cn('size-9 object-contain', imageClassName)} />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex size-12 items-center justify-center rounded-xl shrink-0',
        'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.5)] ring-1 ring-white/35 backdrop-blur-sm dark:ring-white/10',
        meta.tint,
        className,
      )}
    >
      <HugeiconsIcon icon={meta.icon} strokeWidth={2} />
    </div>
  )
}
