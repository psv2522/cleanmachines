import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, describeError, fetchJson, MAX_RETRIES, retryDelay, shouldRetry } from './client'

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('fetchJson', () => {
  it('returns the parsed body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(200, ['a', 'b'])))
    await expect(fetchJson('/agents')).resolves.toEqual(['a', 'b'])
  })

  it('reports the API error message and status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(400, { error: 'invalid cursor' })))
    const error = await fetchJson('/events').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ kind: 'http', status: 400, message: 'invalid cursor', retryable: false })
  })

  it('reads Retry-After in seconds', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(503, { error: 'busy' }, { 'Retry-After': '2' })))
    const error = await fetchJson('/events').catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 503, retryAfterMs: 2000, retryable: true })
  })

  it('classifies network failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    await expect(fetchJson('/events')).rejects.toMatchObject({ kind: 'network', retryable: true })
  })

  it('classifies unreadable bodies', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(200, '<html>')))
    await expect(fetchJson('/events')).rejects.toMatchObject({ kind: 'parse' })
  })

  it('times out a request that never answers', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
          }),
      ),
    )
    const pending = fetchJson('/events', undefined, undefined, 1000).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(1000)
    expect(await pending).toMatchObject({ kind: 'timeout' })
  })

  it('passes a caller abort through instead of turning it into an API error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
          }),
      ),
    )
    const controller = new AbortController()
    const pending = fetchJson('/events', undefined, controller.signal).catch((e: unknown) => e)
    controller.abort()
    const error = await pending
    expect(error).not.toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ name: 'AbortError' })
  })
})

describe('retry policy', () => {
  it('retries server and network failures a bounded number of times', () => {
    const serverError = new ApiError('http', 'boom', 500)
    expect(shouldRetry(0, serverError)).toBe(true)
    expect(shouldRetry(MAX_RETRIES, serverError)).toBe(false)
    expect(shouldRetry(0, new ApiError('network', 'offline'))).toBe(true)
  })

  it('does not retry requests the API rejected', () => {
    expect(shouldRetry(0, new ApiError('http', 'bad', 400))).toBe(false)
    expect(shouldRetry(0, new ApiError('http', 'missing', 404))).toBe(false)
    expect(shouldRetry(0, new Error('bug'))).toBe(false)
  })

  it('backs off with jitter and honours Retry-After', () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      const base = Math.min(500 * 2 ** attempt, 8000)
      const delay = retryDelay(attempt, new ApiError('http', 'boom', 500))
      expect(delay).toBeGreaterThanOrEqual(base / 2)
      expect(delay).toBeLessThanOrEqual(base)
    }
    expect(retryDelay(0, new ApiError('http', 'busy', 429, 4000))).toBe(4000)
    expect(retryDelay(0, new ApiError('http', 'busy', 429, 120_000))).toBe(30_000)
  })
})

describe('describeError', () => {
  it('explains each kind of failure', () => {
    expect(describeError(new ApiError('network', 'x'))).toMatch(/Could not reach/)
    expect(describeError(new ApiError('timeout', 'x'))).toMatch(/did not respond in time/)
    expect(describeError(new ApiError('http', 'x', 502))).toMatch(/internal error \(502\)/)
    expect(describeError(new ApiError('http', 'invalid status', 400))).toMatch(/rejected the request: invalid status/)
  })
})
