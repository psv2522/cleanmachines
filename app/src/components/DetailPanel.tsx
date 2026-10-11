import { useEffect, useRef, type ReactNode } from 'react'
import { describeError, MAX_RETRIES } from '../api/client'
import { isNotFound, useEventDetail } from '../api/queries'
import type { EventDetail, EventSummary } from '../api/types'
import { useDelayedFlag } from '../hooks/useDelayedFlag'
import { formatFullTime, formatLatency, formatUtcTime } from '../lib/format'
import { CopyButton } from './CopyButton'
import { JsonView } from './JsonView'
import { Notice, Spinner } from './Notice'
import { StatusBadge } from './StatusBadge'
import './DetailPanel.css'

interface DetailPanelProps {
  eventId: string
  /** The row from the list, shown while the full event loads. */
  summary: EventSummary | undefined
  /** Incremented when the panel should take keyboard focus. */
  focusNonce: number
  onClose: () => void
}

export function DetailPanel({ eventId, summary, focusNonce, onClose }: DetailPanelProps) {
  const query = useEventDetail(eventId)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (focusNonce > 0) headingRef.current?.focus()
  }, [focusNonce])

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [eventId])

  const head = query.data ?? summary

  return (
    <aside className="detail-panel" aria-labelledby="detail-heading">
      <header className="detail-panel__header">
        <div className="detail-panel__title">
          <h2 id="detail-heading" ref={headingRef} tabIndex={-1}>
            {head ? <span className="mono">{head.tool}</span> : 'Event details'}
          </h2>
          {head && (
            <p className="detail-panel__subtitle">
              <StatusBadge status={head.status} />
              <span>{head.agent}</span>
            </p>
          )}
        </div>
        <button type="button" className="button button--quiet detail-panel__close" onClick={onClose}>
          <span className="visually-hidden">Close event details</span>
          <kbd aria-hidden="true">Esc</kbd>
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="m2.5 2.5 7 7m0-7-7 7" />
          </svg>
        </button>
      </header>
      <div className="detail-panel__body" ref={bodyRef}>
        <DetailBody eventId={eventId} summary={summary} query={query} onClose={onClose} />
      </div>
    </aside>
  )
}

function DetailBody({
  eventId,
  summary,
  query,
  onClose,
}: {
  eventId: string
  summary: EventSummary | undefined
  query: ReturnType<typeof useEventDetail>
  onClose: () => void
}) {
  const waiting = query.isPending && query.fetchStatus === 'fetching'
  const slow = useDelayedFlag(waiting, 2500)

  if (query.isError) {
    if (isNotFound(query.error)) {
      return (
        <Notice
          tone="warning"
          title="This event doesn’t exist"
          actions={
            <button type="button" className="button" onClick={onClose}>
              Close
            </button>
          }
        >
          <p>
            No event has the ID <code>{eventId}</code>. The link may be incomplete.
          </p>
        </Notice>
      )
    }
    return (
      <Notice
        tone="error"
        role="alert"
        title="Couldn’t load this event"
        actions={
          <button type="button" className="button button--primary" onClick={() => query.refetch()}>
            Try again
          </button>
        }
      >
        <p>{describeError(query.error)}</p>
      </Notice>
    )
  }

  if (query.isPending) {
    let status: ReactNode = null
    if (query.fetchStatus === 'paused') {
      status = 'You’re offline. The event will load when your connection is back.'
    } else if (query.failureCount > 0) {
      status = `The API returned an error. Retrying (attempt ${query.failureCount + 1} of ${MAX_RETRIES + 1})…`
    } else if (slow) {
      status = 'Still loading. The API is responding slowly.'
    }
    return (
      <div aria-busy="true">
        {summary && <Overview event={summary} />}
        <p className="detail-panel__loading" role="status">
          {query.fetchStatus !== 'paused' && <Spinner />}
          <span>{status ?? 'Loading the full event…'}</span>
        </p>
        <div className="skeleton-block" />
        <div className="skeleton-block skeleton-block--short" />
      </div>
    )
  }

  const event = query.data
  return (
    <>
      <Overview event={event} />
      <Outcome event={event} />
      <section className="detail-section" aria-labelledby="detail-args">
        <h3 id="detail-args">Arguments</h3>
        <JsonView value={event.args} label="Arguments" />
      </section>
      <section className="detail-section" aria-labelledby="detail-result">
        <h3 id="detail-result">Result</h3>
        <JsonView value={event.result} label="Result" />
      </section>
    </>
  )
}

function Overview({ event }: { event: EventSummary | EventDetail }) {
  return (
    <dl className="detail-meta">
      <div>
        <dt>Event ID</dt>
        <dd className="detail-meta__id">
          <code>{event.id}</code>
          <CopyButton text={event.id} label="Copy event ID" />
        </dd>
      </div>
      <div>
        <dt>Time</dt>
        <dd>
          <time dateTime={event.timestamp}>{formatFullTime(event.timestamp)}</time>
          <span className="detail-meta__secondary">{formatUtcTime(event.timestamp)}</span>
        </dd>
      </div>
      <div>
        <dt>Agent</dt>
        <dd>{event.agent}</dd>
      </div>
      <div>
        <dt>Tool</dt>
        <dd>
          <code>{event.tool}</code>
        </dd>
      </div>
      <div>
        <dt>Latency</dt>
        <dd>{formatLatency(event.latencyMs)}</dd>
      </div>
    </dl>
  )
}

function readString(value: unknown, key: string): string | null {
  if (value && typeof value === 'object' && key in value) {
    const field = (value as Record<string, unknown>)[key]
    return typeof field === 'string' ? field : null
  }
  return null
}

function Outcome({ event }: { event: EventDetail }) {
  const blockingRule = readString(event.result, 'rule')
  const errorMessage = readString(event.result, 'error')
  const rules = event.policyMatches ?? []

  return (
    <section className="detail-section" aria-labelledby="detail-policy">
      <h3 id="detail-policy">Policy</h3>
      {event.status === 'blocked' && (
        <p className="outcome outcome--blocked">
          Blocked before it ran{blockingRule ? <> by <code>{blockingRule}</code></> : null}.
        </p>
      )}
      {event.status === 'error' && (
        <p className="outcome outcome--error">The call failed{errorMessage ? `: ${errorMessage}` : '.'}</p>
      )}
      {rules.length > 0 ? (
        <>
          <p className="detail-section__hint">
            {rules.length === 1 ? 'One rule matched this call.' : `${rules.length} rules matched this call.`}
          </p>
          <ul className="rule-list">
            {rules.map((rule) => (
              <li key={rule} data-blocking={rule === blockingRule || undefined}>
                <code>{rule}</code>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="detail-section__hint">No policy rules matched this call.</p>
      )}
    </section>
  )
}
