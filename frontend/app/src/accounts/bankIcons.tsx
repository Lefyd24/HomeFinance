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
] as const

export type BankIconValue = (typeof BANK_ICONS)[number]['value']

export function bankIconSrc(icon: string | null | undefined): string | null {
  if (!icon) return null
  const match = BANK_ICONS.find((b) => b.value === icon || b.file === icon)
  const file = match?.file ?? icon
  return `/assets/icons/banks/${file}`
}

const TYPE_META: Record<
  AccountType,
  { label: string; icon: typeof BankIcon; tint: string }
> = {
  checking: { label: 'Checking', icon: BankIcon, tint: 'bg-primary/15 text-primary' },
  savings: { label: 'Savings', icon: SafeBoxIcon, tint: 'bg-success/15 text-success' },
  credit: { label: 'Credit', icon: CreditCardIcon, tint: 'bg-destructive/15 text-destructive' },
  cash: { label: 'Cash', icon: Money01Icon, tint: 'bg-chart-3/20 text-chart-3' },
  investment: { label: 'Investment', icon: ChartIncreaseIcon, tint: 'bg-chart-2/20 text-chart-2' },
}

export function getAccountTypeMeta(type: AccountType) {
  return TYPE_META[type] ?? { label: type, icon: Wallet01Icon, tint: 'bg-muted text-muted-foreground' }
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
          'flex size-12 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-border shrink-0',
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
        meta.tint,
        className,
      )}
    >
      <HugeiconsIcon icon={meta.icon} strokeWidth={2} />
    </div>
  )
}
