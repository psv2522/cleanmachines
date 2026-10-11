import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_FILTERS, type Filters } from '../state/viewState'
import { Histogram } from './Histogram'

const START = Date.parse('2026-10-07T12:00:00Z')

function bucketsFor(url: URL) {
  const bucket = url.searchParams.get('bucket') as '1m' | '1h'
  const step = bucket === '1m' ? 60_000 : 3_600_000
  const from = url.searchParams.get('from')
  const first = from ? Date.parse(from) : START
  const count = from ? 10 : 48
  return {
    bucket,
    buckets: Array.from({ length: count }, (_, i) => ({ t: new Date(first + i * step).toISOString(), count: i + 1 })),
  }
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => new Response(JSON.stringify(bucketsFor(new URL(input))), { status: 200 })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function setup(filters: Filters) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onSelectRange = vi.fn()
  const ui = (f: Filters): ReactElement => (
    <QueryClientProvider client={client}>
      <Histogram filters={f} live={false} onSelectRange={onSelectRange} onClearRange={() => {}} />
    </QueryClientProvider>
  )
  const result = render(ui(filters))
  return { onSelectRange, rerender: (f: Filters) => result.rerender(ui(f)) }
}

describe('Histogram', () => {
  it('selects a time range with the keyboard', async () => {
    const user = userEvent.setup()
    const { onSelectRange } = setup(EMPTY_FILTERS)
    const chart = await screen.findByRole('group', { name: /Events over time/ })
    chart.focus()

    await user.keyboard('{End}{Shift>}{ArrowLeft}{ArrowLeft}{/Shift}{Enter}')
    expect(onSelectRange).toHaveBeenCalledWith({
      from: new Date(START + 45 * 3_600_000).toISOString(),
      to: new Date(START + 48 * 3_600_000).toISOString(),
    })
  })

  it('drops a bar position that no longer exists when the range narrows', async () => {
    const user = userEvent.setup()
    const { rerender } = setup(EMPTY_FILTERS)
    const chart = await screen.findByRole('group', { name: /per hour/ })
    chart.focus()
    await user.keyboard('{End}')

    const from = new Date(START).toISOString()
    const to = new Date(START + 10 * 60_000).toISOString()
    rerender({ ...EMPTY_FILTERS, from, to })
    expect(await screen.findByRole('group', { name: /per minute\. 55 events/ })).toBeInTheDocument()
    expect(document.querySelector('.histogram__tooltip')).toBeNull()
  })
})
