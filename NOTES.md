# Notes

**Run:**
1. `npm run api` starts the mock API.
2. `pnpm --dir app install && pnpm --dir app dev` starts the app on http://localhost:5173. Set `VITE_API_URL` to use a different API.
3. `pnpm --dir app test` runs the tests. `typecheck`, `lint` and `build` also exist.

Part B is in `perf-clinic/`, with the write-up in `PERF.md`.

## What I built

**React with Vite**, because this is a client-only tool calling a CORS-enabled third-party API. There's nothing to render on a server, so Next.js would only add a server runtime. The only libraries added are TanStack Query, for request state, retries and cancellation, and Fontsource, for fonts.

**The URL holds the whole view:** search, agents, status, time range and the open event. A small `useSyncExternalStore` store reads and writes it, so refresh, back/forward and copied links all work. A typing session adds one history entry, not one per keystroke.

**Core:**
- The list pages through all events with cursors.
- The detail panel opens from `?event=` and closes with Escape, which puts focus back on the row.
- Every data view has loading, empty, error and slow states:
  - 5xx responses retry up to 3 times, then "Try again" appears.
  - "Still loading" appears after 2.5 s.
  - There is an offline message and a not-found message.

**Optional items.** I did all the Polish items and all four Stretch items, because they depend on each other. Live mode is only "non-disruptive" if the virtualized list keeps the reader's place. The chart's time-range selection drives the same URL state as the filters.
- **Polish:**
  - Keyboard navigation in the list (arrows, Home/End, Enter).
  - A tablet layout, where the panel becomes an overlay.
  - Semantic markup, managed focus and announced status changes.
  - System dark mode and reduced motion.
- **Live mode** (SSE):
  - Each new event is matched against the current filters in the browser.
  - A full event is fetched when its truncated preview isn't enough to decide a search match.
  - If the reader has scrolled, a "Show N new events" pill appears and nothing moves.
- **Virtualization by hand:** fixed 36px rows with overscan.
- **Histogram:** follows the filters. Dragging or Shift+arrow keys select a time range, which becomes the `from`/`to` filter.
- **Tests:** 60 tests in Vitest and Testing Library. They cover:
  - URL state;
  - the virtual window maths;
  - live matching and merging;
  - histogram bucketing;
  - retry rules;
  - full app flows against a fake API.

## Tradeoffs and what I'd do with more time

- **The event list never refetches on its own,** because refetching an infinite query replays every loaded page. New data arrives through live mode or a filter change.
- **Live mode is off while a time range is selected,** since a past range gets no new events.
- **Fixed row heights keep virtualization simple,** but long values are truncated in the list and shown in full only in the panel.
- **The histogram shows totals only,** because the API has no per-status breakdown.
- **With more time:** Playwright tests for scrolling, virtualization and live-mode anchoring. jsdom has no layout, so I checked those by hand in Chrome.

## Known issues

- The mock API makes new event IDs on every restart, so an old `?event=` link shows "This event doesn't exist".
- The Part B timings come from running the original and fixed code in Node, not from Chrome traces, because headless Chrome on my machine kept exiting on its own. Layout costs are given as counts. See the top of `PERF.md`.

## How I used AI

I built this with Claude Code (Anthropic's coding agent), directing it step by step.
- **First,** it statically checked the repo, including the scripts and the `bin/` launchers, for anything malicious. I also checked the binaries on VirusTotal.
- **Part A:**
  - It scaffolded the app and wrote most of the code.
  - It tested the app in a real Chrome window, with screenshots, before I committed it. That caught three bugs, which it fixed:
    - a histogram crash when a narrower range removed the selected bar;
    - the "Show N new events" jump being cancelled by rows arriving mid-scroll;
    - a table column too narrow for `calendar.create_event`.
  - It then wrote the test suite, including a regression test for the histogram crash.
- **Part B:** it diagnosed the page, made the fixes and timed the hot paths before and after.
- **Write-ups:** it drafted `PERF.md` and these notes from that work.
