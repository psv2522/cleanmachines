import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { shouldRetry } from './api/client'
import type { EventDetail, EventStatus, EventSummary } from './api/types'
import { App } from './App'

const STATUS_CYCLE: EventStatus[] = ['ok', 'ok', 'blocked', 'error']
const TOOLS = ['email.send', 'sql.query', 'fs.read', 'shell.exec']

const EVENTS: EventSummary[] = Array.from({ length: 450 }, (_, i) => ({
  id: `evt_${i}`,
  timestamp: new Date(Date.parse('2026-10-09T12:00:00Z') - i * 1000).toISOString(),
  agent: i % 2 ? 'support-copilot' : 'code-reviewer',
  tool: TOOLS[i % TOOLS.length],
  status: STATUS_CYCLE[i % STATUS_CYCLE.length],
  latencyMs: 10 + i,
  argsPreview: `{"n":${i}}`,
}))

interface FakeApi {
  failEvents: number
  hangEvents: boolean
  requests: string[]
}

let api: FakeApi

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function handle(input: string): Promise<Response> {
  const url = new URL(input)
  api.requests.push(url.pathname + url.search)
  if (url.pathname === '/agents') return json(200, ['code-reviewer', 'support-copilot'])
  if (url.pathname === '/events/histogram') return json(200, { bucket: '1h', buckets: [] })

  const detail = url.pathname.match(/^\/events\/(.+)$/)
  if (detail) {
    const event = EVENTS.find((e) => e.id === decodeURIComponent(detail[1]))
    if (!event) return json(404, { error: 'not found' })
    const body: EventDetail = { ...event, args: { n: 1, path: '/workspace/secret.txt' }, result: { ok: true }, policyMatches: [] }
    return json(200, body)
  }

  if (url.pathname === '/events') {
    if (api.hangEvents) return new Promise(() => {})
    if (api.failEvents > 0) {
      api.failEvents -= 1
      return json(500, { error: 'internal error' })
    }
    const q = url.searchParams.get('q')?.toLowerCase()
    const status = url.searchParams.get('status')
    const matches = EVENTS.filter(
      (e) => (!status || e.status === status) && (!q || `${e.agent} ${e.tool} ${e.argsPreview}`.toLowerCase().includes(q)),
    )
    const offset = Number(url.searchParams.get('cursor') ?? 0)
    const limit = Number(url.searchParams.get('limit') ?? 200)
    const items = matches.slice(offset, offset + limit)
    const next = offset + limit < matches.length ? String(offset + limit) : null
    return json(200, { items, nextCursor: next, total: matches.length })
  }
  return json(404, { error: 'unknown route' })
}

function renderApp(path = '/') {
  window.history.replaceState(null, '', path)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: shouldRetry, retryDelay: 0, refetchOnWindowFocus: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  )
}

const row = (id: string) => document.getElementById(`event-row-${id}`)
const countWhere = (match: (event: EventSummary) => boolean) => `${EVENTS.filter(match).length} events`

beforeEach(() => {
  api = { failEvents: 0, hangEvents: false, requests: [] }
  vi.stubGlobal('fetch', vi.fn((input: string) => handle(input)))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('lists events with the total from the API', async () => {
    renderApp()
    expect(await screen.findByRole('heading', { name: '450 events' })).toBeInTheDocument()
    expect(screen.getByText('200 loaded')).toBeInTheDocument()
    expect(within(row('evt_0')!).getByText('code-reviewer')).toBeInTheDocument()
  })

  it('opens an event from the URL and closes it with Escape, returning focus to its row', async () => {
    const user = userEvent.setup()
    renderApp('/?event=evt_3')
    const panel = await screen.findByRole('complementary')
    expect(await within(panel).findByRole('heading', { level: 2, name: 'shell.exec' })).toBeInTheDocument()
    expect(await within(panel).findByText(/secret\.txt/)).toBeInTheDocument()
    await waitFor(() => expect(row('evt_3')).toHaveAttribute('aria-selected', 'true'))

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(window.location.search).toBe('')
    expect(document.activeElement).toBe(row('evt_3'))
  })

  it('moves through rows with the keyboard and opens one with Enter', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('heading', { name: '450 events' })
    row('evt_0')!.focus()

    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(window.location.search).toBe('?event=evt_2')
    const heading = await screen.findByRole('heading', { level: 2, name: 'fs.read' })
    expect(document.activeElement).toBe(heading)
  })

  it('reports a missing event', async () => {
    renderApp('/?event=evt_missing')
    expect(await screen.findByText('This event doesn’t exist')).toBeInTheDocument()
  })

  it('keeps the status filter in the URL', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('heading', { name: '450 events' })

    await user.click(screen.getByRole('radio', { name: 'Blocked' }))
    expect(window.location.search).toBe('?status=blocked')
    expect(await screen.findByRole('heading', { name: countWhere((e) => e.status === 'blocked') })).toBeInTheDocument()
    expect(api.requests).toContain('/events?status=blocked&limit=200')
  })

  it('searches once typing pauses rather than on every keystroke', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('heading', { name: '450 events' })

    await user.type(screen.getByRole('searchbox'), 'shell')
    await waitFor(() => expect(window.location.search).toBe('?q=shell'))
    expect(await screen.findByRole('heading', { name: countWhere((e) => e.tool === 'shell.exec') })).toBeInTheDocument()
    expect(api.requests.filter((r) => r.startsWith('/events?q='))).toEqual(['/events?q=shell&limit=200'])
  })

  it('retries failed requests, then offers to try again', async () => {
    const user = userEvent.setup()
    api.failEvents = 4
    renderApp()
    expect(await screen.findByText('Couldn’t load events')).toBeInTheDocument()
    expect(screen.getByText(/internal error \(500\)/)).toBeInTheDocument()
    expect(api.requests.filter((r) => r.startsWith('/events?'))).toHaveLength(4)

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: '450 events' })).toBeInTheDocument()
  })

  it('explains an empty result and clears the filters', async () => {
    const user = userEvent.setup()
    renderApp('/?q=no-such-thing&status=error')
    expect(await screen.findByText('No events match these filters')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear all filters' }))
    expect(window.location.search).toBe('')
    expect(await screen.findByRole('heading', { name: '450 events' })).toBeInTheDocument()
  })

  it('says so when the API is slow', async () => {
    api.hangEvents = true
    renderApp()
    expect(screen.getByText('Loading events…')).toBeInTheDocument()
    expect(
      await screen.findByText('Still loading. The activity API is responding slowly.', undefined, { timeout: 4000 }),
    ).toBeInTheDocument()
  })

  it('loads the next page from the end-of-list button', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('heading', { name: '450 events' })
    // jsdom has no layout, so drive paging through the footer button rather than scrolling.
    await user.click(screen.getByRole('button', { name: 'Load more events' }))
    await waitFor(() => expect(screen.getByText('400 loaded')).toBeInTheDocument())
    expect(api.requests).toContain('/events?limit=200&cursor=200')
  })
})
