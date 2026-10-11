export interface VirtualRange {
  start: number
  end: number
}

interface RangeInput {
  scrollTop: number
  viewportHeight: number
  rowHeight: number
  count: number
  overscan: number
}

/** Rows [start, end) to render for the current scroll position, including overscan. */
export function computeRange({ scrollTop, viewportHeight, rowHeight, count, overscan }: RangeInput): VirtualRange {
  if (count <= 0) return { start: 0, end: 0 }
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight)
  const visible = Math.ceil(Math.max(0, viewportHeight) / rowHeight) + 1
  const start = Math.min(Math.max(0, first - overscan), count)
  const end = Math.min(count, first + visible + overscan)
  return { start, end: Math.max(start, end) }
}

interface RevealInput {
  index: number
  rowHeight: number
  scrollTop: number
  viewportHeight: number
  /** Height of the sticky header that covers the top of the scroll area. */
  headerHeight: number
}

/** The scrollTop that brings a row fully into view, or null if it is already visible. */
export function scrollTopToReveal({ index, rowHeight, scrollTop, viewportHeight, headerHeight }: RevealInput): number | null {
  const rowTop = index * rowHeight
  const rowBottom = rowTop + rowHeight
  const visibleHeight = viewportHeight - headerHeight
  if (rowTop < scrollTop) return rowTop
  if (rowBottom > scrollTop + visibleHeight) return rowBottom - visibleHeight
  return null
}

export function rangesEqual(a: VirtualRange, b: VirtualRange) {
  return a.start === b.start && a.end === b.end
}
