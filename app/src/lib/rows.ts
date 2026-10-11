import type { EventSummary } from '../api/types'

/** Live events first, then the fetched pages, without duplicates. */
export function mergeRows(live: EventSummary[], pages: EventSummary[][]): EventSummary[] {
  const seen = new Set<string>()
  const rows: EventSummary[] = []
  const push = (event: EventSummary) => {
    if (seen.has(event.id)) return
    seen.add(event.id)
    rows.push(event)
  }
  live.forEach(push)
  for (const page of pages) page.forEach(push)
  return rows
}
