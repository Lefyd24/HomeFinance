import { useId } from 'react'
import { cn } from '@/lib/utils'

/**
 * A trend shape, not a chart: no axes, no labels, no tooltip. It sits beside a
 * number that already states the value, and only answers "which way has this
 * been going?". Drawn as plain SVG so it costs nothing to render dozens of.
 */
export function Sparkline({
  values,
  color,
  className,
  width = 96,
  height = 28,
}: {
  values: number[]
  color: string
  className?: string
  width?: number
  height?: number
}) {
  const gradientId = useId()

  if (values.length < 2) {
    return <div className={cn('h-7', className)} style={{ width }} aria-hidden />
  }

  const min = Math.min(...values, 0)
  const max = Math.max(...values, 0)
  const span = max - min || 1
  const stepX = width / (values.length - 1)
  const pad = 2

  const points = values.map((value, index) => {
    const x = index * stepX
    const y = height - pad - ((value - min) / span) * (height - pad * 2)
    return [x, y] as const
  })

  const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn('overflow-visible', className)}
      role="img"
      aria-hidden
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r={2.5} fill={color} />
    </svg>
  )
}
