import { useMemo } from 'react'
import { useReducedMotion } from 'motion/react'

/**
 * Chart vocabulary for the investments sub-app.
 *
 * Investments is the one place in the app that charts with recharts (the rest
 * of the app is on ECharts via `reports/chartTheme.ts`), so the two stacks need
 * to agree on meaning even though they don't share code. The rule is the same
 * one `reports/chartTheme.ts` states: colour is assigned by *job*, never by
 * position in a list.
 *
 * - Polarity — did this go up or down — is `--flow-in` / `--flow-out`, the same
 *   tokens `InvestmentPrimitives` uses for every number on the page.
 * - Identity — which series is which — walks `--chart-1`…`--chart-5`.
 *
 * Everything is a CSS variable rather than a literal, so light/dark comes for
 * free through `ChartStyle` and nothing has to re-read the DOM on theme change
 * the way the ECharts side has to.
 */

/** Identity colours, in the order a chart should reach for them. */
export const SERIES_COLORS = [
  'var(--chart-4)',
  'var(--chart-2)',
  'var(--chart-5)',
  'var(--chart-1)',
  'var(--chart-3)',
] as const

/**
 * Beyond five slices the eye stops telling colours apart, so the tail folds
 * into one muted grey rather than cycling the palette and implying a
 * distinction that isn't legible.
 */
export const OVERFLOW_COLOR = 'var(--muted-foreground)'

export function seriesColor(index: number): string {
  return SERIES_COLORS[index] ?? OVERFLOW_COLOR
}

/** Up, down, or flat — the same three-way split as `DeltaPct`. */
export function polarityColor(value: number | null | undefined): string {
  if (value == null || value === 0) return 'var(--muted-foreground)'
  return value > 0 ? 'var(--flow-in)' : 'var(--flow-out)'
}

/**
 * The halo that goes with `polarityColor`, as an SVG filter.
 *
 * The ECharts half of the app gets this from `polarityItemStyle`'s
 * `shadowBlur`; recharts has no equivalent, so a `drop-shadow()` on the mark
 * stands in. Flat values get nothing — a glow means "this moved".
 *
 * Use it on marks with room around them (a bar in a ranked list, a single
 * line), not on dense series where neighbouring halos would smear together.
 */
export function polarityGlow(value: number | null | undefined): string | undefined {
  if (value == null || value === 0) return undefined
  return value > 0
    ? 'drop-shadow(0 0 5px var(--flow-in-glow))'
    : 'drop-shadow(0 0 5px var(--flow-out-glow))'
}

/**
 * Recharts animates by default and has no notion of the user's motion
 * preference. Every other animated surface in this app honours it (see the
 * `prefers-reduced-motion` blocks in `index.css`), so investments charts have
 * to opt in by hand — spread the result onto each series.
 */
export function useChartMotion() {
  const reduced = useReducedMotion()
  return useMemo(
    () => ({ isAnimationActive: !reduced, animationDuration: reduced ? 0 : 400 }),
    [reduced],
  )
}
