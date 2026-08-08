import { useNavigate } from 'react-router-dom'
import { TriangleIcon, XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '../../lib/format'
import type { SavedWatch } from '../investmentsApi'

/**
 * A mobile-friendly watch card for a saved company.
 *
 * - No glass effect, uses shadow-xl for depth
 * - Rounded-2xl for a soft, modern look
 * - Full-width responsive — grid handles columns
 * - Day change coloured with flow-in / flow-out tokens
 */
export function WatchCard({ watch, onDelete }: { watch: SavedWatch; onDelete: () => void }) {
  const navigate = useNavigate()
  const positive = (watch.day_change_pct ?? 0) >= 0

  return (
    <button
      type="button"
      className="relative group w-full text-left rounded-2xl border border-border bg-card p-4 shadow-lg hover:shadow-xl transition-shadow"
      onClick={() =>
        navigate(`/investments/research?symbol=${encodeURIComponent(watch.symbol)}`)
      }
    >
      {/* Header — price + direction triangle */}
      <div className="flex items-start justify-between">
        <span className="text-xl font-semibold tabular-nums leading-none">
          {watch.last_price != null ? formatCurrency(watch.last_price, 'USD') : '—'}
        </span>
        <TriangleIcon
          className={cn(
            'size-5 stroke-none mt-0.5',
            positive ? 'fill-flow-in' : 'fill-flow-out rotate-180',
          )}
        />
      </div>

      {/* Day change */}
      <div className="mt-1.5">
        {watch.day_change_pct != null && (
          <span
            className={cn(
              'text-sm tabular-nums font-medium',
              positive ? 'text-flow-in' : 'text-flow-out',
            )}
          >
            {positive ? '+' : ''}
            {watch.day_change_pct.toFixed(2)}%
          </span>
        )}
      </div>

      {/* Footer — symbol + name */}
      <div className="mt-3 pt-3 border-t border-border/60">
        <span className="block text-lg font-semibold leading-tight">{watch.symbol}</span>
        {watch.name && (
          <span className="block text-xs text-muted-foreground truncate mt-0.5">
            {watch.name}
          </span>
        )}
        {watch.last_updated && (
          <span className="block text-[0.625rem] text-muted-foreground/50 mt-1">
            {new Date(watch.last_updated).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* Delete button — only on hover (desktop) or always visible (touch) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className={cn(
          'absolute top-2.5 right-2.5 size-6 flex items-center justify-center',
          'rounded-full bg-background/90 text-muted-foreground',
          'hover:text-flow-out hover:bg-flow-out/10',
          // Always visible on touch devices, opacity transition on hover-capable
          'opacity-0 group-hover:opacity-100',
          'sm:opacity-0', // Hide by default on large screens
        )}
        aria-label="Remove from watchlist"
      >
        <XIcon className="size-3.5" />
      </button>
    </button>
  )
}
