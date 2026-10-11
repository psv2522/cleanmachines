import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { describeError, MAX_RETRIES } from './api/client'
import { queryKeys, useEvents } from './api/queries'
import type { EventSummary } from './api/types'
import { ActiveFilters } from './components/ActiveFilters'
import { AgentFilter } from './components/AgentFilter'
import { DetailPanel } from './components/DetailPanel'
import { EventTable, type EventTableHandle, type OpenOptions } from './components/EventTable'
import { Histogram } from './components/Histogram'
import { LiveToggle } from './components/LiveToggle'
import { Notice, Spinner } from './components/Notice'
import { SearchBox } from './components/SearchBox'
import { StatusFilter } from './components/StatusFilter'
import { useDelayedFlag } from './hooks/useDelayedFlag'
import { useLiveEvents } from './hooks/useLiveEvents'
import { formatCount, plural } from './lib/format'
import { liveModeAvailable } from './lib/liveMatch'
import { mergeRows } from './lib/rows'
import { useViewState, type NavigateOptions } from './state/useViewState'
import {
  EMPTY_FILTERS,
  filtersKey,
  filtersOf,
  hasActiveFilters,
  parseViewState,
  type Filters,
  type ViewState,
} from './state/viewState'
import './App.css'

const SLOW_AFTER_MS = 2500

export function App() {
  const [view, navigate] = useViewState()
  const filters = useStableFilters(view)
  const key = filtersKey(filters)
  const queryClient = useQueryClient()
  const events = useEvents(filters)

  const [liveEnabled, setLiveEnabled] = useState(false)
  const [refreshCount, setRefreshCount] = useState(0)
  const [panelFocusNonce, setPanelFocusNonce] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const tableRef = useRef<EventTableHandle>(null)
  const rowsRef = useRef<EventSummary[]>([])
  const refreshRef = useRef<() => void>(() => {})

  const liveAvailable = liveModeAvailable(filters)
  const liveOn = liveEnabled && liveAvailable
  const live = useLiveEvents({
    enabled: liveOn,
    filters,
    getNewestTimestamp: () => rowsRef.current[0]?.timestamp ?? null,
    onGap: () => refreshRef.current(),
  })

  const pages = events.data?.pages
  const rows = useMemo(
    () => mergeRows(events.isPlaceholderData ? [] : live.items, pages?.map((page) => page.items) ?? []),
    [pages, events.isPlaceholderData, live.items],
  )
  useEffect(() => {
    rowsRef.current = rows
  })

  const refresh = useCallback(() => {
    live.clear()
    queryClient.resetQueries({ queryKey: queryKeys.events(filters), exact: true })
    setRefreshCount((count) => count + 1)
  }, [live, queryClient, filters])
  useEffect(() => {
    refreshRef.current = refresh
  })

  const pageItemCount = pages?.reduce((sum, page) => sum + page.items.length, 0) ?? 0
  const serverTotal = pages?.[0]?.total ?? null
  const total = serverTotal === null ? null : serverTotal + Math.max(0, rows.length - pageItemCount)

  const updateFilters = useCallback(
    (next: Partial<Filters>, options?: NavigateOptions) => navigate((current) => ({ ...current, ...next }), options),
    [navigate],
  )

  const openEvent = useCallback(
    (id: string, { replace, focusPanel }: OpenOptions) => {
      navigate({ event: id }, { replace })
      if (focusPanel) setPanelFocusNonce((nonce) => nonce + 1)
    },
    [navigate],
  )

  const closePanel = useCallback(() => {
    const id = parseViewState(window.location.search).event
    navigate({ event: null })
    if (id) tableRef.current?.focusRow(id)
  }, [navigate])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target instanceof Element ? event.target : null
      const typing = target?.closest('input[type="search"], input[type="text"], textarea, [contenteditable="true"]')
      if (typing) return
      if (event.key === 'Escape' && parseViewState(window.location.search).event) {
        event.preventDefault()
        closePanel()
      } else if (event.key === '/') {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closePanel])

  const selectedSummary = useMemo(
    () => (view.event ? rows.find((row) => row.id === view.event) : undefined),
    [rows, view.event],
  )

  let placeholder: ReactNode
  if (events.isPending) {
    placeholder = <LoadingRows fetchStatus={events.fetchStatus} failureCount={events.failureCount} />
  } else if (events.isError && !events.data) {
    placeholder = (
      <EventsError
        error={events.error}
        hasFilters={hasActiveFilters(filters)}
        onRetry={() => events.refetch()}
        onClearFilters={() => updateFilters(EMPTY_FILTERS)}
      />
    )
  } else if (rows.length === 0) {
    placeholder = (
      <EmptyResults
        filters={filters}
        liveOn={liveOn}
        onClearFilters={() => updateFilters(EMPTY_FILTERS)}
        onClearRange={() => updateFilters({ from: null, to: null })}
      />
    )
  }

  const resetKey = `${key}|${events.isPlaceholderData ? 'previous' : 'current'}|${refreshCount}`

  return (
    <div className="app" data-panel={view.event ? 'open' : undefined}>
      <a className="skip-link" href="#results">
        Skip to events
      </a>
      <header className="topbar">
        <h1 className="brand">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="7" />
            <path d="M6 21h4l3-10 4 14 3-9 2 5h4" />
          </svg>
          Agent activity
        </h1>
        <form className="topbar__filters" role="search" aria-label="Filter events" onSubmit={(e) => e.preventDefault()}>
          <SearchBox ref={searchRef} value={view.q} onCommit={(q, options) => updateFilters({ q }, options)} />
          <AgentFilter selected={view.agents} onChange={(agents, options) => updateFilters({ agents }, options)} />
          <StatusFilter value={view.status} onChange={(status) => updateFilters({ status })} />
        </form>
        <LiveToggle enabled={liveEnabled} available={liveAvailable} status={live.status} onChange={setLiveEnabled} />
      </header>

      <main className="workspace">
        <Histogram
          filters={filters}
          live={liveOn}
          onSelectRange={(range) => updateFilters(range)}
          onClearRange={() => updateFilters({ from: null, to: null })}
        />
        <section className="results" id="results" aria-labelledby="results-title" tabIndex={-1}>
          <div className="results__bar">
            <h2 id="results-title" className="results__count">
              {total === null ? 'Events' : plural(total, 'event')}
            </h2>
            {total !== null && rows.length > 0 && rows.length < total && (
              <span className="results__loaded">{formatCount(rows.length)} loaded</span>
            )}
            <ActiveFilters filters={filters} onChange={updateFilters} />
            <ResultsStatus
              fetchStatus={events.fetchStatus}
              updating={events.isPlaceholderData && events.isFetching}
              failureCount={events.failureCount}
            />
            <div className="results__tools">
              <p className="shortcuts" aria-hidden="true">
                <kbd>↑</kbd>
                <kbd>↓</kbd> move <kbd>Enter</kbd> open <kbd>Esc</kbd> close <kbd>/</kbd> search
              </p>
              <button
                type="button"
                className="button button--small"
                onClick={refresh}
                disabled={events.isFetching && !events.isFetchingNextPage}
              >
                Refresh
              </button>
            </div>
          </div>
          <EventTable
            ref={tableRef}
            rows={rows}
            total={total}
            resetKey={resetKey}
            selectedId={view.event}
            stale={events.isPlaceholderData}
            placeholder={placeholder}
            hasMore={Boolean(events.hasNextPage)}
            isFetchingMore={events.isFetchingNextPage}
            loadMoreError={events.isFetchNextPageError ? events.error : null}
            onLoadMore={() => events.fetchNextPage({ cancelRefetch: false })}
            onOpen={openEvent}
          />
        </section>
      </main>

      {view.event && (
        <DetailPanel
          eventId={view.event}
          summary={selectedSummary}
          focusNonce={panelFocusNonce}
          onClose={closePanel}
        />
      )}
    </div>
  )
}

/** Filters change identity only when a value that reaches the API changes, not when an event opens. */
function useStableFilters(view: ViewState): Filters {
  const key = filtersKey(view)
  const [stable, setStable] = useState(() => ({ key, filters: filtersOf(view) }))
  if (stable.key === key) return stable.filters
  const next = { key, filters: filtersOf(view) }
  setStable(next)
  return next.filters
}

function ResultsStatus({
  fetchStatus,
  updating,
  failureCount,
}: {
  fetchStatus: 'fetching' | 'paused' | 'idle'
  updating: boolean
  failureCount: number
}) {
  const slow = useDelayedFlag(updating, SLOW_AFTER_MS)
  let text: string | null = null
  if (fetchStatus === 'paused') text = 'You’re offline. Results will update when your connection is back.'
  else if (updating && failureCount > 0) text = `The API returned an error. Retrying (attempt ${failureCount + 1} of ${MAX_RETRIES + 1})…`
  else if (updating && slow) text = 'Still updating. The API is responding slowly.'
  else if (updating) text = 'Updating results…'
  return (
    <span className="results__status" role="status">
      {text && (
        <>
          {fetchStatus !== 'paused' && <Spinner />}
          {text}
        </>
      )}
    </span>
  )
}

function LoadingRows({ fetchStatus, failureCount }: { fetchStatus: string; failureCount: number }) {
  const slow = useDelayedFlag(fetchStatus === 'fetching', SLOW_AFTER_MS)
  let text = 'Loading events…'
  if (fetchStatus === 'paused') text = 'You’re offline. Events will load when your connection is back.'
  else if (failureCount > 0) text = `The API returned an error. Retrying (attempt ${failureCount + 1} of ${MAX_RETRIES + 1})…`
  else if (slow) text = 'Still loading. The activity API is responding slowly.'
  return (
    <div className="loading-rows" aria-busy="true">
      <p className="loading-rows__status" role="status">
        {fetchStatus !== 'paused' && <Spinner />}
        {text}
      </p>
      {Array.from({ length: 10 }, (_, index) => (
        <div key={index} className="loading-rows__row" aria-hidden="true">
          <span style={{ width: '9rem' }} />
          <span style={{ width: `${5 + ((index * 7) % 5)}rem` }} />
          <span style={{ width: `${6 + ((index * 3) % 4)}rem` }} />
          <span style={{ width: '3.5rem' }} />
        </div>
      ))}
    </div>
  )
}

function EventsError({
  error,
  hasFilters,
  onRetry,
  onClearFilters,
}: {
  error: unknown
  hasFilters: boolean
  onRetry: () => void
  onClearFilters: () => void
}) {
  return (
    <Notice
      tone="error"
      role="alert"
      title="Couldn’t load events"
      actions={
        <>
          <button type="button" className="button button--primary" onClick={onRetry}>
            Try again
          </button>
          {hasFilters && (
            <button type="button" className="button" onClick={onClearFilters}>
              Clear filters
            </button>
          )}
        </>
      }
    >
      <p>{describeError(error)}</p>
    </Notice>
  )
}

function EmptyResults({
  filters,
  liveOn,
  onClearFilters,
  onClearRange,
}: {
  filters: Filters
  liveOn: boolean
  onClearFilters: () => void
  onClearRange: () => void
}) {
  if (!hasActiveFilters(filters)) {
    return (
      <Notice title="No events yet">
        <p>
          {liveOn
            ? 'Live mode is on. New tool calls will appear here as agents make them.'
            : 'Turn on live mode to see tool calls as agents make them.'}
        </p>
      </Notice>
    )
  }
  const onlyRange = (filters.from || filters.to) && !filters.q.trim() && !filters.agents.length && !filters.status
  return (
    <Notice
      title="No events match these filters"
      actions={
        <>
          {(filters.from || filters.to) && !onlyRange && (
            <button type="button" className="button" onClick={onClearRange}>
              Search all time
            </button>
          )}
          <button type="button" className="button button--primary" onClick={onClearFilters}>
            Clear all filters
          </button>
        </>
      }
    >
      <p>Try a shorter search, another status, or fewer agents.</p>
    </Notice>
  )
}
