import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { retryDelay, shouldRetry } from '../api/client'
import { fetchEvent, fetchEventsPage, queryKeys } from '../api/queries'
import type { EventSummary } from '../api/types'
import { detailMatchesQuery, matchLiveEvent } from '../lib/liveMatch'
import { filtersKey, type Filters } from '../state/viewState'
import { useEventStream, type StreamStatus } from './useEventStream'

const NO_EVENTS: EventSummary[] = []

const newestFirst = (a: EventSummary, b: EventSummary) =>
  Date.parse(b.timestamp) - Date.parse(a.timestamp) || (a.id < b.id ? 1 : -1)

interface LiveOptions {
  enabled: boolean
  filters: Filters
  /** Timestamp of the newest event already in the list. */
  getNewestTimestamp: () => string | null
  /** More events arrived while disconnected than one catch-up page can hold. */
  onGap: () => void
}

export interface LiveEvents {
  items: EventSummary[]
  status: StreamStatus
  clear: () => void
}

/**
 * Events from /stream that match the current filters, newest first. They are kept per
 * filter combination and dropped when the filters change, because the next fetch of the
 * list already includes them.
 */
export function useLiveEvents({ enabled, filters, getNewestTimestamp, onGap }: LiveOptions): LiveEvents {
  const queryClient = useQueryClient()
  const key = filtersKey(filters)
  const [state, setState] = useState<{ key: string; items: EventSummary[] }>({ key, items: NO_EVENTS })

  const latest = useRef({ key, filters, getNewestTimestamp, onGap })
  useEffect(() => {
    latest.current = { key, filters, getNewestTimestamp, onGap }
  })

  const add = useCallback((events: EventSummary[], forKey: string) => {
    if (events.length === 0) return
    setState((prev) => {
      if (forKey !== latest.current.key) return prev
      const base = prev.key === forKey ? prev.items : NO_EVENTS
      const seen = new Set(base.map((event) => event.id))
      const fresh = events.filter((event) => !seen.has(event.id))
      if (fresh.length === 0) return prev
      return { key: forKey, items: [...fresh, ...base].sort(newestFirst) }
    })
  }, [])

  const onEvents = useCallback(
    (batch: EventSummary[]) => {
      const { key: forKey, filters: current } = latest.current
      const accepted: EventSummary[] = []
      for (const event of batch) {
        const match = matchLiveEvent(event, current)
        if (match === 'match') accepted.push(event)
        if (match === 'needs-detail') {
          queryClient
            .fetchQuery({
              queryKey: queryKeys.event(event.id),
              queryFn: ({ signal }) => fetchEvent(event.id, signal),
              staleTime: Infinity,
              retry: shouldRetry,
              retryDelay,
            })
            .then((detail) => {
              if (detailMatchesQuery(detail, current.q)) add([event], forKey)
            })
            .catch(() => {})
        }
      }
      add(accepted, forKey)
    },
    [add, queryClient],
  )

  const onOpen = useCallback(async () => {
    const { key: forKey, filters: current, getNewestTimestamp: getNewest } = latest.current
    const newest = getNewest()
    if (!newest) return
    for (let attempt = 0; attempt <= 3; attempt++) {
      try {
        const page = await fetchEventsPage(current, null)
        const newestMs = Date.parse(newest)
        const newer = page.items.filter((event) => Date.parse(event.timestamp) > newestMs)
        if (newer.length === page.items.length && page.nextCursor) {
          if (forKey === latest.current.key) latest.current.onGap()
          return
        }
        add(newer, forKey)
        return
      } catch (error) {
        if (!shouldRetry(attempt, error)) return
        await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt, error)))
      }
    }
  }, [add])

  const status = useEventStream(enabled, { onEvents, onOpen })
  const clear = useCallback(() => setState({ key: latest.current.key, items: NO_EVENTS }), [])

  return { items: state.key === key ? state.items : NO_EVENTS, status, clear }
}
