export const API_BASE: string = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

export const REQUEST_TIMEOUT_MS = 20_000
export const MAX_RETRIES = 3

type ApiErrorKind = 'http' | 'network' | 'timeout' | 'parse'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number | undefined
  readonly retryAfterMs: number | undefined

  constructor(kind: ApiErrorKind, message: string, status?: number, retryAfterMs?: number) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.retryAfterMs = retryAfterMs
  }

  get retryable(): boolean {
    if (this.kind !== 'http') return true
    const status = this.status ?? 0
    return status >= 500 || status === 408 || status === 429
  }
}

export function apiUrl(path: string, params?: URLSearchParams): string {
  const query = params?.toString()
  return `${API_BASE}${path}${query ? `?${query}` : ''}`
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(header)
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now())
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json()
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
      return body.error
    }
  } catch {
    // Body was not JSON; fall back to the status text.
  }
  return res.statusText || `HTTP ${res.status}`
}

export async function fetchJson<T>(
  path: string,
  params?: URLSearchParams,
  signal?: AbortSignal,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const forwardAbort = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', forwardAbort, { once: true })

  try {
    let res: Response
    try {
      res = await fetch(apiUrl(path, params), {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
    } catch (error) {
      if (signal?.aborted) throw error
      if (timedOut) throw new ApiError('timeout', `The request took longer than ${timeoutMs / 1000}s`)
      throw new ApiError('network', 'Could not reach the activity API')
    }

    if (!res.ok) {
      const message = await readErrorMessage(res)
      throw new ApiError('http', message, res.status, parseRetryAfter(res.headers.get('Retry-After')))
    }

    try {
      return (await res.json()) as T
    } catch (error) {
      if (signal?.aborted) throw error
      if (timedOut) throw new ApiError('timeout', `The request took longer than ${timeoutMs / 1000}s`)
      throw new ApiError('parse', 'The activity API sent a response that could not be read')
    }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', forwardAbort)
  }
}

export function shouldRetry(failureCount: number, error: unknown): boolean {
  return error instanceof ApiError && error.retryable && failureCount < MAX_RETRIES
}

export function retryDelay(attempt: number, error: unknown): number {
  if (error instanceof ApiError && error.retryAfterMs !== undefined) {
    return Math.min(error.retryAfterMs, 30_000)
  }
  const base = Math.min(500 * 2 ** attempt, 8_000)
  return base / 2 + Math.random() * (base / 2)
}

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.kind) {
      case 'timeout':
        return 'The activity API did not respond in time.'
      case 'network':
        return 'Could not reach the activity API. Check that it is running and that you are online.'
      case 'parse':
        return error.message + '.'
      case 'http':
        if (error.status === 429) return 'The activity API is rate limiting requests.'
        if ((error.status ?? 0) >= 500) return `The activity API failed with an internal error (${error.status}).`
        return `The activity API rejected the request: ${error.message}.`
    }
  }
  return error instanceof Error ? error.message : 'Something went wrong.'
}
