/**
 * The print vocabulary for investment report PDFs.
 *
 * A PDF is a fixed, light, ink-on-paper surface — it has no theme to follow and
 * no CSS variables to read, so every colour here is a literal. They are the
 * *light* theme's tokens from `index.css`, converted from oklch to sRGB hex, so
 * a printed report and the screen it came from speak the same colour language:
 * `--flow-in`/`--flow-out` for polarity, `--chart-1`…`--chart-5` for identity.
 *
 * Series colours walk the same order as `chartConfig.SERIES_COLORS`, so an
 * instrument keeps its colour between the page and the export.
 */

export const PRINT = {
  /** Body ink. */
  ink: '#0d172a',
  /** Secondary ink — labels, captions, axis text. */
  inkMuted: '#3b495d',
  /** Tertiary ink — footnotes, watermark-weight text. */
  inkFaint: '#7e8792',
  /** Inverted ink, for text on a filled surface. */
  inkInverse: '#ffffff',

  /** Page ground. Kept pure white — printers do not reproduce a tinted page. */
  paper: '#ffffff',
  /** A panel that needs to separate from the page without a border. */
  surface: '#f7f9fc',
  /** The zebra stripe / table header tint. */
  surfaceAlt: '#f1f4f7',

  /** Hairlines. */
  rule: '#e2e8f0',
  ruleSoft: '#eef2f7',

  /** The brand accent — headings, the cover bar, emphasis marks. */
  accent: '#1e3a5f',

  /** Polarity. Never used for identity. */
  positive: '#00973c',
  negative: '#e00119',
  /** Tints of the above, for chart fills that sit under text. */
  positiveSoft: '#d8f0e2',
  negativeSoft: '#fbdfe2',
} as const

/**
 * Identity colours, in the order a chart reaches for them — the same walk as
 * `chartConfig.SERIES_COLORS` (chart-4, chart-2, chart-5, chart-1, chart-3).
 */
export const PRINT_SERIES = ['#3299fe', '#1c588e', '#39bdf8', '#1e3a5f', '#007ec4'] as const

/** Beyond five series the eye stops telling colours apart — see `chartConfig`. */
export const PRINT_SERIES_OVERFLOW = '#7e8792'

export function printSeriesColor(index: number): string {
  return PRINT_SERIES[index] ?? PRINT_SERIES_OVERFLOW
}

/** Up, down, or flat — the print half of `chartConfig.polarityColor`. */
export function printPolarityColor(value: number | null | undefined): string {
  if (value == null || value === 0) return PRINT.inkFaint
  return value > 0 ? PRINT.positive : PRINT.negative
}

/** Type scale, in points. A PDF point is 1/72in, so these are true print sizes. */
export const TYPE = {
  /** The cover title. */
  display: 24,
  /** A page-level heading. */
  title: 15,
  /** A section heading. */
  heading: 9,
  /** The identity block's price — the biggest figure off the cover. */
  figureLg: 19,
  /** A card's headline figure. */
  figure: 15,
  /** A small card's headline figure. */
  figureSm: 11,
  /** Running body copy. */
  body: 8.5,
  /** Table cells, labels. */
  small: 7.5,
  /** Footnotes, axis ticks, eyebrows. */
  micro: 6.5,
} as const

/** Page geometry, in points. A4 is 595.28 x 841.89. */
export const PAGE = {
  marginX: 34,
  marginTop: 40,
  marginBottom: 40,
  /** Usable width: A4 width minus both margins. Charts size themselves off it. */
  contentWidth: 595.28 - 34 * 2,
} as const

export const RADIUS = 4

/**
 * `Font.register` needs a real TTF — the app's UI font ships as woff2 only,
 * which fontkit cannot read, so static Inter cuts live in `public/fonts`.
 * Latin *and* Greek, because the app is bilingual and the built-in Helvetica
 * has no Greek glyphs at all.
 */
export const PDF_FONT_FAMILY = 'Inter'

export const PDF_FONT_SOURCES = [
  { src: '/fonts/Inter-Regular.ttf', fontWeight: 400 as const },
  { src: '/fonts/Inter-Medium.ttf', fontWeight: 500 as const },
  { src: '/fonts/Inter-SemiBold.ttf', fontWeight: 600 as const },
  { src: '/fonts/Inter-Bold.ttf', fontWeight: 700 as const },
]
