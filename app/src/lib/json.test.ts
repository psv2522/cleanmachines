import { describe, expect, it } from 'vitest'
import { stringifyJson, tokenizeJson } from './json'

describe('tokenizeJson', () => {
  it('labels keys, strings, numbers and literals', () => {
    const text = stringifyJson({ path: '/a "b"', size: -1.5e3, ok: true, next: null })
    const tokens = tokenizeJson(text).filter((token) => token.type !== 'plain')
    expect(tokens).toEqual([
      { type: 'key', text: '"path"' },
      { type: 'string', text: '"/a \\"b\\""' },
      { type: 'key', text: '"size"' },
      { type: 'number', text: '-1500' },
      { type: 'key', text: '"ok"' },
      { type: 'literal', text: 'true' },
      { type: 'key', text: '"next"' },
      { type: 'literal', text: 'null' },
    ])
  })

  it('loses no characters', () => {
    const text = stringifyJson({ list: [1, 'two', { three: false }], nested: { a: '' } })
    expect(
      tokenizeJson(text)
        .map((token) => token.text)
        .join(''),
    ).toBe(text)
  })

  it('does not treat digits inside strings as numbers', () => {
    const tokens = tokenizeJson('"evt_01M4"')
    expect(tokens).toEqual([{ type: 'string', text: '"evt_01M4"' }])
  })
})
