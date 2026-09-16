import type { SearchProvider, SearchResult } from './types.ts'

const DEFAULT_SEARXNG_BASE_URL = 'http://localhost:8080'
const SEARCH_TIMEOUT_MS = 12_000

function normalizeBaseUrl(value?: string) {
  return String(value || DEFAULT_SEARXNG_BASE_URL).replace(/\/+$/, '')
}

function normalizeResult(item: any, index: number): SearchResult | null {
  try {
    const url = new URL(String(item?.url || ''))
    if (!['http:', 'https:'].includes(url.protocol)) return null
    return {
      title: String(item?.title || url.hostname).trim(),
      url: url.toString(),
      snippet: String(item?.content || item?.snippet || '').replace(/\s+/g, ' ').trim(),
      domain: url.hostname.replace(/^www\./, '').toLowerCase(),
      publishedAt: item?.publishedDate || item?.published_at || null,
      engine: item?.engine || item?.engines?.[0] || null,
      providerScore: Number.isFinite(Number(item?.score))
        ? Number(item.score)
        : Math.max(0, 10 - index),
    }
  } catch {
    return null
  }
}

export function createSearxngProvider(options: {
  baseUrl?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
} = {}): SearchProvider {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? process.env.SEARXNG_BASE_URL)
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? SEARCH_TIMEOUT_MS

  return {
    id: 'searxng',
    async search(query, searchOptions = {}) {
      const controller = new AbortController()
      const abortFromCaller = () => controller.abort(searchOptions.signal?.reason)
      const timeout = setTimeout(() => controller.abort(new Error('search timeout')), timeoutMs)
      if (searchOptions.signal?.aborted) abortFromCaller()
      else searchOptions.signal?.addEventListener('abort', abortFromCaller, { once: true })

      try {
        const searchUrl = new URL(`${baseUrl}/search`)
        searchUrl.searchParams.set('q', query)
        searchUrl.searchParams.set('format', 'json')
        const response = await fetchImpl(searchUrl, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'MarketMaps/1.0 local research assistant',
          },
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`SearXNG search returned HTTP ${response.status}.`)
        }
        const payload = await response.json()
        const limit = Math.max(1, searchOptions.limit ?? 12)
        return (payload?.results ?? [])
          .map(normalizeResult)
          .filter(Boolean)
          .slice(0, limit) as SearchResult[]
      } finally {
        clearTimeout(timeout)
        searchOptions.signal?.removeEventListener('abort', abortFromCaller)
      }
    },
  }
}
