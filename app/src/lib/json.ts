export type JsonTokenType = 'key' | 'string' | 'number' | 'literal' | 'plain'

export interface JsonToken {
  type: JsonTokenType
  text: string
}

export function stringifyJson(value: unknown): string {
  if (value === undefined) return 'undefined'
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}

const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g

/** Splits pretty-printed JSON into coloured spans. Plain text in between is kept as is. */
export function tokenizeJson(text: string): JsonToken[] {
  const tokens: JsonToken[] = []
  let last = 0
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index
    if (index > last) tokens.push({ type: 'plain', text: text.slice(last, index) })
    if (match[1] !== undefined) {
      tokens.push({ type: match[2] ? 'key' : 'string', text: match[1] })
      if (match[2]) tokens.push({ type: 'plain', text: match[2] })
    } else if (/^-?\d/.test(match[0])) {
      tokens.push({ type: 'number', text: match[0] })
    } else {
      tokens.push({ type: 'literal', text: match[0] })
    }
    last = index + match[0].length
  }
  if (last < text.length) tokens.push({ type: 'plain', text: text.slice(last) })
  return tokens
}
