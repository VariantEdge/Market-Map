import {
  OllamaModelMissingError,
  OllamaTimeoutError,
  OllamaUnavailableError,
  createOllamaProvider,
} from '../llm/ollama.ts'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const REQUIRED_TAKEAWAY_GROUPS = [
  'Key Financial Results',
  'Business Segment Results',
  'Capital Allocation',
  'Industry Trends and Dynamics',
  'Competitive Landscape',
  'Growth Opportunities and Strategies',
]
const REQUIRED_GUIDANCE_GROUPS = ['Quarterly Guidance', 'Annual Guidance', 'Outlook']
const DEFAULT_TIMEOUT_MS = 600_000
const DEFAULT_PIPELINE_TIMEOUT_MS = 1_800_000
const ENGINE_VERSION = 'earnings-commentary-v10'
const commentaryCache = new Map()

const ANALYST_SYSTEM_PROMPT = `You are a tenured public-equity analyst reviewing one earnings period.
Write for investors, not as a generic summarizer. Consolidate duplicate facts. Preserve every substantive
management answer point and explain why it matters for revenue, margins, estimates and the investment thesis
when the evidence supports that inference. Preserve hard numbers, periods and GAAP/non-GAAP labels exactly.
Distinguish sourced fact from analyst inference. Never invent information, numbers, segments, customers,
competitors or accounting labels. Return only valid JSON matching the requested schema.`

function compactWhitespace(value = '') {
  return String(value).replace(/\s+/g, ' ').trim()
}

function normalizeNumberToken(value = '') {
  return value
    .toLowerCase()
    .replace(/,/g, '')
    .replace(/\b(?:million|billion|thousand)\b/g, (word) => word[0])
    .replace(/\s+/g, '')
}

function numberTokens(value = '') {
  return [...String(value).matchAll(/(?:[$€£¥]\s*)?\d[\d,.]*(?:\.\d+)?\s*(?:%|x|bps?|basis points?|million|billion|thousand|m|bn|shares?)?/gi)]
    .map((match) => normalizeNumberToken(match[0]))
    .filter((token) => token && !/^\d{1,2}$/.test(token))
}

function stripCodeFence(value = '') {
  return String(value)
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

export function parseStructuredJson(value = '') {
  const cleaned = stripCodeFence(value)
  try {
    return JSON.parse(cleaned)
  } catch {
    const objectStart = cleaned.indexOf('{')
    const objectEnd = cleaned.lastIndexOf('}')
    if (objectStart >= 0 && objectEnd > objectStart) {
      return JSON.parse(cleaned.slice(objectStart, objectEnd + 1))
    }
    throw new Error('Local Ollama did not return valid structured JSON.')
  }
}

async function callStructured(provider, messages, label, options = {}) {
  const requestOptions = {
    signal: options.signal,
    maxTokens: options.maxTokens ?? 1800,
    temperature: options.temperature ?? 0.1,
    responseFormat: { type: 'json_object' },
    numCtx: options.numCtx ?? 8192,
    native: true,
  }
  const first = await chatWithRestartRetry(provider, messages, requestOptions)
  try {
    return parseStructuredJson(first)
  } catch (firstError) {
    const repaired = await chatWithRestartRetry(
      provider,
      [
        {
          role: 'system',
          content: 'Repair malformed JSON. Preserve the original meaning. Return only one valid JSON object.',
        },
        {
          role: 'user',
          content: `${label} failed JSON parsing with: ${firstError.message}\n\nMalformed output:\n${first}`,
        },
      ],
      { ...requestOptions, maxTokens: options.repairMaxTokens ?? requestOptions.maxTokens },
    )
    return parseStructuredJson(repaired)
  }
}

async function chatWithRestartRetry(provider, messages, options, attempts = 3) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await provider.chat(messages, options)
    } catch (error) {
      lastError = error
      if (!(error instanceof OllamaUnavailableError) || attempt === attempts) throw error
      await new Promise((resolve) => setTimeout(resolve, attempt * 3000))
    }
  }
  throw lastError
}

function evidenceSourceLabel(source = '') {
  if (/earnings release/i.test(source)) return 'Earnings Release'
  if (/8-k/i.test(source)) return 'SEC 8-K'
  if (/6-k/i.test(source)) return 'SEC 6-K'
  if (/10-q/i.test(source)) return 'SEC 10-Q'
  if (/10-k/i.test(source)) return 'SEC 10-K'
  if (/20-f/i.test(source)) return 'SEC 20-F'
  if (/transcript/i.test(source)) return 'Transcript'
  return source || 'Source'
}

function addEvidence(records, seen, record) {
  const text = compactWhitespace(record.text).slice(0, 280)
  if (!text || text.length < 18) return
  const key = `${record.source}|${text.toLowerCase()}`
  if (seen.has(key)) return
  seen.add(key)
  records.push({
    id: `E${records.length + 1}`,
    text,
    source: evidenceSourceLabel(record.source),
    url: record.url || '',
    speaker: record.speaker || '',
    period: record.period || '',
    accountingBasis: record.accountingBasis || detectAccountingBasis(text),
    numbers: numberTokens(text),
  })
}

function sourceSentences(text = '') {
  return String(text)
    .replace(/\s+/g, ' ')
    .split(/\s*\|\|\s*|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map(compactWhitespace)
    .filter((sentence) =>
      sentence.length >= 28 &&
      sentence.length <= 900 &&
      (
        numberTokens(sentence).length ||
        /\bsegment|guidance|outlook|backlog|bookings|revenue|margin|income|earnings|EPS|EBIT|EBITDA|capex|capital expenditures|cash flow|capacity|demand|customer|competition|market share|product\b/i.test(sentence)
      )
    )
}

export function detectAccountingBasis(text = '') {
  if (/\bnon-gaap\b|\badjusted\b/i.test(text)) return 'non-GAAP'
  if (/\bgaap\b/i.test(text)) return 'GAAP'
  return 'unspecified'
}

export function extractDeterministicEvidence(input) {
  const records = []
  const seen = new Set()
  const transcriptUrl = input.transcript?.transcriptUrl || input.deterministic?.sources?.transcript || ''

  for (const document of input.evidenceDocuments ?? []) {
    for (const sentence of sourceSentences(document.text).slice(0, 3)) {
      addEvidence(records, seen, {
        text: sentence,
        source: document.source,
        url: document.url,
        period: input.transcript?.quarter,
      })
    }
  }

  for (const group of input.deterministic?.sections?.takeaways ?? []) {
    for (const item of group.items ?? []) {
      addEvidence(records, seen, {
        text: item.text,
        source: item.source,
        url: item.url,
        period: input.transcript?.quarter,
      })
    }
  }

  for (const group of input.deterministic?.sections?.guidance ?? []) {
    for (const item of group.items ?? []) {
      addEvidence(records, seen, {
        text: item.text,
        source: item.source,
        url: item.url,
        period: group.group,
      })
    }
  }

  const transcriptSentences = String(input.transcript?.transcriptText ?? '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .filter((sentence) =>
      sentence.length >= 35 &&
      sentence.length <= 900 &&
      (numberTokens(sentence).length || /\bbacklog|bookings|demand|capacity|segment|competitive|outlook|guidance|margin|revenue|capex|cash flow|CPO|OCS|transceiver|indium phosphide\b/i.test(sentence))
    )

  for (const sentence of transcriptSentences.slice(0, 50)) {
    addEvidence(records, seen, {
      text: sentence,
      source: 'Transcript',
      url: transcriptUrl,
      period: input.transcript?.quarter,
    })
  }

  return records.slice(0, 35)
}

function serializeExchange(exchange) {
  return {
    sequence: exchange.sequence,
    analyst: exchange.speaker,
    firm: exchange.firm,
    question: exchange.text,
    executiveResponses: (exchange.answerBlocks ?? []).map((block) => ({
      speaker: block.speaker,
      role: block.role,
      text: block.text,
    })),
  }
}

export async function summarizeQnaExchange(exchange, provider, options = {}) {
  const payload = serializeExchange(exchange)
  const result = await callStructured(
    provider,
    [
      { role: 'system', content: ANALYST_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Analyze this complete Q&A exchange. The question may contain a follow-up and the response
may contain multiple executives. Capture every substantive answer point, including timing, dependencies,
qualifications and investor significance. Do not merely shorten the first response.

Return:
{
  "sequence": number,
  "answer_points": [
    {
      "point": "faithful concise summary",
      "speaker": "executive name",
      "investor_significance": "supported implication or empty string",
      "accounting_basis": "GAAP | non-GAAP | unspecified"
    }
  ]
}
Use at most 5 answer points. Keep each point under 45 words and each investor significance under 25 words.

Exchange:
${JSON.stringify(payload)}`,
      },
    ],
    `Q&A exchange ${exchange.sequence}`,
    { ...options, maxTokens: 340, numCtx: 6144 },
  )

  return {
    sequence: exchange.sequence,
    answerPoints: (result.answer_points ?? [])
      .map((item) => ({
        point: compactWhitespace(item.point),
        speaker: compactWhitespace(item.speaker),
        investorSignificance: compactWhitespace(item.investor_significance),
        accountingBasis: item.accounting_basis || 'unspecified',
      }))
      .filter((item) => item.point),
  }
}

function evidenceForPrompt(evidence) {
  return evidence.map((item) => ({
    id: item.id,
    text: item.text,
    source: item.source,
    speaker: item.speaker,
    accounting_basis: item.accountingBasis,
  }))
}

function benchmarkForPrompt(deterministic) {
  return {
    takeawayGroups: (deterministic.sections?.takeaways ?? []).map((group) => ({
      group: group.group,
      benchmarkSubjects: (group.items ?? []).slice(0, 2).map((item) => item.subject || item.label || ''),
    })),
    guidanceGroups: (deterministic.sections?.guidance ?? []).map((group) => group.group),
    topicLabels: (deterministic.topics ?? []).map((topic) => topic.label),
  }
}

function compactQnaForSynthesis(qnaAnalyses = []) {
  return qnaAnalyses.map((analysis) => ({
    sequence: analysis.sequence,
    answerPoints: (analysis.answerPoints ?? []).slice(0, 3).map((point) => ({
      point: compactWhitespace(point.point).slice(0, 180),
      investorSignificance: compactWhitespace(point.investorSignificance).slice(0, 120),
    })),
  }))
}

async function cachedSynthesisPart(options, stage, generate) {
  if (!options.skipCache && options.cacheKey) {
    const cached = await readStageCache(options.cacheKey, stage)
    if (cached) return cached
  }
  const result = await generate()
  if (!options.skipCache && options.cacheKey) {
    await writeStageCache(options.cacheKey, stage, result)
  }
  return result
}

async function synthesizeCommentary(input, evidence, qnaAnalyses, provider, options = {}) {
  const sourceEvidence = JSON.stringify(evidenceForPrompt(evidence))
  const qnaInsights = JSON.stringify(compactQnaForSynthesis(qnaAnalyses))
  const benchmark = benchmarkForPrompt(input.deterministic)
  const takeaways = []

  for (const groupName of REQUIRED_TAKEAWAY_GROUPS) {
    const benchmarkGroup = benchmark.takeawayGroups.find((group) => group.group === groupName)
    const result = await cachedSynthesisPart(
      options,
      `synthesis-takeaway-${groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      () => callStructured(
        provider,
        [
          { role: 'system', content: ANALYST_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Build only the "${groupName}" section for ${input.ticker} ${input.transcript.quarter}.
Use the company's reported segment definitions. Consolidate duplicate facts. Preserve hard numbers and
GAAP/non-GAAP labels. Cite evidence_ids. Use 2-4 dense investor-relevant items.
Return {"group":"${groupName}","description":"...","items":[{"subject":"...","text":"...","evidence_ids":["E1"],"fact_or_inference":"fact | inference"}]}.
Benchmark subjects: ${JSON.stringify(benchmarkGroup?.benchmarkSubjects ?? [])}
Q&A insights: ${qnaInsights}
Evidence: ${sourceEvidence}`,
          },
        ],
        `${groupName} synthesis`,
        { ...options, maxTokens: 620, repairMaxTokens: 620, numCtx: 8192 },
      ),
    )
    takeaways.push(result)
  }

  const guidanceResult = await cachedSynthesisPart(
    options,
    'synthesis-guidance',
    () => callStructured(
      provider,
      [
        { role: 'system', content: ANALYST_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Build guidance and outlook for ${input.ticker} ${input.transcript.quarter}.
Preserve every hard number and period. Explicitly retain GAAP/non-GAAP labels. Do not include tax rate.
Return {"guidance":[{"group":"Quarterly Guidance | Annual Guidance | Outlook","description":"...","items":[{"label":"metric label","subject":"outlook subject or empty","text":"...","evidence_ids":["E1"]}]}]}.
Return all three required groups, using a clear not-provided item when necessary.
Evidence: ${sourceEvidence}`,
        },
      ],
      'guidance synthesis',
      { ...options, maxTokens: 800, repairMaxTokens: 800, numCtx: 8192 },
    ),
  )

  const topicsResult = await cachedSynthesisPart(
    options,
    'synthesis-topics',
    () => callStructured(
      provider,
      [
        { role: 'system', content: ANALYST_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Rank 6-10 quarter-specific investor topics for ${input.ticker} ${input.transcript.quarter}.
Avoid generic labels. Use 1-2 sourced points per topic and explain why each matters to revenue, margins,
estimates or thesis when supported.
Return {"topics":[{"label":"...","items":[{"text":"...","evidence_ids":["E1"],"fact_or_inference":"fact | inference"}]}]}.
Benchmark labels: ${JSON.stringify(benchmark.topicLabels)}
Q&A insights: ${qnaInsights}
Evidence: ${sourceEvidence}`,
        },
      ],
      'topics synthesis',
      { ...options, maxTokens: 900, repairMaxTokens: 900, numCtx: 8192 },
    ),
  )

  return {
    takeaways,
    guidance: guidanceResult.guidance ?? [],
    topics: topicsResult.topics ?? [],
  }
}

async function verifyCommentary(input, draft, evidence, provider, options = {}) {
  return callStructured(
    provider,
    [
      {
        role: 'system',
        content: `${ANALYST_SYSTEM_PROMPT}
You are now the verification analyst. Remove or correct any claim that is not supported by its cited
evidence. Catch omitted Q&A points, duplicate bullets, wrong segment definitions, unsupported numbers,
period mistakes and missing GAAP/non-GAAP labels. Do not improve prose by adding new facts.`,
      },
      {
        role: 'user',
        content: `Verify this ${input.ticker} ${input.transcript.quarter} commentary against the evidence.
If no correction is needed, use null for commentary instead of repeating it.
Return {
  "approved": boolean,
  "commentary": <corrected object in the identical schema, or null>,
  "issues_fixed": ["..."]
}.

Draft:
${JSON.stringify(draft)}

Evidence:
${JSON.stringify(evidenceForPrompt(evidence))}`,
      },
    ],
    'earnings commentary verification',
    { ...options, maxTokens: 650, repairMaxTokens: 650, numCtx: 8192 },
  )
}

function evidenceById(evidence) {
  return new Map(evidence.map((item) => [item.id, item]))
}

function itemSource(item, evidenceMap, fallbackSource = 'Transcript', fallbackUrl = '') {
  const cited = (item.evidence_ids ?? [])
    .map((id) => evidenceMap.get(id))
    .filter(Boolean)
  const source = cited[0]
  return {
    source: source?.source || fallbackSource,
    url: source?.url || fallbackUrl,
    citedText: cited.map((entry) => entry.text).join(' '),
  }
}

function unsupportedNumbers(text, citedText) {
  if (!text) return []
  const supported = new Set(numberTokens(citedText))
  return numberTokens(text).filter((token) => !supported.has(token))
}

const EVIDENCE_STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'and', 'because', 'been', 'being', 'between',
  'company', 'could', 'from', 'into', 'investor', 'investors', 'more', 'quarter', 'revenue',
  'said', 'that', 'their', 'there', 'these', 'they', 'this', 'through', 'under', 'with', 'would',
])

function evidenceTerms(text = '') {
  return new Set(
    compactWhitespace(text)
      .toLowerCase()
      .replace(/[^a-z0-9.-]+/g, ' ')
      .split(' ')
      .filter((term) => term.length >= 4 && !EVIDENCE_STOPWORDS.has(term))
  )
}

function hasEvidenceSupport(item, text, citedText) {
  if (item.fact_or_inference === 'inference') return Boolean(citedText)
  if (!citedText || !(item.evidence_ids ?? []).length) return false
  const claimTerms = [...evidenceTerms(text)]
  if (!claimTerms.length) return true
  const sourceTerms = evidenceTerms(citedText)
  const overlap = claimTerms.filter((term) => sourceTerms.has(term)).length
  return overlap >= Math.min(2, claimTerms.length)
}

function requiresAccountingLabel(text = '') {
  return /\bEPS|earnings per share|gross margin|operating margin|operating income|EBITDA|EBIT|net income\b/i.test(text)
}

function missingAccountingLabel(text = '', citedText = '') {
  const sourceBasis = detectAccountingBasis(citedText)
  if (!requiresAccountingLabel(text) || sourceBasis === 'unspecified') return false
  return sourceBasis === 'non-GAAP'
    ? !/\bnon-gaap\b|\badjusted\b/i.test(text)
    : !/\bgaap\b/i.test(text)
}

function normalizeGeneratedItem(item, evidenceMap, fallbackSource, fallbackUrl) {
  const text = compactWhitespace(item?.text)
  if (!text) return null
  const sourceInfo = itemSource(item, evidenceMap, fallbackSource, fallbackUrl)
  if (!hasEvidenceSupport(item, text, sourceInfo.citedText)) return null
  if (unsupportedNumbers(text, sourceInfo.citedText).length) return null
  if (missingAccountingLabel(text, sourceInfo.citedText)) return null
  return {
    ...(item.label ? { label: compactWhitespace(item.label) } : {}),
    ...(item.subject ? { subject: compactWhitespace(item.subject) } : {}),
    text,
    source: sourceInfo.source,
    ...(sourceInfo.url ? { url: sourceInfo.url } : {}),
  }
}

function normalizedGroups(groups, requiredGroups, evidenceMap, fallbackGroups, fallbackUrl) {
  return requiredGroups.map((groupName) => {
    const generated = (groups ?? []).find((group) => group.group === groupName)
    const fallback = (fallbackGroups ?? []).find((group) => group.group === groupName)
    const items = (generated?.items ?? [])
      .map((item) => normalizeGeneratedItem(item, evidenceMap, 'Transcript', fallbackUrl))
      .filter(Boolean)
    return {
      group: groupName,
      description: compactWhitespace(generated?.description || fallback?.description || ''),
      items: items.length ? dedupeItems(items) : (fallback?.items ?? []),
    }
  })
}

export function dedupeItems(items = []) {
  const seen = new Set()
  return items.filter((item) => {
    const normalized = compactWhitespace(item.text)
      .toLowerCase()
      .replace(/[^a-z0-9%$]+/g, ' ')
    const signature = normalized.split(' ').filter(Boolean).slice(0, 14).join(' ')
    if (!signature || seen.has(signature)) return false
    seen.add(signature)
    return true
  })
}

function mergeGuidanceWithDeterministic(generated, fallback) {
  const merged = [...generated]
  for (const item of fallback ?? []) {
    const numbers = numberTokens(item.text)
    const alreadyCovered = merged.some((candidate) => {
      const candidateNumbers = new Set(numberTokens(candidate.text))
      return numbers.length
        ? numbers.every((number) => candidateNumbers.has(number))
        : compactWhitespace(candidate.text).toLowerCase() === compactWhitespace(item.text).toLowerCase()
    })
    if (!alreadyCovered) merged.push(item)
  }
  return dedupeItems(merged)
}

function normalizedGuidanceGroups(groups, evidenceMap, fallbackGroups, fallbackUrl) {
  return REQUIRED_GUIDANCE_GROUPS.map((groupName) => {
    const generated = (groups ?? []).find((group) => group.group === groupName)
    const fallback = (fallbackGroups ?? []).find((group) => group.group === groupName)
    const generatedItems = (generated?.items ?? [])
      .map((item) => normalizeGeneratedItem(item, evidenceMap, 'Transcript', fallbackUrl))
      .filter(Boolean)
    return {
      group: groupName,
      description: compactWhitespace(generated?.description || fallback?.description || ''),
      items: mergeGuidanceWithDeterministic(generatedItems, fallback?.items ?? []),
    }
  })
}

function normalizeTopics(topics, evidenceMap, fallbackTopics, fallbackUrl) {
  const normalized = (topics ?? [])
    .map((topic) => ({
      label: compactWhitespace(topic.label),
      items: dedupeItems(
        (topic.items ?? [])
          .map((item) => normalizeGeneratedItem(item, evidenceMap, 'Transcript', fallbackUrl))
          .filter(Boolean)
      ),
    }))
    .filter((topic) => topic.label && topic.items.length)
    .slice(0, 10)

  return normalized.length >= 6 ? normalized : fallbackTopics
}

export function validateGeneratedCommentary(draft, evidence, deterministic) {
  const evidenceMap = evidenceById(evidence)
  const transcriptUrl = deterministic.sources?.transcript || ''
  return {
    takeaways: normalizedGroups(
      draft.takeaways,
      REQUIRED_TAKEAWAY_GROUPS,
      evidenceMap,
      deterministic.sections?.takeaways,
      transcriptUrl,
    ),
    guidance: normalizedGuidanceGroups(
      draft.guidance,
      evidenceMap,
      deterministic.sections?.guidance,
      transcriptUrl,
    ),
    topics: normalizeTopics(draft.topics, evidenceMap, deterministic.topics, transcriptUrl),
  }
}

function normalizeAuditTerms(text = '') {
  return [...evidenceTerms(text)].filter((term) => !/^\d/.test(term))
}

function answerBlockCovered(block, points) {
  const blockTerms = normalizeAuditTerms(block.text)
  if (!blockTerms.length) return true
  const pointTerms = new Set(normalizeAuditTerms(
    points.map((point) => `${point.point} ${point.investorSignificance}`).join(' ')
  ))
  return blockTerms.filter((term) => pointTerms.has(term)).length >= Math.min(3, blockTerms.length)
}

function isSubstantiveAnswerBlock(block = {}) {
  const text = compactWhitespace(block.text)
  return Boolean(
    text &&
    !/^(?:thanks|thank you|got it|great|okay|sure|yep|yeah|yes|no|oh,?\s+yeah|all right|appreciate it|good question)\.?$/i.test(text)
  )
}

function mergeQna(deterministicQna, analyses) {
  const analysisBySequence = new Map(analyses.map((analysis) => [analysis.sequence, analysis]))
  return deterministicQna.map((item) => {
    const analysis = analysisBySequence.get(item.sequence)
    const points = analysis?.answerPoints ?? []
    if (!points.length) return item
    return {
      ...item,
      answerSummary: points
        .map((point) => point.investorSignificance
          ? `${point.point} Investor significance: ${point.investorSignificance}`
          : point.point)
        .join('; '),
      answerSpeakers: [...new Set(points.map((point) => point.speaker).filter(Boolean))],
    }
  })
}

export function validateQnaAnalyses(analyses = [], exchanges = []) {
  const exchangeBySequence = new Map(exchanges.map((exchange) => [exchange.sequence, exchange]))
  return analyses.map((analysis) => {
    const exchange = exchangeBySequence.get(analysis.sequence)
    if (!exchange) return { sequence: analysis.sequence, answerPoints: [] }
    const sourceText = (exchange.answerBlocks ?? []).map((block) => block.text).join(' ')
    const sourceBasis = detectAccountingBasis(sourceText)
    const rawPoints = analysis.answerPoints ?? analysis.answer_points ?? []
    const answerPoints = rawPoints
      .map((point) => ({
        point: compactWhitespace(point.point),
        speaker: compactWhitespace(point.speaker),
        investorSignificance: compactWhitespace(
          point.investorSignificance ?? point.investor_significance,
        ),
        accountingBasis: point.accountingBasis ?? point.accounting_basis ?? 'unspecified',
      }))
      .filter((point) => point.point)
      .filter((point) => !unsupportedNumbers(
        `${point.point} ${point.investorSignificance}`,
        sourceText,
      ).length)
      .filter((point) => {
        if (!requiresAccountingLabel(point.point) || sourceBasis === 'unspecified') return true
        return sourceBasis === 'non-GAAP'
          ? /\bnon-gaap\b|\badjusted\b/i.test(point.point)
          : /\bgaap\b/i.test(point.point)
      })
    for (const block of (exchange.answerBlocks ?? []).filter(isSubstantiveAnswerBlock)) {
      if (answerBlockCovered(block, answerPoints)) continue
      answerPoints.push({
        point: compactWhitespace(block.text),
        speaker: block.speaker || '',
        investorSignificance: '',
        accountingBasis: detectAccountingBasis(block.text),
      })
    }
    return { sequence: analysis.sequence, answerPoints }
  })
}

function duplicateItemCount(groups = []) {
  let duplicates = 0
  for (const group of groups) {
    const seen = new Set()
    for (const item of group.items ?? []) {
      const key = compactWhitespace(item.text).toLowerCase().replace(/[^a-z0-9]+/g, ' ')
      if (seen.has(key)) duplicates += 1
      seen.add(key)
    }
  }
  return duplicates
}

function guidanceNumbers(groups = []) {
  return new Set(
    groups
      .flatMap((group) => group.items ?? [])
      .flatMap((item) => numberTokens(item.text))
  )
}

export function auditEarningsCommentary(result, input) {
  const takeaways = result.sections?.takeaways ?? []
  const guidance = result.sections?.guidance ?? []
  const qna = result.sections?.qna ?? []
  const takeawayGroups = new Set(takeaways.map((group) => group.group))
  const guidanceGroups = new Set(guidance.map((group) => group.group))
  const qnaBySequence = new Map(qna.map((item) => [item.sequence, item]))
  const missingQnaCoverage = []
  const missingQnaBlocks = []

  for (const exchange of input.qnaExchanges ?? []) {
    const item = qnaBySequence.get(exchange.sequence)
    const points = String(item?.answerSummary ?? '')
      .split(/;\s+/)
      .filter(Boolean)
      .map((point) => ({ point, investorSignificance: '' }))
    const uncovered = (exchange.answerBlocks ?? [])
      .filter(isSubstantiveAnswerBlock)
      .filter((block) => !answerBlockCovered(block, points))
    if (!item?.answerSummary || uncovered.length) {
      missingQnaCoverage.push(exchange.sequence)
      missingQnaBlocks.push({
        sequence: exchange.sequence,
        blocks: uncovered.map((block) => ({
          speaker: block.speaker,
          text: compactWhitespace(block.text).slice(0, 800),
        })),
        summary: compactWhitespace(item?.answerSummary).slice(0, 1600),
      })
    }
  }

  const expectedGuidanceNumbers = guidanceNumbers(input.deterministic.sections?.guidance)
  const actualGuidanceNumbers = guidanceNumbers(guidance)
  const missingGuidanceNumbers = [...expectedGuidanceNumbers]
    .filter((number) => !actualGuidanceNumbers.has(number))
  const checks = {
    completeQna: qna.length === (input.qnaExchanges?.length ?? 0) && !missingQnaCoverage.length,
    financialGroups: REQUIRED_TAKEAWAY_GROUPS.every((group) => takeawayGroups.has(group)),
    accountingLabels: takeaways
      .flatMap((group) => group.items ?? [])
      .concat(guidance.flatMap((group) => group.items ?? []))
      .every((item) => {
        if (!requiresAccountingLabel(item.text)) return true
        const basis = detectAccountingBasis(item.text)
        return basis !== 'unspecified' || !/\badjusted|non-gaap|gaap\b/i.test(item.label ?? '')
      }),
    guidanceCoverage: REQUIRED_GUIDANCE_GROUPS.every((group) => guidanceGroups.has(group)) && !missingGuidanceNumbers.length,
    topicQuality: result.topics?.length >= 6 && result.topics?.length <= 10 &&
      result.topics.every((topic) => topic.label && topic.items?.length),
    noDuplicates: duplicateItemCount(takeaways) === 0 &&
      duplicateItemCount(guidance) === 0 &&
      duplicateItemCount(result.topics) === 0,
    quarterIdentity: result.selectedPeriodId === input.transcript.id &&
      result.fiscalQuarter === input.transcript.quarter,
  }

  return {
    passed: Object.values(checks).every(Boolean),
    checks,
    details: {
      missingQnaCoverage,
      missingQnaBlocks,
      missingGuidanceNumbers,
    },
  }
}

export function buildEarningsCacheKey(input) {
  const transcript = input.transcript
  return [
    ENGINE_VERSION,
    input.ticker,
    transcript.id,
    transcript.transcriptUrl,
    transcript.transcriptText?.length ?? 0,
    input.qnaExchanges?.length ?? 0,
  ].join('|')
}

export function clearEarningsCommentaryCache() {
  commentaryCache.clear()
}

function diskCachePath(key) {
  const hash = createHash('sha256').update(key).digest('hex')
  return join(process.cwd(), '.cache', 'earnings-commentary', `${hash}.json`)
}

function stageCachePath(key, stage) {
  const hash = createHash('sha256').update(`${key}|${stage}`).digest('hex')
  return join(process.cwd(), '.cache', 'earnings-commentary', 'stages', `${hash}.json`)
}

async function readDiskCache(key) {
  try {
    return JSON.parse(await readFile(diskCachePath(key), 'utf8'))
  } catch {
    return null
  }
}

async function writeDiskCache(key, value) {
  try {
    const path = diskCachePath(key)
    await mkdir(join(process.cwd(), '.cache', 'earnings-commentary'), { recursive: true })
    await writeFile(path, JSON.stringify(value), 'utf8')
  } catch {
    // In-memory caching remains available in read-only or serverless environments.
  }
}

async function readStageCache(key, stage) {
  try {
    return JSON.parse(await readFile(stageCachePath(key, stage), 'utf8'))
  } catch {
    return null
  }
}

async function writeStageCache(key, stage, value) {
  try {
    const directory = join(process.cwd(), '.cache', 'earnings-commentary', 'stages')
    await mkdir(directory, { recursive: true })
    await writeFile(stageCachePath(key, stage), JSON.stringify(value), 'utf8')
  } catch {
    // Stage caching is an optimization; deterministic fallback remains available.
  }
}

export function shouldEnhanceEarningsCommentary(input) {
  if (String(process.env.EARNINGS_COMMENTARY_OLLAMA_ENABLED ?? 'true').toLowerCase() === 'false') return false
  return Boolean(
    input.ticker &&
    input.transcript?.id &&
    input.transcript?.transcriptText &&
    input.qnaExchanges?.length
  )
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}

export async function enhanceEarningsCommentary(input, options = {}) {
  if (!shouldEnhanceEarningsCommentary(input)) {
    options.onStatus?.({ status: 'not_applicable' })
    return input.deterministic
  }

  const key = buildEarningsCacheKey(input)
  if (!options.skipCache && commentaryCache.has(key)) {
    options.onStatus?.({ status: 'cache_memory' })
    return commentaryCache.get(key)
  }
  if (!options.skipCache) {
    const cached = await readDiskCache(key)
    if (cached) {
      commentaryCache.set(key, cached)
      options.onStatus?.({ status: 'cache_disk' })
      return cached
    }
  }
  options.onStatus?.({ status: 'running' })

  const provider = options.provider ?? createOllamaProvider({
    timeoutMs: options.timeoutMs ?? (
      Number(process.env.EARNINGS_COMMENTARY_OLLAMA_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS
    ),
  })
  const controller = new AbortController()
  const abortFromCaller = () => controller.abort(options.signal?.reason)
  if (options.signal?.aborted) abortFromCaller()
  else options.signal?.addEventListener('abort', abortFromCaller, { once: true })
  const pipelineTimeout = setTimeout(
    () => controller.abort(new Error('Earnings commentary pipeline timeout')),
    options.pipelineTimeoutMs ?? (
      Number(process.env.EARNINGS_COMMENTARY_PIPELINE_TIMEOUT_MS) || DEFAULT_PIPELINE_TIMEOUT_MS
    ),
  )
  const runOptions = { ...options, signal: controller.signal }

  try {
    const qnaAnalyses = await mapWithConcurrency(
      input.qnaExchanges ?? [],
      Math.max(1, Number(options.qnaConcurrency ?? process.env.EARNINGS_COMMENTARY_QNA_CONCURRENCY ?? 1)),
      async (exchange) => {
      const stage = `qna-${exchange.sequence}`
      if (!options.skipCache) {
        const cached = await readStageCache(key, stage)
        if (cached) return cached
      }
      try {
        const analysis = await summarizeQnaExchange(exchange, provider, runOptions)
        if (!options.skipCache) await writeStageCache(key, stage, analysis)
        return analysis
      } catch (error) {
        if (
          error instanceof OllamaUnavailableError ||
          error instanceof OllamaModelMissingError ||
          error instanceof OllamaTimeoutError
        ) {
          throw error
        }
        return {
          sequence: exchange.sequence,
          answerPoints: exchange.answerSummary
            ? [{ point: exchange.answerSummary, speaker: exchange.answerSpeakers?.join(', ') || '', investorSignificance: '' }]
            : [],
        }
      }
    })

    const evidence = extractDeterministicEvidence(input)
    let draft = !options.skipCache ? await readStageCache(key, 'synthesis') : null
    if (!draft) {
      draft = await synthesizeCommentary(input, evidence, qnaAnalyses, provider, {
        ...runOptions,
        cacheKey: key,
      })
      if (!options.skipCache) await writeStageCache(key, 'synthesis', draft)
    }
    let verification = !options.skipCache ? await readStageCache(key, 'verification') : null
    if (!verification) {
      verification = await verifyCommentary(input, draft, evidence, provider, runOptions)
      if (!options.skipCache) await writeStageCache(key, 'verification', verification)
    }
    const verifiedQna = validateQnaAnalyses(
      qnaAnalyses,
      input.qnaExchanges,
    )
    const validated = validateGeneratedCommentary(
      verification.commentary ?? draft,
      evidence,
      input.deterministic,
    )
    const result = {
      ...input.deterministic,
      topics: validated.topics,
      sections: {
        takeaways: validated.takeaways,
        qna: mergeQna(input.deterministic.sections.qna, verifiedQna),
        guidance: validated.guidance,
      },
    }
    commentaryCache.set(key, result)
    if (!options.skipCache) await writeDiskCache(key, result)
    options.onStatus?.({ status: 'completed' })
    return result
  } catch (error) {
    options.onStatus?.({
      status: 'fallback',
      error: error?.message || String(error),
      code: error?.code || '',
    })
    return input.deterministic
  } finally {
    clearTimeout(pipelineTimeout)
    options.signal?.removeEventListener('abort', abortFromCaller)
  }
}
