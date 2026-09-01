/**
 * The report's charts, drawn as real PDF vectors.
 *
 * Nothing here screenshots the page. The on-screen charts are recharts SVG
 * coloured entirely through oklch CSS variables — rasterising those loses the
 * text layer, and the oklch values do not survive a canvas round-trip anyway.
 * So each chart is re-drawn from the same data through `@react-pdf/renderer`'s
 * SVG primitives: crisp at any zoom, a fraction of the file size, and identical
 * in colour to the screen because both read from the same token palette
 * (`pdfTheme`'s hex literals are the light theme's oklch values).
 *
 * Every component takes explicit pixel dimensions — a PDF has no layout pass
 * that a chart could measure itself against, so the caller owns the box.
 */
import type { ComponentProps, ComponentType } from 'react'
import { Circle, G, Line, Path, Rect, Svg, Text as PdfSvgText } from '@react-pdf/renderer'
import { PDF_FONT_FAMILY, PRINT, TYPE, printPolarityColor } from './pdfTheme'

/**
 * `@react-pdf/renderer`'s shipped types leave the font props off SVG `<Text>`,
 * but the layout engine inherits every one of them (see `BASE_SVG_INHERITED_PROPS`
 * in @react-pdf/layout) — so the cast restores what the runtime already accepts
 * rather than papering over a real gap.
 */
type SvgTextProps = ComponentProps<typeof PdfSvgText> & {
  fontSize?: number
  fontFamily?: string
  fontWeight?: number
}
const SvgText = PdfSvgText as unknown as ComponentType<SvgTextProps>

const AXIS_FONT = TYPE.micro

/** Round a domain out to human numbers and hand back evenly spaced ticks. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return []
  if (min === max) return [min]
  const rawStep = (max - min) / count
  const magnitude = 10 ** Math.floor(Math.log10(Math.abs(rawStep) || 1))
  const normalized = rawStep / magnitude
  const step = (normalized >= 5 ? 10 : normalized >= 2 ? 5 : normalized >= 1 ? 2 : 1) * magnitude
  const start = Math.ceil(min / step) * step
  const ticks: number[] = []
  for (let value = start; value <= max + step * 1e-6; value += step) {
    ticks.push(Math.abs(value) < step * 1e-6 ? 0 : value)
  }
  return ticks
}

function axisLabel(x: number, y: number, text: string, anchor: 'start' | 'middle' | 'end' = 'end') {
  return (
    <SvgText
      x={x}
      y={y}
      fill={PRINT.inkFaint}
      fontSize={AXIS_FONT}
      fontFamily={PDF_FONT_FAMILY}
      textAnchor={anchor}
    >
      {text}
    </SvgText>
  )
}

/** A smooth-enough polyline. Straight segments — a cardinal spline would
 *  invent turning points the data never had. */
function linePath(points: Array<[number, number]>): string {
  if (points.length === 0) return ''
  return points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ')
}

// ---------------------------------------------------------------------------
// Horizontal bars — "which one actually made more money"
// ---------------------------------------------------------------------------

export interface BarRow {
  label: string
  value: number
  /** Benchmark rows are drawn at reduced weight, as on screen. */
  muted?: boolean
  formatted: string
}

export function BarRowsChart({
  rows,
  width,
  rowHeight = 17,
}: {
  rows: BarRow[]
  width: number
  rowHeight?: number
}) {
  const labelWidth = 44
  const valueWidth = 40
  const plotLeft = labelWidth
  const plotWidth = Math.max(20, width - labelWidth - valueWidth)
  const height = rows.length * rowHeight + 2

  const max = Math.max(0, ...rows.map((r) => r.value))
  const min = Math.min(0, ...rows.map((r) => r.value))
  const span = max - min || 1
  const xOf = (value: number) => plotLeft + ((value - min) / span) * plotWidth
  const zeroX = xOf(0)

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Line x1={zeroX} y1={0} x2={zeroX} y2={height} stroke={PRINT.rule} strokeWidth={0.6} />
      {rows.map((row, index) => {
        const centerY = index * rowHeight + rowHeight / 2 + 1
        const barTop = centerY - 4
        const x = xOf(Math.min(0, row.value))
        const barWidth = Math.max(0.7, Math.abs(xOf(row.value) - zeroX))
        const color = printPolarityColor(row.value)
        return (
          <G key={row.label}>
            <SvgText
              x={labelWidth - 6}
              y={centerY + 2.4}
              fill={PRINT.ink}
              fontSize={TYPE.small}
              fontFamily={PDF_FONT_FAMILY}
              fontWeight={500}
              textAnchor="end"
            >
              {row.label}
            </SvgText>
            <Rect
              x={x}
              y={barTop}
              width={barWidth}
              height={8}
              rx={1.5}
              fill={color}
              fillOpacity={row.muted ? 0.4 : 1}
            />
            <SvgText
              x={width}
              y={centerY + 2.4}
              fill={color}
              fontSize={TYPE.small}
              fontFamily={PDF_FONT_FAMILY}
              fontWeight={600}
              textAnchor="end"
            >
              {row.formatted}
            </SvgText>
          </G>
        )
      })}
    </Svg>
  )
}

// ---------------------------------------------------------------------------
// Multi-series line — growth of 100, drawdown, price history
// ---------------------------------------------------------------------------

export interface LineSeries {
  key: string
  color: string
  /** Null gaps the line rather than drawing through missing data. */
  values: Array<number | null>
  dashed?: boolean
  /** Fills to the baseline — used by drawdown, where the area *is* the message. */
  fillOpacity?: number
  strokeWidth?: number
}

export function LineSeriesChart({
  series,
  xLabels,
  width,
  height,
  formatY,
  baseline,
  padTop = 6,
}: {
  series: LineSeries[]
  /** One entry per x position; only a few are drawn, evenly spaced. */
  xLabels: string[]
  width: number
  height: number
  formatY: (value: number) => string
  /** A horizontal reference line (100 for growth, 0 for drawdown). */
  baseline?: number
  padTop?: number
}) {
  const padLeft = 30
  const padBottom = 13
  const padRight = 4
  const plotW = width - padLeft - padRight
  const plotH = height - padTop - padBottom

  const all = series.flatMap((s) => s.values).filter((v): v is number => v != null)
  if (all.length === 0 || plotW <= 0 || plotH <= 0) {
    return <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} />
  }

  let min = Math.min(...all)
  let max = Math.max(...all)
  if (baseline != null) {
    min = Math.min(min, baseline)
    max = Math.max(max, baseline)
  }
  const pad = (max - min) * 0.08 || Math.abs(max) * 0.08 || 1
  min -= pad
  max += pad

  const count = Math.max(...series.map((s) => s.values.length))
  const xOf = (i: number) => padLeft + (count <= 1 ? plotW / 2 : (i / (count - 1)) * plotW)
  const yOf = (v: number) => padTop + plotH - ((v - min) / (max - min)) * plotH

  const ticks = niceTicks(min, max, 4)
  const labelStride = Math.max(1, Math.ceil(count / 5))

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {ticks.map((tick) => (
        <G key={`t-${tick}`}>
          <Line
            x1={padLeft}
            y1={yOf(tick)}
            x2={width - padRight}
            y2={yOf(tick)}
            stroke={PRINT.ruleSoft}
            strokeWidth={0.6}
          />
          {axisLabel(padLeft - 4, yOf(tick) + 2, formatY(tick))}
        </G>
      ))}

      {baseline != null ? (
        <Line
          x1={padLeft}
          y1={yOf(baseline)}
          x2={width - padRight}
          y2={yOf(baseline)}
          stroke={PRINT.rule}
          strokeWidth={0.8}
        />
      ) : null}

      {series.map((entry) => {
        // Split on nulls so a gap in the data gaps the line rather than being
        // drawn straight through.
        const segments: Array<Array<[number, number]>> = []
        let current: Array<[number, number]> = []
        entry.values.forEach((value, index) => {
          if (value == null) {
            if (current.length > 1) segments.push(current)
            current = []
            return
          }
          current.push([xOf(index), yOf(value)])
        })
        if (current.length > 1) segments.push(current)

        const areaBase = baseline != null ? yOf(baseline) : padTop + plotH
        const filled = entry.fillOpacity != null && entry.fillOpacity > 0

        return (
          <G key={entry.key}>
            {filled
              ? segments.map((coords, i) => (
                  <Path
                    key={`${entry.key}-fill-${i}`}
                    d={`${linePath(coords)} L${coords[coords.length - 1]![0].toFixed(2)},${areaBase.toFixed(2)} L${coords[0]![0].toFixed(2)},${areaBase.toFixed(2)} Z`}
                    fill={entry.color}
                    fillOpacity={entry.fillOpacity}
                    stroke="none"
                  />
                ))
              : null}
            {segments.map((coords, i) => (
              <Path
                key={`${entry.key}-${i}`}
                d={linePath(coords)}
                stroke={entry.color}
                strokeWidth={entry.strokeWidth ?? 1.1}
                strokeDasharray={entry.dashed ? '3 2' : undefined}
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
          </G>
        )
      })}

      <Line
        x1={padLeft}
        y1={padTop + plotH}
        x2={width - padRight}
        y2={padTop + plotH}
        stroke={PRINT.rule}
        strokeWidth={0.6}
      />
      {xLabels.map((label, index) =>
        index % labelStride === 0 || index === xLabels.length - 1 ? (
          <G key={`x-${index}`}>
            {axisLabel(
              xOf(index),
              height - 3.5,
              label,
              index === 0 ? 'start' : index === xLabels.length - 1 ? 'end' : 'middle',
            )}
          </G>
        ) : null,
      )}
    </Svg>
  )
}

/** The colour key that goes under a multi-series chart. */
export interface LegendEntry {
  label: string
  color: string
  dashed?: boolean
}

// ---------------------------------------------------------------------------
// Scatter — risk versus return
// ---------------------------------------------------------------------------

export interface ScatterPoint {
  label: string
  x: number
  y: number
  color: string
  muted?: boolean
}

export function ScatterPlot({
  points,
  width,
  height,
  formatX,
  formatY,
  crosshair,
}: {
  points: ScatterPoint[]
  width: number
  height: number
  formatX: (value: number) => string
  formatY: (value: number) => string
  /** The benchmark's own position, drawn as quadrant lines. */
  crosshair?: { x: number; y: number }
}) {
  const padLeft = 32
  const padBottom = 15
  const padTop = 8
  const padRight = 10
  const plotW = width - padLeft - padRight
  const plotH = height - padTop - padBottom

  if (points.length === 0 || plotW <= 0 || plotH <= 0) {
    return <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} />
  }

  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const xPad = (Math.max(...xs) - Math.min(...xs)) * 0.2 || Math.abs(xs[0] ?? 1) * 0.2 || 0.02
  const yPad = (Math.max(...ys) - Math.min(...ys)) * 0.2 || Math.abs(ys[0] ?? 1) * 0.2 || 0.02
  const minX = Math.min(...xs) - xPad
  const maxX = Math.max(...xs) + xPad
  const minY = Math.min(...ys) - yPad
  const maxY = Math.max(...ys) + yPad

  const xOf = (v: number) => padLeft + ((v - minX) / (maxX - minX || 1)) * plotW
  const yOf = (v: number) => padTop + plotH - ((v - minY) / (maxY - minY || 1)) * plotH

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {niceTicks(minY, maxY, 3).map((tick) => (
        <G key={`y-${tick}`}>
          <Line
            x1={padLeft}
            y1={yOf(tick)}
            x2={width - padRight}
            y2={yOf(tick)}
            stroke={PRINT.ruleSoft}
            strokeWidth={0.6}
          />
          {axisLabel(padLeft - 4, yOf(tick) + 2, formatY(tick))}
        </G>
      ))}
      {niceTicks(minX, maxX, 3).map((tick) => (
        <G key={`x-${tick}`}>{axisLabel(xOf(tick), height - 4, formatX(tick), 'middle')}</G>
      ))}

      {crosshair ? (
        <G>
          <Line
            x1={xOf(crosshair.x)}
            y1={padTop}
            x2={xOf(crosshair.x)}
            y2={padTop + plotH}
            stroke={PRINT.inkFaint}
            strokeWidth={0.6}
            strokeDasharray="2 2"
          />
          <Line
            x1={padLeft}
            y1={yOf(crosshair.y)}
            x2={width - padRight}
            y2={yOf(crosshair.y)}
            stroke={PRINT.inkFaint}
            strokeWidth={0.6}
            strokeDasharray="2 2"
          />
        </G>
      ) : null}

      {points.map((point) => (
        <G key={point.label}>
          <Circle
            cx={xOf(point.x)}
            cy={yOf(point.y)}
            r={3}
            fill={point.color}
            fillOpacity={point.muted ? 0.45 : 1}
          />
          <SvgText
            x={xOf(point.x)}
            y={yOf(point.y) - 5}
            fill={PRINT.inkMuted}
            fontSize={AXIS_FONT}
            fontFamily={PDF_FONT_FAMILY}
            fontWeight={600}
            textAnchor="middle"
          >
            {point.label}
          </SvgText>
        </G>
      ))}
    </Svg>
  )
}

// ---------------------------------------------------------------------------
// Correlation heatmap
// ---------------------------------------------------------------------------

/**
 * Colour is inverted on purpose, exactly as `CorrelationMatrix` does it on
 * screen: high correlation gets the loss token, negative correlation the gain
 * token, because two holdings moving together is the thing to be wary of.
 */
export function CorrelationHeatmap({
  labels,
  valueAt,
  width,
}: {
  labels: string[]
  valueAt: (a: string, b: string) => number | undefined
  width: number
}) {
  const headerW = 42
  const n = labels.length
  if (n === 0) return null
  const cell = Math.min(48, Math.max(24, (width - headerW) / n))
  const rowH = 16
  const height = rowH * (n + 1) + 2
  const totalW = headerW + cell * n

  return (
    <Svg width={totalW} height={height} viewBox={`0 0 ${totalW} ${height}`}>
      {labels.map((label, col) => (
        <G key={`h-${label}`}>
          <SvgText
            x={headerW + col * cell + cell / 2}
            y={11}
            fill={PRINT.inkMuted}
            fontSize={AXIS_FONT}
            fontFamily={PDF_FONT_FAMILY}
            fontWeight={600}
            textAnchor="middle"
          >
            {label}
          </SvgText>
        </G>
      ))}
      {labels.map((rowLabel, row) => (
        <G key={`r-${rowLabel}`}>
          <SvgText
            x={headerW - 5}
            y={rowH * (row + 1) + 11}
            fill={PRINT.inkMuted}
            fontSize={AXIS_FONT}
            fontFamily={PDF_FONT_FAMILY}
            fontWeight={600}
            textAnchor="end"
          >
            {rowLabel}
          </SvgText>
          {labels.map((colLabel, col) => {
            const same = row === col
            const corr = same ? 1 : valueAt(rowLabel, colLabel)
            const opacity = corr == null ? 0 : Math.min(0.08 + Math.abs(corr) * 0.35, 0.43)
            const fill = corr == null ? PRINT.paper : corr >= 0 ? PRINT.negative : PRINT.positive
            return (
              <G key={`${rowLabel}-${colLabel}`}>
                <Rect
                  x={headerW + col * cell + 1}
                  y={rowH * (row + 1) + 1}
                  width={cell - 2}
                  height={rowH - 2}
                  rx={2}
                  fill={fill}
                  fillOpacity={opacity}
                  stroke={PRINT.ruleSoft}
                  strokeWidth={0.5}
                />
                <SvgText
                  x={headerW + col * cell + cell / 2}
                  y={rowH * (row + 1) + 11}
                  fill={same ? PRINT.inkFaint : PRINT.ink}
                  fontSize={AXIS_FONT}
                  fontFamily={PDF_FONT_FAMILY}
                  textAnchor="middle"
                >
                  {corr == null ? '—' : corr.toFixed(2)}
                </SvgText>
              </G>
            )
          })}
        </G>
      ))}
    </Svg>
  )
}

// ---------------------------------------------------------------------------
// Histogram — the shape of daily returns
// ---------------------------------------------------------------------------

export function HistogramChart({
  bins,
  width,
  height,
  formatX,
}: {
  bins: Array<{ lower: number; upper: number; count: number }>
  width: number
  height: number
  formatX: (value: number) => string
}) {
  const padBottom = 12
  const padTop = 3
  const plotH = height - padTop - padBottom
  if (bins.length === 0 || plotH <= 0) {
    return <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} />
  }
  const maxCount = Math.max(...bins.map((b) => b.count)) || 1
  const barW = width / bins.length

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {bins.map((bin, index) => {
        const mid = (bin.lower + bin.upper) / 2
        const h = (bin.count / maxCount) * plotH
        return (
          <Rect
            key={`${bin.lower}-${bin.upper}`}
            x={index * barW + 0.5}
            y={padTop + plotH - h}
            width={Math.max(0.8, barW - 1)}
            height={h}
            rx={1}
            fill={mid < 0 ? PRINT.negative : PRINT.positive}
            fillOpacity={0.6}
          />
        )
      })}
      <Line
        x1={0}
        y1={padTop + plotH}
        x2={width}
        y2={padTop + plotH}
        stroke={PRINT.rule}
        strokeWidth={0.6}
      />
      {axisLabel(0, height - 3, formatX((bins[0]!.lower + bins[0]!.upper) / 2), 'start')}
      {axisLabel(
        width,
        height - 3,
        formatX((bins[bins.length - 1]!.lower + bins[bins.length - 1]!.upper) / 2),
        'end',
      )}
    </Svg>
  )
}

// ---------------------------------------------------------------------------
// Sparkline — a rolling metric's shape, no axes
// ---------------------------------------------------------------------------

export function Sparkline({
  values,
  width,
  height,
  color,
}: {
  values: Array<number | null>
  width: number
  height: number
  color: string
}) {
  const points = values
    .map((value, index) => ({ value, index }))
    .filter((p): p is { value: number; index: number } => p.value != null)
  if (points.length < 2)
    return <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} />

  const min = Math.min(...points.map((p) => p.value))
  const max = Math.max(...points.map((p) => p.value))
  const span = max - min || 1
  const xOf = (i: number) => (i / (values.length - 1)) * width
  const yOf = (v: number) => height - 1.5 - ((v - min) / span) * (height - 3)
  const coords: Array<[number, number]> = points.map((p) => [xOf(p.index), yOf(p.value)])
  const path = linePath(coords)

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Path
        d={`${path} L${coords[coords.length - 1]![0].toFixed(2)},${height} L${coords[0]![0].toFixed(2)},${height} Z`}
        fill={color}
        fillOpacity={0.12}
        stroke="none"
      />
      <Path d={path} stroke={color} strokeWidth={1} fill="none" strokeLinejoin="round" />
    </Svg>
  )
}

// ---------------------------------------------------------------------------
// Range bar — where today's price sits in the 52-week band
// ---------------------------------------------------------------------------

export function RangeBar({ markerPct, width }: { markerPct: number; width: number }) {
  const height = 9
  const barY = 3
  const barH = 3.5
  const x = (Math.min(100, Math.max(0, markerPct)) / 100) * width

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Rect x={0} y={barY} width={width} height={barH} rx={barH / 2} fill={PRINT.surfaceAlt} />
      <Rect
        x={0}
        y={barY}
        width={width * 0.25}
        height={barH}
        rx={barH / 2}
        fill={PRINT.negative}
        fillOpacity={0.28}
      />
      <Rect
        x={width * 0.75}
        y={barY}
        width={width * 0.25}
        height={barH}
        rx={barH / 2}
        fill={PRINT.positive}
        fillOpacity={0.28}
      />
      <Circle cx={x} cy={barY + barH / 2} r={3.2} fill={PRINT.ink} />
      <Circle cx={x} cy={barY + barH / 2} r={1.4} fill={PRINT.paper} />
    </Svg>
  )
}

// ---------------------------------------------------------------------------
// Weight bars — sector weightings, fund holdings
// ---------------------------------------------------------------------------

export function WeightBar({
  fraction,
  width,
  color = PRINT.accent,
}: {
  /** 0-1 of the widest entry in the group, not of 100%. */
  fraction: number
  width: number
  color?: string
}) {
  const height = 3.5
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Rect x={0} y={0} width={width} height={height} rx={height / 2} fill={PRINT.surfaceAlt} />
      <Rect
        x={0}
        y={0}
        width={Math.max(0.8, Math.min(1, Math.max(0, fraction)) * width)}
        height={height}
        rx={height / 2}
        fill={color}
        fillOpacity={0.75}
      />
    </Svg>
  )
}
