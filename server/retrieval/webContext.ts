import { getSearchProvider, getWebFetchTopN, isWebSearchEnabled } from '../search/index.ts'
import type { SearchQuery, SearchResult } from '../search/types.ts'
import { fetchPage } from '../web/fetchPage.ts'

const SEARCH_RESULT_LIMIT = 15
const ANALYTICAL_FETCH_TOP_N = 9
const MAX_WEB_CHUNK_LENGTH = 1800
const REPUTABLE_DOMAINS = [
  'sec.gov',
  'reuters.com',
  'bloomberg.com',
  'cnbc.com',
  'wsj.com',
  'ft.com',
  'marketwatch.com',
  'morningstar.com',
  'finance.yahoo.com',
  'nasdaq.com',
]
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'company', 'for', 'from',
  'how', 'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to',
  'what', 'when', 'where', 'which', 'who', 'why', 'with', 'would',
])

export type SourceQuality =
  | 'official_company'
  | 'sec'
  | 'transcript'
  | 'reputable_news'
  | 'generic_web'

const SOURCE_QUALITY_PRIORITY: Record<SourceQuality, number> = {
  official_company: 0,
  sec: 1,
  transcript: 2,
  reputable_news: 3,
  generic_web: 4,
}

function tokenize(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9.+-]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
}

function unique<T>(values: T[]) {
  return [...new Set(values)]
}

export function buildWebSearchQuery(input: SearchQuery) {
  const keyTerms = unique(tokenize(input.question)).slice(0, 10).join(' ')
  return [
    `"${input.companyName}"`,
    input.ticker,
    input.question,
    input.theme,
    `Layer ${input.layer}`,
    keyTerms,
  ].filter(Boolean).join(' ')
}

export function isAnalyticalInvestmentQuestion(question: string) {
  return /\b(bull|bear|thesis|break|risk|downside|upside|chokepoint|bottleneck|catalyst|debate|valuation|multiple|estimate|margin|earnings|outlook|guidance|competition|alternative|scenario|sensitivity|what\s+would)\b/i.test(
    String(question || ''),
  )
}

export function buildWebSearchQueries(input: SearchQuery) {
  const primary = buildWebSearchQuery(input)
  if (!isAnalyticalInvestmentQuestion(input.question)) return [primary]

  return [
    primary,
    `"${input.companyName}" ${input.ticker} investor relations earnings release 10-Q 8-K`,
    `"${input.companyName}" ${input.ticker} earnings call transcript guidance outlook`,
  ]
}

function companyDomainTokens(companyName: string) {
  return tokenize(companyName)
    .filter((token) => token.length >= 4 && !['corp', 'corporation', 'incorporated'].includes(token))
}

export function classifyWebSource(
  result: Pick<SearchResult, 'title' | 'url' | 'snippet' | 'domain'>,
  input: SearchQuery,
): SourceQuality {
  const domain = result.domain.toLowerCase()
  const url = result.url.toLowerCase()
  const haystack = `${result.title} ${result.snippet} ${url}`.toLowerCase()

  if (domain === 'sec.gov' || domain.endsWith('.sec.gov')) return 'sec'

  const parsedUrl = new URL(result.url)
  const looksLikeIr =
    /^(investor|investors)\./.test(domain) ||
    /\/(investor-relations|investors?|ir)(\/|$)/.test(parsedUrl.pathname.toLowerCase())
  const looksLikeCompanyDomain = companyDomainTokens(input.companyName)
    .some((token) => domain.includes(token))
  if (looksLikeIr || looksLikeCompanyDomain) return 'official_company'
  if (/\b(transcript|earnings call|conference call)\b/.test(haystack)) return 'transcript'

  if (REPUTABLE_DOMAINS.some(
    (reputableDomain) =>
      domain === reputableDomain || domain.endsWith(`.${reputableDomain}`),
  )) {
    return 'reputable_news'
  }
  return 'generic_web'
}

function asksForCurrentInformation(question: string) {
  return /\b(latest|current|today|recent|new|this quarter|this year|now)\b/i.test(question)
}

function ageBoost(publishedAt: string | null) {
  if (!publishedAt) return 0
  const timestamp = Date.parse(publishedAt)
  if (!Number.isFinite(timestamp)) return 0
  const ageDays = Math.max(0, (Date.now() - timestamp) / 86_400_000)
  if (ageDays <= 45) return 10
  if (ageDays <= 180) return 6
  if (ageDays <= 730) return 2
  return 0
}

export function scoreWebResult(result: SearchResult, input: SearchQuery) {
  const haystack = `${result.title} ${result.snippet} ${result.url}`.toLowerCase()
  const questionTokens = unique(tokenize(input.question))
  let score = result.providerScore

  if (haystack.includes(input.ticker.toLowerCase())) score += 12
  if (haystack.includes(input.companyName.toLowerCase())) score += 14
  if (haystack.includes(input.theme.toLowerCase())) score += 3
  if (haystack.includes(`layer ${input.layer}`)) score += 2
  for (const token of questionTokens) {
    if (haystack.includes(token)) score += token.length >= 6 ? 3 : 2
  }

  const url = result.url.toLowerCase()
  if (result.domain === 'sec.gov' || result.domain.endsWith('.sec.gov')) score += 24
  if (/(investor|investors|investor-relations|\/ir\/)/.test(url)) score += 18
  if (/(earnings|results|quarter|10-q|10-k|8-k|transcript)/.test(haystack)) score += 12
  if (REPUTABLE_DOMAINS.some((domain) => result.domain === domain || result.domain.endsWith(`.${domain}`))) {
    score += 8
  }
  if (asksForCurrentInformation(input.question)) score += ageBoost(result.publishedAt)
  return score
}

function compareRankedResults(
  a: { result: SearchResult; score: number; sourceQuality: SourceQuality },
  b: { result: SearchResult; score: number; sourceQuality: SourceQuality },
) {
  return (
    SOURCE_QUALITY_PRIORITY[a.sourceQuality] - SOURCE_QUALITY_PRIORITY[b.sourceQuality] ||
    b.score - a.score
  )
}

function selectRelevantText(text: string, input: SearchQuery) {
  const lines = String(text || '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 45)
  const tokens = unique(tokenize(`${input.ticker} ${input.companyName} ${input.question}`))
  const ranked = lines
    .map((line, index) => ({
      line,
      index,
      score: tokens.reduce(
        (sum, token) => sum + (line.toLowerCase().includes(token) ? 1 : 0),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)

  const selected = []
  let length = 0
  for (const item of ranked) {
    if (!item.score && selected.length >= 2) continue
    if (length + item.line.length > MAX_WEB_CHUNK_LENGTH) continue
    selected.push(item)
    length += item.line.length + 1
    if (length >= MAX_WEB_CHUNK_LENGTH * 0.85) break
  }
  return selected
    .sort((a, b) => a.index - b.index)
    .map((item) => item.line)
    .join('\n')
    .slice(0, MAX_WEB_CHUNK_LENGTH)
}

function displayLabel(title: string, domain: string) {
  const cleanTitle = title.replace(/\s+/g, ' ').trim()
  return `${domain} · ${cleanTitle}`.slice(0, 140)
}

async function fetchSearchResult(
  result: SearchResult,
  input: SearchQuery,
  signal?: AbortSignal,
  fetchPageImpl = fetchPage,
) {
  let page = null
  try {
    page = await fetchPageImpl(result.url, { signal })
  } catch {
    // Search snippets remain useful when a page blocks automated fetching.
  }

  const content = selectRelevantText(page?.text || '', input) || result.snippet
  if (!content) return null
  const finalUrl = page?.finalUrl || result.url
  const domain = new URL(finalUrl).hostname.replace(/^www\./, '').toLowerCase()
  const title = page?.title || result.title || domain
  const publishedAt = page?.publishedAt || result.publishedAt || null
  const retrievedAt = page?.retrievedAt || new Date().toISOString()
  const score = scoreWebResult({ ...result, url: finalUrl, domain, title, publishedAt }, input)
  const sourceQuality = classifyWebSource({
    ...result,
    url: finalUrl,
    domain,
    title,
  }, input)

  return {
    id: `web-${Buffer.from(finalUrl).toString('base64url').slice(0, 32)}`,
    content,
    heading: title,
    chunkIndex: 1,
    sourceFile: finalUrl,
    ticker: input.ticker,
    theme: input.theme,
    displayLabel: displayLabel(title, domain),
    sourceType: page ? 'web_page' : 'web_search_snippet',
    sourceQuality,
    sourceUrl: finalUrl,
    title,
    domain,
    publishedAt,
    retrievedAt,
    score,
    baseScore: score,
    meaningful: true,
  }
}

export async function retrieveWebContext(
  input: SearchQuery,
  options: {
    signal?: AbortSignal
    provider?: ReturnType<typeof getSearchProvider>
    fetchTopN?: number
    fetchPageImpl?: typeof fetchPage
  } = {},
) {
  if (!isWebSearchEnabled() && !options.provider) {
    return {
      enabled: false,
      available: false,
      query: null,
      chunks: [],
      error: null,
    }
  }

  const provider = options.provider ?? getSearchProvider()
  const queries = buildWebSearchQueries(input)
  const query = queries[0]
  try {
    const searchResults = await Promise.all(
      queries.map((searchQuery) =>
        provider.search(searchQuery, {
          signal: options.signal,
          limit: SEARCH_RESULT_LIMIT,
        }),
      ),
    )
    const dedupedResults = [
      ...new Map(
        searchResults
          .flat()
          .map((result) => [result.url.replace(/\/+$/, ''), result]),
      ).values(),
    ]
    const fetchTopN = options.fetchTopN ?? (
      isAnalyticalInvestmentQuestion(input.question)
        ? Math.max(ANALYTICAL_FETCH_TOP_N, getWebFetchTopN())
        : getWebFetchTopN()
    )
    const ranked = dedupedResults
      .map((result) => ({
        result,
        score: scoreWebResult(result, input),
        sourceQuality: classifyWebSource(result, input),
      }))
      .sort(compareRankedResults)
      .slice(0, SEARCH_RESULT_LIMIT)
      .slice(0, Math.min(10, fetchTopN))

    const chunks = (
      await Promise.all(
        ranked.map(({ result }) =>
          fetchSearchResult(result, input, options.signal, options.fetchPageImpl),
        ),
      )
    )
      .filter(Boolean)
      .sort((a, b) => (
        SOURCE_QUALITY_PRIORITY[a.sourceQuality] - SOURCE_QUALITY_PRIORITY[b.sourceQuality] ||
        b.score - a.score
      ))

    return {
      enabled: true,
      available: true,
      query,
      chunks,
      error: null,
    }
  } catch (error) {
    if (options.signal?.aborted) throw error
    return {
      enabled: true,
      available: false,
      query,
      chunks: [],
      error: error?.message || 'Web search failed.',
    }
  }
}
