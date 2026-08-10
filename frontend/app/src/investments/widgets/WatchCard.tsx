import { useNavigate } from 'react-router-dom'
import { TriangleIcon, XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Widget,
  WidgetHeader,
  WidgetTitle,
  WidgetContent,
} from '@/components/ui/widget'
import { formatCurrency } from '../../lib/format'
import type { SavedWatch } from '../investmentsApi'

/**
 * A mobile-friendly watch card for a saved company.
 *
 * - No glass effect, uses the shared widget card primitives
 * - Full-width responsive — grid handles columns
 * - Day change coloured with flow-in / flow-out tokens
 */
export function WatchCard({ watch, onDelete }: { watch: SavedWatch; onDelete: () => void }) {
  const navigate = useNavigate()
  const positive = (watch.day_change_pct ?? 0) >= 0

  const handleNavigate = () => {
    navigate(`/investments/research?symbol=${encodeURIComponent(watch.symbol)}`)
  }

  return (
    <Widget
      design="mumbai"
      className="group relative h-full w-full cursor-pointer border-border bg-card p-4 shadow-lg whitespace-normal transition-shadow hover:shadow-xl"
      onClick={handleNavigate}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handleNavigate()
        }
      }}
      role="button"
      tabIndex={0}
    >
      <WidgetHeader className="items-start">
        <WidgetTitle className="flex w-full items-center justify-between gap-2">
          <div className="flex min-w-0 flex-col">
            <span className="text-lg font-semibold leading-tight">{watch.symbol}</span>
            {watch.name && (
              <span className="block truncate text-xs text-muted-foreground">
                {watch.name}
              </span>
            )}
          </div>
          {watch.last_updated && (
            <span className="shrink-0 text-[0.625rem] text-muted-foreground/50">
              {new Date(watch.last_updated).toLocaleDateString()}
            </span>
          )}
        </WidgetTitle>
      </WidgetHeader>

      <WidgetContent className="mt-2 flex-col items-start justify-start gap-1">
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
        <div className="flex items-center gap-2">
          <span className="text-xl font-semibold tabular-nums leading-none">
            {watch.last_price != null ? formatCurrency(watch.last_price, 'USD') : '—'}
          </span>
          <TriangleIcon
            className={cn(
              'size-5 stroke-none',
              positive ? 'fill-flow-in' : 'fill-flow-out rotate-180',
            )}
          />
        </div>
      </WidgetContent>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onDelete()
        }}
        className={cn(
          'absolute right-2.5 top-2.5 flex size-6 items-center justify-center',
          'rounded-full bg-background/90 text-muted-foreground',
          'hover:bg-flow-out/10 hover:text-flow-out',
          'opacity-0 group-hover:opacity-100 sm:opacity-0',
        )}
        aria-label="Remove from watchlist"
      >
        <XIcon className="size-3.5" />
      </button>
    </Widget>
  )
}
