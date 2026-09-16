const ticker = String(process.argv[2] || 'COHR').toUpperCase()
const mode = String(process.argv[3] || 'all').toLowerCase()
const baseUrl = String(process.env.MARKET_MAPS_BASE_URL || 'http://localhost:5173').replace(/\/+$/, '')

async function fetchJson(path, timeoutMs = 2_100_000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('Local earnings audit timed out.')), timeoutMs)
  try {
    const response = await fetch(`${baseUrl}${path}`, { signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${path}`)
    return response.json()
  } finally {
    clearTimeout(timeout)
  }
}

const index = await fetchJson(`/api/earnings-commentary?ticker=${encodeURIComponent(ticker)}&deterministic=1`, 120_000)
if (!index.available) throw new Error(index.error || `${ticker} earnings commentary unavailable.`)

const periods = mode === 'latest' ? index.periods.slice(0, 1) : index.periods
const rows = []

for (const period of periods) {
  const payload = await fetchJson(
    `/api/earnings-commentary?ticker=${encodeURIComponent(ticker)}&period=${encodeURIComponent(period.id)}&audit=1`,
  )
  const audit = payload.audit
  rows.push({
    period: period.fiscalLabel,
    calendar: period.calendarLabel,
    passed: Boolean(audit?.passed),
    qna: audit?.checks?.completeQna ?? false,
    financials: audit?.checks?.financialGroups ?? false,
    labels: audit?.checks?.accountingLabels ?? false,
    guidance: audit?.checks?.guidanceCoverage ?? false,
    topics: audit?.checks?.topicQuality ?? false,
    duplicates: audit?.checks?.noDuplicates ?? false,
    switching: audit?.checks?.quarterIdentity ?? false,
    evidence: payload.sourcePacket?.evidenceDocuments?.length ?? 0,
    qnaCount: payload.commentary?.qnaQuestionCount ?? 0,
    topicCount: payload.commentary?.topics?.length ?? 0,
    missingQna: audit?.details?.missingQnaCoverage?.join(',') ?? '',
    missingGuidance: audit?.details?.missingGuidanceNumbers?.join(',') ?? '',
    engine: payload.sourcePacket?.engine?.status ?? '',
    engineError: payload.sourcePacket?.engine?.error ?? '',
  })
}

console.table(rows)
if (rows.some((row) => !row.passed)) process.exitCode = 1
