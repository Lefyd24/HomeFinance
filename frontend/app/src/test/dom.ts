import { screen } from '@testing-library/react'

/** Match a leaf element's full textContent (avoids Testing Library text-node quirks). */
export function getByExactText(text: string) {
  return screen.getByText((_, node) => {
    if (!(node instanceof HTMLElement)) return false
    if (node.children.length > 0) return false
    return (node.textContent ?? '') === text
  })
}
