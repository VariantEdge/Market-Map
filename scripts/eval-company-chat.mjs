import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { evaluateAnswerQuality } from './company-chat-answer-quality.mjs'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const BASE_URL = String(
  process.env.COMPANY_CHAT_BASE_URL || 'http://localhost:5173',
).replace(/\/+$/, '')
const REQUIRE_LIVE = process.env.COMPANY_CHAT_EVAL_REQUIRED === '1'
const evals = JSON.parse(
  await readFile(join(ROOT, 'data', 'evals', 'company-chat-evals.json'), 'utf8'),
)
const bannedPhrases = [
  'according to openai',
  'according to anthropic',
  'according to gemini',
  'hosted inference',
  'paid fallback',
]
const unsupportedPrecisionPatterns = [
  /\$\s?\d[\d,.]*(?:\s?(?:million|billion|m|b))?/i,
  /\b\d+(?:\.\d+)?\s*%\b/,
  /\bmarket share (?:of|is)\s+\d/i,
]

function includesAny(answer, options) {
  const normalized = answer.toLowerCase()
  return options.some((option) => normalized.includes(option.toLowerCase()))
}

let health
try {
  const response = await fetch(`${BASE_URL}/api/company-chat/health`)
  if (!response.ok) throw new Error(`health returned HTTP ${response.status}`)
  health = await response.json()
} catch (error) {
  const message = `Live company-chat eval skipped: ${error.message}. Start the app and Ollama to run it.`
  if (REQUIRE_LIVE) {
    console.error(`FAIL ${message}`)
    process.exit(1)
  }
  console.warn(`SKIP ${message}`)
  process.exit(0)
}

if (!health.ollamaReachable || !health.modelInstalled) {
  const message = 'Live company-chat eval skipped because Ollama or the configured model is unavailable.'
  if (REQUIRE_LIVE) {
    console.error(`FAIL ${message}`)
    process.exit(1)
  }
  console.warn(`SKIP ${message}`)
  process.exit(0)
}
if (
  health.paidProviderEnabled !== false ||
  health.costMode !== 'local_ollama_plus_free_web_retrieval'
) {
  console.error('FAIL Health response does not preserve the zero-cost Ollama-only contract.')
  process.exit(1)
}

const failures = []
for (const evaluation of evals) {
  const started = Date.now()
  const response = await fetch(`${BASE_URL}/api/company-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ticker: evaluation.ticker,
      theme: evaluation.theme,
      layer: evaluation.layer,
      question: evaluation.question,
      conversation: [],
    }),
  })
  const payload = await response.json().catch(() => ({}))
  const answer = String(payload.answer || '')
  const prefix = evaluation.id

  if (!response.ok) failures.push(`${prefix}: HTTP ${response.status} ${payload.error || ''}`)
  if (!answer.trim()) failures.push(`${prefix}: answer is empty`)
  if (!Array.isArray(payload.sources) || !payload.sources.length) {
    failures.push(`${prefix}: sources are missing`)
  }
  if (payload.cost_mode !== 'local_ollama_plus_free_web_retrieval') {
    failures.push(`${prefix}: cost_mode is not local_ollama_plus_free_web_retrieval`)
  }
  if (!['High', 'Medium', 'Low'].includes(payload.confidence)) {
    failures.push(`${prefix}: confidence is missing or invalid`)
  }
  for (const requirement of evaluation.must_include) {
    if (!includesAny(answer, requirement.any_of)) {
      failures.push(`${prefix}: missing concept "${requirement.concept}"`)
    }
  }
  for (const exclusion of evaluation.must_not_include) {
    if (includesAny(answer, exclusion.phrases)) {
      failures.push(`${prefix}: included banned concept "${exclusion.concept}"`)
    }
  }
  for (const phrase of bannedPhrases) {
    if (answer.toLowerCase().includes(phrase)) {
      failures.push(`${prefix}: included banned phrase "${phrase}"`)
    }
  }
  for (const pattern of unsupportedPrecisionPatterns) {
    if (pattern.test(answer)) {
      failures.push(`${prefix}: claimed unsupported numeric precision (${pattern})`)
    }
  }
  if (evaluation.answer_quality) {
    const quality = evaluateAnswerQuality(answer, payload, evaluation.answer_quality)
    for (const failure of quality.failures) {
      failures.push(`${prefix}: ${failure}`)
    }
  }

  console.log(
    `${failures.some((failure) => failure.startsWith(`${prefix}:`)) ? 'FAIL' : 'PASS'} ${prefix}: ${answer.length} chars, ${payload.sources?.length ?? 0} sources, ${payload.confidence || 'no confidence'}, ${Date.now() - started}ms`,
  )
}

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL ${failure}`))
  console.error(`Live company-chat eval failed with ${failures.length} issue(s).`)
  process.exitCode = 1
} else {
  console.log(`Live company-chat eval passed for ${evals.length} golden question(s).`)
}
