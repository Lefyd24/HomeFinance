import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * True once the element has scrolled into view, and true forever after.
 *
 * Gates the page's heavy sections: charts render only when reached, and the
 * technical-signals fetch is not spent on users who never scroll that far
 * (`/technical` is rate-limited at 60 hits / 5 min — see investments.py:70).
 *
 * Falls back to true immediately where IntersectionObserver is unavailable,
 * which includes jsdom under Vitest, so component tests see real content.
 */
export function useInViewOnce<T extends Element>(
  rootMargin = '200px',
): [(node: T | null) => void, boolean] {
  const [inView, setInView] = useState(false)
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => () => observerRef.current?.disconnect(), [])

  const ref = useCallback(
    (node: T | null) => {
      observerRef.current?.disconnect()
      if (inView) return
      if (node == null) return
      if (typeof IntersectionObserver === 'undefined') {
        setInView(true)
        return
      }
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setInView(true)
            observer.disconnect()
          }
        },
        { rootMargin },
      )
      observer.observe(node)
      observerRef.current = observer
    },
    [inView, rootMargin],
  )

  return [ref, inView]
}
