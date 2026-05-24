export interface ProTableResult<T> {
  data: T[]
  success: boolean
  total: number
}

export function toProTableResult<T>(response: unknown, fallbackItems: T[] = []): ProTableResult<T> {
  const data = response as Record<string, unknown>
  const items = data.items ?? data.data ?? data.results ?? data.scans ?? data.reports ?? fallbackItems
  return {
    data: Array.isArray(items) ? items as T[] : fallbackItems,
    success: true,
    total: typeof data.total === 'number' ? data.total : Array.isArray(items) ? items.length : fallbackItems.length,
  }
}
