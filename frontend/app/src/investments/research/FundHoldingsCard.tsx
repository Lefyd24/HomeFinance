import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { seriesColor } from '../chartConfig'
import type { AssetClassMix, CompanyProfile, EtfHolding, SectorWeight } from '../investmentsApi'
import { fmtPct } from './researchFormat'

/** `financial_services` -> `Financial services` — Yahoo ships sector ids as snake_case,
 * and there is no i18n dictionary for the ~11 GICS-style sector names, so this is a
 * plain client-side humanization rather than translated copy. */
function humanizeSector(id: string): string {
  const spaced = id.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function HoldingRow({ holding, maxWeight }: { holding: EtfHolding; maxWeight: number }) {
  const pct = holding.weight != null && maxWeight > 0 ? (holding.weight / maxWeight) * 100 : 0
  return (
    <div className="break-inside-avoid-column py-1.5">
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium">
            {holding.symbol}
            {holding.name && (
              <span className="ms-1.5 truncate text-xs font-normal text-muted-foreground">
                {holding.name}
              </span>
            )}
          </span>
          <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
            {fmtPct(holding.weight)}
          </span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary/70"
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
      </div>
    </div>
  )
}

/** No cap on the list — its natural length is what should set the column's
 * (and so the card's) height, rather than an arbitrary top-N truncation. */
function SectorList({ sectors }: { sectors: SectorWeight[] }) {
  const max = sectors.reduce((acc, s) => Math.max(acc, s.weight), 0)

  return (
    <div className="flex flex-1 flex-col justify-between gap-1.5">
      {sectors.map((s) => (
        <div key={s.sector} className="flex items-center gap-2">
          <span className="w-24 shrink-0 truncate text-xs text-muted-foreground sm:w-28">
            {humanizeSector(s.sector)}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{
                width: `${max > 0 ? (s.weight / max) * 100 : 0}%`,
                backgroundColor: 'var(--chart-2)',
              }}
            />
          </div>
          <span className="w-9 shrink-0 text-end text-xs tabular-nums text-muted-foreground">
            {fmtPct(s.weight, { decimals: 0 })}
          </span>
        </div>
      ))}
    </div>
  )
}

const ASSET_CLASS_KEYS: (keyof AssetClassMix)[] = ['stock', 'bond', 'cash', 'preferred', 'other']

/** Rows, not a stacked progress bar — a fund's split is 2-4 numbers, and a
 * bare bar under-uses the space a full card row gives it. Each class gets its
 * own swatch-and-figure row instead, matching the sector list's rhythm. */
function AssetMix({ mix }: { mix: AssetClassMix }) {
  const { t } = useTranslation('investments')
  const segments = ASSET_CLASS_KEYS.map((key, index) => ({
    key,
    color: seriesColor(index),
    value: mix[key] ?? 0,
  })).filter((segment) => segment.value > 0)

  if (segments.length === 0) return null

  return (
    <div className="flex flex-1 flex-col justify-between gap-2">
      {segments.map((segment) => (
        <div
          key={segment.key}
          className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5"
        >
          <span className="inline-flex items-center gap-2 text-sm font-medium">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: segment.color }}
            />
            {t(`research.assetClasses.${segment.key}`)}
          </span>
          <span className="text-sm font-semibold tabular-nums">
            {fmtPct(segment.value, { decimals: 1 })}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * A fund's sector mix and stock/bond/cash split — two short, similarly-sized
 * blocks, so this card stays compact instead of stretching to match a much
 * taller sibling (that's why holdings live in their own `TopHoldingsCard`,
 * not here).
 */
export function FundCompositionCard({
  profile,
  className,
}: {
  profile: CompanyProfile
  className?: string
}) {
  const { t } = useTranslation('investments')
  if (profile.quote_type !== 'etf' && profile.quote_type !== 'mutual_fund') return null

  const sectors = profile.sector_weightings ?? []
  const mix = profile.asset_classes
  if (sectors.length === 0 && !mix) return null

  return (
    <Card size="sm" className={cn('flex flex-col', className)}>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-muted-foreground">
          {t('research.compositionTitle')}
        </CardTitle>
        {profile.fund_family && (
          <p className="text-xs text-muted-foreground">{profile.fund_family}</p>
        )}
      </CardHeader>
      <CardContent
        className={cn(
          'grid grid-cols-1 items-stretch gap-x-8 gap-y-4',
          sectors.length > 0 && mix != null && 'sm:grid-cols-2',
        )}
      >
        {sectors.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {t('research.sectorWeightings')}
            </p>
            <SectorList sectors={sectors} />
          </div>
        )}
        {mix && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">{t('research.assetMix')}</p>
            <AssetMix mix={mix} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * An ETF/mutual fund's top constituents. Kept in its own full-width row
 * rather than sharing a grid row with `FundCompositionCard` — ~10 holdings is
 * taller than the sector/asset-mix blocks, and pairing them stretched the
 * shorter card to match, leaving a visibly empty lower half.
 */
export function TopHoldingsCard({
  profile,
  className,
}: {
  profile: CompanyProfile
  className?: string
}) {
  const { t } = useTranslation('investments')
  if (profile.quote_type !== 'etf' && profile.quote_type !== 'mutual_fund') return null

  const holdings = profile.top_holdings ?? []
  if (holdings.length === 0) return null

  const maxWeight = holdings.reduce((acc, h) => Math.max(acc, h.weight ?? 0), 0)

  return (
    <Card size="sm" className={cn('flex flex-col', className)}>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-muted-foreground">
          {t('research.holdingsTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border/50 sm:columns-2 sm:divide-y-0 sm:gap-x-8 lg:columns-3">
          {holdings.map((holding) => (
            <HoldingRow key={holding.symbol} holding={holding} maxWeight={maxWeight} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
