import { describe, expect, it } from 'vitest'
import type { EventDetail, EventSummary } from '../api/types'
import { EMPTY_FILTERS } from '../state/viewState'
import { detailMatchesQuery, liveModeAvailable, matchLiveEvent } from './liveMatch'
import { mergeRows } from './rows'

const event: EventSummary = {
  id: 'evt_1',
  timestamp: '2026-10-09T12:00:05.000Z',
  agent: 'support-copilot',
  tool: 'email.send',
  status: 'blocked',
  latencyMs: 12,
  argsPreview: '{"body":"Here are the records you asked for. SSN: 230-82-4944"}',
}

describe('matchLiveEvent', () => {
  it('matches everything with no filters', () => {
    expect(matchLiveEvent(event, EMPTY_FILTERS)).toBe('match')
  })

  it('applies agent, status and time range exactly', () => {
    expect(matchLiveEvent(event, { ...EMPTY_FILTERS, agents: ['code-reviewer'] })).toBe('no-match')
    expect(matchLiveEvent(event, { ...EMPTY_FILTERS, agents: ['support-copilot'] })).toBe('match')
    expect(matchLiveEvent(event, { ...EMPTY_FILTERS, status: 'ok' })).toBe('no-match')
    expect(matchLiveEvent(event, { ...EMPTY_FILTERS, from: '2026-10-09T12:00:06.000Z' })).toBe('no-match')
    expect(matchLiveEvent(event, { ...EMPTY_FILTERS, to: '2026-10-09T12:00:05.000Z' })).toBe('no-match')
  })

  it('searches agent, tool and the args preview case-insensitively', () => {
    expect(matchLiveEvent(event, { ...EMPTY_FILTERS, q: 'EMAIL' })).toBe('match')
    expect(matchLiveEvent(event, { ...EMPTY_FILTERS, q: 'ssn' })).toBe('match')
    expect(matchLiveEvent(event, { ...EMPTY_FILTERS, q: 'kubectl' })).toBe('no-match')
  })

  it('defers to the full event when the preview was truncated', () => {
    const truncated = { ...event, argsPreview: '{"body":"Here are the records you…' }
    expect(matchLiveEvent(truncated, { ...EMPTY_FILTERS, q: 'kubectl' })).toBe('needs-detail')
  })
})

describe('detailMatchesQuery', () => {
  const detail = { ...event, args: { to: ['ops@acme.io'], body: 'deploy log' }, result: null, policyMatches: [] } as EventDetail

  it('searches the full arguments', () => {
    expect(detailMatchesQuery(detail, 'ops@acme')).toBe(true)
    expect(detailMatchesQuery(detail, 'payroll')).toBe(false)
  })
})

describe('liveModeAvailable', () => {
  it('is off for a fixed time window', () => {
    expect(liveModeAvailable({ ...EMPTY_FILTERS, from: '2026-10-08T00:00:00.000Z' })).toBe(true)
    expect(liveModeAvailable({ ...EMPTY_FILTERS, to: '2026-10-09T00:00:00.000Z' })).toBe(false)
  })
})

describe('mergeRows', () => {
  it('puts live events first and drops duplicates already in a page', () => {
    const a = { ...event, id: 'a' }
    const b = { ...event, id: 'b' }
    const c = { ...event, id: 'c' }
    expect(mergeRows([a, b], [[b, c], [c]]).map((row) => row.id)).toEqual(['a', 'b', 'c'])
  })
})
