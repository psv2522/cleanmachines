const numberFormat = new Intl.NumberFormat()

export function formatCount(value: number): string {
  return numberFormat.format(value)
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`
}

export function formatLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`
  return `${(ms / 60_000).toFixed(1)} min`
}

const rowTime = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

const fullTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'long',
})

const utcTime = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'long',
  timeZone: 'UTC',
})

const shortTime = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const clockTime = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** "Oct 9, 14:21:07" plus the milliseconds, which matter when ordering tool calls. */
export function formatRowTime(iso: string): { main: string; ms: string } {
  const date = new Date(iso)
  return { main: rowTime.format(date), ms: `.${String(date.getMilliseconds()).padStart(3, '0')}` }
}

export function formatFullTime(iso: string): string {
  return fullTime.format(new Date(iso))
}

export function formatUtcTime(iso: string): string {
  const date = new Date(iso)
  return `${utcTime.format(date).replace(' UTC', '')}.${String(date.getUTCMilliseconds()).padStart(3, '0')} UTC`
}

export function formatShortTime(iso: string | number): string {
  return shortTime.format(new Date(iso))
}

export function formatClock(iso: string | number): string {
  return clockTime.format(new Date(iso))
}

export function timeZoneLabel(): string {
  const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(new Date())
  return parts.find((part) => part.type === 'timeZoneName')?.value ?? 'local'
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
