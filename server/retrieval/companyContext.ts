import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { basename, dirname, join } from 'node:path'
import { MARKET_MAPS } from '../../src/data.js'
import { fetchYahooPrice } from '../../api/marketData.js'
import {
  PLACEHOLDER_PATTERN,
  parseMarkdownSections,
} from './contextSchema.ts'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(MODULE_DIR, '..', '..')
const MAX_CONTEXT_CHUNKS = 10
const MAX_CHUNK_LENGTH = 1050
const QUOTE_TIMEOUT_MS = 2500

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'company', 'do',
  'for', 'from', 'how', 'i', 'if', 'in', 'is', 'it', 'of', 'on', 'or', 'our',
  'that', 'the', 'their', 'this', 'to', 'was', 'what', 'when', 'where', 'which',
  'who', 'why', 'with', 'would', 'you',
])

const SYNONYM_GROUPS = [
  ['bull', 'upside', 'growth', 'catalyst', 'opportunity'],
  ['bear', 'downside', 'risk', 'disconfirm', 'break', 'thesis'],
  ['competitor', 'competition', 'alternative', 'substitute', 'peer'],
  ['chokepoint', 'bottleneck', 'constraint', 'capacity', 'supply'],
  ['margin', 'profitability', 'ebit', 'ebitda', 'earnings'],
  ['demand', 'orders', 'backlog', 'visibility'],
  ['capex', 'capital', 'expenditure', 'investment'],
  ['customer', 'qualification', 'qualified', 'adoption'],
  ['product', 'portfolio', 'exposure', 'segment'],
  ['valuation', 'multiple', 'price', 'marketcap'],
]

function normalizeTheme(theme) {
  const value = String(theme || 'photonics').trim().toLowerCase()
  return value === 'optics' ? 'photonics' : value
}

function tokenize(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9.+-]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function expandSynonyms(tokens) {
  const expanded = new Set(tokens)
  for (const group of SYNONYM_GROUPS) {
    if (group.some((term) => expanded.has(term))) {
      group.forEach((term) => expanded.add(term))
    }
  }
  return [...expanded]
}

function usableAppText(value) {
  const text = String(value ?? '').trim()
  return text && !PLACEHOLDER_PATTERN.test(text) ? text : ''
}

function chunkText(text) {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!normalized) return []
  if (normalized.length <= MAX_CHUNK_LENGTH) return [normalized]

  const sentences = normalized.split(/(?<=[.!?])\s+/)
  const chunks = []
  let current = ''
  for (const sentence of sentences) {
    if (current && current.length + sentence.length + 1 > MAX_CHUNK_LENGTH) {
      chunks.push(current)
      current = sentence
    } else {
      current = `${current} ${sentence}`.trim()
    }
  }
  if (current) chunks.push(current)
  return chunks
}

async function readContextFile(relativePath, metadata) {
  try {
    const text = await readFile(join(PROJECT_ROOT, relativePath), 'utf8')
    const fileName = basename(relativePath)
    return parseMarkdownSections(text).flatMap((section) => {
      if (!section.content || PLACEHOLDER_PATTERN.test(section.content)) return []
      return chunkText(section.content).map((content, chunkIndex) => ({
        id: `${metadata.id}-${section.heading.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${chunkIndex + 1}`,
        content,
        heading: section.heading,
        chunkIndex: chunkIndex + 1,
        sourceFile: relativePath,
        ticker: metadata.ticker ?? null,
        theme: metadata.theme ?? null,
        displayLabel: `${fileName} · ${section.heading}`,
        sourceType: 'local_markdown',
        sourceQuality: 'local_context',
        baseScore: metadata.baseScore ?? 0,
        meaningful:
          metadata.meaningful !== false &&
          !['Source notes', 'Key open questions'].includes(section.heading),
      }))
    })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}

function findCompany(ticker, requestedLayer, requestedTheme) {
  const normalizedTicker = String(ticker).trim().toUpperCase()
  const preferredIndex = Number(requestedLayer) - 1
  const matches = []
  const marketMap = Object.values(MARKET_MAPS).find(
    (candidate) =>
      candidate.id === requestedTheme || candidate.contextTheme === requestedTheme,
  )
  const layers = marketMap?.layers ?? []

  layers.forEach((layer, layerIndex) => {
    const company = layer.companies.find(
      (candidate) => String(candidate.ticker ?? '').toUpperCase() === normalizedTicker,
    )
    if (company) matches.push({ company, layer, layerIndex })
  })

  return matches.find((match) => match.layerIndex === preferredIndex) ?? matches[0] ?? null
}

function appChunk({
  id,
  content,
  heading,
  displayLabel,
  ticker,
  theme,
  baseScore,
  meaningful = false,
}) {
  return {
    id,
    content,
    heading,
    chunkIndex: 1,
    sourceFile: 'src/data.js',
    ticker,
    theme,
    displayLabel,
    sourceType: 'app_data',
    sourceQuality: 'local_context',
    baseScore,
    meaningful,
  }
}

function buildAppChunks(match, theme, requestedLayer) {
  if (!match) return []
  const { company, layer, layerIndex } = match
  const description = usableAppText(company.description)
  const overview = usableAppText(layer.overview?.description)
  const importance = usableAppText(layer.overview?.importance)
  const peers = layer.companies
    .filter((candidate) => candidate.ticker && candidate.ticker !== company.ticker)
    .map((candidate) => `${candidate.name} (${candidate.ticker})`)

  return [
    appChunk({
      id: 'market-maps-company-profile',
      heading: 'Company record',
      displayLabel: 'App data · Company record',
      ticker: company.ticker,
      theme,
      baseScore: 8,
      meaningful: Boolean(description),
      content: [
        `${company.name} (${company.ticker}) is a ${company.type?.toLowerCase() || 'mapped'} company based in ${company.country || 'an unspecified country'}.`,
        `Market Maps places it in ${theme} Layer ${layerIndex + 1}: ${layer.name}.`,
        description,
      ].filter(Boolean).join(' '),
    }),
    appChunk({
      id: 'market-maps-layer-overview',
      heading: 'Market map layer',
      displayLabel: 'App data · Market map layer',
      ticker: company.ticker,
      theme,
      baseScore: 6,
      meaningful: Boolean(overview || importance),
      content: [
        `Requested layer: ${requestedLayer || layerIndex + 1}. Market Maps layer name: ${layer.name}.`,
        overview,
        importance,
      ].filter(Boolean).join(' '),
    }),
    appChunk({
      id: 'market-maps-layer-peers',
      heading: 'Layer peers',
      displayLabel: 'App data · Layer peers',
      ticker: company.ticker,
      theme,
      baseScore: 2,
      content: `Other mapped companies in this layer include: ${peers.join(', ')}. Layer membership does not establish direct competition.`,
    }),
  ]
}

async function buildQuoteChunk(ticker, companyName, theme) {
  try {
    const quote = await Promise.race([
      fetchYahooPrice(ticker),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Quote snapshot timed out')), QUOTE_TIMEOUT_MS),
      ),
    ])
    if (quote?.price == null) return []

    return [{
      id: 'yahoo-quote-snapshot',
      content: `${companyName || ticker} (${ticker}) quote snapshot: ${quote.price} ${quote.currency} as of ${quote.fetched_at}. This is a point-in-time market quote, not a valuation conclusion.`,
      heading: 'Quote snapshot',
      chunkIndex: 1,
      sourceFile: 'Yahoo Finance',
      ticker,
      theme,
      displayLabel: 'Yahoo Finance · Quote snapshot',
      sourceType: 'free_quote_snapshot',
      sourceQuality: 'local_context',
      sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}`,
      baseScore: 1,
      meaningful: true,
    }]
  } catch {
    return []
  }
}

function scoreChunk(chunk, query) {
  const content = chunk.content.toLowerCase()
  const contentTokens = new Set(tokenize(content))
  const headingTokens = new Set(tokenize(chunk.heading))
  let score = chunk.baseScore ?? 0

  if (chunk.ticker && chunk.ticker.toUpperCase() === query.ticker) score += 10
  if (query.companyName && content.includes(query.companyName.toLowerCase())) score += 8
  if (chunk.theme === query.theme || content.includes(query.theme)) score += 4
  if (content.includes(`layer ${query.layer}`)) score += 5

  for (const token of query.tokens) {
    if (headingTokens.has(token)) score += 5
    if (contentTokens.has(token)) score += token.length >= 6 ? 3 : 2
  }
  return score
}

function publicSource(chunk) {
  return {
    id: chunk.id,
    label: chunk.displayLabel,
    type: chunk.sourceType,
    source_type: chunk.sourceType,
    source_quality: chunk.sourceQuality || 'local_context',
    source_file: chunk.sourceFile,
    heading: chunk.heading,
    chunk_index: chunk.chunkIndex,
    ticker: chunk.ticker,
    theme: chunk.theme,
    ...(chunk.sourceUrl ? { url: chunk.sourceUrl } : {}),
  }
}

export async function retrieveCompanyContext(input, options = {}) {
  const ticker = String(input.ticker ?? '').trim().toUpperCase()
  const theme = normalizeTheme(input.theme)
  const layer = Number(input.layer) || 1
  const question = String(input.question ?? '').trim()
  const match = findCompany(ticker, layer, theme)
  const companyName = match?.company?.name ?? ticker

  const [companyFileChunks, sharedThemeChunks, quoteChunks] = await Promise.all([
    readContextFile(`data/company-context/${ticker}.md`, {
      id: `local-company-${ticker.toLowerCase()}`,
      ticker,
      theme,
      baseScore: 11,
    }),
    readContextFile(`data/company-context/shared/${theme}.md`, {
      id: `local-theme-${theme}`,
      theme,
      baseScore: 4,
      meaningful: false,
    }),
    options.includeQuote === false ? [] : buildQuoteChunk(ticker, companyName, theme),
  ])

  const chunks = [
    ...buildAppChunks(match, theme, layer),
    ...companyFileChunks,
    ...sharedThemeChunks,
    ...quoteChunks,
  ]
  const rawTokens = tokenize(`${question} ${ticker} ${companyName} ${theme} layer ${layer}`)
  const query = {
    ticker,
    companyName,
    theme,
    layer,
    tokens: unique(expandSynonyms(rawTokens)),
  }

  const ranked = chunks
    .map((chunk) => ({ ...chunk, score: scoreChunk(chunk, query) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, MAX_CONTEXT_CHUNKS)

  const meaningfulCount = ranked.filter((chunk) => chunk.meaningful).length

  return {
    company: match
      ? {
          ticker,
          name: match.company.name,
          layer: match.layerIndex + 1,
          layerName: match.layer.name,
          theme,
        }
      : { ticker, name: ticker, layer, layerName: null, theme },
    chunks: ranked,
    sources: ranked.map(publicSource),
    meaningfulCount,
    thinContext: meaningfulCount < 2,
    usedContext: ranked.map((chunk) => ({
      id: chunk.id,
      source_id: chunk.id,
      source: chunk.displayLabel,
      source_file: chunk.sourceFile,
      heading: chunk.heading,
      chunk_index: chunk.chunkIndex,
      ticker: chunk.ticker,
      theme: chunk.theme,
      score: chunk.score,
      display_label: chunk.displayLabel,
      excerpt: chunk.content.slice(0, 300),
      meaningful: chunk.meaningful,
      source_type: chunk.sourceType,
      source_quality: chunk.sourceQuality || 'local_context',
    })),
  }
}
