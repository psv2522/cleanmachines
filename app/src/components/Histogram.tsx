import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { describeError, MAX_RETRIES } from '../api/client'
import { useHistogram } from '../api/queries'
import { useDelayedFlag } from '../hooks/useDelayedFlag'
import { useElementSize } from '../hooks/useElementSize'
import { formatClock, formatCount, formatShortTime, plural } from '../lib/format'
import { buildSeries, chooseBucket, slotIndexAt, slotsToRange, type Series } from '../lib/histogram'
import type { Filters } from '../state/viewState'
import { Spinner } from './Notice'
import './Histogram.css'

const CHART_HEIGHT = 64
const FALLBACK_WIDTH = 640
const BUCKET_NAMES = { '1m': 'per minute', '5m': 'per 5 minutes', '1h': 'per hour' } as const

interface HistogramProps {
  filters: Filters
  /** Refresh periodically so the chart keeps up with live mode. */
  live: boolean
  onSelectRange: (range: { from: string; to: string }) => void
  onClearRange: () => void
}

interface Selection {
  anchor: number
  focus: number
}

export function Histogram({ filters, live, onSelectRange, onClearRange }: HistogramProps) {
  const bucket = chooseBucket(filters.from, filters.to)
  const query = useHistogram(filters, bucket, live)
  const chartRef = useRef<HTMLDivElement>(null)
  const { width: measuredWidth } = useElementSize(chartRef)
  const width = measuredWidth || FALLBACK_WIDTH

  // While new filters load, keep drawing the previous chart rather than mixing the old
  // buckets with the new time range.
  const ready = Boolean(query.data) && !query.isPlaceholderData
  const fresh = useMemo(
    () => (ready && query.data ? buildSeries(query.data.buckets, query.data.bucket, filters) : null),
    [ready, query.data, filters],
  )
  const [previous, setPrevious] = useState<Series | null>(null)
  if (ready && fresh !== previous) setPrevious(fresh)
  const series = ready ? fresh : previous

  const [hover, setHover] = useState<number | null>(null)
  const [drag, setDrag] = useState<Selection | null>(null)
  const [keyboard, setKeyboard] = useState<{ focus: number; anchor: number | null } | null>(null)
  // Slot indexes only mean something on the time grid they were picked on.
  const grid = series ? `${series.start}|${series.bucketMs}` : null
  const [interactionGrid, setInteractionGrid] = useState(grid)
  if (grid !== interactionGrid) {
    setInteractionGrid(grid)
    setHover(null)
    setDrag(null)
    setKeyboard(null)
  }

  const waiting = query.fetchStatus === 'fetching' && (query.isPending || query.isPlaceholderData)
  const slow = useDelayedFlag(waiting, 2500)
  const hasRange = Boolean(filters.from || filters.to)

  const slotAt = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return slotIndexAt(series!, (event.clientX - rect.left) / rect.width)
  }

  const apply = (a: number, b: number) => {
    if (!series) return
    setKeyboard(null)
    onSelectRange(slotsToRange(series, a, b))
  }

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (!series || event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const index = slotAt(event)
    setKeyboard(null)
    setDrag({ anchor: index, focus: index })
  }

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!series) return
    const index = slotAt(event)
    setHover(index)
    if (drag) setDrag({ ...drag, focus: index })
  }

  const onPointerUp = () => {
    if (!drag) return
    setDrag(null)
    apply(drag.anchor, drag.focus)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!series) return
    const last = series.slots.length - 1
    const current = keyboard ?? { focus: last, anchor: null }
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 }
    if (event.key in step || event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      const focus =
        event.key === 'Home' ? 0 : event.key === 'End' ? last : Math.min(last, Math.max(0, current.focus + step[event.key]))
      const anchor = event.shiftKey ? (current.anchor ?? current.focus) : null
      setKeyboard({ focus, anchor })
    } else if (event.key === 'Enter' && keyboard) {
      event.preventDefault()
      apply(keyboard.anchor ?? keyboard.focus, keyboard.focus)
    } else if (event.key === 'Escape' && keyboard?.anchor != null) {
      event.preventDefault()
      event.stopPropagation()
      setKeyboard({ focus: keyboard.focus, anchor: null })
    }
  }

  const selection: Selection | null =
    drag ?? (keyboard ? { anchor: keyboard.anchor ?? keyboard.focus, focus: keyboard.focus } : null)
  const highlighted = keyboard?.focus ?? hover

  const describeSlot = (index: number) => {
    const slot = series?.slots[index]
    if (!series || !slot) return ''
    const end = slot.start + series.bucketMs
    return `${formatShortTime(slot.start)} to ${formatClock(end)}: ${plural(slot.count, 'event')}`
  }

  const describeSelection = (sel: Selection) => {
    if (!series) return ''
    const { from, to } = slotsToRange(series, sel.anchor, sel.focus)
    return `${formatShortTime(from)} to ${formatShortTime(to)}`
  }

  let rangeText = ''
  if (series) {
    rangeText = `${formatShortTime(series.start)} to ${formatShortTime(series.end)}, ${BUCKET_NAMES[query.data?.bucket ?? bucket]}`
  }

  let status: string | null = null
  if (query.fetchStatus === 'paused') status = 'Offline. The chart will update when your connection is back.'
  else if (waiting && query.failureCount > 0) status = `Retrying (attempt ${query.failureCount + 1} of ${MAX_RETRIES + 1})…`
  else if (slow) status = 'Still loading. The API is responding slowly.'
  else if (waiting) status = 'Loading…'

  return (
    <section className="histogram" aria-labelledby="histogram-title">
      <div className="histogram__head">
        <h2 id="histogram-title">Events over time</h2>
        {rangeText && <span className="histogram__range">{rangeText}</span>}
        {status && (
          <span className="histogram__status" role="status">
            {query.fetchStatus !== 'paused' && <Spinner />} {status}
          </span>
        )}
        <span className="histogram__actions">
          {hasRange && (
            <button type="button" className="button button--small" onClick={onClearRange}>
              Show all time
            </button>
          )}
        </span>
      </div>

      <div className="histogram__chart" ref={chartRef} data-stale={(waiting && series !== null) || undefined}>
        {query.isError && !series ? (
          <div className="histogram__message" role="alert">
            <span>Couldn’t load the chart. {describeError(query.error)}</span>
            <button type="button" className="button button--small" onClick={() => query.refetch()}>
              Try again
            </button>
          </div>
        ) : !series ? (
          query.isPending ? (
            <div className="histogram__skeleton" aria-hidden="true" />
          ) : (
            <div className="histogram__message">No events to chart for these filters.</div>
          )
        ) : (
          <div
            className="histogram__plot"
            tabIndex={0}
            role="group"
            aria-roledescription="chart"
            aria-label={`Events over time, ${rangeText}. ${formatCount(series.total)} events. Use the left and right arrow keys to move between bars, Shift with an arrow key to select a range, and Enter to show only that time.`}
            onKeyDown={onKeyDown}
            onBlur={() => setKeyboard(null)}
          >
            <Bars
              series={series}
              width={width}
              highlighted={highlighted}
              selection={selection}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={() => setHover(null)}
            />
            {series.total === 0 && <div className="histogram__empty">No events in this time range.</div>}
            {highlighted !== null && !drag && (
              <div
                className="histogram__tooltip"
                style={{ left: `${Math.min(88, Math.max(12, ((highlighted + 0.5) / series.slots.length) * 100))}%` }}
                aria-hidden="true"
              >
                {describeSlot(highlighted)}
              </div>
            )}
            <span className="visually-hidden" aria-live="polite">
              {keyboard ? (keyboard.anchor !== null && selection ? `Selected ${describeSelection(selection)}` : describeSlot(keyboard.focus)) : ''}
            </span>
          </div>
        )}
      </div>
      {series && (
        <div className="histogram__axis" aria-hidden="true">
          <span>{formatShortTime(series.start)}</span>
          <span>{formatShortTime((series.start + series.end) / 2)}</span>
          <span>{formatShortTime(series.end)}</span>
        </div>
      )}
      {drag && series && (
        <p className="histogram__hint" aria-hidden="true">
          {describeSelection(drag)}
        </p>
      )}
    </section>
  )
}

interface BarsProps {
  series: Series
  width: number
  highlighted: number | null
  selection: Selection | null
  onPointerDown: (event: PointerEvent<SVGSVGElement>) => void
  onPointerMove: (event: PointerEvent<SVGSVGElement>) => void
  onPointerUp: (event: PointerEvent<SVGSVGElement>) => void
  onPointerLeave: () => void
}

function Bars({ series, width, highlighted, selection, ...handlers }: BarsProps) {
  const count = series.slots.length
  const slotWidth = width / count
  const gap = slotWidth > 4 ? 1 : 0
  const max = Math.max(series.max, 1)
  const low = selection ? Math.min(selection.anchor, selection.focus) : -1
  const high = selection ? Math.max(selection.anchor, selection.focus) : -1

  return (
    <svg
      className="histogram__svg"
      width={width}
      height={CHART_HEIGHT}
      viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
      aria-hidden="true"
      {...handlers}
    >
      {selection && (
        <rect
          className="histogram__selection"
          x={low * slotWidth}
          y={0}
          width={(high - low + 1) * slotWidth}
          height={CHART_HEIGHT}
        />
      )}
      {series.slots.map((slot, index) => {
        if (slot.count === 0) return null
        const height = Math.max(1.5, (slot.count / max) * (CHART_HEIGHT - 4))
        const state = index === highlighted ? 'hover' : index >= low && index <= high ? 'selected' : undefined
        return (
          <rect
            key={slot.start}
            className="histogram__bar"
            data-state={state}
            x={index * slotWidth + gap / 2}
            y={CHART_HEIGHT - height}
            width={Math.max(slotWidth - gap, 0.5)}
            height={height}
          />
        )
      })}
      <line className="histogram__baseline" x1={0} x2={width} y1={CHART_HEIGHT - 0.5} y2={CHART_HEIGHT - 0.5} />
    </svg>
  )
}
