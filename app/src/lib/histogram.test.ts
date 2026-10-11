import { describe, expect, it } from 'vitest'
import { buildSeries, chooseBucket, slotIndexAt, slotsToRange } from './histogram'

describe('chooseBucket', () => {
  it('uses hourly buckets without a full range', () => {
    expect(chooseBucket(null, null)).toBe('1h')
    expect(chooseBucket('2026-10-08T00:00:00Z', null)).toBe('1h')
  })

  it('gets finer as the range narrows', () => {
    expect(chooseBucket('2026-10-08T00:00:00Z', '2026-10-08T03:00:00Z')).toBe('1m')
    expect(chooseBucket('2026-10-08T00:00:00Z', '2026-10-08T12:00:00Z')).toBe('5m')
    expect(chooseBucket('2026-10-08T00:00:00Z', '2026-10-09T00:00:00Z')).toBe('1h')
  })
})

describe('buildSeries', () => {
  const buckets = [
    { t: '2026-10-08T10:00:00Z', count: 4 },
    { t: '2026-10-08T13:00:00Z', count: 9 },
  ]

  it('fills the gaps the API leaves out', () => {
    const series = buildSeries(buckets, '1h', { from: null, to: null })!
    expect(series.slots.map((slot) => slot.count)).toEqual([4, 0, 0, 9])
    expect(series.total).toBe(13)
    expect(series.max).toBe(9)
  })

  it('spans the selected range, not just the data', () => {
    const series = buildSeries(buckets, '1h', { from: '2026-10-08T09:00:00Z', to: '2026-10-08T15:00:00Z' })!
    expect(series.slots).toHaveLength(6)
    expect(series.slots[1].count).toBe(4)
    expect(new Date(series.end).toISOString()).toBe('2026-10-08T15:00:00.000Z')
  })

  it('returns null when there is nothing to draw', () => {
    expect(buildSeries([], '1h', { from: null, to: null })).toBeNull()
  })
})

describe('selection helpers', () => {
  const series = buildSeries(
    [
      { t: '2026-10-08T10:00:00Z', count: 1 },
      { t: '2026-10-08T14:00:00Z', count: 1 },
    ],
    '1h',
    { from: null, to: null },
  )!

  it('turns a selection in either direction into a from/to range', () => {
    const expected = { from: '2026-10-08T11:00:00.000Z', to: '2026-10-08T14:00:00.000Z' }
    expect(slotsToRange(series, 1, 3)).toEqual(expected)
    expect(slotsToRange(series, 3, 1)).toEqual(expected)
  })

  it('maps pointer positions to slots and clamps at the edges', () => {
    expect(slotIndexAt(series, 0)).toBe(0)
    expect(slotIndexAt(series, 0.5)).toBe(2)
    expect(slotIndexAt(series, 1)).toBe(4)
    expect(slotIndexAt(series, 1.4)).toBe(4)
    expect(slotIndexAt(series, -1)).toBe(0)
  })
})
