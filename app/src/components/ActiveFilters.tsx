import { formatShortTime } from '../lib/format'
import { EMPTY_FILTERS, hasActiveFilters, type Filters } from '../state/viewState'
import { statusLabel } from '../lib/status'

interface ActiveFiltersProps {
  filters: Filters
  onChange: (next: Partial<Filters>) => void
}

export function ActiveFilters({ filters, onChange }: ActiveFiltersProps) {
  if (!hasActiveFilters(filters)) return null

  const chips: { key: string; label: string; remove: Partial<Filters> }[] = []
  if (filters.q.trim()) chips.push({ key: 'q', label: `“${filters.q.trim()}”`, remove: { q: '' } })
  for (const agent of filters.agents) {
    chips.push({ key: `agent:${agent}`, label: agent, remove: { agents: filters.agents.filter((a) => a !== agent) } })
  }
  if (filters.status) chips.push({ key: 'status', label: statusLabel(filters.status), remove: { status: null } })
  if (filters.from || filters.to) {
    const label = `${filters.from ? formatShortTime(filters.from) : 'Start'} to ${filters.to ? formatShortTime(filters.to) : 'now'}`
    chips.push({ key: 'time', label, remove: { from: null, to: null } })
  }

  return (
    <ul className="active-filters" aria-label="Active filters">
      {chips.map((chip) => (
        <li key={chip.key} className="chip">
          <span>{chip.label}</span>
          <button
            type="button"
            className="chip__remove"
            aria-label={`Remove filter ${chip.label}`}
            onClick={() => onChange(chip.remove)}
          >
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="m3 3 6 6m0-6-6 6" />
            </svg>
          </button>
        </li>
      ))}
      {chips.length > 1 && (
        <li>
          <button type="button" className="link-button" onClick={() => onChange(EMPTY_FILTERS)}>
            Clear all
          </button>
        </li>
      )}
    </ul>
  )
}
