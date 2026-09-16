export interface SearchQuery {
  ticker: string
  companyName: string
  question: string
  theme: string
  layer: number
}

export interface SearchResult {
  title: string
  url: string
  snippet: string
  domain: string
  publishedAt: string | null
  engine: string | null
  providerScore: number
}

export interface SearchProvider {
  id: string
  search(query: string, options?: { signal?: AbortSignal; limit?: number }): Promise<SearchResult[]>
}
