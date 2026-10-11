import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useViewState } from './useViewState'

describe('useViewState', () => {
  it('pushes a history entry by default and replaces on request', () => {
    const { result } = renderHook(() => useViewState())
    const start = window.history.length

    act(() => result.current[1]({ q: 'ssn' }))
    expect(window.location.search).toBe('?q=ssn')
    expect(window.history.length).toBe(start + 1)

    act(() => result.current[1]({ q: 'ssn export' }, { replace: true }))
    expect(window.location.search).toBe('?q=ssn+export')
    expect(window.history.length).toBe(start + 1)
    expect(result.current[0].q).toBe('ssn export')
  })

  it('does not add an entry when nothing changes', () => {
    const { result } = renderHook(() => useViewState())
    act(() => result.current[1]({ status: 'error' }))
    const length = window.history.length
    act(() => result.current[1]({ status: 'error' }))
    expect(window.history.length).toBe(length)
  })

  it('follows back and forward', () => {
    const { result } = renderHook(() => useViewState())
    act(() => result.current[1]({ status: 'blocked' }))
    act(() => result.current[1]({ event: 'evt_1' }))
    expect(result.current[0].event).toBe('evt_1')

    act(() => {
      window.history.replaceState(null, '', '/?status=blocked')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(result.current[0]).toMatchObject({ status: 'blocked', event: null })
  })

  it('rewrites a non-canonical URL in place', () => {
    window.history.replaceState(null, '', '/?event=evt_1&agent=b&agent=a&status=nope')
    const length = window.history.length
    renderHook(() => useViewState())
    expect(window.location.search).toBe('?agent=a&agent=b&event=evt_1')
    expect(window.history.length).toBe(length)
  })

  it('supports functional updates against the latest URL', () => {
    const { result } = renderHook(() => useViewState())
    act(() => result.current[1]({ agents: ['a'] }))
    act(() => result.current[1]((current) => ({ ...current, agents: [...current.agents, 'b'] })))
    expect(result.current[0].agents).toEqual(['a', 'b'])
  })
})
