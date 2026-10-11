import type { EventStatus } from '../api/types'

const LABELS: Record<EventStatus, string> = { ok: 'OK', blocked: 'Blocked', error: 'Error' }

export function statusLabel(status: EventStatus): string {
  return LABELS[status]
}
