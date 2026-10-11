import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { filterParams, filtersKey, type Filters } from '../state/viewState'
import { ApiError, fetchJson } from './client'
import type { Bucket, EventDetail, EventsPage, HistogramResponse } from './types'

export const PAGE_SIZE = 200

export const queryKeys = {
  agents: ['agents'] as const,
  events: (filters: Filters) => ['events', filtersKey(filters)] as const,
  event: (id: string) => ['event', id] as const,
  histogram: (filters: Filters, bucket: Bucket) => ['histogram', filtersKey(filters), bucket] as const,
}

export function fetchEventsPage(filters: Filters, cursor: string | null, signal?: AbortSignal) {
  const params = filterParams(filters)
  params.set('limit', String(PAGE_SIZE))
  if (cursor) params.set('cursor', cursor)
  return fetchJson<EventsPage>('/events', params, signal)
}

export function fetchEvent(id: string, signal?: AbortSignal) {
  return fetchJson<EventDetail>(`/events/${encodeURIComponent(id)}`, undefined, signal)
}

export function useAgents() {
  return useQuery({
    queryKey: queryKeys.agents,
    queryFn: ({ signal }) => fetchJson<string[]>('/agents', undefined, signal),
    staleTime: 10 * 60_000,
  })
}

export function useEvents(filters: Filters) {
  return useInfiniteQuery({
    queryKey: queryKeys.events(filters),
    queryFn: ({ pageParam, signal }) => fetchEventsPage(filters, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    // Refetching an infinite query replays every loaded page in sequence. Fresh data
    // arrives through live mode or an explicit refresh instead.
    staleTime: Infinity,
  })
}

export function useEventDetail(id: string | null) {
  return useQuery({
    queryKey: queryKeys.event(id ?? ''),
    queryFn: ({ signal }) => fetchEvent(id!, signal),
    enabled: id !== null,
    staleTime: Infinity,
  })
}

export function useHistogram(filters: Filters, bucket: Bucket, live: boolean) {
  return useQuery({
    queryKey: queryKeys.histogram(filters, bucket),
    queryFn: ({ signal }) => {
      const params = filterParams(filters)
      params.set('bucket', bucket)
      return fetchJson<HistogramResponse>('/events/histogram', params, signal)
    },
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchInterval: live ? 15_000 : false,
  })
}

export function isNotFound(error: unknown) {
  return error instanceof ApiError && error.status === 404
}
