import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createOllamaProvider,
  OllamaModelMissingError,
  OllamaTimeoutError,
  OllamaUnavailableError,
} from '../server/llm/ollama.ts'
import {
  buildCompanyChatHealth,
  getCompanyChatHealthFallback,
} from '../server/llm/index.ts'
import {
  COMPANY_CONTEXT_HEADINGS,
  THEME_CONTEXT_HEADINGS,
  validateContextMarkdown,
} from '../server/retrieval/contextSchema.ts'
import { retrieveCompanyContext } from '../server/retrieval/companyContext.ts'
import { extractReadableText } from '../server/web/extractReadableText.ts'
import { createSearxngProvider } from '../server/search/searxng.ts'
import {
  buildWebSearchQuery,
  buildWebSearchQueries,
  classifyWebSource,
  isAnalyticalInvestmentQuestion,
  retrieveWebContext,
  scoreWebResult,
} from '../server/retrieval/webContext.ts'
import {
  createStreamingAnswerSanitizer,
  prioritizeCompanyChatChunks,
  sanitizeCompanyChatAnswer,
} from '../server/companyChat.ts'
import { evaluateAnswerQuality } from '../scripts/company-chat-answer-quality.mjs'

const ROOT = fileURLToPath(new URL('../', import.meta.url))

function response(body, init = {}) {
  return new Response(body, init)
}

test('Ollama provider reports a missing local model cleanly', async () => {
  const provider = createOllamaProvider({
    fetchImpl: async () => response('model not found', { status: 404 }),
  })

  await assert.rejects(
    provider.chat([{ role: 'user', content: 'hello' }]),
    (error) => {
      assert.ok(error instanceof OllamaModelMissingError)
      assert.equal(
        error.message,
        'Local model is not installed. Run ollama pull qwen2.5:7b-instruct.',
      )
      return true
    },
  )
})

test('Ollama provider reports a stopped local server cleanly', async () => {
  const provider = createOllamaProvider({
    fetchImpl: async () => {
      const error = new TypeError('fetch failed')
      error.cause = { code: 'ECONNREFUSED' }
      throw error
    },
  })

  await assert.rejects(
    provider.chat([{ role: 'user', content: 'hello' }]),
    (error) => {
      assert.ok(error instanceof OllamaUnavailableError)
      assert.equal(error.message, 'Local model is not running. Start Ollama and retry.')
      return true
    },
  )
})

test('Ollama provider returns the product timeout message', async () => {
  const provider = createOllamaProvider({
    timeoutMs: 10,
    fetchImpl: async (_url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(
        new DOMException('Aborted', 'AbortError'),
      ), { once: true })
    }),
  })

  await assert.rejects(
    provider.chat([{ role: 'user', content: 'hello' }]),
    (error) => {
      assert.ok(error instanceof OllamaTimeoutError)
      assert.equal(error.message, 'Local model took too long. Retry or use a smaller model.')
      return true
    },
  )
})

test('Ollama stream yields tokens and preserves zero-cost mode', async () => {
  const encoder = new TextEncoder()
  const provider = createOllamaProvider({
    fetchImpl: async () => response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":" locally"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }),
  })

  let answer = ''
  for await (const token of provider.streamChat([{ role: 'user', content: 'hello' }])) {
    answer += token
  }

  assert.equal(answer, 'Hello locally')
  assert.equal(provider.costMode, 'local_ollama_plus_free_web_retrieval')
})

test('Ollama stream flushes a final unterminated SSE frame', async () => {
  const encoder = new TextEncoder()
  const provider = createOllamaProvider({
    fetchImpl: async () => response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"final token"}}]}'))
        controller.close()
      },
    }), { status: 200 }),
  })

  let answer = ''
  for await (const token of provider.streamChat([{ role: 'user', content: 'hello' }])) answer += token
  assert.equal(answer, 'final token')
})

test('company chat removes retrieval mechanics from completed answers', () => {
  const answer = sanitizeCompanyChatAnswer(`
    Evidence from Market Maps context:
    According to the retrieved context [C4], capacity conversion matters [6].
    The provided context points to revenue and margin risk, as mentioned in the research material.

    In summary, this repeats the same conclusion.
  `)

  assert.doesNotMatch(answer, /\[(?:C)?\d+\]/)
  assert.doesNotMatch(answer, /retrieved context|provided context|Evidence from Market Maps/i)
  assert.doesNotMatch(answer, /research material|In summary/i)
  assert.match(answer, /capacity conversion matters/)
  assert.match(answer, /revenue and margin risk/)
})

test('COHR bull-case quality eval rejects shallow answers', () => {
  const rules = {
    min_words: 150,
    reject_generic_bullet_list: true,
    reject_raw_context_ids: true,
    reject_direct_answer_start: true,
    reject_market_maps_evidence_heading: true,
    require_first_order: true,
    require_second_order: true,
    require_financial_transmission: true,
    require_web_source_cards_when_available: true,
  }
  const shallow = `Direct answer
Evidence from Market Maps context [C4]:
- Demand could slow and hurt the stock because demand is important.
- Margins could decline and investors could become less optimistic.
- Execution could disappoint and valuation could fall.
- Competition could increase and estimates could move lower.`
  const result = evaluateAnswerQuality(shallow, {
    web_search_available: true,
    sources: [{ label: 'COHR.md', source_quality: 'local_context' }],
  }, rules)

  assert.equal(result.passed, false)
  assert.ok(result.failures.some((failure) => failure.includes('under 150 words')))
  assert.ok(result.failures.includes('answer is only a generic bullet list'))
  assert.ok(result.failures.includes('answer includes a raw context ID'))
  assert.ok(result.failures.includes('answer starts with "Direct answer"'))
  assert.ok(result.failures.includes('answer exposes the Market Maps context heading'))
  assert.ok(result.failures.includes('answer does not explain first-order impact'))
  assert.ok(result.failures.includes('answer does not explain second-order impact'))
  assert.ok(result.failures.includes('answer has no clickable web source cards'))
})

test('COHR bull-case quality eval requires every financial transmission channel', () => {
  const answer = `${'The first-order impact is slower shipment conversion and weaker revenue. '.repeat(24)}
The second-order impact is lower margins and estimate revisions. Confidence: Medium.`
  const result = evaluateAnswerQuality(answer, {
    web_search_available: false,
    sources: [],
  }, {
    min_words: 150,
    require_first_order: true,
    require_second_order: true,
    require_financial_transmission: true,
  })

  assert.equal(result.passed, false)
  assert.ok(result.failures.some((failure) => failure.includes('multiple')))
  assert.ok(result.failures.some((failure) => failure.includes('investor perception')))
})

test('COHR bull-case quality eval recognizes a causal second-order explanation', () => {
  const answer = `${'The first-order impact is delayed shipments and weaker revenue with pressure on margins. '.repeat(18)}
Secondly, execution delays could weaken competitive position, raise capital intensity, reset market expectations, and compress the valuation multiple. Estimate revisions and investor perception would follow.`
  const result = evaluateAnswerQuality(answer, {
    web_search_available: false,
    sources: [],
  }, {
    min_words: 150,
    require_first_order: true,
    require_second_order: true,
    require_financial_transmission: true,
  })

  assert.equal(result.passed, true, result.failures.join('; '))
})

test('COHR bull-case quality eval passes a sourced causal answer', () => {
  const answer = `The bull case depends on Coherent converting AI-driven optical demand and new capacity into qualified shipments, recognized revenue, and expanding margins. The actual break point would be a persistent gap between installed capacity and customer-qualified shipment growth, because that would show the demand narrative is not translating into earnings power.

The first-order impact would appear in revenue conversion. Product qualification or ramp delays would defer shipments and recognized revenue while manufacturing costs continue to run through the income statement. Underutilized capacity and weaker product mix would pressure gross margins, making the earnings shortfall larger than the revenue miss alone.

The second-order impact would be a reset to estimates and investor perception. If revenue and margins repeatedly lag the capacity story, consensus estimates and guidance would move lower. Investors could stop treating the spending as growth investment and start treating it as excess capital intensity. That change would likely compress the valuation multiple because the market would assign less credit to future optical demand and more weight to execution risk.

Investors should watch qualification timing, shipment growth versus capacity additions, revenue recognition, gross-margin progression, and management guidance. The concern would be disproved by timely qualifications, accelerating shipment conversion, sustained revenue growth, improving margins, stable or rising estimates, and evidence that customers are adopting the targeted products on schedule. Those outcomes would keep the bull case intact and support investor confidence.

Confidence: Medium`
  const result = evaluateAnswerQuality(answer, {
    web_search_available: true,
    sources: [{
      label: 'Coherent earnings release',
      url: 'https://www.coherent.com/company/investor-relations',
      source_quality: 'official_company',
    }],
  }, {
    min_words: 150,
    reject_generic_bullet_list: true,
    reject_raw_context_ids: true,
    reject_direct_answer_start: true,
    reject_market_maps_evidence_heading: true,
    require_first_order: true,
    require_second_order: true,
    require_financial_transmission: true,
    require_web_source_cards_when_available: true,
  })

  assert.equal(result.passed, true, result.failures.join('; '))
  assert.ok(result.wordCount >= 150)
  assert.equal(result.webSourceCards, true)
})

test('streaming sanitizer removes split citation labels without joining words', () => {
  const sanitizer = createStreamingAnswerSanitizer()
  const output = [
    sanitizer.push(`${'Revenue conversion drives margins and estimates. '.repeat(10)}[C`),
    sanitizer.push('4] Investor perception follows.'),
    sanitizer.flush(),
  ].join('')

  assert.doesNotMatch(output, /\[C4\]/)
  assert.match(output, /estimates\. Investor perception/)
})

test('health contract exposes local provider and retrieval readiness', async () => {
  const health = await buildCompanyChatHealth({
    id: 'ollama',
    model: 'qwen2.5:7b-instruct',
    baseUrl: 'http://localhost:11434',
    costMode: 'local_ollama_plus_free_web_retrieval',
    health: async () => ({
      available: true,
      modelAvailable: true,
      models: ['qwen2.5:7b-instruct'],
    }),
  }, {
    webSearchEnabled: true,
    webSearchProvider: 'searxng',
    searxngReachable: true,
  })

  assert.deepEqual(health, {
    llmProvider: 'ollama',
    model: 'qwen2.5:7b-instruct',
    baseUrl: 'http://localhost:11434',
    paidProviderEnabled: false,
    costMode: 'local_ollama_plus_free_web_retrieval',
    webSearchEnabled: true,
    webSearchProvider: 'searxng',
    searxngReachable: true,
    ollamaReachable: true,
    modelInstalled: true,
    retrievalMode: 'web_then_local_lexical',
    streamingEnabled: true,
    available: true,
    modelAvailable: true,
    models: ['qwen2.5:7b-instruct'],
  })
})

test('health fallback preserves local-only architecture metadata', () => {
  const health = getCompanyChatHealthFallback(new Error('health failed'))

  assert.equal(health.llmProvider, 'ollama')
  assert.equal(health.paidProviderEnabled, false)
  assert.equal(health.costMode, 'local_ollama_plus_free_web_retrieval')
  assert.equal(health.webSearchProvider, 'searxng')
  assert.equal(health.ollamaReachable, false)
  assert.equal(health.modelInstalled, false)
})

test('SearXNG provider normalizes free web search results', async () => {
  const provider = createSearxngProvider({
    fetchImpl: async (url) => {
      assert.match(String(url), /\/search\?/)
      assert.match(String(url), /format=json/)
      return response(JSON.stringify({
        results: [{
          title: 'Coherent investor release',
          url: 'https://investors.example.com/coherent-results',
          content: 'Quarterly results and company commentary.',
          publishedDate: '2026-05-01',
          engine: 'bing',
          score: 3.5,
        }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    },
  })
  const results = await provider.search('COHR earnings', { limit: 5 })

  assert.equal(results.length, 1)
  assert.equal(results[0].domain, 'investors.example.com')
  assert.equal(results[0].providerScore, 3.5)
})

test('readable text extraction removes page chrome and keeps research content', () => {
  const result = extractReadableText(`
    <html><head>
      <title>Coherent Results</title>
      <meta property="article:published_time" content="2026-05-01">
      <style>.hidden { display:none }</style>
    </head><body>
      <nav>Navigation links that should be removed from the readable content.</nav>
      <main>
        <h1>Quarterly Results</h1>
        <p>Coherent discussed capacity, product qualification, shipment timing, and margin execution during the quarter.</p>
      </main>
      <script>window.secret = true</script>
    </body></html>
  `)

  assert.equal(result.title, 'Coherent Results')
  assert.equal(result.publishedAt, '2026-05-01')
  assert.match(result.text, /capacity, product qualification/)
  assert.doesNotMatch(result.text, /Navigation links|window\.secret/)
})

test('web retrieval builds ranked clickable source metadata', async () => {
  const input = {
    ticker: 'COHR',
    companyName: 'Coherent',
    theme: 'photonics',
    layer: 1,
    question: 'What is the latest earnings outlook?',
  }
  const query = buildWebSearchQuery(input)
  assert.match(query, /COHR/)
  assert.match(query, /Coherent/)
  assert.match(query, /latest earnings outlook/)

  const result = await retrieveWebContext(input, {
    provider: {
      id: 'searxng',
      search: async () => [{
        title: 'Coherent quarterly earnings release',
        url: 'https://investors.coherent.com/news/results',
        snippet: 'Coherent reported quarterly results and discussed product qualification.',
        domain: 'investors.coherent.com',
        publishedAt: '2026-05-01',
        engine: 'mock',
        providerScore: 5,
      }],
    },
    fetchTopN: 1,
    fetchPageImpl: async () => ({
      finalUrl: 'https://investors.coherent.com/news/results',
      title: 'Coherent quarterly earnings release',
      publishedAt: '2026-05-01',
      retrievedAt: '2026-06-11T00:00:00.000Z',
      text: 'Coherent discussed product qualification, capacity conversion, shipment timing, and the outlook for optical demand.',
    }),
  })

  assert.equal(result.available, true)
  assert.equal(result.chunks.length, 1)
  assert.equal(result.chunks[0].sourceType, 'web_page')
  assert.equal(result.chunks[0].domain, 'investors.coherent.com')
  assert.equal(result.chunks[0].publishedAt, '2026-05-01')
  assert.equal(result.chunks[0].sourceQuality, 'official_company')
  assert.ok(result.chunks[0].score > 20)
  assert.match(result.chunks[0].displayLabel, /investors\.coherent\.com/)
})

test('analytical questions diversify search and fetch up to ten ranked pages', async () => {
  const input = {
    ticker: 'COHR',
    companyName: 'Coherent',
    theme: 'photonics',
    layer: 1,
    question: 'What would break the bull case on COHR?',
  }
  assert.equal(isAnalyticalInvestmentQuestion(input.question), true)
  assert.equal(buildWebSearchQueries(input).length, 3)

  const calls = []
  const results = Array.from({ length: 15 }, (_, index) => ({
    title: index === 0 ? 'Coherent investor relations results' : `COHR research ${index}`,
    url: index === 0
      ? 'https://www.coherent.com/company/investor-relations/results'
      : `https://example${index}.com/cohr-analysis`,
    snippet: 'COHR demand, capacity, margins, and investor expectations.',
    domain: index === 0 ? 'coherent.com' : `example${index}.com`,
    publishedAt: '2026-05-01',
    engine: 'mock',
    providerScore: 15 - index,
  }))
  const retrieval = await retrieveWebContext(input, {
    provider: {
      id: 'searxng',
      search: async (query, options) => {
        calls.push({ query, limit: options.limit })
        return results
      },
    },
    fetchTopN: 9,
    fetchPageImpl: async (url) => ({
      finalUrl: url,
      title: 'COHR evidence',
      publishedAt: '2026-05-01',
      retrievedAt: '2026-06-11T00:00:00.000Z',
      text: 'COHR capacity conversion, customer qualification, revenue growth, margin execution, estimate risk, and investor expectations.',
    }),
  })

  assert.equal(calls.length, 3)
  assert.ok(calls.every((call) => call.limit === 15))
  assert.equal(retrieval.chunks.length, 9)
  assert.equal(retrieval.chunks[0].sourceQuality, 'official_company')
})

test('source quality follows the investor evidence hierarchy', () => {
  const input = {
    ticker: 'COHR',
    companyName: 'Coherent',
    theme: 'photonics',
    layer: 1,
    question: 'What would break the bull case?',
  }
  const result = (domain, url, title = 'COHR results') => ({
    domain,
    url,
    title,
    snippet: '',
  })

  assert.equal(
    classifyWebSource(result('coherent.com', 'https://coherent.com/company/investor-relations'), input),
    'official_company',
  )
  assert.equal(
    classifyWebSource(result('sec.gov', 'https://sec.gov/Archives/cohr-10q.htm'), input),
    'sec',
  )
  assert.equal(
    classifyWebSource(result('example.com', 'https://example.com/cohr-transcript', 'COHR earnings call transcript'), input),
    'transcript',
  )
  assert.equal(
    classifyWebSource(result('reuters.com', 'https://reuters.com/cohr'), input),
    'reputable_news',
  )
  assert.equal(
    classifyWebSource(result('example.com', 'https://example.com/cohr'), input),
    'generic_web',
  )
})

test('final evidence packet is capped at 18 and ranks local context above generic web', () => {
  const makeChunk = (id, sourceQuality, score) => ({
    id,
    sourceQuality,
    score,
    sourceFile: sourceQuality === 'local_context'
      ? 'data/company-context/COHR.md'
      : `https://${id}.com`,
  })
  const web = [
    makeChunk('official', 'official_company', 20),
    makeChunk('sec', 'sec', 100),
    makeChunk('transcript', 'transcript', 90),
    makeChunk('news', 'reputable_news', 80),
    ...Array.from({ length: 12 }, (_, index) =>
      makeChunk(`generic-${index}`, 'generic_web', 100 - index)),
  ]
  const local = Array.from({ length: 6 }, (_, index) =>
    makeChunk(`local-${index}`, 'local_context', 20 - index))
  const ranked = prioritizeCompanyChatChunks(web, local, 'COHR')

  assert.equal(ranked.length, 18)
  assert.deepEqual(
    ranked.slice(0, 4).map((chunk) => chunk.sourceQuality),
    ['official_company', 'sec', 'transcript', 'reputable_news'],
  )
  assert.ok(
    ranked.findIndex((chunk) => chunk.sourceQuality === 'local_context') <
    ranked.findIndex((chunk) => chunk.sourceQuality === 'generic_web'),
  )
})

test('web result scoring boosts filings and investor relations pages', () => {
  const input = {
    ticker: 'COHR',
    companyName: 'Coherent',
    theme: 'photonics',
    layer: 1,
    question: 'latest earnings',
  }
  const base = {
    title: 'Coherent earnings',
    snippet: 'Coherent earnings update',
    publishedAt: '2026-05-01',
    engine: 'mock',
    providerScore: 1,
  }
  const secScore = scoreWebResult({
    ...base,
    url: 'https://www.sec.gov/Archives/cohr-10q.htm',
    domain: 'sec.gov',
  }, input)
  const genericScore = scoreWebResult({
    ...base,
    url: 'https://example.com/cohr',
    domain: 'example.com',
  }, input)
  assert.ok(secScore > genericScore)
})

test('web retrieval fails softly when SearXNG is unavailable', async () => {
  const result = await retrieveWebContext({
    ticker: 'COHR',
    companyName: 'Coherent',
    theme: 'photonics',
    layer: 1,
    question: 'What is the bull case?',
  }, {
    provider: {
      id: 'searxng',
      search: async () => {
        throw new Error('connection refused')
      },
    },
  })

  assert.equal(result.enabled, true)
  assert.equal(result.available, false)
  assert.deepEqual(result.chunks, [])
  assert.match(result.error, /connection refused/)
})

test('frontend includes progressive states, cancellation, inspector, and no direct Ollama call', async () => {
  const card = await readFile(
    join(ROOT, 'src', 'components', 'CompanyChatCard.jsx'),
    'utf8',
  )
  for (const state of [
    'Searching web and Market Maps context...',
    'Reading Market Maps context...',
    'Thinking locally with Ollama...',
    'Generating answer...',
  ]) {
    assert.match(card, new RegExp(state.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(card, /abortRef\.current\?\.abort\(\)/)
  assert.doesNotMatch(card, /localhost:11434/)
  assert.match(card, /Local model \+ free web search · zero API cost/)
  assert.match(card, /official_company: 'Official company'/)
  assert.match(card, /source\.source_quality/)
  assert.doesNotMatch(card, /Context used|ticker-chat-context-inspector/)
  assert.match(card, /retrievalNotice/)
})

test('company chat prompt requires causal investment analysis without inline citations', async () => {
  const source = await readFile(join(ROOT, 'server', 'companyChat.ts'), 'utf8')

  assert.match(source, /tenured public-markets PM/)
  assert.match(source, /revenue, margins, consensus estimates, valuation multiple/)
  assert.match(source, /connected analytical paragraphs/)
  assert.match(source, /Do not use a numbered list/)
  assert.match(source, /Do not add standard boilerplate risks/)
  assert.match(source, /roughly 400-550 words/)
  assert.match(source, /State the bull case being tested/)
  assert.match(source, /first-order operating consequence/)
  assert.match(source, /what evidence would prove the concern wrong/i)
  assert.match(source, /Do not mention retrieval, RAG, context, chunks/)
  assert.match(source, /Sources are displayed separately in the product UI/)
  assert.doesNotMatch(source, /Refer to evidence using the provided context labels/)
})

test('context schema validates company and theme files', async () => {
  const company = await readFile(join(ROOT, 'data', 'company-context', 'COHR.md'), 'utf8')
  const theme = await readFile(
    join(ROOT, 'data', 'company-context', 'shared', 'photonics.md'),
    'utf8',
  )
  const companyResult = validateContextMarkdown(company, COMPANY_CONTEXT_HEADINGS)
  const themeResult = validateContextMarkdown(theme, THEME_CONTEXT_HEADINGS)

  assert.deepEqual(companyResult.missingHeadings, [])
  assert.deepEqual(companyResult.duplicateHeadings, [])
  assert.deepEqual(companyResult.placeholderSections, [])
  assert.deepEqual(themeResult.missingHeadings, [])
  assert.deepEqual(themeResult.duplicateHeadings, [])
})

test('retrieval returns readable source metadata and relevant headings', async () => {
  const result = await retrieveCompanyContext({
    ticker: 'COHR',
    theme: 'photonics',
    layer: 1,
    question: 'What would break the bull case?',
  }, { includeQuote: false })

  assert.equal(result.thinContext, false)
  assert.ok(result.meaningfulCount >= 2)
  assert.ok(result.usedContext.some((chunk) => chunk.heading === 'What would break the thesis'))
  assert.ok(result.usedContext.every((chunk) => (
    chunk.source_file &&
    chunk.heading &&
    Number.isInteger(chunk.chunk_index) &&
    Number.isFinite(chunk.score) &&
    chunk.display_label
  )))
  assert.ok(result.sources.some((source) => source.label === 'COHR.md · Bear case'))
})

test('neocloud company retrieval uses its own market map and context', async () => {
  const result = await retrieveCompanyContext({
    ticker: 'NBIS',
    theme: 'neoclouds',
    layer: 1,
    question: 'What would break the bull case?',
  }, { includeQuote: false })

  assert.equal(result.company.name, 'Nebius Group')
  assert.equal(result.company.layerName, 'AI Infrastructure & Neocloud Platforms')
  assert.equal(result.company.theme, 'neoclouds')
  assert.equal(result.thinContext, false)
  assert.ok(result.meaningfulCount >= 2)
  assert.ok(result.usedContext.some((chunk) => chunk.source_file.endsWith('NBIS.md')))
  assert.ok(result.usedContext.some((chunk) => chunk.source_file.endsWith('neoclouds.md')))
})

test('placeholder sections are excluded and thin company context is flagged', async () => {
  const result = await retrieveCompanyContext({
    ticker: 'AXTI',
    theme: 'photonics',
    layer: 1,
    question: 'What is the bull case?',
  }, { includeQuote: false })

  assert.equal(result.thinContext, true)
  assert.equal(result.meaningfulCount, 0)
  assert.equal(
    result.usedContext.some((chunk) => /todo|placeholder/i.test(chunk.excerpt)),
    false,
  )
})

test('company chat source has no paid provider or fallback', async () => {
  const files = [
    'src/App.jsx',
    'src/components/CompanyChatCard.jsx',
    'src/companyChatConfig.js',
    'server/companyChat.ts',
    'server/llm/index.ts',
    'server/llm/ollama.ts',
    'server/http/companyChatHandlers.ts',
    'server/search/index.ts',
    'server/search/searxng.ts',
    'server/retrieval/webContext.ts',
    'server/web/fetchPage.ts',
    'api/company-chat.ts',
    'api/company-chat/health.ts',
    'api/company-chat/warmup.ts',
  ]
  const forbidden = [
    ['open', 'ai'].join(''),
    ['anth', 'ropic'].join(''),
    ['gem', 'ini'].join(''),
    ['google', '-generative-ai'].join(''),
  ]

  for (const file of files) {
    const content = (await readFile(join(ROOT, file), 'utf8')).toLowerCase()
    for (const term of forbidden) {
      assert.equal(content.includes(term), false, `${file} contains forbidden provider: ${term}`)
    }
  }
})

test('development and deployment routes share the company-chat HTTP adapter', async () => {
  const routeFiles = [
    'vite.config.js',
    'api/company-chat.ts',
    'api/company-chat/health.ts',
    'api/company-chat/warmup.ts',
  ]

  for (const file of routeFiles) {
    const content = await readFile(join(ROOT, file), 'utf8')
    assert.match(content, /companyChatHandlers\.ts/)
    assert.doesNotMatch(content, /function writeCompanyChatEvent|function readJsonBody/)
  }

  const viteConfig = await readFile(join(ROOT, 'vite.config.js'), 'utf8')
  assert.doesNotMatch(viteConfig, /async function fetchYahoo(?:Price|Chart|Fundamentals)/)
})
