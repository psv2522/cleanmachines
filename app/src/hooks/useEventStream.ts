import { useEffect, useRef, useState } from 'react'
import { apiUrl } from '../api/client'
import { STATUSES, type EventSummary } from '../api/types'

export type StreamStatus = 'off' | 'connecting' | 'live' | 'reconnecting'

const FLUSH_INTERVAL_MS = 400
const MAX_RECONNECT_DELAY_MS = 30_000

function parseStreamEvent(data: string): EventSummary | null {
  try {
    const value: unknown = JSON.parse(data)
    if (!value || typeof value !== 'object') return null
    const event = value as Partial<EventSummary>
    if (typeof event.id !== 'string' || typeof event.timestamp !== 'string') return null
    if (!STATUSES.includes(event.status as EventSummary['status'])) return null
    return {
      id: event.id,
      timestamp: event.timestamp,
      agent: String(event.agent ?? ''),
      tool: String(event.tool ?? ''),
      status: event.status as EventSummary['status'],
      latencyMs: Number(event.latencyMs ?? 0),
      argsPreview: String(event.argsPreview ?? ''),
    }
  } catch {
    return null
  }
}

interface StreamHandlers {
  onEvents: (events: EventSummary[]) => void
  /** Called on every successful (re)connect, so the caller can fill any gap. */
  onOpen?: () => void
}

/**
 * Subscribes to /stream while enabled. Events are batched so a burst re-renders the list
 * once rather than once per event.
 */
export function useEventStream(enabled: boolean, handlers: StreamHandlers): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>('off')
  const handlersRef = useRef(handlers)
  useEffect(() => {
    handlersRef.current = handlers
  })

  useEffect(() => {
    if (!enabled) return

    let source: EventSource | null = null
    let buffer: EventSummary[] = []
    let flushTimer: ReturnType<typeof setTimeout> | undefined
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    let disposed = false

    const flush = () => {
      flushTimer = undefined
      if (buffer.length === 0) return
      const batch = buffer
      buffer = []
      handlersRef.current.onEvents(batch)
    }

    const connect = () => {
      setStatus(attempts === 0 ? 'connecting' : 'reconnecting')
      source = new EventSource(apiUrl('/stream'))
      source.onopen = () => {
        attempts = 0
        setStatus('live')
        handlersRef.current.onOpen?.()
      }
      source.onmessage = (message: MessageEvent<string>) => {
        const event = parseStreamEvent(message.data)
        if (!event) return
        buffer.push(event)
        flushTimer ??= setTimeout(flush, FLUSH_INTERVAL_MS)
      }
      source.onerror = () => {
        if (disposed || !source) return
        if (source.readyState === EventSource.CONNECTING) {
          setStatus('reconnecting')
          return
        }
        // The browser gave up (for example after a non-200 response); retry with backoff.
        source.close()
        attempts += 1
        setStatus('reconnecting')
        const delay = Math.min(1000 * 2 ** attempts, MAX_RECONNECT_DELAY_MS)
        reconnectTimer = setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      setStatus('off')
      disposed = true
      source?.close()
      clearTimeout(reconnectTimer)
      clearTimeout(flushTimer)
      flush()
    }
  }, [enabled])

  return enabled ? status : 'off'
}
