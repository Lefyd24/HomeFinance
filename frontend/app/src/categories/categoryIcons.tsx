import { HugeiconsIcon } from '@hugeicons/react'
import {
  // General
  TagIcon,
  ArrowUpDownIcon,

  // ── Food & Dining ──
  Restaurant02Icon,
  ShoppingBasket01Icon,
  CafeIcon,
  Pizza01Icon,
  BeerIcon,
  CoffeeIcon,
  StreetFoodIcon,
  Bread01Icon,
  CakeIcon,

  // ── Transport & Vehicle ──
  BusIcon,
  Car01Icon,
  PetrolPumpIcon,
  CarParking01Icon,
  Bicycle01Icon,
  BikeIcon,
  TrainIcon,
  TaxiIcon,

  // ── Home & Housing ──
  Home01Icon,
  BuildingIcon,
  HouseHeartIcon,
  HousePlugIcon,
  ElectricHome01Icon,
  DropletIcon,
  GasPipeIcon,
  EnergyIcon,
  BulbIcon,

  // ── Technology & Subscriptions ──
  AiPhoneIcon,
  WifiConnected02Icon,
  SmartPhoneIcon,
  ComputerIcon,
  LaptopIcon,
  RepeatIcon,
  TabletIcon,

  // ── Shopping & Fashion ──
  ShoppingCartIcon,
  TShirtIcon,
  Shirt01Icon,
  ClothesIcon,
  HairDryerIcon,

  // ── Health & Medical ──
  HeartCheckIcon,
  Doctor01Icon,
  Hospital01Icon,
  PillIcon,
  PillBottleIcon,
  DentalToothIcon,
  AmbulanceIcon,

  // ── Entertainment & Leisure ──
  GameController01Icon,
  Film01Icon,
  MusicNoteIcon,
  DiscIcon,
  HeadphonesIcon,
  PartyIcon,
  Confetti,
  Birthday,

  // ── Sports & Fitness ──
  RunningShoesIcon,
  WorkoutSportIcon,
  EquipmentGym01Icon,
  Yoga01Icon,
  WalkingIcon,

  // ── Education & Knowledge ──
  GraduationCapIcon,
  Book01Icon,
  Notebook01Icon,
  PenIcon,
  Library,

  // ── Travel & Vacation ──
  PlaneIcon,
  AirplaneIcon,
  LuggageIcon,
  BeachIcon,
  UmbrellaIcon,
  HotelIcon,
  HotAirBalloonIcon,

  // ── Household & Maintenance ──
  CleaningBucketIcon,
  WashingMachineIcon,
  ToolsIcon,
  RepairIcon,
  Plant01Icon,
  FlowerIcon,
  Leaf01Icon,

  // ── Pets & Nature ──
  CatIcon,
  FishIcon,

  // ── Gifts, Charity & Social ──
  GiftCardIcon,
  GiftIcon,
  CharityIcon,
  HandHeartIcon,
  HandHelpingIcon,

  // ── Money & Finance (Income) ──
  MoneyBag01Icon,
  MoneyReceive01Icon,
  BriefcaseIcon,
  Bitcoin01Icon,
  Wallet01Icon,
  CashbackIcon,
  Award01Icon,
  SaveMoneyDollarIcon,
  PiggyBankIcon,
  Coins01Icon,
  BankIcon,
  BanknoteIcon,
  CreditCardIcon,
  SafeIcon,

  // ── Money & Finance (Expense/General) ──
  Invoice01Icon,
  ChartLine,
  ChartBarIncreasing,
  PieChart,
  PercentIcon,
  DiscountTag01Icon,
  CouponIcon,
  DollarIcon,
  EuroIcon,
  MoneyIcon,
  CurrencyIcon,
  TransactionIcon,
  ExchangeIcon,

  // ── Goals, Savings & Planning ──
  GoalIcon,
  TargetIcon,
  TaxesIcon,
  ShieldIcon,
  StarIcon,

  // ── Transfer ──
  Gif01Icon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

/**
 * ICON_MAP — maps semantic category keys to HugeIcons components.
 *
 * Organized by domain. Each key is a category identifier stored in the database.
 * When adding new icons, import the icon component above and add the mapping here.
 * All icon names must match exports from @hugeicons/core-free-icons.
 */
export const ICON_MAP = {
  // ═══════════════════════════════════════
  //  General / Default
  // ═══════════════════════════════════════
  default: TagIcon,

  // ═══════════════════════════════════════
  //  EXPENSES
  // ═══════════════════════════════════════

  // ── Food & Dining ──
  food: Restaurant02Icon,
  groceries: ShoppingBasket01Icon,
  dining: CafeIcon,
  takeaway: Pizza01Icon,
  drinks: BeerIcon,
  coffee: CoffeeIcon,
  bakery: Bread01Icon,
  dessert: CakeIcon,
  fastfood: StreetFoodIcon,

  // ── Transport & Vehicle ──
  transport: BusIcon,
  car: Car01Icon,
  fuel: PetrolPumpIcon,
  parking: CarParking01Icon,
  bicycle: Bicycle01Icon,
  bike: BikeIcon,
  train: TrainIcon,
  taxi: TaxiIcon,

  // ── Home & Housing ──
  home: Home01Icon,
  rent: BuildingIcon,
  mortgage: HouseHeartIcon,
  maintenance: HousePlugIcon,
  electricity: ElectricHome01Icon,
  water: DropletIcon,
  gas: GasPipeIcon,
  energy: EnergyIcon,
  lighting: BulbIcon,

  // ── Technology & Subscriptions ──
  utilities: AiPhoneIcon,
  internet: WifiConnected02Icon,
  phone: SmartPhoneIcon,
  computer: ComputerIcon,
  laptop: LaptopIcon,
  subscriptions: RepeatIcon,
  electronics: TabletIcon,

  // ── Shopping & Fashion ──
  shopping: ShoppingCartIcon,
  clothing: TShirtIcon,
  clothes: Shirt01Icon,
  fashion: ClothesIcon,
  beauty: HairDryerIcon,

  // ── Health & Medical ──
  health: HeartCheckIcon,
  medical: Doctor01Icon,
  hospital: Hospital01Icon,
  pharmacy: PillIcon,
  medication: PillBottleIcon,
  dental: DentalToothIcon,
  emergency: AmbulanceIcon,

  // ── Entertainment & Leisure ──
  entertainment: GameController01Icon,
  movies: Film01Icon,
  music: MusicNoteIcon,
  albums: DiscIcon,
  headphones: HeadphonesIcon,
  party: PartyIcon,
  celebration: Confetti,
  birthday: Birthday,

  // ── Sports & Fitness ──
  sports: RunningShoesIcon,
  fitness: WorkoutSportIcon,
  gym: EquipmentGym01Icon,
  yoga: Yoga01Icon,
  walking: WalkingIcon,

  // ── Education & Knowledge ──
  education: GraduationCapIcon,
  books: Book01Icon,
  notebook: Notebook01Icon,
  stationery: PenIcon,
  learning: Library,

  // ── Travel & Vacation ──
  travel: PlaneIcon,
  flight: AirplaneIcon,
  luggage: LuggageIcon,
  holiday: BeachIcon,
  umbrella: UmbrellaIcon,
  hotel: HotelIcon,
  adventure: HotAirBalloonIcon,

  // ── Household & Maintenance ──
  cleaning: CleaningBucketIcon,
  laundry: WashingMachineIcon,
  tools: ToolsIcon,
  repairs: RepairIcon,
  garden: Plant01Icon,
  flowers: FlowerIcon,
  plants: Leaf01Icon,

  // ── Pets & Animals ──
  pets: CatIcon,
  petfood: FishIcon,

  // ── Gifts, Charity & Social ──
  gift: GiftCardIcon,
  presents: GiftIcon,
  charity: CharityIcon,
  donation: HandHeartIcon,
  helping: HandHelpingIcon,

  // ═══════════════════════════════════════
  //  INCOME
  // ═══════════════════════════════════════

  salary: MoneyBag01Icon,
  income: MoneyReceive01Icon,
  work: BriefcaseIcon,
  freelance: BriefcaseIcon,
  investment: Bitcoin01Icon,
  allowance: Wallet01Icon,
  cashback: CashbackIcon,
  bonus: Award01Icon,
  savings: SaveMoneyDollarIcon,
  piggybank: PiggyBankIcon,
  dividend: Coins01Icon,
  bank: BankIcon,
  banknote: BanknoteIcon,
  card: CreditCardIcon,
  safe: SafeIcon,

  // ── Earnings & Returns ──
  interest: ChartLine,
  profit: ChartBarIncreasing,
  portfolio: PieChart,
  discount: PercentIcon,
  coupon: DiscountTag01Icon,
  voucher: CouponIcon,
  currency: DollarIcon,
  foreign: EuroIcon,
  cash: MoneyIcon,
  exchange: CurrencyIcon,
  transaction: TransactionIcon,
  swap: ExchangeIcon,

  // ═══════════════════════════════════════
  //  TRANSFERS & BILLING
  // ═══════════════════════════════════════

  transfer: ArrowUpDownIcon,
  invoice: Invoice01Icon,
  giftcard: Gif01Icon,

  // ═══════════════════════════════════════
  //  GOALS, TAXES & PROTECTION
  // ═══════════════════════════════════════

  goal: GoalIcon,
  target: TargetIcon,
  tax: TaxesIcon,
  insurance: ShieldIcon,
  achievement: StarIcon,
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
        'shadow-sm ring-1 ring-inset',
        className,
      )}
      style={{
        backgroundColor: `color-mix(in oklch, ${color} 22%, transparent)`,
        '--tw-ring-color': `color-mix(in oklch, ${color} 30%, transparent)`,
      } as React.CSSProperties}
    >
      <HugeiconsIcon
        icon={iconKey}
        size={size}
        strokeWidth={1.8}
        style={{ color }}
      />
    </div>
  )
}

export function getIconOptions(): { value: string; label: string }[] {
  return Object.keys(ICON_MAP).map((key) => ({
    value: key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
  }))
}
