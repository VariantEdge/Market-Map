import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  auditEarningsCommentary,
  buildEarningsCacheKey,
  clearEarningsCommentaryCache,
  dedupeItems,
  enhanceEarningsCommentary,
  extractDeterministicEvidence,
  parseStructuredJson,
  shouldEnhanceEarningsCommentary,
  summarizeQnaExchange,
  validateGeneratedCommentary,
  validateQnaAnalyses,
} from '../server/earningsCommentary/ollamaEngine.js'
import { OllamaUnavailableError } from '../server/llm/ollama.ts'
import {
  extractHardGuidanceFromDocuments,
  selectPeriodFilings,
} from '../api/earningsCommentaryCore.js'

const ROOT = process.cwd()
const transcriptUrl = 'https://example.test/cohr-transcript'
const releaseUrl = 'https://example.test/cohr-8k'

function fallbackCommentary() {
  return {
    ticker: 'COHR',
    available: true,
    selectedPeriodId: 'latest-cohr',
    sources: { transcript: transcriptUrl },
    topics: Array.from({ length: 6 }, (_, index) => ({
      label: `Fallback Topic ${index + 1}`,
      items: [{ text: `Fallback topic detail ${index + 1}.`, source: 'Transcript', url: transcriptUrl }],
    })),
    sections: {
      takeaways: [
        {
          group: 'Key Financial Results',
          description: 'Financial results.',
          items: [
            {
              subject: 'Non-GAAP EPS',
              text: 'Non-GAAP diluted EPS was $1.41.',
              source: 'SEC 8-K',
              url: releaseUrl,
            },
          ],
        },
        {
          group: 'Business Segment Results',
          description: 'Reported segments.',
          items: [
            {
              subject: 'Datacenter & Communications Segment',
              text: 'Datacenter & Communications segment revenue was $1.36 billion.',
              source: 'SEC 8-K',
              url: releaseUrl,
            },
          ],
        },
        {
          group: 'Capital Allocation',
          description: 'Capital allocation.',
          items: [{ subject: 'CapEx', text: 'Capital expenditures were $290 million.', source: 'Transcript', url: transcriptUrl }],
        },
        {
          group: 'Industry Trends and Dynamics',
          description: 'Industry.',
          items: [{ subject: 'Demand', text: 'AI data center demand remained strong.', source: 'Transcript', url: transcriptUrl }],
        },
        {
          group: 'Competitive Landscape',
          description: 'Competition.',
          items: [{ subject: 'Portfolio', text: 'Management emphasized photonics portfolio breadth.', source: 'Transcript', url: transcriptUrl }],
        },
        {
          group: 'Growth Opportunities and Strategies',
          description: 'Growth.',
          items: [{ subject: 'InP', text: 'Indium phosphide capacity supports future transceiver growth.', source: 'Transcript', url: transcriptUrl }],
        },
      ],
      qna: [
        {
          sequence: 1,
          speaker: 'Analyst One',
          firm: 'Research Firm',
          text: 'Why has doubling indium phosphide capacity not doubled revenue, and what is the margin effect?',
          answerSummary: 'Fallback answer.',
          answerSpeakers: ['Jim Anderson'],
          source: 'Transcript',
        },
      ],
      guidance: [
        {
          group: 'Quarterly Guidance',
          description: 'Quarterly guidance.',
          items: [{ label: 'Non-GAAP EPS', text: 'Non-GAAP EPS guidance was $1.50 to $1.60.', source: 'SEC 8-K', url: releaseUrl }],
        },
        {
          group: 'Annual Guidance',
          description: 'Annual guidance.',
          items: [{ text: 'No annual guidance was provided.', source: 'Unverified' }],
        },
        {
          group: 'Outlook',
          description: 'Outlook.',
          items: [{ subject: 'Capacity', text: 'Capacity is expected to ramp through calendar 2026.', source: 'Transcript', url: transcriptUrl }],
        },
      ],
    },
  }
}

function engineInput(overrides = {}) {
  const deterministic = fallbackCommentary()
  return {
    ticker: 'COHR',
    transcript: {
      id: 'latest-cohr',
      quarter: 'Q3 2026',
      transcriptUrl,
      transcriptText: 'Non-GAAP diluted EPS was $1.41. Datacenter & Communications segment revenue was $1.36 billion. Capital expenditures were $290 million.',
      isLatestTranscript: true,
    },
    qnaExchanges: [
      {
        sequence: 1,
        speaker: 'Analyst One',
        firm: 'Research Firm',
        text: 'Why has doubling indium phosphide capacity not doubled revenue, and what is the margin effect?',
        answerSummary: 'Fallback answer.',
        answerSpeakers: ['Jim Anderson', 'Sherri Luther'],
        answerBlocks: [
          {
            speaker: 'Jim Anderson',
            role: 'Chief Executive Officer',
            text: 'There is a two-to-three-month latency from device production to completed transceiver shipments.',
          },
          {
            speaker: 'Sherri Luther',
            role: 'Chief Financial Officer',
            text: 'The capacity ramp initially adds cost, while qualification and product mix determine the gross-margin benefit.',
          },
        ],
      },
    ],
    deterministic,
    ...overrides,
  }
}

function fixtureEvidence(input = engineInput()) {
  return extractDeterministicEvidence(input)
}

function generatedDraft(evidence) {
  const eps = evidence.find((item) => item.text.includes('Non-GAAP diluted EPS'))
  const segment = evidence.find((item) => item.text.includes('Datacenter & Communications'))
  const capex = evidence.find((item) => item.text.includes('Capital expenditures'))
  const demand = evidence.find((item) => item.text.includes('AI data center demand'))
  const portfolio = evidence.find((item) => item.text.includes('photonics portfolio'))
  const inp = evidence.find((item) => item.text.includes('Indium phosphide'))
  const guidance = evidence.find((item) => item.text.includes('EPS guidance'))
  const outlook = evidence.find((item) => item.text.includes('Capacity is expected'))
  const takeaways = [
    ['Key Financial Results', eps, 'Non-GAAP EPS', 'Non-GAAP diluted EPS was $1.41.'],
    ['Business Segment Results', segment, 'Datacenter & Communications Segment', 'Datacenter & Communications segment revenue was $1.36 billion.'],
    ['Capital Allocation', capex, 'CapEx', 'Capital expenditures were $290 million.'],
    ['Industry Trends and Dynamics', demand, 'Demand', 'AI data center demand remained strong.'],
    ['Competitive Landscape', portfolio, 'Portfolio', 'Management emphasized photonics portfolio breadth.'],
    ['Growth Opportunities and Strategies', inp, 'InP', 'Indium phosphide capacity supports future transceiver growth.'],
  ].map(([group, record, subject, text]) => ({
    group,
    description: `${group}.`,
    items: [{ subject, text, evidence_ids: [record.id], fact_or_inference: 'fact' }],
  }))

  return {
    takeaways,
    guidance: [
      {
        group: 'Quarterly Guidance',
        description: 'Quarterly guidance.',
        items: [{ label: 'Non-GAAP EPS', text: 'Non-GAAP EPS guidance was $1.50 to $1.60.', evidence_ids: [guidance.id] }],
      },
      {
        group: 'Annual Guidance',
        description: 'Annual guidance.',
        items: [],
      },
      {
        group: 'Outlook',
        description: 'Outlook.',
        items: [{ subject: 'Capacity', text: 'Capacity is expected to ramp through calendar 2026.', evidence_ids: [outlook.id] }],
      },
    ],
    topics: Array.from({ length: 6 }, (_, index) => ({
      label: `Topic ${index + 1}`,
      items: [{
        text: 'Indium phosphide capacity supports future transceiver growth.',
        evidence_ids: [inp.id],
        fact_or_inference: 'fact',
      }],
    })),
  }
}

test('structured JSON parser accepts fenced output and rejects prose', () => {
  assert.deepEqual(parseStructuredJson('```json\n{"ok":true}\n```'), { ok: true })
  assert.throws(() => parseStructuredJson('not json'))
})

test('Q&A analysis sends the full question and every executive response', async () => {
  const calls = []
  const provider = {
    async chat(messages) {
      calls.push(messages)
      return JSON.stringify({
        sequence: 1,
        answer_points: [
          { point: 'Shipments lag device production by two to three months.', speaker: 'Jim Anderson', investor_significance: 'Revenue follows qualified module shipments.', accounting_basis: 'unspecified' },
          { point: 'Early capacity adds cost before mix and utilization improve.', speaker: 'Sherri Luther', investor_significance: 'Gross-margin leverage arrives after qualification.', accounting_basis: 'unspecified' },
        ],
      })
    },
  }

  const result = await summarizeQnaExchange(engineInput().qnaExchanges[0], provider)
  const prompt = calls[0][1].content
  assert.match(prompt, /doubling indium phosphide capacity/)
  assert.match(prompt, /two-to-three-month latency/)
  assert.match(prompt, /qualification and product mix/)
  assert.equal(result.answerPoints.length, 2)
})

test('generated commentary removes duplicate bullets', () => {
  const items = dedupeItems([
    { text: 'Revenue reached $1.81 billion, up 21% year-over-year.' },
    { text: 'Revenue reached $1.81 billion, up 21% year-over-year.' },
  ])
  assert.equal(items.length, 1)
})

test('validation rejects unsupported numbers, incorrect segments, and missing non-GAAP labels', () => {
  const input = engineInput()
  const evidence = fixtureEvidence(input)
  const draft = generatedDraft(evidence)
  const epsRecord = evidence.find((item) => item.text.includes('Non-GAAP diluted EPS'))
  const segmentRecord = evidence.find((item) => item.text.includes('Datacenter & Communications'))

  draft.takeaways[0].items = [{
    subject: 'EPS',
    text: 'Diluted EPS was $1.41.',
    evidence_ids: [epsRecord.id],
    fact_or_inference: 'fact',
  }]
  draft.takeaways[1].items = [{
    subject: 'Consumer Segment',
    text: 'Consumer segment revenue accelerated sharply.',
    evidence_ids: [segmentRecord.id],
    fact_or_inference: 'fact',
  }]
  draft.takeaways[2].items = [{
    subject: 'CapEx',
    text: 'Capital expenditures were $999 million.',
    evidence_ids: [segmentRecord.id],
    fact_or_inference: 'fact',
  }]

  const validated = validateGeneratedCommentary(draft, evidence, input.deterministic)
  assert.equal(validated.takeaways[0].items[0].text, 'Non-GAAP diluted EPS was $1.41.')
  assert.match(validated.takeaways[1].items[0].text, /Datacenter & Communications/)
  assert.equal(validated.takeaways[2].items[0].text, 'Capital expenditures were $290 million.')
})

test('all transcript-backed tickers and quarters use the same enhancement engine', () => {
  assert.equal(shouldEnhanceEarningsCommentary(engineInput()), true)
  assert.equal(
    shouldEnhanceEarningsCommentary(engineInput({
      ticker: 'NBIS',
      transcript: { ...engineInput().transcript, id: 'prior-nbis', isLatestTranscript: false },
    })),
    true,
  )
  assert.equal(shouldEnhanceEarningsCommentary(engineInput({ qnaExchanges: [] })), false)
})

test('cache key changes with ticker, transcript, or transcript length', () => {
  const input = engineInput()
  const base = buildEarningsCacheKey(input)
  assert.notEqual(base, buildEarningsCacheKey({ ...input, ticker: 'LITE' }))
  assert.notEqual(base, buildEarningsCacheKey({
    ...input,
    transcript: { ...input.transcript, transcriptText: `${input.transcript.transcriptText} extra` },
  }))
})

test('Ollama unavailability returns the existing deterministic commentary', async () => {
  clearEarningsCommentaryCache()
  const input = engineInput()
  const provider = {
    async chat() {
      throw new OllamaUnavailableError()
    },
  }
  const result = await enhanceEarningsCommentary(input, { provider, skipCache: true })
  assert.deepEqual(result, input.deterministic)
})

test('staged engine preserves all Q&A points and runs a verification pass', async () => {
  clearEarningsCommentaryCache()
  const input = engineInput()
  const evidence = fixtureEvidence(input)
  const draft = generatedDraft(evidence)
  const qnaAnalysis = {
    sequence: 1,
    answer_points: [
      {
        point: 'Completed transceiver shipments lag device production by two to three months.',
        speaker: 'Jim Anderson',
        investor_significance: 'The capacity ramp reaches revenue only after module qualification and shipment.',
        accounting_basis: 'unspecified',
      },
      {
        point: 'Early ramp costs precede utilization and mix benefits.',
        speaker: 'Sherri Luther',
        investor_significance: 'Gross-margin leverage should trail the physical capacity increase.',
        accounting_basis: 'unspecified',
      },
    ],
  }
  const calls = []
  const provider = {
    async chat(messages) {
      calls.push(messages)
      const prompt = messages[1]?.content ?? ''
      if (calls.length === 1) return JSON.stringify(qnaAnalysis)
      const takeawayMatch = prompt.match(/Build only the "([^"]+)" section/)
      if (takeawayMatch) {
        return JSON.stringify(draft.takeaways.find((group) => group.group === takeawayMatch[1]))
      }
      if (/Build guidance and outlook/.test(prompt)) {
        return JSON.stringify({ guidance: draft.guidance })
      }
      if (/Rank 6-10 quarter-specific investor topics/.test(prompt)) {
        return JSON.stringify({ topics: draft.topics })
      }
      return JSON.stringify({ approved: true, commentary: null, issues_fixed: [] })
    },
  }

  const result = await enhanceEarningsCommentary(input, {
    provider,
    skipCache: true,
    pipelineTimeoutMs: 5000,
  })

  assert.equal(calls.length, 10)
  assert.match(calls[9][0].content, /verification analyst/)
  assert.match(calls[9][1].content, /commentary against the evidence/)
  assert.match(result.sections.qna[0].answerSummary, /two to three months/)
  assert.match(result.sections.qna[0].answerSummary, /Gross-margin leverage/)
  assert.equal(result.sections.takeaways.length, 6)
  assert.equal(result.sections.guidance.length, 3)
  assert.ok(result.topics.length >= 6 && result.topics.length <= 10)
})

test('Q&A verification drops unsupported numeric claims', () => {
  const input = engineInput()
  const verified = validateQnaAnalyses(
    [{
      sequence: 1,
      answer_points: [
        {
          point: 'The shipment latency is 99 months.',
          speaker: 'Jim Anderson',
          investor_significance: '',
          accounting_basis: 'unspecified',
        },
        {
          point: 'The capacity ramp initially adds cost before qualification.',
          speaker: 'Sherri Luther',
          investor_significance: 'Gross-margin benefits depend on mix and utilization.',
          accounting_basis: 'unspecified',
        },
      ],
    }],
    input.qnaExchanges,
  )
  assert.equal(verified[0].answerPoints.some((point) => /99 months/.test(point.point)), false)
  assert.equal(
    verified[0].answerPoints.some((point) => /initially adds cost/.test(point.point)),
    true,
  )
})

test('period filing selection uses filings nearest the selected earnings call', () => {
  const filings = selectPeriodFilings(
    {
      filings: [
        { form: '8-K', filed: '2026-05-06', url: 'latest-8k' },
        { form: '10-Q', filed: '2026-05-06', url: 'latest-10q' },
        { form: '8-K', filed: '2026-02-04', url: 'prior-8k' },
        { form: '10-Q', filed: '2026-02-04', url: 'prior-10q' },
      ],
    },
    { date: 'Feb 4, 2026' },
  )
  assert.deepEqual(filings.map((filing) => filing.url), ['prior-8k', 'prior-10q'])
})

test('hard guidance extraction preserves source, period, numbers, and non-GAAP labels', () => {
  const items = extractHardGuidanceFromDocuments([
    {
      source: 'Earnings Release',
      url: releaseUrl,
      text: 'Quarterly Guidance || The company expects non-GAAP diluted EPS between $1.50 and $1.60 for the next quarter. || Revenue is expected to range from $1.8 billion to $1.9 billion.',
    },
  ])
  assert.equal(items.length, 2)
  assert.ok(items.some((item) => item.label === 'Non-GAAP EPS'))
  assert.ok(items.some((item) => item.text.includes('$1.8 billion')))
  assert.ok(items.every((item) => item.source === 'Earnings Release'))
})

test('earnings audit checks Q&A completeness, guidance coverage, topics, duplicates, and period identity', () => {
  const input = engineInput()
  const result = fallbackCommentary()
  result.fiscalQuarter = input.transcript.quarter
  const fullAnswer = input.qnaExchanges[0].answerBlocks.map((block) => block.text).join('; ')
  result.sections.qna[0].answerSummary = fullAnswer
  const audit = auditEarningsCommentary(result, input)
  assert.equal(audit.checks.completeQna, true)
  assert.equal(audit.checks.guidanceCoverage, true)
  assert.equal(audit.checks.topicQuality, true)
  assert.equal(audit.checks.noDuplicates, true)
  assert.equal(audit.checks.quarterIdentity, true)
})

test('malformed structured output receives exactly one repair retry', async () => {
  const calls = []
  const provider = {
    async chat(messages) {
      calls.push(messages)
      if (calls.length === 1) return '{"sequence":1,"answer_points":['
      return JSON.stringify({
        sequence: 1,
        answer_points: [{
          point: 'The complete answer was recovered.',
          speaker: 'Jim Anderson',
          investor_significance: '',
          accounting_basis: 'unspecified',
        }],
      })
    },
  }

  const result = await summarizeQnaExchange(engineInput().qnaExchanges[0], provider)
  assert.equal(calls.length, 2)
  assert.equal(result.answerPoints[0].point, 'The complete answer was recovered.')
})

test('engine source contains no paid-provider path or API-key requirement', async () => {
  const source = await readFile(
    join(ROOT, 'server', 'earningsCommentary', 'ollamaEngine.js'),
    'utf8',
  )
  const banned = [
    ['open', 'ai'].join(''),
    ['anth', 'ropic'].join(''),
    ['gem', 'ini'].join(''),
    ['OPENAI', '_API_KEY'].join(''),
    ['ANTHROPIC', '_API_KEY'].join(''),
    ['GEMINI', '_API_KEY'].join(''),
  ]
  for (const token of banned) assert.equal(source.toLowerCase().includes(token.toLowerCase()), false)
  assert.match(source, /createOllamaProvider/)
})
