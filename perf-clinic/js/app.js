const { pageSize, tickerIntervalMs, tickerVisibleRows, storageKey } = window.APP_CONFIG;

const grid = document.getElementById('agents');
const searchInput = document.getElementById('search');
const resultsList = document.getElementById('results');
const resultsCount = document.getElementById('results-count');
const topbar = document.querySelector('.topbar');
const backToTop = document.getElementById('back-to-top');
const progress = document.getElementById('read-progress');
const tickerToggle = document.getElementById('ticker-toggle');
const preview = document.getElementById('row-preview');
const scrollContext = document.getElementById('scroll-context');

const searchDelayMs = 150;
const maxViewed = 5000;

const byNewest = window.ACTIVITY.slice().sort((a, b) =>
  a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0,
);
const viewed = loadViewed();
const searchIndex = [];
let minuteCounts = null;
const whenIdle = window.requestIdleCallback || ((callback) => setTimeout(callback, 1));

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Timestamps are UTC ISO strings, so HH:MM:SS is already in them.
function formatTime(iso) {
  return iso.slice(11, 19);
}

function countByAgent(events) {
  const counts = {};
  events.forEach((event) => {
    counts[event.agent] = (counts[event.agent] || 0) + 1;
  });
  return counts;
}

function renderAgents() {
  const counts = countByAgent(window.ACTIVITY);
  grid.innerHTML = window.AGENTS.map((agent, index) => {
    const image = 'assets/agents/agent-' + String((index % 6) + 1).padStart(2, '0') + '.webp';
    return (
      '<article class="agent-card">' +
      '<img class="agent-avatar" src="' + image + '" alt="" width="48" height="48" loading="lazy" decoding="async">' +
      '<h3>' + escapeHtml(agent.name) + '</h3>' +
      '<p class="agent-owner">' + escapeHtml(agent.owner) + '</p>' +
      '<p class="agent-description">' + escapeHtml(agent.description) + '</p>' +
      '<p class="agent-count">' + (counts[agent.name] || 0).toLocaleString() + ' calls today</p>' +
      '</article>'
    );
  }).join('');
}

function loadViewed() {
  return new Set(JSON.parse(localStorage.getItem(storageKey) || '[]'));
}

function rememberViewed(items) {
  for (const item of items) {
    viewed.delete(item.id);
    viewed.add(item.id);
  }
  for (const id of viewed) {
    if (viewed.size <= maxViewed) break;
    viewed.delete(id);
  }
  localStorage.setItem(storageKey, JSON.stringify([...viewed]));
}

function extendSearchIndex(limit) {
  const end = Math.min(byNewest.length, searchIndex.length + limit);
  for (let i = searchIndex.length; i < end; i++) {
    const event = byNewest[i];
    searchIndex.push(
      [event.id, event.timestamp, event.agent, event.tool, event.status, event.latencyMs, event.summary]
        .join('\n')
        .toLowerCase(),
    );
  }
}

function indexInBackground() {
  extendSearchIndex(2000);
  if (searchIndex.length < byNewest.length) whenIdle(indexInBackground);
}

function search(query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return byNewest;
  extendSearchIndex(Infinity);
  return byNewest.filter((event, index) => searchIndex[index].includes(needle));
}

let pageEvents = [];
let pageById = new Map();

function renderResults(query) {
  const matches = search(query);
  pageEvents = matches.slice(0, pageSize);
  pageById = new Map(pageEvents.map((event) => [event.id, event]));
  resultsCount.textContent = matches.length.toLocaleString() + ' matching tool calls';
  resultsList.innerHTML = pageEvents.map((event) => {
    const isNew = !viewed.has(event.id);
    return (
      '<li class="result-row status-' + event.status + '" data-id="' + event.id + '">' +
      '<span class="result-time">' + formatTime(event.timestamp) + '</span>' +
      '<span class="result-agent">' + escapeHtml(event.agent) + '</span>' +
      '<span class="result-tool">' + escapeHtml(event.tool) + '</span>' +
      '<span class="result-status">' + event.status + '</span>' +
      '<span class="result-latency">' + event.latencyMs + ' ms</span>' +
      '<span class="result-summary">' + escapeHtml(event.summary) + '</span>' +
      (isNew ? '<span class="badge-new">New</span>' : '') +
      '</li>'
    );
  }).join('');
  rememberViewed(pageEvents);
  focusStart = 0;
  focusEnd = 0;
  invalidateLayout();
}

function callsInMinute(minute) {
  if (!minuteCounts) {
    minuteCounts = new Map();
    for (const event of window.ACTIVITY) {
      const key = event.timestamp.slice(11, 16);
      minuteCounts.set(key, (minuteCounts.get(key) || 0) + 1);
    }
  }
  return minuteCounts.get(minute) || 0;
}

let rowTops = null;
let maxScroll = 0;
let focusStart = 0;
let focusEnd = 0;
let contextText = '';
let scrollFrame = 0;

function measureLayout() {
  maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  rowTops = Array.from(resultsList.children, (row) => row.getBoundingClientRect().top + window.scrollY);
}

function invalidateLayout() {
  rowTops = null;
  scheduleScrollUpdate();
}

function scheduleScrollUpdate() {
  if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScrollUi);
}

function firstRowBelow(y) {
  let low = 0;
  let high = rowTops.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (rowTops[mid] > y) high = mid;
    else low = mid + 1;
  }
  return low;
}

function updateScrollUi() {
  scrollFrame = 0;
  if (!rowTops) measureLayout();
  const scrolled = window.scrollY;
  const viewport = window.innerHeight;
  progress.style.transform = 'scaleX(' + (maxScroll > 0 ? Math.min(1, scrolled / maxScroll) : 0) + ')';
  topbar.classList.toggle('topbar-raised', scrolled > 8);
  backToTop.classList.toggle('visible', scrolled > viewport);

  const start = firstRowBelow(scrolled + viewport * 0.3);
  let end = start;
  while (end < rowTops.length && rowTops[end] < scrolled + viewport * 0.6) end++;
  setFocusRange(start, end);
}

function setFocusRange(start, end) {
  const rows = resultsList.children;
  for (let i = focusStart; i < focusEnd; i++) {
    if (i < start || i >= end) rows[i].classList.remove('in-focus');
  }
  for (let i = start; i < end; i++) rows[i].classList.add('in-focus');
  focusStart = start;
  focusEnd = end;

  let text = '';
  if (start < end) {
    const minute = pageEvents[start].timestamp.slice(11, 16);
    text = minute + ' UTC · ' + callsInMinute(minute) + ' calls that minute';
  }
  if (text !== contextText) {
    contextText = text;
    scrollContext.textContent = text;
  }
}

let previewId = null;

function hidePreview() {
  preview.hidden = true;
}

function showPreview(event) {
  const row = event.target.closest('.result-row');
  if (!row) return;
  const item = pageById.get(row.dataset.id);
  if (!item) return;
  if (previewId !== item.id) {
    previewId = item.id;
    preview.textContent = item.summary;
  }
  preview.style.transform = 'translate(' + (event.clientX + 12) + 'px, ' + (event.clientY + 12) + 'px)';
  preview.hidden = false;
}

let tickerPanel = null;
let tickerTimer = 0;

function tickerRow(event) {
  const row = document.createElement('li');
  row.className = 'ticker-row status-' + event.status;
  row.innerHTML =
    '<span class="ticker-time">' + formatTime(event.timestamp) + '</span>' +
    '<span class="ticker-agent">' + escapeHtml(event.agent) + '</span>' +
    '<span class="ticker-tool">' + escapeHtml(event.tool) + '</span>';
  return row;
}

function closeTickerOnEscape(event) {
  if (event.key === 'Escape') closeTicker();
}

function openTicker() {
  const panel = document.createElement('aside');
  panel.className = 'ticker';
  panel.innerHTML = '<header class="ticker-header">Live tool calls</header><ul class="ticker-list"></ul>';
  document.body.appendChild(panel);
  tickerPanel = panel;
  const list = panel.querySelector('.ticker-list');

  tickerTimer = setInterval(() => {
    const event = window.ACTIVITY[Math.floor(Math.random() * window.ACTIVITY.length)];
    list.prepend(tickerRow(event));
    while (list.children.length > tickerVisibleRows) {
      list.lastElementChild.remove();
    }
  }, tickerIntervalMs);

  window.addEventListener('keydown', closeTickerOnEscape);
  tickerToggle.setAttribute('aria-pressed', 'true');
  tickerToggle.textContent = 'Hide live calls';
}

function closeTicker() {
  if (!tickerPanel) return;
  clearInterval(tickerTimer);
  window.removeEventListener('keydown', closeTickerOnEscape);
  tickerPanel.remove();
  tickerPanel = null;
  tickerToggle.setAttribute('aria-pressed', 'false');
  tickerToggle.textContent = 'Show live calls';
}

let searchTimer = 0;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => renderResults(searchInput.value), searchDelayMs);
});
window.addEventListener('scroll', scheduleScrollUpdate, { passive: true });
window.addEventListener('resize', invalidateLayout);
new ResizeObserver(invalidateLayout).observe(document.body);
resultsList.addEventListener('mousemove', showPreview);
resultsList.addEventListener('mouseleave', hidePreview);
resultsList.addEventListener('wheel', hidePreview, { passive: true });
resultsList.addEventListener('touchstart', hidePreview, { passive: true });
backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
tickerToggle.addEventListener('click', () => (tickerPanel ? closeTicker() : openTicker()));

renderAgents();
renderResults('');
whenIdle(indexInBackground);
