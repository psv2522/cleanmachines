import type { StreamStatus } from '../hooks/useEventStream'

interface LiveToggleProps {
  enabled: boolean
  available: boolean
  status: StreamStatus
  onChange: (enabled: boolean) => void
}

const STATUS_TEXT: Record<StreamStatus, string> = {
  off: '',
  connecting: 'Connecting…',
  live: 'Receiving new events',
  reconnecting: 'Connection lost. Reconnecting…',
}

export function LiveToggle({ enabled, available, status, onChange }: LiveToggleProps) {
  const on = enabled && available
  return (
    <div className="live-toggle" data-status={on ? status : 'off'}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-describedby="live-toggle-status"
        className="live-toggle__switch"
        disabled={!available}
        onClick={() => onChange(!enabled)}
      >
        <span className="live-toggle__track" aria-hidden="true">
          <span className="live-toggle__thumb" />
        </span>
        Live
      </button>
      <span id="live-toggle-status" className="live-toggle__status" role="status">
        {available ? (on ? STATUS_TEXT[status] : '') : 'Off while a time range is selected'}
      </span>
    </div>
  )
}
