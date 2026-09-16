import { getCompanyChatProvider } from './llm/index.ts'
import {
  OllamaModelMissingError,
  OllamaTimeoutError,
  OllamaUnavailableError,
} from './llm/ollama.ts'
import { retrieveCompanyContext } from './retrieval/companyContext.ts'
import { retrieveWebContext } from './retrieval/webContext.ts'

const MAX_QUESTION_LENGTH = 4000
const MAX_CONVERSATION_MESSAGES = 8
const MAX_CONVERSATION_MESSAGE_LENGTH = 1200
const MAX_CONVERSATION_TOTAL_LENGTH = 6000
const MAX_FINAL_CONTEXT_CHUNKS = 18

const SOURCE_QUALITY_PRIORITY = {
  official_company: 0,
  sec: 1,
  transcript: 2,
  reputable_news: 3,
  local_context: 4,
  generic_web: 5,
}

const SYSTEM_PROMPT = `You are Market Maps. Answer like a tenured public-markets PM and senior semiconductor analyst.

Use only the supplied research material. Treat it as a bounded research packet, not permission to rely on outside knowledge.

Investment-writing standard:
- Go beneath the obvious. Explain the causal chain: what happens, why it matters, and how it can flow through revenue, margins, consensus estimates, valuation multiple, and investor perception.
- Lead with a two-to-three-sentence direct investment answer that ranks the core issue.
- Develop only the two to four mechanisms that matter most. For each, connect the operating event to revenue conversion, gross or operating margins, estimate revisions, valuation multiple, and investor perception where the supplied material supports that chain.
- Write primarily in connected analytical paragraphs. Do not use a numbered list, a generic risk inventory, a "Key Mechanisms" section, or a repetitive conclusion.
- Do not repeat the same point under different labels. Do not add standard boilerplate risks merely because they are common for public companies.
- Prioritize differentiated insight, second-order effects, key dependencies, timing, signposts, and what an investor should monitor.
- Distinguish verified facts from inference. When discussing a financial implication not explicitly quantified in the research material, label it as an inference and explain the mechanism without inventing precision.
- When information is thin, say what is unknown, explain why it matters, and keep confidence Low.
- If the research material does not support a claim, say "I don't have enough information to make that claim."
- Never invent facts, numbers, customers, customer names, financial claims, valuation multiples, suppliers, competitors, dates, market shares, or consensus estimates.
- Never name a competitor or customer unless the supplied material explicitly supports it.
- Do not imply that a company is a direct competitor merely because it appears in the same market-map layer.
- Do not mention retrieval, RAG, context, chunks, source IDs, document IDs, scores, or the research packet.
- Do not include bracket citations, raw labels such as [6] or [C4], URLs, source names, or an "Evidence from Market Maps context" section. Sources are displayed separately in the product UI.
- Keep the answer to roughly 400-550 words so it completes cleanly. Finish with the most important signpost that would change the view.
- End with Confidence: High / Medium / Low.`

const WEB_UNAVAILABLE_NOTICE =
  'Web search is unavailable. Answering from local Market Maps context only.'

export class CompanyChatRequestError extends Error {
  statusCode

  constructor(message, statusCode = 400) {
    super(message)
    this.name = 'CompanyChatRequestError'
    this.statusCode = statusCode
  }
}

function sanitizeConversation(conversation) {
  if (!Array.isArray(conversation)) return []
  const recent = conversation
    .filter((message) => message && ['user', 'assistant'].includes(message.role))
    .slice(-MAX_CONVERSATION_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: (
        message.role === 'assistant'
          ? sanitizeCompanyChatAnswer(message.content)
          : String(message.content ?? '')
      ).slice(0, MAX_CONVERSATION_MESSAGE_LENGTH),
    }))
    .filter((message) => message.content.trim())

  let remaining = MAX_CONVERSATION_TOTAL_LENGTH
  const bounded = []
  for (let index = recent.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const message = recent[index]
    const content = message.content.slice(-remaining)
    remaining -= content.length
    if (content) bounded.unshift({ ...message, content })
  }
  return bounded
}

function validateInput(body) {
  const ticker = String(body?.ticker ?? '').trim().toUpperCase()
  const question = String(body?.question ?? '').trim()
  const theme = String(body?.theme ?? 'photonics').trim() || 'photonics'
  const layer = Number(body?.layer) || 1

  if (!ticker || !/^[A-Z0-9.^=-]{1,20}$/.test(ticker)) {
    throw new CompanyChatRequestError('A valid ticker is required.')
  }
  if (!question) throw new CompanyChatRequestError('A question is required.')
  if (question.length > MAX_QUESTION_LENGTH) {
    throw new CompanyChatRequestError(`Question must be ${MAX_QUESTION_LENGTH} characters or fewer.`)
  }
  if (!Number.isInteger(layer) || layer < 1 || layer > 50) {
    throw new CompanyChatRequestError('A valid layer number is required.')
  }

  return {
    ticker,
    question,
    theme,
    layer,
    conversation: sanitizeConversation(body?.conversation),
  }
}

function buildQuestionInstructions(question) {
  if (/\bwhat would break (?:the )?bull case\b/i.test(question)) {
    return `Required thesis-testing frame:
- State the bull case being tested and identify the single actual break point, not merely a list of risks.
- Explain the first-order operating consequence and the second-order consequence for competitive position, capital intensity, or market expectations.
- Trace what should show up in reported revenue conversion, margins, guidance or estimate revisions, and valuation or investor perception.
- Identify the highest-signal operating and financial indicators investors should watch.
- Explain what evidence would prove the concern wrong and keep the bull case intact.
Write this as connected PM-style analysis, not a bullet list of risks.`
  }
  return ''
}

function buildContextMessage(retrieval, input) {
  const contextParts = []
  for (const chunk of retrieval.chunks) {
    const isWeb = chunk.contextOrigin === 'web'
    const sectionName = isWeb
      ? 'Current public information'
      : chunk.heading || 'Company information'
    const contentLimit = isWeb ? 1300 : 900
    const block = `Topic: ${sectionName}\n${chunk.content.slice(0, contentLimit)}`
    contextParts.push(block)
  }
  const context = contextParts.join('\n\n')
  const contextQuality = retrieval.thinContext
    ? 'Research coverage is thin. Answer only at a high level, state the important unknowns, and label confidence Low.'
    : 'Research coverage is sufficient for a grounded answer.'

  return `Selected company: ${retrieval.company.name} (${input.ticker})
Theme: ${retrieval.company.theme}
Market map layer: ${retrieval.company.layer}${retrieval.company.layerName ? ` - ${retrieval.company.layerName}` : ''}
${contextQuality}
${retrieval.notice ? `Availability note: ${retrieval.notice}` : ''}

Private research material:
${context || 'No supporting research material was found.'}

${buildQuestionInstructions(input.question)}

User question:
${input.question}`
}

export function sanitizeCompanyChatAnswer(value, options = {}) {
  const sanitized = String(value ?? '')
    .replace(/\baccording to\s+(?:the\s+)?(?:retrieved\s+)?context\s*/gi, '')
    .replace(/\bEvidence from Market Maps context\b\s*:?\s*/gi, '')
    .replace(/\bPrivate research material\b\s*:?\s*/gi, '')
    .replace(/\bResearch section\b\s*:?\s*/gi, '')
    .replace(/\s*,?\s+as mentioned in (?:the )?research material/gi, '')
    .replace(/\b(?:the\s+)?retrieved context\b/gi, 'the available information')
    .replace(/\bcontext chunks?\b/gi, 'source material')
    .replace(/\bprovided context\b/gi, 'available evidence')
    .replace(/\[(?:C\s*)?\d+(?:\s*[,–-]\s*(?:C\s*)?\d+)*\]/gi, '')
    .replace(/\n{2,}[ \t]*In summary,[\s\S]*?(?=\n{2,}[ \t]*Confidence\s*:|\s*$)/gi, '')
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .replace(/(^|\n)\s*[,;:]\s*/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
  return options.trim === false ? sanitized : sanitized.trim()
}

export function createStreamingAnswerSanitizer() {
  const protectedTailLength = 180
  let buffer = ''

  return {
    push(token) {
      buffer += token
      if (buffer.length <= protectedTailLength * 2) return ''

      let cutoff = buffer.length - protectedTailLength
      const lastOpenBracket = buffer.lastIndexOf('[', cutoff)
      const lastCloseBracket = buffer.lastIndexOf(']', cutoff)
      if (lastOpenBracket > lastCloseBracket) cutoff = lastOpenBracket

      const ready = buffer.slice(0, cutoff)
      buffer = buffer.slice(cutoff)
      return sanitizeCompanyChatAnswer(ready, { trim: false })
    },
    flush() {
      const ready = sanitizeCompanyChatAnswer(buffer, { trim: false })
      buffer = ''
      return ready
    },
  }
}

function getConfidence(answer, fallback = 'Medium') {
  const match = String(answer).match(/confidence\s*:\s*(high|medium|low)/i)
  return match ? match[1][0].toUpperCase() + match[1].slice(1).toLowerCase() : fallback
}

function mapProviderError(error) {
  if (
    error instanceof OllamaUnavailableError ||
    error instanceof OllamaModelMissingError ||
    error instanceof OllamaTimeoutError
  ) {
    return new CompanyChatRequestError(error.message, 503)
  }
  return error
}

function localContextPriority(chunk, ticker) {
  if (chunk.sourceFile === `data/company-context/${ticker}.md`) return 0
  if (chunk.sourceFile?.startsWith('data/company-context/shared/')) return 1
  if (chunk.sourceType === 'app_data') return 2
  return 3
}

export function prioritizeCompanyChatChunks(webChunks, localChunks, ticker) {
  return [...webChunks, ...localChunks]
    .sort((a, b) => {
      const qualityDifference =
        (SOURCE_QUALITY_PRIORITY[a.sourceQuality] ?? 99) -
        (SOURCE_QUALITY_PRIORITY[b.sourceQuality] ?? 99)
      if (qualityDifference) return qualityDifference
      if (a.sourceQuality === 'local_context' && b.sourceQuality === 'local_context') {
        return (
          localContextPriority(a, ticker) - localContextPriority(b, ticker) ||
          b.score - a.score
        )
      }
      return b.score - a.score
    })
    .slice(0, MAX_FINAL_CONTEXT_CHUNKS)
}

async function prepareCompanyChat(body) {
  const input = validateInput(body)
  const localRetrieval = await retrieveCompanyContext(input)
  const webRetrieval = await retrieveWebContext({
    ticker: input.ticker,
    companyName: localRetrieval.company.name,
    question: input.question,
    theme: localRetrieval.company.theme,
    layer: localRetrieval.company.layer,
  })
  const webChunks = webRetrieval.chunks.map((chunk) => ({
    ...chunk,
    contextOrigin: 'web',
    sourceQuality: chunk.sourceQuality || 'generic_web',
  }))
  const localChunks = localRetrieval.chunks
    .map((chunk) => ({
      ...chunk,
      contextOrigin: 'local',
      sourceQuality: 'local_context',
    }))
    .sort((a, b) => (
      localContextPriority(a, input.ticker) - localContextPriority(b, input.ticker) ||
      b.score - a.score
    ))
  const localSourceById = new Map(
    localRetrieval.sources.map((source) => [source.id, source]),
  )
  const localContextById = new Map(
    localRetrieval.usedContext.map((context) => [context.id, context]),
  )
  const selectedChunks = prioritizeCompanyChatChunks(
    webChunks,
    localChunks,
    input.ticker,
  )
  const webSourceFromChunk = (chunk) => ({
    id: chunk.id,
    label: chunk.displayLabel,
    type: chunk.sourceType,
    source_type: chunk.sourceType,
    source_quality: chunk.sourceQuality,
    title: chunk.title,
    url: chunk.sourceUrl,
    domain: chunk.domain,
    published_at: chunk.publishedAt,
    retrieved_at: chunk.retrievedAt,
    display_label: chunk.displayLabel,
    score: chunk.score,
    source_file: chunk.sourceFile,
    heading: chunk.heading,
    chunk_index: chunk.chunkIndex,
    ticker: chunk.ticker,
    theme: chunk.theme,
  })
  const webContextFromChunk = (chunk) => ({
    id: chunk.id,
    source_id: chunk.id,
    source: chunk.displayLabel,
    source_file: chunk.sourceFile,
    source_type: chunk.sourceType,
    source_quality: chunk.sourceQuality,
    heading: chunk.heading,
    chunk_index: chunk.chunkIndex,
    ticker: chunk.ticker,
    theme: chunk.theme,
    score: chunk.score,
    display_label: chunk.displayLabel,
    excerpt: chunk.content.slice(0, 300),
    meaningful: true,
    url: chunk.sourceUrl,
    domain: chunk.domain,
    published_at: chunk.publishedAt,
    retrieved_at: chunk.retrievedAt,
  })
  const sources = selectedChunks
    .map((chunk) => (
      chunk.contextOrigin === 'web'
        ? webSourceFromChunk(chunk)
        : localSourceById.get(chunk.id)
    ))
    .filter(Boolean)
  const usedContext = selectedChunks
    .map((chunk) => (
      chunk.contextOrigin === 'web'
        ? webContextFromChunk(chunk)
        : localContextById.get(chunk.id)
    ))
    .filter(Boolean)
  const meaningfulCount = selectedChunks.filter((chunk) => chunk.meaningful).length
  const retrieval = {
    ...localRetrieval,
    chunks: selectedChunks,
    sources,
    usedContext,
    meaningfulCount,
    thinContext: meaningfulCount < 2,
    webSearchEnabled: webRetrieval.enabled,
    webSearchAvailable: webRetrieval.available,
    webSearchQuery: webRetrieval.query,
    notice:
      webRetrieval.enabled && !webRetrieval.available
        ? WEB_UNAVAILABLE_NOTICE
        : null,
  }
  if (!retrieval.chunks.length || retrieval.meaningfulCount === 0) {
    throw new CompanyChatRequestError(
      "I don't have enough Market Maps context to answer this yet. Add verified company context and retry.",
      422,
    )
  }
  const provider = getCompanyChatProvider()
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...input.conversation,
    { role: 'user', content: buildContextMessage(retrieval, input) },
  ]

  return { input, retrieval, provider, messages }
}

export async function runCompanyChat(body, options = {}) {
  const { retrieval, provider, messages } = await prepareCompanyChat(body)

  try {
    const answer = sanitizeCompanyChatAnswer(
      await provider.chat(messages, { signal: options.signal }),
    )

    return {
      answer,
      sources: retrieval.sources,
      used_context: retrieval.usedContext,
      cost_mode: provider.costMode,
      confidence: getConfidence(answer, retrieval.thinContext ? 'Low' : 'Medium'),
      context_quality: retrieval.thinContext ? 'thin' : 'grounded',
      retrieval_notice: retrieval.notice,
      web_search_enabled: retrieval.webSearchEnabled,
      web_search_available: retrieval.webSearchAvailable,
      timestamp: new Date().toISOString(),
    }
  } catch (error) {
    throw mapProviderError(error)
  }
}

export async function runCompanyChatStream(body, options = {}) {
  const { retrieval, provider, messages } = await prepareCompanyChat(body)

  return {
    sources: retrieval.sources,
    used_context: retrieval.usedContext,
    cost_mode: provider.costMode,
    context_quality: retrieval.thinContext ? 'thin' : 'grounded',
    retrieval_notice: retrieval.notice,
    web_search_enabled: retrieval.webSearchEnabled,
    web_search_available: retrieval.webSearchAvailable,
    async *tokens() {
      const sanitizer = createStreamingAnswerSanitizer()
      try {
        for await (const token of provider.streamChat(messages, { signal: options.signal })) {
          const safeToken = sanitizer.push(token)
          if (safeToken) yield safeToken
        }
        const finalToken = sanitizer.flush()
        if (finalToken) yield finalToken
      } catch (error) {
        throw mapProviderError(error)
      }
    },
    finalize(answer) {
      return {
        confidence: getConfidence(answer, retrieval.thinContext ? 'Low' : 'Medium'),
        context_quality: retrieval.thinContext ? 'thin' : 'grounded',
        retrieval_notice: retrieval.notice,
        web_search_enabled: retrieval.webSearchEnabled,
        web_search_available: retrieval.webSearchAvailable,
        timestamp: new Date().toISOString(),
        cost_mode: provider.costMode,
      }
    },
  }
}

export async function warmupCompanyChat(options = {}) {
  const provider = getCompanyChatProvider()
  try {
    return await provider.warmup({ signal: options.signal })
  } catch (error) {
    throw mapProviderError(error)
  }
}
