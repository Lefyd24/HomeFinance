/**
 * One visual system for every chart on the Reports page.
 *
 * Colour is assigned by the job it does, not by series index:
 *
 * - **Polarity** (money in vs money out, surplus vs shortfall) uses the
 *   `--chart-positive` / `--chart-negative` tokens — the saturated, glowing
 *   siblings of the `--success` / `--destructive` text colours, so a chart and
 *   the numbers beside it read as the same hue without a 12px label having to
 *   carry chart-strength saturation. Position and a legend always carry the
 *   same meaning too, so nothing depends on hue alone.
 * - **Identity** (categories, merchants, accounts — many series at once) uses a
 *   fixed eight-slot categorical palette validated for colour-vision
 *   deficiency. Slots are assigned in order and never cycled: a ninth series
 *   folds into "Other" rather than inventing a hue.
 * - **Magnitude** (heat cells) uses a single hue, light to dark.
 *
 * Every value is read live from the stylesheet so light/dark and any future
 * theme edit flow through without touching chart code.
 */
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'

/**
 * Categorical slots, ordered so that adjacent pairs stay separable under
 * simulated colour-vision deficiency. Do not reorder — the ordering is the
 * safety mechanism, not decoration.
 */
const CATEGORICAL_LIGHT = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
]

const CATEGORICAL_DARK = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#008300',
  '#9085e9',
  '#e66767',
]

export const MAX_SERIES = CATEGORICAL_LIGHT.length

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function domIsDark(): boolean {
  if (typeof document === 'undefined') return false
  return document.documentElement.classList.contains('dark')
}

/**
 * next-themes updates `resolvedTheme` in React state before it applies the
 * `class` on `<html>`, so a synchronous read of CSS variables during render
 * can return the previous theme's ink/muted colours. Use fallbacks until the
 * DOM matches `isDark`, and re-read after the attribute has been applied.
 */
function syncedCssVar(
  name: string,
  isDark: boolean,
  lightFallback: string,
  darkFallback: string,
): string {
  const fallback = isDark ? darkFallback : lightFallback
  if (typeof window === 'undefined') return fallback
  if (domIsDark() !== isDark) return fallback
  return cssVar(name, fallback)
}

export function createChartTheme(isDark: boolean): ChartTheme {
  const categorical = isDark ? CATEGORICAL_DARK : CATEGORICAL_LIGHT
  const overflow = '#898781'

  return {
    isDark,
    positive: syncedCssVar('--chart-positive', isDark, '#00a250', '#3ee98a'),
    negative: syncedCssVar('--chart-negative', isDark, '#e6162c', '#ff5c57'),
    positiveGlow: syncedCssVar(
      '--chart-positive-glow',
      isDark,
      'rgba(0,162,80,0.42)',
      'rgba(62,233,138,0.45)',
    ),
    negativeGlow: syncedCssVar(
      '--chart-negative-glow',
      isDark,
      'rgba(230,22,44,0.42)',
      'rgba(255,92,87,0.45)',
    ),
    neutral: syncedCssVar('--primary', isDark, '#1e3a5f', '#38bdf8'),
    ink: syncedCssVar('--foreground', isDark, '#0f172a', '#f8fafc'),
    muted: syncedCssVar('--muted-foreground', isDark, '#64748b', '#94a3b8'),
    grid: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.09)',
    axis: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.16)',
    surface: syncedCssVar('--card', isDark, '#ffffff', '#141d29'),
    categorical,
    sequential: isDark
      ? ['#16304f', '#23507f', '#2f74b8', '#3399ff', '#7ec3ff']
      : ['#dbeafe', '#a9cdf7', '#5f9ae8', '#2f74b8', '#1e3a5f'],
    seriesColor: (index: number) => categorical[index] ?? overflow,
  }
}

function chartThemeFingerprint(theme: ChartTheme): string {
  return [
    theme.isDark,
    theme.positive,
    theme.negative,
    theme.positiveGlow,
    theme.negativeGlow,
    theme.neutral,
    theme.ink,
    theme.muted,
    theme.surface,
  ].join('|')
}

/** Stops axis tooltips from fading or scaling away other series (or stacked segments). */
export const seriesHoverSafe = {
  emphasis: { focus: 'none' as const, scale: false },
  blur: {
    itemStyle: { opacity: 1 },
    lineStyle: { opacity: 1 },
    areaStyle: { opacity: 1 },
  },
}

/**
 * Item style for a polarity mark (a bar, a point, an area).
 *
 * Polarity is the one thing on a finance chart you should be able to read
 * before you read anything else, so gains and losses carry a soft halo in their
 * own hue on top of the (already saturated) `--chart-positive` /
 * `--chart-negative` fill. The glow is a shadow, not a second series, so it
 * costs nothing in layout and disappears cleanly on export.
 */
export function polarityItemStyle(theme: ChartTheme, polarity: 'positive' | 'negative') {
  const positive = polarity === 'positive'
  return {
    color: positive ? theme.positive : theme.negative,
    shadowBlur: 12,
    shadowColor: positive ? theme.positiveGlow : theme.negativeGlow,
    shadowOffsetY: 1,
  }
}

/** The same treatment for a line series, where the glow tracks the stroke. */
export function polarityLineStyle(theme: ChartTheme, polarity: 'positive' | 'negative') {
  const positive = polarity === 'positive'
  return {
    color: positive ? theme.positive : theme.negative,
    width: 2,
    shadowBlur: 14,
    shadowColor: positive ? theme.positiveGlow : theme.negativeGlow,
  }
}

const noBlurState = {
  itemStyle: { opacity: 1 },
  lineStyle: { opacity: 1 },
  areaStyle: { opacity: 1 },
}

/**
 * ECharts axis tooltips default to `triggerEmphasis: true`, which highlights the
 * hovered category and blurs everything else — bars can look like they vanish.
 * Apply at the Chart wrapper so every reports chart gets consistent hover behavior.
 */
export function normalizeChartOption(option: object): object {
  const opt = option as {
    tooltip?: { axisPointer?: Record<string, unknown> }
    series?: Array<Record<string, unknown>>
  }

  const tooltip =
    opt.tooltip?.axisPointer != null
      ? (() => {
          const axisPointer: Record<string, unknown> = {
            ...opt.tooltip.axisPointer,
            triggerEmphasis: false,
          }
          if (axisPointer.type === 'shadow') {
            axisPointer.type = 'line'
            axisPointer.lineStyle = {
              color:
                (axisPointer.shadowStyle as { color?: string } | undefined)?.color ??
                'rgba(128,128,128,0.45)',
              width: 1,
              type: 'dashed',
            }
            delete axisPointer.shadowStyle
          }
          return { ...opt.tooltip, axisPointer }
        })()
      : opt.tooltip

  const series = opt.series?.map((entry) => ({
    ...entry,
    emphasis: {
      focus: 'none',
      scale: false,
      ...(entry.emphasis as Record<string, unknown> | undefined),
    },
    blur: {
      ...noBlurState,
      ...(entry.blur as Record<string, unknown> | undefined),
      itemStyle: {
        ...noBlurState.itemStyle,
        ...((entry.blur as { itemStyle?: Record<string, unknown> } | undefined)?.itemStyle),
      },
      lineStyle: {
        ...noBlurState.lineStyle,
        ...((entry.blur as { lineStyle?: Record<string, unknown> } | undefined)?.lineStyle),
      },
      areaStyle: {
        ...noBlurState.areaStyle,
        ...((entry.blur as { areaStyle?: Record<string, unknown> } | undefined)?.areaStyle),
      },
    },
  }))

  return {
    blur: noBlurState,
    ...opt,
    ...(tooltip !== undefined ? { tooltip } : {}),
    ...(series !== undefined ? { series } : {}),
  }
}

export interface ChartTheme {
  isDark: boolean
  /** Money in, surplus, "under budget". */
  positive: string
  /** Money out, shortfall, "over budget". */
  negative: string
  /** Halo painted behind a positive mark — see `polarityItemStyle`. */
  positiveGlow: string
  /** Halo painted behind a negative mark — see `polarityItemStyle`. */
  negativeGlow: string
  /** Derived/aggregate series that is neither in nor out — net lines, totals. */
  neutral: string
  ink: string
  muted: string
  grid: string
  axis: string
  surface: string
  /** Identity palette. Index it in order; never modulo past the end. */
  categorical: string[]
  /** Single-hue magnitude ramp, light → dark. */
  sequential: string[]
  /** Colour for the nth identity slot, folding overflow into a muted grey. */
  seriesColor: (index: number) => string
}

export function useChartTheme(): ChartTheme {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const [theme, setTheme] = useState(() =>
    typeof document !== 'undefined' ? createChartTheme(domIsDark()) : createChartTheme(false),
  )

  useEffect(() => {
    if (resolvedTheme === undefined) return

    const sync = () => {
      const next = createChartTheme(isDark)
      setTheme((prev) =>
        chartThemeFingerprint(prev) === chartThemeFingerprint(next) ? prev : next,
      )
    }

    sync()
    // next-themes applies the html `class` in its own effect; one frame later CSS vars match.
    const id = window.requestAnimationFrame(sync)
    return () => window.cancelAnimationFrame(id)
  }, [resolvedTheme, isDark])

  return theme
}

/** Axis/grid/tooltip chrome shared by every cartesian chart. */
export function baseAxisStyle(theme: ChartTheme) {
  return {
    axisLine: { lineStyle: { color: theme.axis } },
    axisTick: { show: false },
    axisLabel: { color: theme.muted, fontSize: 11 },
    splitLine: { lineStyle: { color: theme.grid, type: 'dashed' as const } },
  }
}

export function tooltipStyle(theme: ChartTheme) {
  return {
    backgroundColor: theme.surface,
    borderColor: theme.grid,
    borderWidth: 1,
    padding: [8, 12] as [number, number],
    textStyle: { color: theme.ink, fontSize: 12 },
    extraCssText: 'border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.12);',
  }
}

/** Compact axis labels: 12.4k rather than 12400. */
export function compactNumber(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`
  return `${Math.round(value)}`
}
