/**
 * The shared furniture every investment report PDF is built from.
 *
 * Anything that decides how the paper *looks* — the running header and footer,
 * the section rhythm, the card surface, the table treatment — lives here, so
 * the two report documents (`ComparisonReportDocument`, `CompanyReportDocument`)
 * only decide what to say, never how to set it.
 *
 * This module imports `@react-pdf/renderer` at the top level on purpose: it is
 * only ever reached through the dynamic `import()` in `usePdfExport`, which is
 * what keeps ~400 kB of PDF machinery out of the app's initial bundle.
 */
import type { ComponentProps, ReactNode } from 'react'
import { Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { PAGE, PDF_FONT_FAMILY, PDF_FONT_SOURCES, PRINT, RADIUS, TYPE } from './pdfTheme'

let fontsRegistered = false

/**
 * Idempotent — `Font.register` is global to the renderer, and an export can be
 * run many times in one session.
 */
export function registerPdfFonts() {
  if (fontsRegistered) return
  Font.register({ family: PDF_FONT_FAMILY, fonts: PDF_FONT_SOURCES })
  // react-pdf hyphenates by default, which shreds tickers ("BTC-", "USD") and
  // long metric labels mid-word. Returning the word whole disables it.
  Font.registerHyphenationCallback((word) => [word])
  fontsRegistered = true
}

/**
 * Greek drops its diacritics when uppercased, so `textTransform: 'uppercase'`
 * — which is a plain `toUpperCase()` inside react-pdf — renders "ΈΡΕΥΝΑ
 * ΕΤΑΙΡΕΊΑΣ" where the orthography wants "ΕΡΕΥΝΑ ΕΤΑΙΡΕΙΑΣ". The `el`
 * tailoring gets it right and leaves Latin text exactly as `toUpperCase()`
 * would, so it is safe for both of the app's languages.
 */
export function upper(text: string): string {
  return text.toLocaleUpperCase('el')
}

/**
 * react-pdf resolves `lineHeight` to absolute points against the *same style
 * object's* `fontSize` (see `transformLineHeight` in @react-pdf/stylesheet),
 * and the result is then inherited as that fixed number. So a `lineHeight` on
 * the page would hand every heading the body text's line box and make large
 * type collide with whatever follows it. Every style below therefore declares
 * its leading next to its own size, and the page declares none — anything
 * without an explicit one falls back to the font's own metrics, which never
 * overlaps.
 */
export const s = StyleSheet.create({
  page: {
    fontFamily: PDF_FONT_FAMILY,
    fontSize: TYPE.body,
    color: PRINT.ink,
    backgroundColor: PRINT.paper,
    paddingTop: PAGE.marginTop,
    paddingBottom: PAGE.marginBottom,
    paddingHorizontal: PAGE.marginX,
  },

  // --- running header / footer ---------------------------------------------
  runningHeader: {
    position: 'absolute',
    top: 16,
    left: PAGE.marginX,
    right: PAGE.marginX,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: PRINT.inkFaint,
    fontSize: TYPE.micro,
  },
  runningFooter: {
    position: 'absolute',
    bottom: 18,
    left: PAGE.marginX,
    right: PAGE.marginX,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    color: PRINT.inkFaint,
    fontSize: TYPE.micro,
  },

  // --- cover ----------------------------------------------------------------
  coverBar: { height: 3, width: 46, backgroundColor: PRINT.accent, marginBottom: 10 },
  eyebrow: {
    fontSize: TYPE.micro,
    lineHeight: 1.3,
    letterSpacing: 1.4,
    color: PRINT.inkFaint,
    fontWeight: 600,
  },
  coverTitle: {
    fontSize: TYPE.display,
    lineHeight: 1.2,
    fontWeight: 700,
    letterSpacing: -0.6,
    color: PRINT.ink,
    marginTop: 6,
  },
  coverSubtitle: {
    fontSize: TYPE.body,
    lineHeight: 1.45,
    color: PRINT.inkMuted,
    marginTop: 6,
    maxWidth: 380,
  },

  // --- sections -------------------------------------------------------------
  section: { marginTop: 16 },
  sectionHeadRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  sectionTitle: {
    fontSize: TYPE.heading,
    lineHeight: 1.3,
    fontWeight: 600,
    letterSpacing: 1.1,
    color: PRINT.inkMuted,
  },
  sectionRule: { flex: 1, height: 1, backgroundColor: PRINT.rule, marginLeft: 8 },
  sectionCaption: {
    fontSize: TYPE.small,
    lineHeight: 1.4,
    color: PRINT.inkFaint,
    marginBottom: 7,
    marginTop: -1,
  },

  // --- surfaces -------------------------------------------------------------
  card: {
    borderWidth: 1,
    borderColor: PRINT.rule,
    borderRadius: RADIUS,
    padding: 8,
    backgroundColor: PRINT.paper,
  },
  cardTinted: { backgroundColor: PRINT.surface },

  // --- text -----------------------------------------------------------------
  label: { fontSize: TYPE.micro, lineHeight: 1.35, color: PRINT.inkFaint, letterSpacing: 0.3 },
  body: { fontSize: TYPE.body, lineHeight: 1.45, color: PRINT.ink },
  bodyMuted: { fontSize: TYPE.small, lineHeight: 1.4, color: PRINT.inkMuted },
  figure: { fontSize: TYPE.figure, lineHeight: 1.25, fontWeight: 600, letterSpacing: -0.3 },
  figureSm: { fontSize: TYPE.figureSm, lineHeight: 1.25, fontWeight: 600, letterSpacing: -0.2 },
  /** The identity block's price, the largest figure outside the cover. */
  figureLg: { fontSize: TYPE.figureLg, lineHeight: 1.2, fontWeight: 700, letterSpacing: -0.5 },
  /** A card's own heading, e.g. the company name over the price. */
  cardTitle: { fontSize: TYPE.title, lineHeight: 1.3, fontWeight: 700, letterSpacing: -0.2 },

  // --- tables ---------------------------------------------------------------
  tableHeadRow: {
    flexDirection: 'row',
    backgroundColor: PRINT.surfaceAlt,
    borderTopLeftRadius: RADIUS,
    borderTopRightRadius: RADIUS,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  tableRow: { flexDirection: 'row', paddingVertical: 3.5, paddingHorizontal: 6 },
  tableRowStriped: { backgroundColor: PRINT.surface },
  th: {
    fontSize: TYPE.micro,
    lineHeight: 1.35,
    fontWeight: 600,
    color: PRINT.inkMuted,
    letterSpacing: 0.3,
  },
  td: { fontSize: TYPE.small, lineHeight: 1.4, color: PRINT.ink },
  tdMuted: { fontSize: TYPE.small, lineHeight: 1.4, color: PRINT.inkMuted },

  // --- misc -----------------------------------------------------------------
  row: { flexDirection: 'row', alignItems: 'center' },
  swatch: { width: 5, height: 5, borderRadius: 2.5, marginRight: 4 },
  chip: {
    borderWidth: 1,
    borderColor: PRINT.rule,
    borderRadius: 3,
    paddingVertical: 1.5,
    paddingHorizontal: 5,
    fontSize: TYPE.micro,
    lineHeight: 1.4,
    color: PRINT.inkMuted,
    marginRight: 4,
    marginBottom: 3,
  },
  footnote: { fontSize: TYPE.micro, lineHeight: 1.4, color: PRINT.inkFaint, marginTop: 2 },
})

/** The hairline that separates the running header from the content. */
export function RunningHeader({ left, right }: { left: string; right: string }) {
  return (
    <View style={s.runningHeader} fixed>
      <Text>{left}</Text>
      <Text>{right}</Text>
    </View>
  )
}

export function RunningFooter({
  note,
  pageLabel,
}: {
  note: string
  pageLabel: (n: number, total: number) => string
}) {
  return (
    <View style={s.runningFooter} fixed>
      <Text style={{ maxWidth: 400 }}>{note}</Text>
      <Text render={({ pageNumber, totalPages }) => pageLabel(pageNumber, totalPages)} />
    </View>
  )
}

/** An A4 page already wearing the report's header, footer and margins. */
export function ReportPage({
  headerLeft,
  headerRight,
  footerNote,
  pageLabel,
  children,
}: {
  headerLeft: string
  headerRight: string
  footerNote: string
  pageLabel: (n: number, total: number) => string
  children: ReactNode
}) {
  return (
    <Page size="A4" style={s.page}>
      <RunningHeader left={headerLeft} right={headerRight} />
      {children}
      <RunningFooter note={footerNote} pageLabel={pageLabel} />
    </Page>
  )
}

export function Cover({
  eyebrow,
  title,
  subtitle,
  meta,
}: {
  eyebrow: string
  title: string
  subtitle?: string
  meta?: string[]
}) {
  return (
    <View>
      <View style={s.coverBar} />
      <Text style={s.eyebrow}>{upper(eyebrow)}</Text>
      <Text style={s.coverTitle}>{title}</Text>
      {subtitle ? <Text style={s.coverSubtitle}>{subtitle}</Text> : null}
      {meta && meta.length > 0 ? (
        <View style={[s.row, { marginTop: 9, flexWrap: 'wrap' }]}>
          {meta.map((entry) => (
            <Text key={entry} style={s.chip}>
              {entry}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  )
}

export function Section({
  title,
  caption,
  children,
  first = false,
  wrap = true,
}: {
  title: string
  caption?: string
  children: ReactNode
  /** Drops the top margin — for the first section under the cover. */
  first?: boolean
  /** `false` keeps the whole section on one page. */
  wrap?: boolean
}) {
  return (
    <View style={first ? undefined : s.section} wrap={wrap}>
      <View style={s.sectionHeadRow}>
        <Text style={s.sectionTitle}>{upper(title)}</Text>
        <View style={s.sectionRule} />
      </View>
      {caption ? <Text style={s.sectionCaption}>{caption}</Text> : null}
      {children}
    </View>
  )
}

/** A coloured dot that ties a name to its series colour, as on screen. */
export function Swatch({ color }: { color: string }) {
  return <View style={[s.swatch, { backgroundColor: color }]} />
}

/** The colour key under a multi-series chart. */
export function ChartLegend({
  entries,
}: {
  entries: Array<{ label: string; color: string; dashed?: boolean }>
}) {
  return (
    <View style={[s.row, { flexWrap: 'wrap', marginTop: 4 }]}>
      {entries.map((entry) => (
        <View key={entry.label} style={[s.row, { marginRight: 10 }]}>
          <View
            style={{
              width: 8,
              height: entry.dashed ? 0 : 2,
              borderRadius: 1,
              marginRight: 3,
              backgroundColor: entry.dashed ? 'transparent' : entry.color,
              borderTopWidth: entry.dashed ? 1 : 0,
              borderTopColor: entry.color,
              borderStyle: entry.dashed ? 'dashed' : 'solid',
            }}
          />
          <Text style={{ fontSize: TYPE.micro, color: PRINT.inkMuted }}>{entry.label}</Text>
        </View>
      ))}
    </View>
  )
}

export interface TableColumn<T> {
  key: string
  header: string
  /** Flex weight of the column. */
  width: number
  align?: 'left' | 'right' | 'center'
  render: (row: T, index: number) => ReactNode
}

/**
 * The one table treatment in the report: tinted header, zebra body, a hairline
 * frame. Right-align numeric columns via each column's `align`.
 */
export function DataTable<T>({
  columns,
  rows,
  keyOf,
}: {
  columns: TableColumn<T>[]
  rows: T[]
  keyOf: (row: T, index: number) => string
}) {
  return (
    <View style={{ borderWidth: 1, borderColor: PRINT.rule, borderRadius: RADIUS }}>
      <View style={s.tableHeadRow}>
        {columns.map((column) => (
          <Text
            key={column.key}
            style={[s.th, { flex: column.width, textAlign: column.align ?? 'left' }]}
          >
            {column.header}
          </Text>
        ))}
      </View>
      {rows.map((row, index) => (
        <View
          key={keyOf(row, index)}
          style={index % 2 === 1 ? [s.tableRow, s.tableRowStriped] : s.tableRow}
          wrap={false}
        >
          {columns.map((column) => (
            <View key={column.key} style={{ flex: column.width }}>
              <View style={{ alignItems: alignItemsFor(column.align) }}>
                {column.render(row, index)}
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}

function alignItemsFor(align: 'left' | 'right' | 'center' | undefined) {
  if (align === 'right') return 'flex-end' as const
  if (align === 'center') return 'center' as const
  return 'flex-start' as const
}

/** A label/value pair on one line, as the research page's fact rows read. */
export function FactRow({
  label,
  value,
  tone,
  striped = false,
}: {
  label: string
  value: string
  tone?: string
  striped?: boolean
}) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          paddingVertical: 2.5,
          paddingHorizontal: 5,
          borderRadius: 2,
        },
        striped ? { backgroundColor: PRINT.surface } : {},
      ]}
      wrap={false}
    >
      <Text style={[s.tdMuted, { flex: 1, paddingRight: 6 }]}>{label}</Text>
      <Text style={[s.td, { fontWeight: 500, color: tone ?? PRINT.ink }]}>{value}</Text>
    </View>
  )
}

/** A stack of `FactRow`s inside a titled card — the report's densest unit. */
export function FactCard({
  title,
  rows,
  style,
}: {
  /** Omit when the enclosing `Section` already carries this exact heading. */
  title?: string
  rows: Array<{ label: string; value: string; tone?: string }>
  style?: ComponentProps<typeof View>['style']
}) {
  return (
    <View style={[s.card, ...(style ? [style] : [])]} wrap={false}>
      {title ? <Text style={[s.sectionTitle, { marginBottom: 4 }]}>{upper(title)}</Text> : null}
      {rows.map((row, index) => (
        <FactRow key={row.label} {...row} striped={index % 2 === 1} />
      ))}
    </View>
  )
}

export function Footnotes({ lines, emphasis }: { lines: string[]; emphasis?: string }) {
  return (
    <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: PRINT.rule, paddingTop: 6 }}>
      {lines.map((line) => (
        <Text key={line} style={s.footnote}>
          {line}
        </Text>
      ))}
      {emphasis ? (
        <Text style={[s.footnote, { color: PRINT.inkMuted, fontWeight: 600, marginTop: 3 }]}>
          {emphasis}
        </Text>
      ) : null}
    </View>
  )
}
