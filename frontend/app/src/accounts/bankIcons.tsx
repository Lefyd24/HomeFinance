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
 *
 * `gradient` and `glow` are the account card's own surface: a deep, fully
 * opaque field in the type's hue, carrying white text. Those two are fixed
 * hex rather than theme tokens because the card is dark in *both* themes — the
 * same choice the portfolio's contact card makes — so there is no light-mode
 * variant for them to follow.
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
    /** Deep two-stop field behind the account card. */
    gradient: string
    /** Blurred blob lighting one corner of that field. */
    glow: string
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
    gradient: 'bg-gradient-to-br from-[#1e3a5f] to-[#0d1c30]',
    glow: 'bg-sky-400/25',
  },
  savings: {
    label: 'Savings',
    plural: 'Savings',
    icon: SafeBoxIcon,
    tint: 'bg-success/15 text-success',
    fill: 'bg-success',
    ambient: 'bg-success/30',
    text: 'text-success',
    gradient: 'bg-gradient-to-br from-[#0d4a3d] to-[#052a22]',
    glow: 'bg-emerald-300/25',
  },
  credit: {
    label: 'Credit',
    plural: 'Credit',
    icon: CreditCardIcon,
    tint: 'bg-flow-out/15 text-flow-out',
    fill: 'bg-flow-out',
    ambient: 'bg-flow-out/25',
    text: 'text-flow-out',
    gradient: 'bg-gradient-to-br from-[#6d1f2c] to-[#390e16]',
    glow: 'bg-rose-300/25',
  },
  cash: {
    label: 'Cash',
    plural: 'Cash',
    icon: Money01Icon,
    tint: 'bg-warning/20 text-warning',
    fill: 'bg-warning',
    ambient: 'bg-warning/25',
    text: 'text-warning',
    gradient: 'bg-gradient-to-br from-[#6b3f12] to-[#3a2008]',
    glow: 'bg-amber-300/25',
  },
  investment: {
    label: 'Investment',
    plural: 'Investments',
    icon: ChartIncreaseIcon,
    tint: 'bg-flow-move/15 text-flow-move',
    fill: 'bg-flow-move',
    ambient: 'bg-flow-move/25',
    text: 'text-flow-move',
    gradient: 'bg-gradient-to-br from-[#2e2a6b] to-[#17143d]',
    glow: 'bg-indigo-300/25',
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
      gradient: 'bg-gradient-to-br from-[#2b3442] to-[#151b24]',
      glow: 'bg-slate-300/20',
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
          'flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-xs dark:bg-white/10',
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
        'flex size-12 shrink-0 items-center justify-center rounded-2xl',
        'shadow-xs',
        meta.tint,
        className,
      )}
    >
      <HugeiconsIcon icon={meta.icon} strokeWidth={2} />
    </div>
  )
}
