import { forwardRef, useCallback, useEffect, useRef, useState } from 'react'
import type { NavigateOptions } from '../state/useViewState'

export const SEARCH_DEBOUNCE_MS = 300

interface SearchBoxProps {
  value: string
  onCommit: (value: string, options: NavigateOptions) => void
}

/**
 * Keeps a local draft so typing stays responsive, and commits it to the URL after a pause.
 * The first commit of a typing session adds a history entry and later ones replace it,
 * so Back returns to the previous search instead of stepping through every keystroke.
 */
export const SearchBox = forwardRef<HTMLInputElement, SearchBoxProps>(function SearchBox({ value, onCommit }, ref) {
  const [draft, setDraft] = useState(value)
  const [committed, setCommitted] = useState(value)
  const inSession = useRef(false)
  const onCommitRef = useRef(onCommit)
  useEffect(() => {
    onCommitRef.current = onCommit
  })

  if (value !== committed) {
    setCommitted(value)
    setDraft(value)
  }

  const commit = useCallback((next: string) => {
    setCommitted(next)
    onCommitRef.current(next, { replace: inSession.current })
    inSession.current = true
  }, [])

  useEffect(() => {
    if (draft === committed) return
    const timer = setTimeout(() => commit(draft), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [draft, committed, commit])

  return (
    <div className="search-box">
      <label htmlFor="event-search" className="visually-hidden">
        Search events
      </label>
      <svg className="search-box__icon" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="7" cy="7" r="4.75" />
        <path d="m10.5 10.5 3.5 3.5" />
      </svg>
      <input
        ref={ref}
        id="event-search"
        type="search"
        className="search-box__input"
        placeholder="Search agents, tools and arguments"
        autoComplete="off"
        spellCheck={false}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          inSession.current = false
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && draft !== committed) commit(draft)
        }}
      />
      <kbd className="search-box__hint" aria-hidden="true">
        /
      </kbd>
    </div>
  )
})
