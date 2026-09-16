import { createSearxngProvider } from './searxng.ts'
import type { SearchProvider } from './types.ts'

export function isWebSearchEnabled() {
  return String(process.env.WEB_SEARCH_ENABLED || 'false').toLowerCase() === 'true'
}

export function getWebSearchProviderName() {
  return String(process.env.WEB_SEARCH_PROVIDER || 'searxng').toLowerCase()
}

export function getWebFetchTopN() {
  const parsed = Number(process.env.WEB_FETCH_TOP_N || 9)
  return Number.isInteger(parsed) ? Math.min(10, Math.max(1, parsed)) : 9
}

export function getSearchProvider(): SearchProvider {
  const provider = getWebSearchProviderName()
  if (provider !== 'searxng') {
    throw new Error(`Unsupported web search provider: ${provider}`)
  }
  return createSearxngProvider()
}

export async function isSearxngReachable(options: {
  provider?: SearchProvider
} = {}) {
  try {
    const provider = options.provider ?? createSearxngProvider({ timeoutMs: 3000 })
    await provider.search('COHR', { limit: 1 })
    return true
  } catch {
    return false
  }
}
