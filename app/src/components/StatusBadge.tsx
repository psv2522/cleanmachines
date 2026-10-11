import type { EventStatus } from '../api/types'
import { statusLabel } from '../lib/status'
import './StatusBadge.css'

/** Status is carried by shape and text as well as colour. */
export function StatusGlyph({ status }: { status: EventStatus }) {
  return (
    <svg className={`status-glyph status-glyph--${status}`} viewBox="0 0 10 10" aria-hidden="true">
      {status === 'ok' && <circle cx="5" cy="5" r="4" />}
      {status === 'blocked' && <path d="M3.3 0.5h3.4l2.8 2.8v3.4l-2.8 2.8H3.3L0.5 6.7V3.3z" />}
      {status === 'error' && <path d="M5 0.6 9.6 9.2H0.4z" />}
    </svg>
  )
}

export function StatusBadge({ status }: { status: EventStatus }) {
  return (
    <span className={`status-badge status-badge--${status}`}>
      <StatusGlyph status={status} />
      {statusLabel(status)}
    </span>
  )
}
