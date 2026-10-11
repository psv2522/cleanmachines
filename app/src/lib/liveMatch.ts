import type { EventDetail, EventSummary } from '../api/types'
import type { Filters } from '../state/viewState'

export type LiveMatch = 'match' | 'no-match' | 'needs-detail'

const TRUNCATION_MARK = '…'

/**
 * Applies the current filters to an event from /stream. Agent, status and time range are
 * exact. The server searches the full args but a stream event only carries a truncated
 * preview, so a miss on a truncated preview is inconclusive and needs the full event.
 */
export function matchLiveEvent(event: EventSummary, filters: Filters): LiveMatch {
  if (filters.agents.length > 0 && !filters.agents.includes(event.agent)) return 'no-match'
  if (filters.status && event.status !== filters.status) return 'no-match'
  const time = Date.parse(event.timestamp)
  if (filters.from && time < Date.parse(filters.from)) return 'no-match'
  if (filters.to && time >= Date.parse(filters.to)) return 'no-match'

  const needle = filters.q.trim().toLowerCase()
  if (!needle) return 'match'
  const haystacks = [event.agent, event.tool, event.argsPreview]
  if (haystacks.some((text) => text.toLowerCase().includes(needle))) return 'match'
  return event.argsPreview.endsWith(TRUNCATION_MARK) ? 'needs-detail' : 'no-match'
}

export function detailMatchesQuery(detail: EventDetail, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  const args = JSON.stringify(detail.args) ?? ''
  return [detail.agent, detail.tool, args].some((text) => text.toLowerCase().includes(needle))
}

/**
 * A view with an end time is a fixed window, so live mode only applies without one. The
 * mock data runs on its own clock, so comparing `to` with the wall clock would mislead.
 */
export function liveModeAvailable(filters: Filters): boolean {
  return !filters.to
}
