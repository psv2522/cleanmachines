import { useEffect, useId, useRef, useState } from 'react'
import { describeError } from '../api/client'
import { useAgents } from '../api/queries'
import type { NavigateOptions } from '../state/useViewState'
import { Spinner } from './Notice'

interface AgentFilterProps {
  selected: string[]
  onChange: (agents: string[], options: NavigateOptions) => void
}

export function AgentFilter({ selected, onChange }: AgentFilterProps) {
  const [open, setOpen] = useState(false)
  const agents = useAgents()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const changedThisSession = useRef(false)
  const panelId = useId()

  const close = (returnFocus: boolean) => {
    setOpen(false)
    changedThisSession.current = false
    if (returnFocus) buttonRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLInputElement>('input')?.focus()
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const update = (next: string[]) => {
    onChange(next, { replace: changedThisSession.current })
    changedThisSession.current = true
  }

  const toggle = (agent: string) => {
    update(selected.includes(agent) ? selected.filter((name) => name !== agent) : [...selected, agent])
  }

  // Agents selected through a URL but missing from /agents still need to be removable.
  const names = [...new Set([...(agents.data ?? []), ...selected])].sort()

  const label = selected.length === 0 ? 'All agents' : selected.length === 1 ? selected[0] : `${selected.length} agents`

  return (
    <div
      className="agent-filter"
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault()
          event.stopPropagation()
          close(true)
        }
      }}
      onBlur={(event) => {
        if (open && !rootRef.current?.contains(event.relatedTarget as Node | null)) close(false)
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="button filter-button"
        aria-expanded={open}
        aria-controls={panelId}
        data-active={selected.length > 0 || undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        <span className="filter-button__label">Agent</span>
        <span className="filter-button__value">{label}</span>
        <svg className="filter-button__chevron" viewBox="0 0 10 10" aria-hidden="true">
          <path d="m2 3.5 3 3 3-3" />
        </svg>
      </button>
      {open && (
        <div ref={panelRef} id={panelId} className="popover agent-filter__panel">
          <fieldset className="agent-filter__list">
            <legend className="visually-hidden">Show events from these agents</legend>
            {agents.isPending && (
              <p className="agent-filter__status">
                <Spinner /> Loading agents…
              </p>
            )}
            {agents.isError && (
              <div className="agent-filter__status" role="alert">
                <p>Couldn’t load the agent list. {describeError(agents.error)}</p>
                <button type="button" className="button button--small" onClick={() => agents.refetch()}>
                  Try again
                </button>
              </div>
            )}
            {names.map((agent) => (
              <label key={agent} className="agent-filter__option">
                <input type="checkbox" checked={selected.includes(agent)} onChange={() => toggle(agent)} />
                <span>{agent}</span>
              </label>
            ))}
          </fieldset>
          <div className="agent-filter__footer">
            <button
              type="button"
              className="button button--quiet button--small"
              disabled={selected.length === 0}
              onClick={() => update([])}
            >
              Show all agents
            </button>
            <button type="button" className="button button--small" onClick={() => close(true)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
