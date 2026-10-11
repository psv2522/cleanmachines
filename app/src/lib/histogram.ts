import type { Bucket, HistogramBucket } from '../api/types'

export const BUCKET_MS: Record<Bucket, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '1h': 60 * 60_000,
}

const HOUR = 60 * 60_000
const MAX_SLOTS = 1500

/** Pick the finest bucket that keeps the chart under a couple of hundred bars. */
export function chooseBucket(from: string | null, to: string | null): Bucket {
  if (!from || !to) return '1h'
  const span = Date.parse(to) - Date.parse(from)
  if (span <= 3 * HOUR) return '1m'
  if (span <= 18 * HOUR) return '5m'
  return '1h'
}

export interface Slot {
  start: number
  count: number
}

export interface Series {
  start: number
  end: number
  bucketMs: number
  slots: Slot[]
  max: number
  total: number
}

const floorTo = (ms: number, step: number) => Math.floor(ms / step) * step
const ceilTo = (ms: number, step: number) => Math.ceil(ms / step) * step

/**
 * Turns the sparse API response (empty buckets are omitted) into a dense series covering
 * the selected range, or the span of the data when no range is selected.
 */
export function buildSeries(
  buckets: HistogramBucket[],
  bucket: Bucket,
  range: { from: string | null; to: string | null },
  extraTimestamps: string[] = [],
): Series | null {
  const bucketMs = BUCKET_MS[bucket]
  const counts = new Map<number, number>()
  for (const { t, count } of buckets) {
    const key = floorTo(Date.parse(t), bucketMs)
    counts.set(key, (counts.get(key) ?? 0) + count)
  }
  for (const timestamp of extraTimestamps) {
    const key = floorTo(Date.parse(timestamp), bucketMs)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const keys = [...counts.keys()]
  const dataStart = keys.length ? Math.min(...keys) : null
  const dataEnd = keys.length ? Math.max(...keys) + bucketMs : null
  const startRaw = range.from ? Date.parse(range.from) : dataStart
  const endRaw = range.to ? Date.parse(range.to) : dataEnd
  if (startRaw === null || endRaw === null || endRaw <= startRaw) return null

  const start = floorTo(startRaw, bucketMs)
  const end = Math.max(ceilTo(endRaw, bucketMs), start + bucketMs)
  const slotCount = Math.min(Math.round((end - start) / bucketMs), MAX_SLOTS)
  const slots: Slot[] = []
  let max = 0
  let total = 0
  for (let i = 0; i < slotCount; i++) {
    const slotStart = start + i * bucketMs
    const count = counts.get(slotStart) ?? 0
    max = Math.max(max, count)
    total += count
    slots.push({ start: slotStart, count })
  }
  return { start, end: start + slotCount * bucketMs, bucketMs, slots, max, total }
}

/** Converts a selection between two slot indexes (either order) into a from/to filter. */
export function slotsToRange(series: Series, a: number, b: number): { from: string; to: string } {
  const first = Math.max(0, Math.min(a, b))
  const last = Math.min(series.slots.length - 1, Math.max(a, b))
  const from = series.slots[first].start
  const to = series.slots[last].start + series.bucketMs
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() }
}

export function slotIndexAt(series: Series, fraction: number): number {
  const index = Math.floor(Math.min(Math.max(fraction, 0), 0.999999) * series.slots.length)
  return Math.min(series.slots.length - 1, Math.max(0, index))
}
