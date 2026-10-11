import { STATUSES, type EventStatus } from '../api/types'
import { statusLabel } from '../lib/status'
import { StatusGlyph } from './StatusBadge'

interface StatusFilterProps {
  value: EventStatus | null
  onChange: (status: EventStatus | null) => void
}

const OPTIONS: (EventStatus | null)[] = [null, ...STATUSES]

export function StatusFilter({ value, onChange }: StatusFilterProps) {
  return (
    <fieldset className="segmented">
      <legend className="visually-hidden">Status</legend>
      {OPTIONS.map((status) => (
        <label key={status ?? 'all'} className="segmented__option" data-status={status ?? 'all'}>
          <input
            type="radio"
            name="status"
            className="visually-hidden"
            checked={value === status}
            onChange={() => onChange(status)}
          />
          <span className="segmented__label">
            {status && <StatusGlyph status={status} />}
            {status ? statusLabel(status) : 'Any status'}
          </span>
        </label>
      ))}
    </fieldset>
  )
}
