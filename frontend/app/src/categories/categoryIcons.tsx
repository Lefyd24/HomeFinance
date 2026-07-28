import { HugeiconsIcon } from '@hugeicons/react'
import {
  ShoppingCartIcon,
  Restaurant02Icon,
  BusIcon,
  Home01Icon,
  MoneyBag01Icon,
  Gif01Icon,
  ArrowUpDownIcon,
  TagIcon,
  Invoice01Icon,
  CoffeeIcon,
  GameController01Icon,
  HeartCheckIcon,
  GraduationCapIcon,
  PlaneIcon,
  AiPhoneIcon,
  ShoppingBasket01Icon,
  BriefcaseIcon,
  Bitcoin01Icon,
  MoneyReceive01Icon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

export const ICON_MAP = {
  default: TagIcon,
  shopping: ShoppingCartIcon,
  food: Restaurant02Icon,
  groceries: ShoppingBasket01Icon,
  transport: BusIcon,
  home: Home01Icon,
  salary: MoneyBag01Icon,
  gift: Gif01Icon,
  transfer: ArrowUpDownIcon,
  invoice: Invoice01Icon,
  coffee: CoffeeIcon,
  entertainment: GameController01Icon,
  health: HeartCheckIcon,
  education: GraduationCapIcon,
  travel: PlaneIcon,
  utilities: AiPhoneIcon,
  work: BriefcaseIcon,
  investment: Bitcoin01Icon,
  income: MoneyReceive01Icon,
} as const

export type IconKey = keyof typeof ICON_MAP

export function CategoryIcon({
  icon,
  color,
  className,
  size = 20,
}: {
  icon?: string | null
  color: string
  className?: string
  size?: number
}) {
  const iconKey = (icon && ICON_MAP[icon as IconKey]) || ICON_MAP.default

  return (
    <div
      className={cn(
        'flex size-9 items-center justify-center rounded-full shrink-0',
        className,
      )}
      style={{ backgroundColor: `${color}20` }}
    >
      <HugeiconsIcon icon={iconKey} size={size} style={{ color }} />
    </div>
  )
}

export function getIconOptions(): { value: string; label: string }[] {
  return Object.keys(ICON_MAP).map((key) => ({
    value: key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
  }))
}
