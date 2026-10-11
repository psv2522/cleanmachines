import { describe, expect, it } from 'vitest'
import { computeRange, scrollTopToReveal } from './virtual'

const base = { rowHeight: 36, viewportHeight: 360, overscan: 5 }

describe('computeRange', () => {
  it('renders the visible rows plus overscan', () => {
    expect(computeRange({ ...base, scrollTop: 0, count: 1000 })).toEqual({ start: 0, end: 16 })
    expect(computeRange({ ...base, scrollTop: 3600, count: 1000 })).toEqual({ start: 95, end: 116 })
  })

  it('clamps to the list bounds', () => {
    expect(computeRange({ ...base, scrollTop: 36_000, count: 1000 })).toEqual({ start: 995, end: 1000 })
    expect(computeRange({ ...base, scrollTop: -50, count: 3 })).toEqual({ start: 0, end: 3 })
    expect(computeRange({ ...base, scrollTop: 0, count: 0 })).toEqual({ start: 0, end: 0 })
  })

  it('keeps the rendered row count independent of list length', () => {
    const small = computeRange({ ...base, scrollTop: 7200, count: 1000 })
    const large = computeRange({ ...base, scrollTop: 7200, count: 1_000_000 })
    expect(large).toEqual(small)
  })
})

describe('scrollTopToReveal', () => {
  const view = { rowHeight: 36, viewportHeight: 396, headerHeight: 36 }

  it('returns null when the row is already fully visible', () => {
    expect(scrollTopToReveal({ ...view, index: 3, scrollTop: 0 })).toBeNull()
  })

  it('scrolls up to a row above the viewport', () => {
    expect(scrollTopToReveal({ ...view, index: 2, scrollTop: 360 })).toBe(72)
  })

  it('scrolls down just far enough, accounting for the sticky header', () => {
    expect(scrollTopToReveal({ ...view, index: 10, scrollTop: 0 })).toBe(36)
  })
})
