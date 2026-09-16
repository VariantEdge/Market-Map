import {
  COMPANY_CHAT_COST_MODE,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  createOllamaProvider,
} from './ollama.ts'
import {
  getWebSearchProviderName,
  isSearxngReachable,
  isWebSearchEnabled,
} from '../search/index.ts'

export function getCompanyChatProvider() {
  return createOllamaProvider()
}

export async function buildCompanyChatHealth(provider, options = {}) {
  const health = await provider.health()
  const webSearchEnabled = options.webSearchEnabled ?? isWebSearchEnabled()
  const webSearchProvider = options.webSearchProvider ?? getWebSearchProviderName()
  const searxngReachable = options.searxngReachable ?? (
    webSearchEnabled && webSearchProvider === 'searxng'
      ? await isSearxngReachable()
      : false
  )

  return {
    llmProvider: provider.id,
    model: provider.model,
    baseUrl: provider.baseUrl,
    paidProviderEnabled: false,
    costMode: provider.costMode,
    webSearchEnabled,
    webSearchProvider,
    searxngReachable,
    ollamaReachable: health.available,
    modelInstalled: health.modelAvailable,
    retrievalMode: webSearchEnabled ? 'web_then_local_lexical' : 'local_lexical',
    streamingEnabled: true,
    ...health,
  }
}

export async function getCompanyChatHealth() {
  return buildCompanyChatHealth(getCompanyChatProvider())
}

export function getCompanyChatHealthFallback(error) {
  const webSearchEnabled = isWebSearchEnabled()
  return {
    error: error?.message || 'Company chat health check failed.',
    llmProvider: 'ollama',
    model: process.env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL,
    baseUrl: process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL,
    paidProviderEnabled: false,
    costMode: COMPANY_CHAT_COST_MODE,
    webSearchEnabled,
    webSearchProvider: getWebSearchProviderName(),
    searxngReachable: false,
    ollamaReachable: false,
    modelInstalled: false,
    retrievalMode: webSearchEnabled ? 'web_then_local_lexical' : 'local_lexical',
    streamingEnabled: true,
    available: false,
    modelAvailable: false,
  }
}
