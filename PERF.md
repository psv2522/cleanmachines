# Perf Clinic

How the numbers were taken:

- **CPU timings.** I ran the original and fixed functions against the same 100,000 events from `js/config.js`, in Node 26 on my Mac. Node uses the same V8 engine as Chrome, so treat the timings as relative rather than exact browser figures.
- **Layout costs.** These are counts of forced synchronous layouts, read off the code. I wanted Chrome Performance traces too, but headless Chrome on this machine quit about 30 seconds after launch, so I couldn't record them reliably.
- **Byte sizes.** These are file sizes on disk.
- **Smoke test.** After the fixes, a scripted headless Chrome run loaded the page, scrolled it, searched, hovered a row and opened and closed the ticker. It found no errors.

### 1. Scrolling janks on every frame
- **Symptom:** scrolling stutters, and gets much worse once the list reaches the middle of the screen.
- **How I found it:** read the `scroll` handler in `js/app.js`, then timed its slowest part on its own.
- **Root cause:** every scroll event (often several per frame) did all of this:
  - Looped over all 200 rows, removing a class and then calling `getBoundingClientRect()`. Each read came straight after a write, so every row forced a fresh layout.
  - Counted "calls that minute" by filtering all 100,000 events, creating a `Date` and an ISO string for each one.
  - Animated the sticky header's `padding-block`, which changes the header height and relayouts the whole page.
  - Grew the progress bar through `width`, which also needs layout.
  - Styled `.in-focus` with a border and padding change, which needs layout too.
- **Fix:**
  - The handler is now passive and runs at most once per frame (`requestAnimationFrame`).
  - Row positions are measured once, and again only when layout actually changes (render, resize, or a `ResizeObserver` on the body). The focused band is then found with a binary search, and only rows that enter or leave it get their class toggled.
  - Per-minute counts come from a `Map` built once.
  - The progress bar uses `transform: scaleX()`.
  - The header keeps fixed padding, so only the shadow toggles.
  - `.in-focus` is drawn with an inset `box-shadow`.
- **Before / after:**
  - Minute count: 83 ms → under 0.001 ms per scroll event.
  - Forced layouts: 200 → 0 per scroll event.
  - Layout-triggering style writes: 2 → 0 per scroll event.

### 2. Typing in search freezes the page, and the first list render takes a second
- **Symptom:**
  - Each keystroke locks up the input.
  - The first render of the list is slow on page load.
- **How I found it:** read `search()` and `renderResults()`, then timed `search()` on the real data.
- **Root cause:**
  - Every keystroke immediately re-ran the search, with no debounce.
  - Each search ran `JSON.stringify(event).toLowerCase()` on all 100,000 events.
  - It then re-sorted every match with a comparator that created two `Date` objects per comparison. An empty query sorts all 100,000 events, which is about 3.4 million `Date` objects.
  - Each row's time was formatted with `toLocaleTimeString`, which is slow.
- **Fix:**
  - The events are sorted once at startup by comparing the ISO strings directly. A search then filters the pre-sorted array, so the matches are already in order.
  - Each event gets a lowercased search string. These are built in 2,000-event batches during idle time after load, so the first keystroke doesn't pay for them.
  - Input is debounced by 150 ms.
  - Times are sliced straight out of the UTC ISO string.
  - Side effect: search now matches field values only. Before, typing a key name such as `agent` or `summary` matched every row.
- **Before / after:**
  - Initial render (empty query): 1,012 ms → 0 ms of search work (the pre-sorted array is returned as is). The one-time sort costs 73 ms.
  - Search for `billing`: 114 ms → 9.7 ms.
  - Typing `billing`: 7 searches → 1.

### 3. A 4.3 MB hero image delays the largest paint
- **Symptom:** the hero, which is the largest thing on screen, paints late, and late again on every slow connection.
- **How I found it:**
  - Checked asset sizes with `ls -l` and the dimensions with `sips`.
  - The Network panel would list it as the largest request, and the Performance panel would mark it as the LCP element.
- **Root cause:**
  - The hero is a 1700×950 PNG of a noisy gradient, a type of image PNG compresses badly.
  - Every screen size downloaded the full-size file.
  - It had no fetch priority.
- **Fix:**
  - Converted the image to WebP at 1700w and 850w.
  - Added `srcset`/`sizes`, so small screens get the smaller file.
  - Added `fetchpriority="high"`.
- **Before / after:** 4,270,977 B → 376,360 B (−91%), or 37,374 B at widths of 850px and below (−99%).

### 4. First paint waits for an unused stylesheet and the data script
- **Symptom:** the page stays blank until a large stylesheet has downloaded and 100,000 events have been generated.
- **How I found it:**
  - Read `<head>`.
  - Ran a script that pulled every class selector out of `css/theme.css` and checked it against the classes used in `index.html` and `js/app.js`. The Coverage panel would show the same thing.
- **Root cause:**
  - `theme.css` holds 8,597 utility rules, none of which the page uses. It still blocks rendering.
  - `js/config.js` was a plain `<script>` in `<head>`, so HTML parsing stopped until it had built all 100,000 events.
- **Fix:**
  - Deleted `theme.css` and its `<link>`.
  - Loaded both scripts with `defer`, so the document is parsed and can paint before the data is built.
- **Before / after:**
  - Render-blocking CSS: 332,305 B → 5,739 B.
  - Script that ran before the body was parsed: 185 ms → 0 ms.

### 5. Avatars download 1.9 MB to show 48px images
- **Symptom:** the agent cards compete with the hero for bandwidth, and the avatars pop in late.
- **How I found it:**
  - `ls -l` and `sips` on `assets/agents/`.
  - `md5` showed that 12 files contained only 6 distinct images.
- **Root cause:**
  - The avatars were 320×320 PNGs at around 160 KB each, displayed at 48px.
  - Every second file was a byte-identical duplicate, so the browser downloaded the same image twice.
  - The avatars were also fetched eagerly, even though they are below the fold.
- **Fix:**
  - Converted them to 96×96 WebP (2× for high-density screens).
  - Kept only the 6 unique images.
  - Added `loading="lazy"` and `decoding="async"`.
- **Before / after:** 12 requests and 1,935,286 B → 6 requests and 2,548 B.

### 6. Content jumps when images load
- **Symptom:** the alerts bar, agents and list jump down when the hero arrives, and the cards grow when each avatar arrives.
- **How I found it:** in the markup, neither `<img>` had dimensions. The Performance panel's Layout Shifts track would show the jumps.
- **Root cause:** without `width` and `height`, the browser reserves no space for an image until it has loaded.
- **Fix:**
  - Added `width`/`height` attributes to the hero and the avatars.
  - Added `height: auto` in CSS, so the hero still scales but keeps its aspect ratio.
- **Before / after:** the hero's shift went from about 770px at a 1440px viewport (everything below it moved) to 0px.

### 7. "Viewed" tracking writes localStorage 200 times per render and never stops growing
- **Symptom:**
  - Each search gets slower the longer the page has been used.
  - The stored list grows without limit.
- **How I found it:** read `rememberViewed()` and timed it with 20,000 ids already stored.
- **Root cause:**
  - `localStorage.setItem` sat inside the loop, so each render re-serialized and synchronously wrote the whole list 200 times.
  - The duplicate check used `Array.includes`, which is O(n) for each row.
  - `loadViewed()` parsed the list again on every render.
  - Nothing ever removed old ids.
- **Fix:**
  - The list is loaded once into a `Set`.
  - It is written once per render.
  - It is capped to the 5,000 most recently seen ids.
- **Before / after** (with 20,000 stored ids):
  - Per render: 200 writes, 60.1 MB serialized and 72.8 ms → 1 write, 75 KB serialized and 0.27 ms. That was measured against an in-memory store; real `localStorage` is slower, so the gap in a browser is larger.

### 8. Agent card heights are equalised with an O(n²) layout loop
- **Symptom:** the page stutters while avatars load and on every window resize.
- **How I found it:** read `equalizeCardHeights()` and where it is called from.
- **Root cause:**
  - For each card, the function cleared its height, read `offsetTop`/`offsetHeight` for all 24 cards and then wrote a height. Every write invalidated layout before the next read.
  - It ran at startup, again after each of the 24 avatar loads, and on every `resize` event.
- **Fix:**
  - Deleted the function.
  - Grid items stretch to the row height by default, so I dropped `align-items: start` and moved the 220px minimum into CSS.
- **Before / after:**
  - Page load: about 600 forced layouts (24 per call × 25 calls) → 0.
  - Resize: 24 forced layouts per resize event → 0.

### 9. Summaries are shrunk to fit with a forced-layout loop
- **Symptom:** every search render and every resize event stalls.
- **How I found it:** read `fitSummaries()`.
- **Root cause:**
  - For each of the 200 rows, the function set `font-size`, then read `scrollWidth`/`clientWidth`. It repeated this in 0.5px steps down to 11px.
  - Each read forced a layout.
- **Fix:** removed the loop. The cell already truncates with `text-overflow: ellipsis`, and the hover preview shows the full summary.
- **Before / after:** per render or resize event, 200 to 1,400 forced layouts → 0.

### 10. The live ticker leaks timers, listeners and DOM
- **Symptom:** after the ticker has been toggled a few times, the tab keeps using CPU and memory with the panel closed, and Escape handlers pile up.
- **How I found it:** read `openTicker()`/`closeTicker()`. The leaked intervals would show in the Performance panel as timer tasks still firing after close.
- **Root cause:**
  - `setInterval` was never cleared.
  - Each open added another `resize` listener and another `keydown` listener.
  - `renderedTickerRows` cached a DOM row for every event ever shown and never evicted any.
- **Fix:**
  - Store the interval and clear it on close.
  - Add the Escape listener on open and remove it on close.
  - Replace the resize listener with CSS `max-height: calc(100vh - 120px)`.
  - Drop the cache, since building a row is cheap.
- **Before / after:**
  - After 5 open/close cycles: 5 intervals (10 ticks per second) and 10 listeners still running → 0.
  - Cached rows after the panel has been open for 10 minutes: about 1,200 → 0.

### 11. The alerts marquee animates `left`
- **Symptom:** the marquee keeps the main thread busy all the time, and it stutters whenever the main thread is busy, for example during a search.
- **How I found it:** read the `alerts-scroll` keyframes. Rendering → Paint flashing would show the strip repainting on every frame.
- **Root cause:**
  - `left` is a layout property, so every frame needed style, layout and paint on the main thread, forever.
  - The compositor can't run this animation on its own.
- **Fix:**
  - The animation now uses `transform: translateX()`.
  - The `.alerts` bar became a size container, so `-220cqw` covers exactly the old distance (from `left: 100%` to `-120%`).
  - The marquee stops under `prefers-reduced-motion`.
- **Before / after:** one layout and one paint per frame (about 60 a second) → 0. The animation now runs on the compositor.

### 12. The hover preview scans every event on each mouse move
- **Symptom:** moving the mouse over the list feels sticky.
- **How I found it:** read `showPreview()` and timed the lookup.
- **Root cause:**
  - On every `mousemove`, the preview ran `ACTIVITY.find` over 100,000 events to find the hovered row.
  - It then positioned the tooltip with `top`/`left`, which needs layout.
- **Fix:**
  - Look the row up in a `Map` of the 200 rendered events.
  - Only rewrite the text when the hovered row changes.
  - Position the tooltip with `transform`.
- **Before / after:** lookup cost per move: 0.67 ms on average → about 0.00002 ms.

### 13. Non-passive wheel and touch listeners hold up scrolling over the list
- **Symptom:** scrolling with the pointer over the list waits for any JavaScript that is running at that moment.
- **How I found it:** checked the `addEventListener` calls. Rendering → Scrolling performance issues would highlight the list.
- **Root cause:** a `wheel` or `touchstart` listener on an element is treated as able to call `preventDefault()`. The compositor therefore has to ask the main thread before it can scroll.
- **Fix:** added `{ passive: true }`. The handler only hides the preview.
- **Before / after:** listeners that block scroll: 2 → 0.

### 14. Text is invisible while the web font loads
- **Symptom:** headings and text are blank for a moment on first load, and for up to 3 seconds on a slow connection.
- **How I found it:** the `@font-face` rule has no `font-display`, and the font is only referenced from CSS, so its request can't start until the CSS has been parsed.
- **Root cause:**
  - The default `font-display` hides text for up to 3 seconds while the font loads.
  - The font was only discovered after the CSS had downloaded and been parsed.
- **Fix:** `font-display: swap`, plus a `<link rel="preload">` for the 65 KB WOFF2 file.
- **Before / after:**
  - Invisible-text period: up to 3 s → 0 (the fallback font shows immediately).
  - The font request now starts while the HTML is still loading, instead of after the CSS.
