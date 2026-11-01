import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Markdown } from './Markdown'

describe('Markdown', () => {
  it('drops images so model output cannot trigger requests', () => {
    const { container } = render(<Markdown content="![x](https://evil/a.png) hello" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('hello')
  })
})
