import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { describeError } from '../api/client'
import type { EventSummary } from '../api/types'
import { useDelayedFlag } from '../hooks/useDelayedFlag'
import { useElementSize } from '../hooks/useElementSize'
import { usePrefersReducedMotion } from '../hooks/useMediaQuery'
import { formatLatency, formatRowTime, formatUtcTime, plural, timeZoneLabel } from '../lib/format'
import { computeRange, rangesEqual, scrollTopToReveal, type VirtualRange } from '../lib/virtual'
import { Spinner } from './Notice'
import { StatusBadge } from './StatusBadge'
import './EventTable.css'

const ROW_HEIGHT = 36
const HEADER_HEIGHT = 36
const OVERSCAN = 10
const LOAD_AHEAD_ROWS = 80
const FRESH_HIGHLIGHT_MS = 2500
const FALLBACK_VIEWPORT = 600

export interface OpenOptions {
  replace: boolean
  focusPanel: boolean
}

export interface EventTableHandle {
  /** Moves keyboard focus to a row, or to the active row if that one is not loaded. */
  focusRow: (id: string) => void
}

interface EventTableProps {
  ref?: Ref<EventTableHandle>
  rows: EventSummary[]
  total: number | null
  /** Changes whenever the rows are replaced by a different result set. */
  resetKey: string
  selectedId: string | null
  stale: boolean
  /** Rendered instead of rows for loading, empty and error states. */
  placeholder?: ReactNode
  hasMore: boolean
  isFetchingMore: boolean
  loadMoreError: unknown
  onLoadMore: () => void
  onOpen: (id: string, options: OpenOptions) => void
}

const rowDomId = (id: string) => `event-row-${id}`

export function EventTable({
  ref,
  rows,
  total,
  resetKey,
  selectedId,
  stale,
  placeholder,
  hasMore,
  isFetchingMore,
  loadMoreError,
  onLoadMore,
  onOpen,
}: EventTableProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const { height: viewportHeight } = useElementSize(scrollerRef)
  const reducedMotion = usePrefersReducedMotion()
  const [range, setRange] = useState<VirtualRange>({ start: 0, end: 0 })
  // The row with the roving tab stop. Opening an event from outside the list (a link,
  // back/forward) moves it to that event, hence the selection it was chosen under.
  const [active, setActive] = useState<{ id: string | null; selection: string | null }>({ id: null, selection: null })
  const [unseen, setUnseen] = useState(0)
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(() => new Set())
  const pointerInside = useRef(false)
  const pendingFocus = useRef<string | null>(null)
  const jumpingToTop = useRef(false)

  const indexById = useMemo(() => new Map(rows.map((row, index) => [row.id, index])), [rows])
  const wantedId = active.selection === selectedId ? active.id : (selectedId ?? active.id)
  const activeIndex = wantedId !== null && indexById.has(wantedId) ? indexById.get(wantedId)! : 0
  const currentActiveId = rows[activeIndex]?.id ?? null
  const setActiveId = useCallback((id: string | null) => setActive({ id, selection: selectedId }), [selectedId])

  const updateRange = useCallback(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const next = computeRange({
      scrollTop: scroller.scrollTop,
      viewportHeight: scroller.clientHeight || FALLBACK_VIEWPORT,
      rowHeight: ROW_HEIGHT,
      count: rows.length,
      overscan: OVERSCAN,
    })
    setRange((prev) => (rangesEqual(prev, next) ? prev : next))
    if (scroller.scrollTop < ROW_HEIGHT / 2) {
      setUnseen(0)
      jumpingToTop.current = false
    }
  }, [rows.length])

  useLayoutEffect(updateRange, [updateRange, viewportHeight])

  const reveal = useCallback(
    (index: number) => {
      const scroller = scrollerRef.current
      if (!scroller) return
      const target = scrollTopToReveal({
        index,
        rowHeight: ROW_HEIGHT,
        scrollTop: scroller.scrollTop,
        viewportHeight: scroller.clientHeight || FALLBACK_VIEWPORT,
        headerHeight: HEADER_HEIGHT,
      })
      if (target !== null) scroller.scrollTop = target
      updateRange()
    },
    [updateRange],
  )

  const latest = useRef({ indexById, reveal, currentActiveId, selectedId, onOpen, setActiveId })
  useLayoutEffect(() => {
    latest.current = { indexById, reveal, currentActiveId, selectedId, onOpen, setActiveId }
  })

  // New result set: start from the top. Same result set with rows prepended by live
  // mode: keep the rows the user is looking at in place unless they are idle at the top.
  const previous = useRef({ resetKey, firstId: rows[0]?.id ?? null })
  useLayoutEffect(() => {
    const prev = previous.current
    previous.current = { resetKey, firstId: rows[0]?.id ?? null }
    const scroller = scrollerRef.current
    if (!scroller) return

    if (prev.resetKey !== resetKey) {
      scroller.scrollTop = 0
      setActive({ id: null, selection: null })
      setUnseen(0)
      updateRange()
      return
    }
    if (!prev.firstId || rows[0]?.id === prev.firstId) return
    const shift = indexById.get(prev.firstId)
    if (!shift) return

    setFreshIds(new Set(rows.slice(0, shift).map((row) => row.id)))
    const engaged =
      !jumpingToTop.current &&
      (scroller.scrollTop > 1 || pointerInside.current || scroller.contains(document.activeElement) || selectedId !== null)
    if (engaged) {
      scroller.scrollTop += shift * ROW_HEIGHT
      setUnseen((count) => count + shift)
    }
    updateRange()
  }, [rows, resetKey, indexById, selectedId, updateRange])

  useEffect(() => {
    if (freshIds.size === 0) return
    const timer = setTimeout(() => setFreshIds(new Set()), FRESH_HIGHLIGHT_MS)
    return () => clearTimeout(timer)
  }, [freshIds])

  // Scroll to the selection when it changes, but not every time rows are added.
  useEffect(() => {
    if (!selectedId) return
    const index = latest.current.indexById.get(selectedId)
    if (index !== undefined) latest.current.reveal(index)
  }, [selectedId])

  useImperativeHandle(
    ref,
    () => ({
      focusRow: (id: string) => {
        const { indexById: indexes, currentActiveId: fallback, reveal: scrollTo, setActiveId: activate } = latest.current
        const index = indexes.get(id)
        const target = index === undefined ? fallback : id
        if (!target) return
        activate(target)
        pendingFocus.current = target
        if (index !== undefined) scrollTo(index)
      },
    }),
    [],
  )

  useLayoutEffect(() => {
    const id = pendingFocus.current
    if (!id) return
    pendingFocus.current = null
    document.getElementById(rowDomId(id))?.focus({ preventScroll: true })
  })

  useEffect(() => {
    if (placeholder || !hasMore || isFetchingMore || loadMoreError) return
    if (range.end >= rows.length - LOAD_AHEAD_ROWS) onLoadMore()
  }, [placeholder, hasMore, isFetchingMore, loadMoreError, range.end, rows.length, onLoadMore])

  const moveTo = (index: number) => {
    const row = rows[Math.min(Math.max(index, 0), rows.length - 1)]
    if (!row) return
    setActiveId(row.id)
    pendingFocus.current = row.id
    reveal(indexById.get(row.id)!)
    if (selectedId) onOpen(row.id, { replace: true, focusPanel: false })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || rows.length === 0) return
    const pageRows = Math.max(1, Math.floor(((scrollerRef.current?.clientHeight || FALLBACK_VIEWPORT) - HEADER_HEIGHT) / ROW_HEIGHT) - 1)
    const targets: Record<string, number> = {
      ArrowDown: activeIndex + 1,
      j: activeIndex + 1,
      ArrowUp: activeIndex - 1,
      k: activeIndex - 1,
      PageDown: activeIndex + pageRows,
      PageUp: activeIndex - pageRows,
      Home: 0,
      End: rows.length - 1,
    }
    if (event.key === 'Enter' && currentActiveId) {
      event.preventDefault()
      onOpen(currentActiveId, { replace: false, focusPanel: true })
      return
    }
    if (!(event.key in targets)) return
    event.preventDefault()
    moveTo(targets[event.key])
  }

  const onRowClick = useCallback((id: string) => {
    const { selectedId: selected, onOpen: open, setActiveId: activate } = latest.current
    activate(id)
    open(id, { replace: selected === id, focusPanel: false })
  }, [])

  const onRowFocus = useCallback((id: string) => latest.current.setActiveId(id), [])

  const indices: number[] = []
  for (let i = range.start; i < Math.min(range.end, rows.length); i++) indices.push(i)
  if (rows.length > 0 && (activeIndex < range.start || activeIndex >= range.end)) indices.push(activeIndex)

  const scrollToTop = () => {
    const scroller = scrollerRef.current
    const first = rows[0]
    if (!scroller || !first) return
    // Compensating for prepended rows would cancel the smooth scroll halfway.
    jumpingToTop.current = true
    scroller.scrollTop = Math.min(scroller.scrollTop, ROW_HEIGHT * 10)
    scroller.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' })
    setActiveId(first.id)
    pendingFocus.current = first.id
  }

  const cancelJump = () => {
    jumpingToTop.current = false
  }

  return (
    <div className="event-table" data-stale={stale || undefined}>
      {unseen > 0 && (
        <button type="button" className="event-table__new button button--primary button--small" onClick={scrollToTop}>
          Show {plural(unseen, 'new event')}
        </button>
      )}
      <div
        ref={scrollerRef}
        className="event-table__scroller"
        onScroll={updateRange}
        onWheel={cancelJump}
        onTouchStart={cancelJump}
        onPointerEnter={() => (pointerInside.current = true)}
        onPointerLeave={() => (pointerInside.current = false)}
      >
        <div
          role="grid"
          aria-label="Events"
          aria-rowcount={total === null ? -1 : total + 1}
          aria-colcount={6}
          aria-busy={stale || undefined}
          className="event-grid"
        >
          <div role="rowgroup" className="event-grid__head">
            <div role="row" aria-rowindex={1} className="event-grid__row">
              <div role="columnheader" className="cell cell--time">
                Time <span className="cell__tz">({timeZoneLabel()})</span>
              </div>
              <div role="columnheader" className="cell cell--agent">Agent</div>
              <div role="columnheader" className="cell cell--tool">Tool</div>
              <div role="columnheader" className="cell cell--status">Status</div>
              <div role="columnheader" className="cell cell--latency">Latency</div>
              <div role="columnheader" className="cell cell--args">Arguments</div>
            </div>
          </div>
          {!placeholder && (
            <div
              role="rowgroup"
              className="event-grid__body"
              style={{ height: rows.length * ROW_HEIGHT }}
              onKeyDown={onKeyDown}
            >
              {indices.map((index) => {
                const row = rows[index]
                return (
                  <EventRow
                    key={row.id}
                    event={row}
                    index={index}
                    active={row.id === currentActiveId}
                    selected={row.id === selectedId}
                    fresh={freshIds.has(row.id)}
                    onActivate={onRowFocus}
                    onClick={onRowClick}
                  />
                )
              })}
            </div>
          )}
        </div>
        {placeholder ?? (
          <TableFooter
            count={rows.length}
            hasMore={hasMore}
            isFetchingMore={isFetchingMore}
            loadMoreError={loadMoreError}
            onLoadMore={onLoadMore}
          />
        )}
      </div>
    </div>
  )
}

interface EventRowProps {
  event: EventSummary
  index: number
  active: boolean
  selected: boolean
  fresh: boolean
  onActivate: (id: string) => void
  onClick: (id: string) => void
}

const EventRow = memo(function EventRow({ event, index, active, selected, fresh, onActivate, onClick }: EventRowProps) {
  const time = formatRowTime(event.timestamp)
  const className = [
    'event-grid__row',
    `event-grid__row--${event.status}`,
    selected && 'is-selected',
    fresh && 'is-fresh',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div
      role="row"
      id={rowDomId(event.id)}
      aria-rowindex={index + 2}
      aria-selected={selected}
      tabIndex={active ? 0 : -1}
      className={className}
      style={{ transform: `translateY(${index * ROW_HEIGHT}px)` }}
      onClick={() => onClick(event.id)}
      onFocus={() => onActivate(event.id)}
    >
      <div role="gridcell" className="cell cell--time">
        <time dateTime={event.timestamp} title={formatUtcTime(event.timestamp)}>
          {time.main}
          <span className="cell__ms">{time.ms}</span>
        </time>
      </div>
      <div role="gridcell" className="cell cell--agent">
        {event.agent}
      </div>
      <div role="gridcell" className="cell cell--tool mono">
        {event.tool}
      </div>
      <div role="gridcell" className="cell cell--status">
        <StatusBadge status={event.status} />
      </div>
      <div role="gridcell" className="cell cell--latency">
        {formatLatency(event.latencyMs)}
      </div>
      <div role="gridcell" className="cell cell--args mono">
        {event.argsPreview}
      </div>
    </div>
  )
})

interface FooterProps {
  count: number
  hasMore: boolean
  isFetchingMore: boolean
  loadMoreError: unknown
  onLoadMore: () => void
}

function TableFooter({ count, hasMore, isFetchingMore, loadMoreError, onLoadMore }: FooterProps) {
  const slow = useDelayedFlag(isFetchingMore, 3000)
  let content: ReactNode
  if (isFetchingMore) {
    content = (
      <>
        <Spinner />
        <span>{slow ? 'Still loading more events. The API is responding slowly.' : 'Loading more events…'}</span>
      </>
    )
  } else if (loadMoreError) {
    content = (
      <>
        <span>Couldn’t load more events. {describeError(loadMoreError)}</span>
        <button type="button" className="button button--small" onClick={onLoadMore}>
          Try again
        </button>
      </>
    )
  } else if (hasMore) {
    content = (
      <button type="button" className="button button--small" onClick={onLoadMore}>
        Load more events
      </button>
    )
  } else if (count > 0) {
    content = <span>End of results. {plural(count, 'event')} shown.</span>
  }
  return (
    <div className="event-table__footer" role="status">
      {content}
    </div>
  )
}
