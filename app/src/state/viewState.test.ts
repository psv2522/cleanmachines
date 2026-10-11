import { describe, expect, it } from 'vitest'
import { EMPTY_VIEW, filtersKey, hasActiveFilters, parseViewState, serializeViewState } from './viewState'

describe('parseViewState', () => {
  it('reads every filter and the open event', () => {
    const state = parseViewState(
      '?q=ssn&agent=support-copilot&agent=billing-assistant&status=blocked&from=2026-10-08T00:00:00.000Z&to=2026-10-09T00:00:00.000Z&event=evt_1',
    )
    expect(state).toEqual({
      q: 'ssn',
      agents: ['billing-assistant', 'support-copilot'],
      status: 'blocked',
      from: '2026-10-08T00:00:00.000Z',
      to: '2026-10-09T00:00:00.000Z',
      event: 'evt_1',
    })
  })

  it('drops values a hand-edited URL can get wrong', () => {
    const state = parseViewState('?status=failed&agent=&agent=%20a%20&agent=a&from=yesterday&event=%20')
    expect(state.status).toBeNull()
    expect(state.agents).toEqual(['a'])
    expect(state.from).toBeNull()
    expect(state.event).toBeNull()
  })

  it('ignores a time range that ends before it starts', () => {
    const state = parseViewState('?from=2026-10-09T00:00:00Z&to=2026-10-08T00:00:00Z')
    expect(state.from).toBeNull()
    expect(state.to).toBeNull()
  })

  it('normalises timestamps to ISO strings', () => {
    expect(parseViewState('?from=2026-10-08T05:30:00%2B05:30').from).toBe('2026-10-08T00:00:00.000Z')
  })
})

describe('serializeViewState', () => {
  it('writes params in a canonical order so equal views have equal URLs', () => {
    const a = serializeViewState({ ...EMPTY_VIEW, event: 'evt_1', status: 'error', agents: ['b', 'a'], q: 'x' })
    const b = serializeViewState({ ...EMPTY_VIEW, q: 'x', agents: ['a', 'b'], status: 'error', event: 'evt_1' })
    expect(a).toBe(b)
    expect(a).toBe('?q=x&agent=a&agent=b&status=error&event=evt_1')
  })

  it('round-trips through parse', () => {
    const search = '?q=rm+-rf&agent=devops-runner&status=blocked&from=2026-10-08T00%3A00%3A00.000Z'
    expect(serializeViewState(parseViewState(search))).toBe(search)
  })

  it('returns an empty string for the default view', () => {
    expect(serializeViewState(EMPTY_VIEW)).toBe('')
    expect(serializeViewState({ ...EMPTY_VIEW, q: '   ' })).toBe('')
  })
})

describe('filter helpers', () => {
  it('treats whitespace-only search as no filter', () => {
    expect(hasActiveFilters({ ...EMPTY_VIEW, q: '  ' })).toBe(false)
    expect(hasActiveFilters({ ...EMPTY_VIEW, status: 'ok' })).toBe(true)
  })

  it('gives the same cache key to filters that make the same request', () => {
    expect(filtersKey({ ...EMPTY_VIEW, q: ' ssn ' })).toBe(filtersKey({ ...EMPTY_VIEW, q: 'ssn' }))
    expect(filtersKey({ ...EMPTY_VIEW, q: 'ssn' })).not.toBe(filtersKey({ ...EMPTY_VIEW, q: 'ssh' }))
  })
})
