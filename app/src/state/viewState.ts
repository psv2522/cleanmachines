import { STATUSES, type EventStatus } from '../api/types'

export interface Filters {
  q: string
  agents: string[]
  status: EventStatus | null
  from: string | null
  to: string | null
}

export interface ViewState extends Filters {
  event: string | null
}

export const EMPTY_FILTERS: Filters = { q: '', agents: [], status: null, from: null, to: null }
export const EMPTY_VIEW: ViewState = { ...EMPTY_FILTERS, event: null }

function isStatus(value: string | null): value is EventStatus {
  return value !== null && (STATUSES as readonly string[]).includes(value)
}

export function normalizeTimestamp(value: string | null): string | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

function normalizeAgents(agents: string[]): string[] {
  return [...new Set(agents.map((agent) => agent.trim()).filter(Boolean))].sort()
}

export function parseViewState(search: string): ViewState {
  const params = new URLSearchParams(search)
  const status = params.get('status')
  let from = normalizeTimestamp(params.get('from'))
  let to = normalizeTimestamp(params.get('to'))
  if (from && to && from >= to) {
    from = null
    to = null
  }
  return {
    q: params.get('q') ?? '',
    agents: normalizeAgents(params.getAll('agent')),
    status: isStatus(status) ? status : null,
    from,
    to,
    event: params.get('event')?.trim() || null,
  }
}

export function serializeViewState(state: ViewState): string {
  const params = new URLSearchParams()
  if (state.q.trim()) params.set('q', state.q)
  for (const agent of normalizeAgents(state.agents)) params.append('agent', agent)
  if (state.status) params.set('status', state.status)
  if (state.from) params.set('from', state.from)
  if (state.to) params.set('to', state.to)
  if (state.event) params.set('event', state.event)
  const query = params.toString()
  return query ? `?${query}` : ''
}

export function filtersOf(state: ViewState): Filters {
  return { q: state.q, agents: state.agents, status: state.status, from: state.from, to: state.to }
}

export function hasActiveFilters(filters: Filters): boolean {
  return Boolean(filters.q.trim() || filters.agents.length || filters.status || filters.from || filters.to)
}

/** Query params understood by /events and /events/histogram. */
export function filterParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams()
  const q = filters.q.trim()
  if (q) params.set('q', q)
  for (const agent of filters.agents) params.append('agent', agent)
  if (filters.status) params.set('status', filters.status)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  return params
}

/** Stable cache key: two filter objects that hit the same API query produce the same key. */
export function filtersKey(filters: Filters): string {
  return filterParams(filters).toString()
}
