import '@testing-library/jest-dom/vitest'
import { beforeAll } from 'vitest'
import i18n from './i18n/config'

beforeAll(async () => {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('pf-language')
  }
  await i18n.changeLanguage('en')
})

// Radix Select / Popover measure elements via ResizeObserver (missing in jsdom).
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverPolyfill {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverPolyfill
}

// Radix Select relies on PointerEvent in jsdom.
if (typeof globalThis.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    constructor(type: string, props?: MouseEventInit) {
      super(type, props)
    }
  }
  // @ts-expect-error jsdom gap
  globalThis.PointerEvent = PointerEventPolyfill
}

Element.prototype.hasPointerCapture ??= () => false
Element.prototype.setPointerCapture ??= () => {}
Element.prototype.releasePointerCapture ??= () => {}
Element.prototype.scrollIntoView ??= () => {}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})
