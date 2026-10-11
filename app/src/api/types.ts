export const STATUSES = ['ok', 'blocked', 'error'] as const
export type EventStatus = (typeof STATUSES)[number]

export interface EventSummary {
  id: string
  timestamp: string
  agent: string
  tool: string
  status: EventStatus
  latencyMs: number
  argsPreview: string
}

export interface EventDetail {
  id: string
  timestamp: string
  agent: string
  tool: string
  status: EventStatus
  latencyMs: number
  args: unknown
  result: unknown
  policyMatches: string[]
}

export interface EventsPage {
  items: EventSummary[]
  nextCursor: string | null
  total: number
}

export const BUCKETS = ['1m', '5m', '1h'] as const
export type Bucket = (typeof BUCKETS)[number]

export interface HistogramBucket {
  t: string
  count: number
}

export interface HistogramResponse {
  bucket: Bucket
  buckets: HistogramBucket[]
}
