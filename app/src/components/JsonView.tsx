import { useMemo, useState } from 'react'
import { formatBytes } from '../lib/format'
import { stringifyJson, tokenizeJson } from '../lib/json'
import { CopyButton } from './CopyButton'

/** Larger payloads render as plain text: thousands of spans would make the panel sluggish. */
export const HIGHLIGHT_LIMIT = 40_000
/** Payloads beyond this are cut off until the user asks for the rest. */
export const PREVIEW_LIMIT = 100_000

interface JsonViewProps {
  value: unknown
  label: string
}

export function JsonView({ value, label }: JsonViewProps) {
  const text = useMemo(() => stringifyJson(value), [value])
  const bytes = useMemo(() => new TextEncoder().encode(text).length, [text])
  const [expanded, setExpanded] = useState(false)
  const truncated = !expanded && text.length > PREVIEW_LIMIT
  const shown = truncated ? text.slice(0, PREVIEW_LIMIT) : text
  const tokens = useMemo(() => (shown.length <= HIGHLIGHT_LIMIT ? tokenizeJson(shown) : null), [shown])

  return (
    <div className="json-view">
      <div className="json-view__bar">
        <span className="json-view__size">{formatBytes(bytes)}</span>
        <CopyButton text={text} label={`Copy ${label.toLowerCase()} as JSON`} />
      </div>
      <pre className="json-view__code" tabIndex={0} aria-label={label}>
        {tokens
          ? tokens.map((token, index) =>
              token.type === 'plain' ? (
                token.text
              ) : (
                <span key={index} className={`json-${token.type}`}>
                  {token.text}
                </span>
              ),
            )
          : shown}
        {truncated && '\n…'}
      </pre>
      {truncated && (
        <button type="button" className="button button--small json-view__more" onClick={() => setExpanded(true)}>
          Show the full {label.toLowerCase()} ({formatBytes(bytes)})
        </button>
      )}
    </div>
  )
}
