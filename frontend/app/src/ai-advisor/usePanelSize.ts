import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

export interface PanelSize {
  width: number
  height: number
}

const STORAGE_KEY = 'ai-advisor:size'
/** Smallest size the chat stays usable at (the old fixed 26rem × 40rem is the default). */
export const MIN_SIZE: PanelSize = { width: 352, height: 448 }
const KEY_STEP = 32

/**
 * The room the panel may take: it is anchored bottom-right, above the speed dial,
 * so it can grow up to the top of the window and left to near its edge.
 */
function maxSize(): PanelSize {
  return {
    width: Math.max(MIN_SIZE.width, window.innerWidth - 48),
    height: Math.max(MIN_SIZE.height, window.innerHeight - 136),
  }
}

export function clampSize(size: PanelSize, max: PanelSize = maxSize()): PanelSize {
  return {
    width: Math.round(Math.min(Math.max(size.width, MIN_SIZE.width), max.width)),
    height: Math.round(Math.min(Math.max(size.height, MIN_SIZE.height), max.height)),
  }
}

function readStored(): PanelSize | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PanelSize>
    if (typeof parsed.width !== 'number' || typeof parsed.height !== 'number') return null
    return { width: parsed.width, height: parsed.height }
  } catch {
    return null
  }
}

function store(size: PanelSize | null) {
  try {
    if (size) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(size))
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Private mode or blocked storage: the size just won't be remembered.
  }
}

/**
 * A user-chosen size for the desktop chat panel, changed by dragging (or arrow keys on)
 * a handle in its top-left corner, and remembered across visits.
 *
 * `size` is null until the user resizes, so the CSS default applies. The bottom-right
 * corner is anchored, which is why dragging left/up makes the panel bigger.
 */
export function usePanelSize(panelRef: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<PanelSize | null>(() => readStored())
  const drag = useRef<{ x: number; y: number; start: PanelSize } | null>(null)

  const commit = useCallback((next: PanelSize | null) => {
    setSize(next)
    store(next)
  }, [])

  // A window that shrank must not leave the panel larger than the screen.
  useEffect(() => {
    if (!size) return
    const onResize = () => setSize((current) => (current ? clampSize(current) : current))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [size])

  const currentSize = useCallback((): PanelSize => {
    const rect = panelRef.current?.getBoundingClientRect()
    return size ?? { width: rect?.width ?? MIN_SIZE.width, height: rect?.height ?? MIN_SIZE.height }
  }, [panelRef, size])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { x: event.clientX, y: event.clientY, start: currentSize() }
      document.body.style.userSelect = 'none'
    },
    [currentSize],
  )

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const active = drag.current
    if (!active) return
    setSize(
      clampSize({
        width: active.start.width + (active.x - event.clientX),
        height: active.start.height + (active.y - event.clientY),
      }),
    )
  }, [])

  const endDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current) return
    drag.current = null
    document.body.style.userSelect = ''
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setSize((current) => {
      if (current) store(current)
      return current
    })
  }, [])

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [KEY_STEP, 0],
        ArrowRight: [-KEY_STEP, 0],
        ArrowUp: [0, KEY_STEP],
        ArrowDown: [0, -KEY_STEP],
      }
      const step = delta[event.key]
      if (!step) return
      event.preventDefault()
      const start = currentSize()
      commit(clampSize({ width: start.width + step[0], height: start.height + step[1] }))
    },
    [commit, currentSize],
  )

  const reset = useCallback(() => commit(null), [commit])

  return {
    size,
    reset,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onKeyDown,
      onDoubleClick: reset,
    },
  }
}
