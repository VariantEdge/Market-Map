import { fetchYahooChart, fetchYahooFundamentals, getPrice, getPrices } from './marketData.js'
import { getCompanyFacts, resolveCompany } from '../server/sec/edgar.js'
import {
  calendarizeAnnualEstimateWithReportedQuarters,
  calculateNtmFromAnnualConsensus,
  enterpriseValue,
  historicalSeasonality,
  normalizeCumulativeQuarterlyFacts,
  valuationMultiple,
} from '../server/valuation/calendarization.js'
import { auditSummary, buildRowAudit } from '../server/valuation/validation.js'
import { buildCanonicalQuarterlyLedger } from '../server/valuation/financialLedger.js'
import { loadLatestSupplementalSourceFacts } from '../server/valuation/sourceLedger.js'
import { loadAuditedFinancials } from '../server/valuation/auditSnapshot.js'
import { buildFilingIndex } from '../server/valuation/filingIndex.js'
import { loadSupplementalFilingFacts } from '../server/valuation/filingFactExtractor.js'
import {
  adjustedEbitdaDenominatorIdentity,
  assertCanonicalAdjustedEbitdaEntry,
  ADJUSTED_EBITDA_PERIOD,
} from '../server/valuation/adjustedEbitdaEngine.js'
import {
  HISTORICAL_VALIDATION_STATUS,
  classifyIssuer,
  isOperatingCompanyClassification,
} from '../server/valuation/issuerClassification.js'
import { fetchWiseSheetsCanonicalRows } from '../server/valuation/wiseSheetsCanonicalShadow.js'
import { buildWiseSheetsHistorical, completeWithSecExceptionQuarters } from '../server/valuation/wiseSheetsFinancials.js'
import { buildCanonicalHistoricalFinancials } from '../server/valuation/secCanonicalFinancials.js'
import { createPerTickerCache, runAbortableTask, runBoundedTask } from '../server/valuation/interactiveCache.js'
import {
  evaluateFinancialSnapshotPromotion,
  FINANCIAL_SNAPSHOT_STATE,
  loadFinancialSnapshots,
  saveFinancialSnapshot,
  snapshotFinancialRow,
} from '../server/valuation/financialSnapshot.js'

const VALUATION_CACHE_TTL_MS = 60 * 60 * 1000
const CANONICAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const INTERACTIVE_SOURCE_TIMEOUT_MS = 8_000
const SEC_SOURCE_TIMEOUT_MS = 30_000
const CONSENSUS_CACHE_TTL_MS = 30 * 60 * 1000
const cache = new Map()
const inFlight = new Map()
const canonicalHistoryCache = createPerTickerCache({
  namespace: 'canonical-history',
  ttlMs: CANONICAL_CACHE_TTL_MS,
})
const adjustedEbitdaCache = createPerTickerCache({
  namespace: 'adjusted-ebitda',
  ttlMs: CANONICAL_CACHE_TTL_MS,
  persist: false,
})
const wiseSheetsBatchCache = createPerTickerCache({
  namespace: 'wisesheets-batches',
  ttlMs: CANONICAL_CACHE_TTL_MS,
})
const consensusCache = createPerTickerCache({
  namespace: 'valuation-consensus',
  ttlMs: CONSENSUS_CACHE_TTL_MS,
  persist: false,
})

export function createWiseSheetsBatchLoader({ cacheStore = wiseSheetsBatchCache, fetchRows = fetchWiseSheetsCanonicalRows } = {}) {
  return async (inputTickers, { refresh = false, cacheKeySuffix = '' } = {}) => {
    const tickers = [...new Set(inputTickers.map((ticker) => String(ticker).trim().toUpperCase()).filter(Boolean))].sort()
    const key = `${tickers.join(',')}${cacheKeySuffix}`
    const cached = await cacheStore.get(key, async () => runBoundedTask(
      'WISESHEETS_HISTORY',
      () => fetchRows(tickers),
      SEC_SOURCE_TIMEOUT_MS,
      [],
    ), { refresh, waitForRefresh: refresh })
    return { ...cached.value, cache: cached.cache }
  }
}

const loadWiseSheetsBatch = createWiseSheetsBatchLoader()

function recordLatency(profile, stage, elapsedMs, details = {}) {
  if (!profile) return
  profile.stages ??= {}
  const entry = profile.stages[stage] ?? { calls: 0, elapsedMs: 0, maxMs: 0 }
  entry.calls += 1
  entry.elapsedMs += elapsedMs
  entry.maxMs = Math.max(entry.maxMs, elapsedMs)
  Object.assign(entry, details)
  profile.stages[stage] = entry
}

async function measureLatency(profile, stage, task, details = {}) {
  const startedAt = performance.now()
  try {
    return await task()
  } finally {
    recordLatency(profile, stage, performance.now() - startedAt, details)
  }
}

const METRIC_TAGS = {
  revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'Revenues'],
  grossProfit: ['GrossProfit'],
  ebitda: ['EarningsBeforeInterestTaxesDepreciationAndAmortization'],
  operatingCashFlow: ['NetCashProvidedByUsedInOperatingActivities'],
  capitalExpenditures: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'],
  cash: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'],
  // Prefer a reported total long-term-debt balance. The prior order selected
  // the current portion first when it was present, understating enterprise
  // value and every EV-based multiple.
  debt: ['LongTermDebt', 'LongTermDebtAndFinanceLeaseObligations', 'LongTermDebtAndFinanceLeaseObligationsNoncurrent', 'LongTermDebtNoncurrent', 'LongTermDebtCurrent'],
  shares: ['EntityCommonStockSharesOutstanding', 'CommonStockSharesOutstanding'],
}

function valueFromFact(facts, tags, unit) {
  for (const tag of tags) {
    const values = facts?.facts?.['us-gaap']?.[tag]?.units?.[unit] ?? facts?.facts?.['dei']?.[tag]?.units?.[unit] ?? []
    if (values.length) return { tag, values }
  }
  return { tag: null, values: [] }
}

function latestPointFact(facts, tags, unit = 'USD') {
  const { tag, values } = valueFromFact(facts, tags, unit)
  const candidates = values
    .filter((item) => item.end && Number.isFinite(Number(item.val)))
    .sort((left, right) => String(right.end).localeCompare(String(left.end)) || String(right.filed ?? '').localeCompare(String(left.filed ?? '')))
  const item = candidates[0]
  return item ? {
    value: Number(item.val),
    source: { tag, form: item.form, filed: item.filed, end: item.end, accn: item.accn, sourceType: 'SEC filed actual', confidence: 'High' },
  } : { value: null, source: null }
}

function incomePeriodFacts(facts, tags, cik = '') {
  const { tag, values } = valueFromFact(facts, tags, 'USD')
  const deduped = new Map()
  for (const item of values) {
    if (!item.start || !item.end || !['10-Q', '10-K', '10-Q/A', '10-K/A'].includes(item.form) || !Number.isFinite(Number(item.val))) continue
    const start = new Date(`${item.start}T12:00:00`)
    const end = new Date(`${item.end}T12:00:00`)
    const duration = Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1
    if (duration < 50 || duration > 390) continue
    const key = `${item.start}:${item.end}`
    const existing = deduped.get(key)
    if (!existing || String(item.filed ?? '') >= String(existing.filed ?? '')) deduped.set(key, item)
  }
  return [...deduped.values()].map((item) => ({
    value: Number(item.val),
    start: item.start,
    end: item.end,
    fiscalYear: item.fy ?? item.end.slice(0, 4),
    sourceType: 'SEC filed actual',
    sourceUrl: cik ? `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, '0')}.json` : null,
    tag,
    filed: item.filed,
    form: item.form,
    accn: item.accn,
  }))
}

function mergeCalendarValues(entries, years) {
  const out = Object.fromEntries(years.map((year) => [year, { value: null, components: [], sourceType: null, confidence: null }]))
  for (const entry of entries) {
    for (const year of years) {
      const value = entry?.[year]
      if (!value || value.value == null) continue
      const prior = out[year]
      out[year] = {
        value: (prior.value ?? 0) + value.value,
        components: [...prior.components, ...(value.components ?? [])],
        sourceType: value.sourceType ?? prior.sourceType,
        confidence: value.confidence ?? prior.confidence,
        method: value.method ?? prior.method,
        quarterlyWeights: value.quarterlyWeights ?? prior.quarterlyWeights,
        originalFiscalPeriod: value.originalFiscalPeriod ?? prior.originalFiscalPeriod,
        sourceUrl: value.sourceUrl ?? prior.sourceUrl,
        alternativeSources: [...(prior.alternativeSources ?? []), ...(value.alternativeSources ?? [])],
        warnings: [...(prior.warnings ?? []), ...(value.warnings ?? [])],
      }
    }
  }
  return out
}

function pct(current, base) {
  return current != null && base != null && base !== 0 ? (current / base) - 1 : null
}

function settleWithin(promise, fallback, timeoutMs = INTERACTIVE_SOURCE_TIMEOUT_MS) {
  let timeout
  return Promise.race([
    Promise.resolve(promise).catch(() => fallback),
    new Promise((resolve) => {
      timeout = setTimeout(() => resolve(fallback), timeoutMs)
    }),
  ]).finally(() => clearTimeout(timeout))
}

function deriveMarginBasedForwardMetric(forwardRevenue, ltmMetric, ltmRevenue, metricName, period) {
  if (forwardRevenue?.value == null || ltmMetric?.value == null || ltmRevenue?.value == null || Number(ltmRevenue.value) === 0) {
    return { value: null, components: [] }
  }
  return {
    value: Number(forwardRevenue.value) * (Number(ltmMetric.value) / Number(ltmRevenue.value)),
    components: [...(forwardRevenue.components ?? []), ...(ltmMetric.components ?? []), ...(ltmRevenue.components ?? [])],
    sourceType: 'Derived Estimate',
    confidence: 'Low',
    method: `${period.toLowerCase()}-revenue-consensus-times-ltm-${metricName}-margin`,
    sourceUrl: forwardRevenue.sourceUrl ?? null,
  }
}

function quoteRanges(chart, price) {
  const values = chart?.points?.map((point) => Number(point.close)).filter(Number.isFinite) ?? []
  if (Number.isFinite(Number(price))) values.push(Number(price))
  const high52 = values.length ? Math.max(...values) : null
  const low52 = values.length ? Math.min(...values) : null
  return { high52, low52, belowHigh52: pct(price, high52), aboveLow52: pct(price, low52) }
}

// The browser needs enough lineage to inspect a cell, not every repeated
// component copied through each derived NTM and forward calculation. Keep a
// bounded, de-duplicated trace in the client response; full source snapshots
// and the canonical ledger remain server-side for the audit command.
function compactComponents(components = [], limit = 8) {
  const unique = new Map()
  for (const component of components) {
    const key = [component.sourceProvider ?? component.provider, component.sourceStart, component.sourceEnd,
      component.tag, component.sourceType, component.sourceValue].join(':')
    if (unique.has(key)) continue
    unique.set(key, {
      provider: component.provider ?? component.sourceProvider ?? null,
      sourceProvider: component.sourceProvider ?? component.provider ?? null,
      metric: component.metric ?? null,
      quarterEnd: component.quarterEnd ?? component.sourceEnd ?? null,
      sourceStart: component.sourceStart ?? null,
      sourceEnd: component.sourceEnd ?? null,
      sourceValue: component.sourceValue ?? null,
      rawValue: component.rawValue ?? null,
      sourceUrl: component.sourceUrl ?? null,
      tag: component.tag ?? null,
      filed: component.filed ?? component.filingDate ?? null,
      filingDate: component.filingDate ?? component.filed ?? null,
      accn: component.accn ?? component.accession ?? null,
      accession: component.accession ?? component.accn ?? null,
      sourceType: component.sourceType ?? null,
      operationScope: component.operationScope ?? null,
      currency: component.currency ?? null,
      dateAuthority: component.dateAuthority ?? null,
      reportedVsDerived: component.reportedVsDerived ?? null,
      formula: component.formula ?? null,
      inputs: (component.inputs ?? []).slice(0, 12),
      sourceId: component.sourceId ?? null,
      filingForm: component.filingForm ?? null,
      document: component.document ?? null,
      documentHash: component.documentHash ?? null,
      sourcePeriodType: component.sourcePeriodType ?? null,
      sourcePeriodBasis: component.sourcePeriodBasis ?? null,
      exactCompanyMetricLabel: component.exactCompanyMetricLabel ?? null,
      tableTitle: component.tableTitle ?? null,
      tableIndex: component.tableIndex ?? null,
      rowIndex: component.rowIndex ?? null,
      columnIndex: component.columnIndex ?? null,
      rowLabel: component.rowLabel ?? null,
      columnLabel: component.columnLabel ?? null,
      rawCellValue: component.rawCellValue ?? null,
      rawReportedValue: component.rawReportedValue ?? null,
      reportedScale: component.reportedScale ?? null,
      reportedUnits: component.reportedUnits ?? null,
      normalizedValue: component.normalizedValue ?? null,
      definitionFingerprint: component.definitionFingerprint ?? null,
      adjustedEbitdaMethod: component.adjustedEbitdaMethod ?? null,
      adjustmentComponents: component.adjustmentComponents ?? [],
      selectionDecision: component.selectionDecision ?? null,
      overlapDays: component.overlapDays ?? null,
      totalDays: component.totalDays ?? null,
      allocationPercentage: component.allocationPercentage ?? null,
      contribution: component.contribution ?? null,
      derivation: component.derivation ?? null,
    })
    if (unique.size === limit) break
  }
  return [...unique.values()]
}

function compactSource(source) {
  if (!source) return source
  return {
    ...source,
    alternativeSources: (source.alternativeSources ?? []).slice(0, 2),
  }
}

function compactProvenanceEntry(entry) {
  if (!entry) return entry
  return {
    ...entry,
    components: compactComponents(entry.components),
    warnings: [...new Set(entry.warnings ?? [])].slice(0, 4),
    alternativeSources: (entry.alternativeSources ?? []).slice(0, 2),
  }
}

function compactValuationRowForClient(row) {
  return {
    ...row,
    provenance: {
      ...row.provenance,
      revenue: Object.fromEntries(Object.entries(row.provenance.revenue ?? {}).map(([period, entry]) => [period, compactProvenanceEntry(entry)])),
      grossProfit: Object.fromEntries(Object.entries(row.provenance.grossProfit ?? {}).map(([period, entry]) => [period, compactProvenanceEntry(entry)])),
      ebit: Object.fromEntries(Object.entries(row.provenance.ebit ?? {}).map(([period, entry]) => [period, compactProvenanceEntry(entry)])),
      operatingCashFlow: Object.fromEntries(Object.entries(row.provenance.operatingCashFlow ?? {}).map(([period, entry]) => [period, compactProvenanceEntry(entry)])),
      capitalExpenditures: Object.fromEntries(Object.entries(row.provenance.capitalExpenditures ?? {}).map(([period, entry]) => [period, compactProvenanceEntry(entry)])),
      ebitda: Object.fromEntries(Object.entries(row.provenance.ebitda ?? {}).map(([period, entry]) => [period, compactProvenanceEntry(entry)])),
      freeCashFlow: Object.fromEntries(Object.entries(row.provenance.freeCashFlow ?? {}).map(([period, entry]) => [period, compactProvenanceEntry(entry)])),
    },
    audit: {
      ...row.audit,
      cells: Object.fromEntries(Object.entries(row.audit.cells ?? {}).map(([key, record]) => [key, {
        ...record,
        source: compactSource(record.source),
        components: compactComponents(record.components),
        warnings: [...new Set(record.warnings ?? [])].slice(0, 4),
      }])),
    },
  }
}

function dateOnly(value) {
  return String(value ?? '').slice(0, 10)
}

export function latestCompletedTradingClose(points = [], now = new Date()) {
  const today = localDateString(now)
  return [...points]
    .filter((point) => Number.isFinite(Number(point.close)) && dateOnly(point.date) < today)
    .sort((left, right) => dateOnly(right.date).localeCompare(dateOnly(left.date)))[0]?.close ?? null
}

export function isMarketHistoryFresh(points = [], now = new Date()) {
  const latest = [...points].map((point) => dateOnly(point.date)).filter(Boolean).sort().at(-1)
  if (!latest) return false
  const ageDays = Math.floor((new Date(`${localDateString(now)}T12:00:00`) - new Date(`${latest}T12:00:00`)) / 86_400_000)
  return ageDays >= 0 && ageDays <= 5
}

export function buildMarginBasedForwardSeries({ revenue, estimateYears, ntmRevenue, basisMetric, basisRevenue, metricName }) {
  return {
    NTM: deriveMarginBasedForwardMetric(ntmRevenue, basisMetric, basisRevenue, metricName, 'NTM'),
    ...Object.fromEntries(estimateYears.map((year) => {
      const period = `${year}E`
      return [period, deriveMarginBasedForwardMetric(revenue[period], basisMetric, basisRevenue, metricName, period)]
    })),
  }
}

export function failClosedForwardBasis(metrics, estimateYears, reason) {
  for (const metric of metrics) {
    for (const period of ['NTM', ...estimateYears.map((year) => `${year}E`)]) {
      metric[period] = {
        value: null,
        components: [],
        sourceType: 'Unavailable',
        validationStatus: HISTORICAL_VALIDATION_STATUS.MISSING_SOURCE_DATA,
        method: reason,
        warnings: [reason],
      }
    }
  }
}

const VERIFIED_ADJUSTED_EBITDA_STATUSES = new Set([
  HISTORICAL_VALIDATION_STATUS.VERIFIED_REPORTED,
  HISTORICAL_VALIDATION_STATUS.VERIFIED_DERIVED,
])

function isUsableAdjustedEbitda(entry) {
  return entry?.value != null && Number.isFinite(Number(entry.value)) &&
    VERIFIED_ADJUSTED_EBITDA_STATUSES.has(entry.validationStatus ?? entry.status)
}

export function hasCompleteAuditedAdjustedEbitda(auditedFinancials, years) {
  if (!auditedFinancials) return false
  return years.every((year) => isUsableAdjustedEbitda(auditedFinancials.actuals?.ebitda?.[year])) &&
    isUsableAdjustedEbitda(auditedFinancials.ltm?.ebitda)
}

export async function loadSupplementalProductionTask(input, dependencies = {}, timeoutMs = SEC_SOURCE_TIMEOUT_MS) {
  if (input.skipSupplemental) return { records: [], errors: [], failure: null }
  const loadCached = dependencies.loadCached ?? loadLatestSupplementalSourceFacts
  const loadSupplemental = dependencies.loadSupplemental ?? loadSupplementalFilingFacts
  const result = await runAbortableTask('SUPPLEMENTAL_SEC_EXTRACTION', async (signal) => {
    const cached = input.refresh ? null : await loadCached(input.company).catch(() => null)
    if (cached) return cached
    return loadSupplemental({
      company: input.company,
      filingIndex: input.filingIndex,
      years: input.years,
      signal,
    })
  }, timeoutMs, { records: [], errors: [] })
  if (!result.diagnostic) {
    if (!result.value?.records?.length && result.value?.errors?.length) {
      return { ...result.value, failure: 'ADJUSTED_EBITDA_EXTRACTION_FAILED' }
    }
    return { ...result.value, failure: null }
  }
  const failure = result.diagnostic.reason === 'SUPPLEMENTAL_SEC_EXTRACTION_TIMEOUT'
    ? 'ADJUSTED_EBITDA_EXTRACTION_TIMEOUT'
    : 'ADJUSTED_EBITDA_EXTRACTION_FAILED'
  return {
    records: [],
    errors: [failure, result.diagnostic.detail].filter(Boolean),
    failure,
  }
}

export async function loadAdjustedEbitdaProductionTask(input, dependencies = {}, timeoutMs = SEC_SOURCE_TIMEOUT_MS) {
  const loadCached = dependencies.loadCached ?? loadLatestSupplementalSourceFacts
  const loadSupplemental = dependencies.loadSupplemental ?? loadSupplementalFilingFacts
  const buildLedger = dependencies.buildLedger ?? buildCanonicalQuarterlyLedger
  const controller = new AbortController()
  const task = async () => {
    const cachedSupplemental = input.preloadedSupplemental !== undefined
      ? null
      : input.skipSupplemental
      ? null
      : input.refresh
      ? null
      : await loadCached(input.company).catch(() => null)
    const supplemental = input.preloadedSupplemental !== undefined
      ? await input.preloadedSupplemental
      : input.skipSupplemental
      ? { records: [], errors: [] }
      : cachedSupplemental ?? await loadSupplemental({
        company: input.company,
        filingIndex: input.filingIndex,
        years: input.years,
        signal: controller.signal,
      }).catch((error) => ({ records: [], errors: [error?.message ?? 'ADJUSTED_EBITDA_SUPPLEMENTAL_FAILED'] }))
    if (supplemental?.failure || (!supplemental?.records?.length && supplemental?.errors?.length)) {
      throw new Error(supplemental.failure ?? 'ADJUSTED_EBITDA_EXTRACTION_FAILED')
    }
    controller.signal.throwIfAborted()
    const ledger = await buildLedger({
      company: input.company,
      facts: input.facts,
      years: input.years,
      filingIndex: input.filingIndex,
      supplementalRawFacts: supplemental.records,
      fallbackStatus: input.fallbackStatus,
    })
    return { ledger, supplemental, failure: null }
  }
  let timeout
  return Promise.race([
    Promise.resolve().then(task)
      .catch((error) => ({
        ledger: null,
        supplemental: { records: [], errors: [error?.message ?? 'ADJUSTED_EBITDA_EXTRACTION_FAILED'] },
        failure: error?.message ?? 'ADJUSTED_EBITDA_EXTRACTION_FAILED',
      })),
    new Promise((resolve) => {
      timeout = setTimeout(() => {
        controller.abort(new Error('ADJUSTED_EBITDA_EXTRACTION_TIMEOUT'))
        resolve({
          ledger: null,
          supplemental: { records: [], errors: ['ADJUSTED_EBITDA_EXTRACTION_TIMEOUT'] },
          failure: 'ADJUSTED_EBITDA_EXTRACTION_TIMEOUT',
        })
      }, timeoutMs)
    }),
  ]).finally(() => clearTimeout(timeout))
}

export async function loadLegacyForwardBasisProductionTask(input, dependencies = {}, timeoutMs = SEC_SOURCE_TIMEOUT_MS) {
  const loadCached = dependencies.loadCached ?? loadLatestSupplementalSourceFacts
  const loadSupplemental = dependencies.loadSupplemental ?? loadSupplementalFilingFacts
  const buildLedger = dependencies.buildLedger ?? buildCanonicalQuarterlyLedger
  return runAbortableTask('FORWARD_BASIS', async (signal) => {
    const cachedSupplemental = input.preloadedSupplemental !== undefined
      ? null
      : input.skipSupplemental ? null : await loadCached(input.company).catch(() => null)
    const supplemental = input.preloadedSupplemental !== undefined
      ? await input.preloadedSupplemental
      : input.skipSupplemental
      ? { records: [], errors: [] }
      : cachedSupplemental ?? await loadSupplemental({
          company: input.company, filingIndex: input.filingIndex, years: input.years, signal,
        })
    if (supplemental?.failure) throw new Error(supplemental.failure)
    signal.throwIfAborted()
    const ledger = await buildLedger({
      company: input.company, facts: input.facts, years: input.years, filingIndex: input.filingIndex,
      supplementalRawFacts: supplemental.records, fallbackStatus: input.fallbackStatus,
      includeAdjustedEbitda: false,
    })
    return completeWithSecExceptionQuarters(
      input.ticker, buildWiseSheetsHistorical(input.ticker, input.wiseSheetsRows, input.years), ledger.ledger, input.years,
    )
  }, timeoutMs)
}

const CANONICAL_HISTORICAL_METRICS = Object.freeze([
  'revenue', 'grossProfit', 'ebit', 'operatingCashFlow', 'capitalExpenditures', 'freeCashFlow',
])

function unavailableHistoricalEntry(status, reason) {
  return { value: null, classification: null, status, reason, components: [] }
}

export function canonicalHistoricalForApi(canonical, years, unavailableStatus = HISTORICAL_VALIDATION_STATUS.MISSING_BUT_AVAILABLE) {
  const calendarActuals = {}
  const ltm = {}
  for (const metric of CANONICAL_HISTORICAL_METRICS) {
    calendarActuals[metric] = Object.fromEntries(years.map((year) => [year,
      canonical?.calendarActuals?.[metric]?.[year] ?? unavailableHistoricalEntry(unavailableStatus, 'CANONICAL_RESULT_UNAVAILABLE'),
    ]))
    ltm[metric] = canonical?.ltm?.[metric] ?? unavailableHistoricalEntry(unavailableStatus, 'CANONICAL_RESULT_UNAVAILABLE')
  }
  return { calendarActuals, ltm }
}

function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export async function buildValuationRow(supabase, ticker, years, wiseSheetsRows = [], options = {}) {
  const profile = options.latencyProfile ?? null
  if (profile) {
    profile.caches ??= {}
    profile.flags ??= {}
  }
  const auditedFinancials = await (options.auditedFinancialsLoader ?? loadAuditedFinancials)(ticker, years.actual)
  const sourceResults = await Promise.all([
    measureLatency(profile, 'marketQuote', () => runBoundedTask('MARKET_QUOTE', () =>
      (options.priceLoader ?? getPrice)(supabase, ticker), INTERACTIVE_SOURCE_TIMEOUT_MS)),
    measureLatency(profile, 'yahooFundamentals', () => runBoundedTask('YAHOO_FUNDAMENTALS', () =>
      (options.fundamentalsLoader ?? fetchYahooFundamentals)(ticker), INTERACTIVE_SOURCE_TIMEOUT_MS)),
    measureLatency(profile, 'secCompanyResolution', () => runAbortableTask(
      'SEC_COMPANY_RESOLUTION', (signal) => (options.companyResolver ?? resolveCompany)(ticker, { signal }), SEC_SOURCE_TIMEOUT_MS,
    )),
    measureLatency(profile, 'yahooChart', () => runBoundedTask('YAHOO_CHART', () =>
      (options.chartLoader ?? fetchYahooChart)(ticker, '1y'), INTERACTIVE_SOURCE_TIMEOUT_MS)),
  ])
  const [quote, fundamentals, company, chart] = sourceResults.map((result) => result.value)
  const sourceDiagnostics = sourceResults.map((result) => result.diagnostic).filter(Boolean)
  const filingIndexResult = company
    ? await measureLatency(profile, 'secFilingIndex', () => runAbortableTask(
      'SEC_FILING_INDEX', (signal) => (options.filingIndexLoader ?? buildFilingIndex)(company, { signal }), SEC_SOURCE_TIMEOUT_MS,
    ))
    : { value: null, diagnostic: null }
  const filingIndex = filingIndexResult.value
  if (filingIndexResult.diagnostic) sourceDiagnostics.push(filingIndexResult.diagnostic)
  const issuerClassification = classifyIssuer({ ticker, company, filings: filingIndex?.filings ?? [] })
  const operatingCompany = isOperatingCompanyClassification(issuerClassification.classification)
  const factsResult = company && operatingCompany
    ? await measureLatency(profile, 'secCompanyFacts', () => runAbortableTask(
      'SEC_COMPANY_FACTS', (signal) => (options.companyFactsLoader ?? getCompanyFacts)(company.cik, { signal }), SEC_SOURCE_TIMEOUT_MS,
    ))
    : { value: null, diagnostic: null }
  const facts = factsResult.value
  if (factsResult.diagnostic) sourceDiagnostics.push(factsResult.diagnostic)
  const cacheKey = `${ticker}:${years.actual.join('-')}${options.profileCacheKey ?? ''}`
  let canonicalHistoryRebuilt = false
  const canonicalCached = company && facts && filingIndex && operatingCompany
    ? await measureLatency(profile, 'canonicalCacheLookup', () => canonicalHistoryCache.get(cacheKey, () => {
        canonicalHistoryRebuilt = true
        return measureLatency(profile, 'canonicalHistoricalRebuild', () =>
          (options.canonicalHistoricalBuilder ?? buildCanonicalHistoricalFinancials)({
          ticker,
          wiseSheetsRows,
          company,
          facts,
          filings: filingIndex,
          years: years.actual,
          asOfDate: localDateString(),
          targetedSecTimeoutMs: SEC_SOURCE_TIMEOUT_MS,
          onTiming: (stage, elapsedMs, details) => recordLatency(profile, stage, elapsedMs, details),
        }))
      }, {
        refresh: Boolean(options.refreshCanonical),
        waitForRefresh: Boolean(options.refreshCanonical),
      }))
      .catch((error) => ({
        value: { canonical: null, failure: error?.message ?? 'CANONICAL_HISTORICAL_BUILD_FAILED' },
        cache: { state: 'ERROR', ageMs: null, refreshing: false },
      }))
    : { value: { canonical: null, failure: null }, cache: { state: 'UNAVAILABLE', ageMs: null, refreshing: false } }
  const auditedAdjustedEbitdaComplete = hasCompleteAuditedAdjustedEbitda(auditedFinancials, years.actual)
  const needsSupplemental = Boolean(company && facts && operatingCompany &&
    (options.includeAdjustedEbitda || options.includeForwardBasis))
  const supplementalPromise = needsSupplemental
    ? measureLatency(profile, 'supplementalSec', () => loadSupplementalProductionTask({
        company, filingIndex, years: years.actual, skipSupplemental: false,
        refresh: Boolean(options.refreshAdjustedEbitda),
      }, options.supplementalDependencies ?? {}, SEC_SOURCE_TIMEOUT_MS))
    : Promise.resolve({ records: [], errors: [], failure: null })
  const adjustedLoader = () => measureLatency(profile, 'adjustedEbitda', () => loadAdjustedEbitdaProductionTask({
    company,
    facts,
    years: years.actual,
    filingIndex,
    skipSupplemental: !operatingCompany || auditedAdjustedEbitdaComplete,
    preloadedSupplemental: needsSupplemental && !auditedAdjustedEbitdaComplete ? supplementalPromise : undefined,
    refresh: Boolean(options.refreshAdjustedEbitda),
    fallbackStatus: issuerClassification.financialStatus ?? HISTORICAL_VALIDATION_STATUS.MISSING_BUT_AVAILABLE,
  }, options.adjustedEbitdaDependencies ?? {}))
  const adjustedPromise = company && facts
    ? options.includeAdjustedEbitda
      ? adjustedEbitdaCache.get(cacheKey, adjustedLoader, {
          refresh: Boolean(options.refreshAdjustedEbitda),
          waitForRefresh: Boolean(options.refreshAdjustedEbitda),
        })
      : adjustedEbitdaCache.peek(cacheKey)
    : Promise.resolve({ value: null, cache: { state: 'UNAVAILABLE', ageMs: null, refreshing: false } })
  const forwardBasisPromise = company && facts && options.includeForwardBasis
    ? measureLatency(profile, 'forwardBasis', () => loadLegacyForwardBasisProductionTask({
        ticker, company, facts, years: years.actual, filingIndex, wiseSheetsRows,
        skipSupplemental: !operatingCompany,
        preloadedSupplemental: needsSupplemental ? supplementalPromise : undefined,
        fallbackStatus: issuerClassification.financialStatus ?? HISTORICAL_VALIDATION_STATUS.MISSING_BUT_AVAILABLE,
      }, options.forwardBasisDependencies ?? {}))
    : Promise.resolve({ value: null, diagnostic: null })
  const [adjustedCached, forwardBasisResult] = await Promise.all([adjustedPromise, forwardBasisPromise])
  const adjustedEbitdaPending = Boolean(company && facts && !adjustedCached.value && !options.includeAdjustedEbitda)
  const adjustedEbitdaLoad = adjustedCached.value ?? {
    ledger: null,
    supplemental: { records: [], errors: [] },
    failure: adjustedEbitdaPending ? 'ADJUSTED_EBITDA_LOADING' : null,
  }
  const canonicalProduction = canonicalCached.value
  if (profile) {
    profile.caches.canonicalHistory = canonicalCached.cache?.state ?? 'UNAVAILABLE'
    profile.flags.canonicalHistoryRebuilt = canonicalHistoryRebuilt
    profile.flags.adjustedEbitdaRan = Boolean(options.includeAdjustedEbitda)
  }
  const rowConstructionStartedAt = performance.now()
  const historicalLedger = adjustedEbitdaLoad.ledger
  const supplemental = adjustedEbitdaLoad.supplemental
  const canonical = canonicalProduction?.canonical ?? null
  const legacyForwardHistorical = forwardBasisResult.value
  const secMetricPeriods = Object.fromEntries(Object.entries({
    revenue: METRIC_TAGS.revenue,
    grossProfit: METRIC_TAGS.grossProfit,
    ebitda: METRIC_TAGS.ebitda,
    operatingCashFlow: METRIC_TAGS.operatingCashFlow,
    capitalExpenditures: METRIC_TAGS.capitalExpenditures,
  }).map(([metric, tags]) => [metric, normalizeCumulativeQuarterlyFacts(incomePeriodFacts(facts, tags, company?.cik))]))

  const unavailableStatus = issuerClassification.financialStatus ?? HISTORICAL_VALIDATION_STATUS.MISSING_BUT_AVAILABLE
  const adjustedFailureStatus = adjustedEbitdaLoad.failure
    ? 'MISSING_SOURCE_DATA'
    : unavailableStatus
  const unavailableActuals = Object.fromEntries(['ebitda'].map((metric) => [metric,
    Object.fromEntries(years.actual.map((year) => [year, {
      value: null,
      components: [],
      sourceType: 'Unavailable',
      validationStatus: adjustedFailureStatus,
      method: adjustedEbitdaLoad.failure ?? adjustedFailureStatus,
      warnings: [adjustedEbitdaLoad.failure ?? issuerClassification.reason],
    }]))]))
  const canonicalHistorical = canonicalHistoricalForApi(canonical, years.actual, unavailableStatus)
  const calendarizedActuals = {
    ...canonicalHistorical.calendarActuals,
    ebitda: historicalLedger?.calendarActuals?.ebitda ?? unavailableActuals.ebitda,
  }
  if (auditedFinancials) {
    for (const metric of ['ebitda']) {
      for (const year of years.actual) {
        const auditedEntry = auditedFinancials.actuals[metric]?.[year]
        if (isUsableAdjustedEbitda(auditedEntry)) calendarizedActuals[metric][year] = auditedEntry
      }
    }
  }
  const unavailableLtm = { value: null, components: [], sourceType: 'Unavailable', validationStatus: unavailableStatus, method: unavailableStatus }
  const unavailableAdjustedLtm = { ...unavailableLtm, validationStatus: adjustedFailureStatus,
    method: adjustedEbitdaLoad.failure ?? adjustedFailureStatus, warnings: [adjustedEbitdaLoad.failure].filter(Boolean) }
  const ltm = {
    ...canonicalHistorical.ltm,
    ebitda: isUsableAdjustedEbitda(auditedFinancials?.ltm?.ebitda)
      ? auditedFinancials.ltm.ebitda
      : historicalLedger?.adjustedEbitda?.ltm ?? unavailableAdjustedLtm,
  }
  const freeCashFlowActuals = calendarizedActuals.freeCashFlow
  // LTM is a historical financial metric. Do not substitute a provider
  // aggregate when four SEC-backed standalone quarters are unavailable.
  // Missing SEC coverage must remain unavailable in the table.
  const ltmRevenue = ltm.revenue
  const ltmGrossProfit = ltm.grossProfit
  const ltmEbit = ltm.ebit
  const ltmEbitda = ltm.ebitda
  assertCanonicalAdjustedEbitdaEntry(ltmEbitda, ADJUSTED_EBITDA_PERIOD.LTM)
  const ltmFreeCashFlow = ltm.freeCashFlow
  const forwardBasisRevenue = legacyForwardHistorical?.ltm?.revenue ?? unavailableLtm
  const forwardBasisGrossProfit = legacyForwardHistorical?.ltm?.grossProfit ?? unavailableLtm
  const forwardBasisFreeCashFlow = legacyForwardHistorical?.ltm?.freeCashFlow ?? unavailableLtm
  const forwardBasisAvailable = Boolean(legacyForwardHistorical)
  const revenueWeights = historicalSeasonality(secMetricPeriods.revenue)
  const calendarizedEstimates = {
    revenue: mergeCalendarValues(
      (fundamentals?.estimates?.revenueConsensus ?? []).map((estimate) =>
        calendarizeAnnualEstimateWithReportedQuarters(estimate, years.estimate, revenueWeights, secMetricPeriods.revenue)),
      years.estimate,
    ),
  }
  const calendarizedRevenue = Object.fromEntries(years.estimate.map((year) => [year,
    calendarizedEstimates.revenue?.[year]?.value != null
      ? calendarizedEstimates.revenue[year]
      : calendarizedActuals.revenue?.[year] ?? null,
  ]))
  const ntmRevenue = calculateNtmFromAnnualConsensus(
    fundamentals?.estimates?.revenueConsensus ?? [],
    revenueWeights,
    secMetricPeriods.revenue,
  )

  const cash = latestPointFact(facts, METRIC_TAGS.cash)
  const debt = latestPointFact(facts, METRIC_TAGS.debt)
  const shares = latestPointFact(facts, METRIC_TAGS.shares, 'shares')
  const dilutedShares = shares.value ?? null
  const secEnterpriseInputsAvailable = [dilutedShares, debt.value, cash.value]
    .every((value) => value != null && Number.isFinite(Number(value)))
  const structure = secEnterpriseInputsAvailable
    ? enterpriseValue({ price: quote?.price, dilutedShares, debt: debt.value, cash: cash.value })
    : {
      equityValue: quote?.price != null && dilutedShares != null
        ? Number(quote.price) * Number(dilutedShares)
        : null,
      enterpriseValue: null,
    }
  const dailyBase = quote?.previousClose ?? chart?.previousClose ?? latestCompletedTradingClose(chart?.points)
  const financialTimestamp = [
    ...Object.values(secMetricPeriods).flat().map((period) => period.filed),
    ...Object.values(canonical?.records ?? {}).flat().map((period) => period.filingDate),
    cash.source?.filed,
    debt.source?.filed,
    shares.source?.filed,
  ].filter(Boolean).sort().at(-1) ?? null

  const revenue = {
    ...Object.fromEntries(years.actual.map((year) => [`${year}A`, calendarizedActuals.revenue?.[year] ?? null])),
    LTM: ltmRevenue,
    ...Object.fromEntries(years.estimate.map((year) => [`${year}E`, calendarizedRevenue?.[year] ?? null])),
  }
  const grossProfit = {
    ...Object.fromEntries(years.actual.map((year) => [`${year}A`, calendarizedActuals.grossProfit?.[year] ?? null])),
    LTM: ltmGrossProfit,
  }
  const ebitda = {
    ...Object.fromEntries(years.actual.map((year) => [`${year}A`, calendarizedActuals.ebitda?.[year] ?? null])),
    LTM: ltmEbitda,
  }
  for (const year of years.actual) {
    assertCanonicalAdjustedEbitdaEntry(ebitda[`${year}A`], ADJUSTED_EBITDA_PERIOD.CALENDAR_YEAR)
  }
  const freeCashFlow = {
    ...Object.fromEntries(years.actual.map((year) => [`${year}A`, freeCashFlowActuals[year] ?? null])),
    LTM: ltmFreeCashFlow,
  }
  const ebit = {
    ...Object.fromEntries(years.actual.map((year) => [`${year}A`, calendarizedActuals.ebit?.[year] ?? null])),
    LTM: ltmEbit,
  }
  const operatingCashFlow = {
    ...Object.fromEntries(years.actual.map((year) => [`${year}A`, calendarizedActuals.operatingCashFlow[year]])),
    LTM: ltm.operatingCashFlow,
  }
  const capitalExpenditures = {
    ...Object.fromEntries(years.actual.map((year) => [`${year}A`, calendarizedActuals.capitalExpenditures[year]])),
    LTM: ltm.capitalExpenditures,
  }
  revenue.NTM = ntmRevenue
  Object.assign(grossProfit, buildMarginBasedForwardSeries({
    revenue, estimateYears: years.estimate, ntmRevenue,
    basisMetric: forwardBasisGrossProfit, basisRevenue: forwardBasisRevenue, metricName: 'gross-profit',
  }))
  Object.assign(ebit, buildMarginBasedForwardSeries({
    revenue, estimateYears: years.estimate, ntmRevenue,
    basisMetric: ltmEbit, basisRevenue: ltmRevenue, metricName: 'ebit',
  }))
  ebitda.NTM = {
    value: null,
    components: [],
    sourceType: 'Unavailable',
    validationStatus: HISTORICAL_VALIDATION_STATUS.LEGITIMATE_NA,
    method: 'NO_COMPANY_DEFINED_ADJUSTED_EBITDA_CONSENSUS',
    warnings: ['Adjusted EBITDA estimates are not synthesized from a trailing margin.'],
  }
  Object.assign(freeCashFlow, buildMarginBasedForwardSeries({
    revenue, estimateYears: years.estimate, ntmRevenue,
    basisMetric: forwardBasisFreeCashFlow, basisRevenue: forwardBasisRevenue, metricName: 'free-cash-flow',
  }))
  if (!forwardBasisAvailable) {
    const forwardStatus = forwardBasisResult.diagnostic?.reason ?? 'FORWARD_BASIS_UNAVAILABLE'
    failClosedForwardBasis([grossProfit, freeCashFlow], years.estimate, forwardStatus)
  }
  for (const year of years.estimate) {
    const period = `${year}E`
    ebitda[period] = {
      value: null,
      components: [],
      sourceType: 'Unavailable',
      validationStatus: HISTORICAL_VALIDATION_STATUS.LEGITIMATE_NA,
      method: 'NO_COMPANY_DEFINED_ADJUSTED_EBITDA_CONSENSUS',
      warnings: ['Adjusted EBITDA estimates are not synthesized from a trailing margin.'],
    }
  }
  const metricValues = (metric) => Object.fromEntries(Object.entries(metric).map(([period, entry]) => [period, entry?.value ?? null]))
  const revenueValues = metricValues(revenue)
  const grossProfitValues = metricValues(grossProfit)
  const ebitValues = metricValues(ebit)
  const ebitdaValues = metricValues(ebitda)
  const freeCashFlowValues = metricValues(freeCashFlow)
  const operatingCashFlowValues = metricValues(operatingCashFlow)
  const capitalExpendituresValues = metricValues(capitalExpenditures)

  const ranges = quoteRanges(chart, quote?.price)
  const row = {
    ticker,
    name: company?.name ?? ticker,
    cik: company?.cik ?? null,
    issuerClassification,
    adjustedEbitdaEngineVersion: ltmEbitda?.adjustedEbitdaEngineVersion ??
      historicalLedger?.adjustedEbitda?.engineVersion ?? null,
    filingExtraction: { filingsExamined: supplemental.filingsExamined ?? 0, errors: supplemental.errors },
    currency: quote?.currency ?? fundamentals?.currency ?? 'USD',
    price: quote?.price ?? null,
    dailyChange: quote?.price != null && dailyBase != null ? quote.price - dailyBase : null,
    dailyPercent: pct(quote?.price, dailyBase),
    ranges,
    capital: {
      dilutedShares,
      equityValue: structure.equityValue,
      debt: debt.value,
      cash: cash.value,
      enterpriseValue: structure.enterpriseValue,
    },
    metrics: {
      revenue: revenueValues,
      grossProfit: grossProfitValues,
      ebit: ebitValues,
      operatingCashFlow: operatingCashFlowValues,
      capitalExpenditures: capitalExpendituresValues,
      ebitda: ebitdaValues,
      freeCashFlow: freeCashFlowValues,
      revenueGrowth: Object.fromEntries(Object.keys(revenueValues).map((period, index, list) => [period, index ? pct(revenueValues[period], revenueValues[list[index - 1]]) : null])),
      grossMargin: Object.fromEntries(Object.keys(grossProfitValues).map((period) => [period, pct(grossProfitValues[period], revenueValues[period] ?? null) == null ? null : grossProfitValues[period] / revenueValues[period]])),
      ebitdaMargin: Object.fromEntries(Object.keys(ebitdaValues).map((period) => [period, ebitdaValues[period] != null && revenueValues[period] ? ebitdaValues[period] / revenueValues[period] : null])),
    },
    multiples: {
      evRevenue: Object.fromEntries(Object.keys(revenueValues).map((period) => [period, valuationMultiple(structure.enterpriseValue, revenueValues[period])])),
      evGrossProfit: Object.fromEntries(Object.keys(grossProfitValues).map((period) => [period, valuationMultiple(structure.enterpriseValue, grossProfitValues[period])])),
      evEbit: Object.fromEntries(Object.keys(ebitValues).map((period) => [period, valuationMultiple(structure.enterpriseValue, ebitValues[period])])),
      evEbitda: Object.fromEntries(Object.entries(ebitda).map(([period, entry]) =>
        [period, valuationMultiple(structure.enterpriseValue, entry?.value ?? null)])),
      evFreeCashFlow: Object.fromEntries(Object.keys(freeCashFlowValues).map((period) => [period, valuationMultiple(structure.enterpriseValue, freeCashFlowValues[period])])),
    },
    multipleDenominatorIdentity: {
      evEbitda: Object.fromEntries(Object.entries(ebitda).map(([period, entry]) =>
        [period, adjustedEbitdaDenominatorIdentity(entry)])),
    },
    provenance: {
      revenue,
      grossProfit,
      ebit,
      operatingCashFlow,
      capitalExpenditures,
      ebitda,
      freeCashFlow,
      capital: { cash: cash.source, debt: debt.source, dilutedShares: shares.source },
      market: { sourceType: 'Yahoo Finance market quote', confidence: 'Medium', retrievedAt: new Date().toISOString() },
    },
    canonicalHistorical: {
      latestReportedPeriods: canonical?.latestReportedPeriods ?? {},
      cache: canonicalCached.cache,
      failures: [
        ...(canonical?.failures ?? []),
        ...(canonicalProduction?.failure ? [{ stage: 'CANONICAL_HISTORICAL', reason: canonicalProduction.failure }] : []),
        ...(adjustedEbitdaLoad.failure ? [{ stage: 'ADJUSTED_EBITDA', reason: adjustedEbitdaLoad.failure }] : []),
        ...(forwardBasisResult.diagnostic ? [{ stage: 'FORWARD_BASIS', reason: forwardBasisResult.diagnostic.reason }] : []),
        ...sourceDiagnostics,
      ].slice(0, 50),
    },
    forwardBasisInputs: {
      revenue: forwardBasisRevenue,
      grossProfit: forwardBasisGrossProfit,
      ebit: ltmEbit,
      ebitRevenue: ltmRevenue,
      freeCashFlow: forwardBasisFreeCashFlow,
    },
    consensusContext: { revenueWeights, revenuePeriods: secMetricPeriods.revenue },
    consensusSnapshot: { updatedAt: new Date().toISOString(), state: 'READY' },
    loadingSections: { adjustedEbitda: adjustedEbitdaPending, forwardBasis: !forwardBasisAvailable },
    marketTimestamp: quote?.fetchedAt ?? null,
    financialTimestamp,
    coverage: 'Canonical WiseSheets + SEC historical GAAP actuals + SEC Adjusted EBITDA + Yahoo consensus',
    historicalAudit: Object.values(calendarizedActuals)
      .flatMap((byYear) => Object.values(byYear ?? {}))
      .reduce((summary, entry) => {
        const status = entry?.status ?? entry?.validationStatus ?? unavailableStatus
        summary[status] = (summary[status] ?? 0) + 1
        return summary
      }, {}),
  }
  row.auditInputs = { dailyBase, high52: ranges.high52, low52: ranges.low52 }
  row.audit = buildRowAudit(row)
  delete row.auditInputs
  const compactRow = compactValuationRowForClient(row)
  recordLatency(profile, 'rowConstructionAudit', performance.now() - rowConstructionStartedAt)
  return compactRow
}

function loadingFinancialRow(ticker, quote, chart, diagnostic = null) {
  const ranges = quoteRanges(chart, quote?.price)
  const dailyBase = quote?.previousClose ?? chart?.previousClose ?? latestCompletedTradingClose(chart?.points)
  return {
    ticker,
    name: ticker,
    currency: quote?.currency ?? 'USD',
    price: quote?.price ?? null,
    dailyChange: quote?.price != null && dailyBase != null ? quote.price - dailyBase : null,
    dailyPercent: pct(quote?.price, dailyBase),
    ranges,
    metrics: {},
    multiples: {},
    provenance: { market: { sourceType: 'Yahoo Finance market quote', retrievedAt: new Date().toISOString() } },
    canonicalHistorical: { failures: diagnostic ? [diagnostic] : [] },
    loadingSections: { financialSnapshot: diagnostic?.reason !== 'FINANCIAL_SNAPSHOT_STORE_NOT_CONFIGURED', adjustedEbitda: true, forwardBasis: true },
    financialSnapshot: { state: 'MISSING', updatedAt: null, engineVersion: null },
    error: diagnostic?.reason === 'FINANCIAL_SNAPSHOT_STORE_NOT_CONFIGURED' ? diagnostic.reason : null,
    marketTimestamp: quote?.fetchedAt ?? null,
  }
}

export function applyMarketDataToFinancialSnapshot(snapshot, quote, chart) {
  if (!snapshot) return null
  const row = structuredClone(snapshot)
  const ranges = chart ? quoteRanges(chart, quote?.price) : row.ranges ?? quoteRanges(null, quote?.price)
  const dailyBase = quote?.previousClose ?? chart?.previousClose ?? latestCompletedTradingClose(chart?.points)
  const capital = row.capital ?? {}
  const structure = enterpriseValue({
    price: quote?.price,
    dilutedShares: capital.dilutedShares,
    debt: capital.debt,
    cash: capital.cash,
  })
  row.price = quote?.price ?? null
  row.currency = quote?.currency ?? row.currency ?? 'USD'
  row.dailyChange = quote?.price != null && dailyBase != null ? quote.price - dailyBase : row.dailyChange ?? null
  row.dailyPercent = dailyBase != null ? pct(quote?.price, dailyBase) : row.dailyPercent ?? null
  row.ranges = ranges
  row.marketTimestamp = quote?.fetchedAt ?? null
  row.capital = { ...capital, equityValue: structure.equityValue, enterpriseValue: structure.enterpriseValue }
  const metrics = row.metrics ?? {}
  row.multiples = {
    evRevenue: Object.fromEntries(Object.entries(metrics.revenue ?? {}).map(([period, value]) => [period, valuationMultiple(structure.enterpriseValue, value)])),
    evGrossProfit: Object.fromEntries(Object.entries(metrics.grossProfit ?? {}).map(([period, value]) => [period, valuationMultiple(structure.enterpriseValue, value)])),
    evEbit: Object.fromEntries(Object.entries(metrics.ebit ?? {}).map(([period, value]) => [period, valuationMultiple(structure.enterpriseValue, value)])),
    evEbitda: Object.fromEntries(Object.entries(metrics.ebitda ?? {}).map(([period, value]) => [period, valuationMultiple(structure.enterpriseValue, value)])),
    evFreeCashFlow: Object.fromEntries(Object.entries(metrics.freeCashFlow ?? {}).map(([period, value]) => [period, valuationMultiple(structure.enterpriseValue, value)])),
  }
  row.provenance ??= {}
  row.provenance.market = { sourceType: 'Yahoo Finance market quote', confidence: 'Medium', retrievedAt: new Date().toISOString() }
  if (row.consensusSnapshot) row.consensusSnapshot.state = consensusState(row.consensusSnapshot.updatedAt)
  row.loadingSections = { financialSnapshot: false, adjustedEbitda: false, forwardBasis: false }
  row.auditInputs = { dailyBase, high52: ranges.high52, low52: ranges.low52 }
  row.audit = buildRowAudit(row)
  delete row.auditInputs
  return compactValuationRowForClient(row)
}

export async function loadValuationMarketData(supabase, tickers, options = {}) {
  const now = options.now ?? new Date()
  const cutoff = new Date(now.getTime() - 370 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const historyPromise = supabase?.from
    ? Promise.resolve(supabase.from('price_history').select('ticker, date, close').in('ticker', tickers).gte('date', cutoff))
        .catch(() => ({ data: [], error: null }))
    : Promise.resolve({ data: [], error: null })
  const quoteLoader = options.quoteLoader ?? getPrices
  const [quotes, historyResult] = await Promise.all([
    quoteLoader(supabase, tickers, { refresh: Boolean(options.refresh) }), historyPromise,
  ])
  const historyByTicker = new Map(tickers.map((ticker) => [ticker, []]))
  for (const point of historyResult.data ?? []) {
    const ticker = String(point.ticker ?? '').toUpperCase()
    if (historyByTicker.has(ticker) && Number.isFinite(Number(point.close))) {
      historyByTicker.get(ticker).push({ date: point.date, close: Number(point.close) })
    }
  }
  for (const [ticker, points] of historyByTicker) {
    points.sort((left, right) => String(left.date).localeCompare(String(right.date)))
    const quote = quotes.get(ticker)
    if (quote && points.length) quotes.set(ticker, {
      ...quote, previousClose: quote.previousClose ?? latestCompletedTradingClose(points, now), chart: { points },
    })
  }
  if (!options.refresh) return quotes
  const stale = tickers.filter((ticker) => !isMarketHistoryFresh(historyByTicker.get(ticker), now))
  const chartLoader = options.chartLoader ?? fetchYahooChart
  const settled = await Promise.allSettled(stale.map((ticker) =>
    runBoundedTask('YAHOO_CHART', () => chartLoader(ticker, '1y'), INTERACTIVE_SOURCE_TIMEOUT_MS)))
  stale.forEach((ticker, index) => {
    const result = settled[index]
    const chart = result.status === 'fulfilled' ? result.value.value : null
    const quote = quotes.get(ticker)
    if (quote) quotes.set(ticker, { ...quote, chart })
  })
  return quotes
}

function consensusState(updatedAt) {
  const ageMs = Date.now() - Date.parse(updatedAt ?? '')
  return Number.isFinite(ageMs) && ageMs <= CONSENSUS_CACHE_TTL_MS ? 'READY' : 'STALE'
}

export function applyConsensusToFinancialSnapshot(snapshot, fundamentals, years, updatedAt = new Date().toISOString()) {
  const row = structuredClone(snapshot)
  const context = row.consensusContext ?? {}
  const basis = row.forwardBasisInputs ?? {}
  const revenueWeights = context.revenueWeights ?? []
  const revenuePeriods = context.revenuePeriods ?? []
  const consensus = fundamentals?.estimates?.revenueConsensus ?? []
  const calendarizedEstimates = mergeCalendarValues(consensus.map((estimate) =>
    calendarizeAnnualEstimateWithReportedQuarters(estimate, years.estimate, revenueWeights, revenuePeriods)), years.estimate)
  const revenue = row.provenance?.revenue ?? {}
  for (const year of years.estimate) {
    const period = `${year}E`
    revenue[period] = calendarizedEstimates[year]?.value != null ? calendarizedEstimates[year] : revenue[period] ?? null
  }
  revenue.NTM = calculateNtmFromAnnualConsensus(consensus, revenueWeights, revenuePeriods)
  row.provenance.revenue = revenue
  const grossProfit = row.provenance.grossProfit ?? {}
  Object.assign(grossProfit, buildMarginBasedForwardSeries({
    revenue, estimateYears: years.estimate, ntmRevenue: revenue.NTM,
    basisMetric: basis.grossProfit, basisRevenue: basis.revenue, metricName: 'gross-profit',
  }))
  const ebit = row.provenance.ebit ?? {}
  Object.assign(ebit, buildMarginBasedForwardSeries({
    revenue, estimateYears: years.estimate, ntmRevenue: revenue.NTM,
    basisMetric: basis.ebit, basisRevenue: basis.ebitRevenue, metricName: 'ebit',
  }))
  const freeCashFlow = row.provenance.freeCashFlow ?? {}
  Object.assign(freeCashFlow, buildMarginBasedForwardSeries({
    revenue, estimateYears: years.estimate, ntmRevenue: revenue.NTM,
    basisMetric: basis.freeCashFlow, basisRevenue: basis.revenue, metricName: 'free-cash-flow',
  }))
  row.provenance.grossProfit = grossProfit
  row.provenance.ebit = ebit
  row.provenance.freeCashFlow = freeCashFlow
  const values = (entries) => Object.fromEntries(Object.entries(entries).map(([period, entry]) => [period, entry?.value ?? null]))
  row.metrics.revenue = values(revenue)
  row.metrics.grossProfit = values(grossProfit)
  row.metrics.ebit = values(ebit)
  row.metrics.freeCashFlow = values(freeCashFlow)
  row.metrics.revenueGrowth = Object.fromEntries(Object.keys(row.metrics.revenue).map((period, index, list) =>
    [period, index ? pct(row.metrics.revenue[period], row.metrics.revenue[list[index - 1]]) : null]))
  row.metrics.grossMargin = Object.fromEntries(Object.keys(row.metrics.grossProfit).map((period) =>
    [period, row.metrics.revenue[period] ? row.metrics.grossProfit[period] / row.metrics.revenue[period] : null]))
  row.multiples.evEbit = Object.fromEntries(Object.entries(row.metrics.ebit).map(([period, value]) =>
    [period, valuationMultiple(row.capital?.enterpriseValue, value)]))
  row.consensusSnapshot = { updatedAt, state: 'READY' }
  row.audit = buildRowAudit(row)
  return row
}

export async function getValuationRows(supabase, inputTickers = [], options = {}) {
  const profile = options.latencyProfile ?? null
  if (profile) {
    profile.caches ??= {}
    profile.flags ??= {}
  }
  const requestStartedAt = performance.now()
  const tickers = [...new Set(inputTickers.map((ticker) => String(ticker).trim().toUpperCase()).filter(Boolean))].slice(0, 40)
  const now = new Date()
  const currentYear = now.getFullYear()
  const years = { actual: [currentYear - 3, currentYear - 2, currentYear - 1], estimate: [currentYear, currentYear + 1] }
  const cacheKey = `snapshot-market-v1:${tickers.join(',')}:${years.actual.join(',')}${options.profileCacheKey ?? ''}`
  const cached = cache.get(cacheKey)
  const responseHasPendingSources = (value) => value?.rows?.some((row) => row.loadingSections?.financialSnapshot)
  const bypassAggregateCache = options.refresh || options.financialRefresh || options.consensusRefresh
  if (profile) profile.caches.aggregate = cached && cached.expiresAt > Date.now() ? 'HIT' : 'MISS'
  if (!bypassAggregateCache && cached && cached.expiresAt > Date.now() && !responseHasPendingSources(cached.value)) {
    recordLatency(profile, 'totalRequest', performance.now() - requestStartedAt)
    return cached.value
  }

  if (!bypassAggregateCache && inFlight.has(cacheKey)) return inFlight.get(cacheKey)

  const request = (async () => {
    const activity = options.activityCounters ?? {}
    activity.secHistoryCalls ??= 0
    activity.wiseSheetsCalls ??= 0
    activity.canonicalRebuilds ??= 0
    activity.adjustedEbitdaRuns ??= 0
    activity.consensusCalls ??= 0
    const snapshotRepository = options.snapshotRepository ?? {
      load: loadFinancialSnapshots,
      save: saveFinancialSnapshot,
    }
    const marketLoader = options.marketLoader ?? loadValuationMarketData
    const providerLoader = options.providerLoader ?? loadWiseSheetsBatch
    const financialRowBuilder = options.financialRowBuilder ?? buildValuationRow
    const providerTickers = options.providerTickers?.length ? options.providerTickers : tickers
    const quotesPromise = measureLatency(profile, 'marketQuote', () => marketLoader(supabase, providerTickers, {
      refresh: Boolean(options.refresh),
    }))
    let snapshotResult
    if (options.financialRefresh) {
      const existingResult = await measureLatency(profile, 'financialSnapshotRead', () =>
        snapshotRepository.load(supabase, tickers, { actualYears: years.actual }))
      activity.wiseSheetsCalls += 1
      const wiseSheetsResult = await measureLatency(profile, 'wiseSheetsAcquisition', () => providerLoader(tickers, {
        refresh: true,
        cacheKeySuffix: options.profileCacheKey ?? '',
      }))
      if (profile) profile.caches.wiseSheets = wiseSheetsResult.cache?.state ?? 'UNAVAILABLE'
      const refreshed = new Map()
      const refreshDiagnostics = []
      for (const ticker of tickers) {
        activity.canonicalRebuilds += 1
        activity.adjustedEbitdaRuns += 1
        const row = await financialRowBuilder(supabase, ticker, years,
          (wiseSheetsResult.value ?? []).filter((item) => String(item.ticker).toUpperCase() === ticker), {
            ...options,
            refreshCanonical: true,
            includeAdjustedEbitda: true,
            refreshAdjustedEbitda: true,
            includeForwardBasis: true,
          })
        const candidate = snapshotFinancialRow(row)
        const promotion = evaluateFinancialSnapshotPromotion(existingResult.snapshots.get(ticker), candidate, {
          actualYears: years.actual,
        })
        if (!promotion.accepted) {
          refreshDiagnostics.push({ ticker, ...promotion.diagnostic })
          refreshed.set(ticker, promotion.snapshot)
          continue
        }
        const saved = await snapshotRepository.save(supabase, ticker, candidate, { actualYears: years.actual })
        refreshed.set(ticker, saved)
      }
      snapshotResult = { snapshots: refreshed, diagnostic: existingResult.diagnostic, refreshDiagnostics }
    } else if (options.consensusRefresh) {
      snapshotResult = await measureLatency(profile, 'financialSnapshotRead', () =>
        snapshotRepository.load(supabase, tickers, { actualYears: years.actual }))
      const consensusLoader = options.consensusLoader ?? fetchYahooFundamentals
      const refreshed = new Map()
      for (const ticker of tickers) {
        const snapshot = snapshotResult.snapshots.get(ticker)
        if (!snapshot || snapshot.financialSnapshot?.state === FINANCIAL_SNAPSHOT_STATE.INCOMPATIBLE) continue
        activity.consensusCalls += 1
        const consensusResult = await consensusCache.get(ticker, () => runBoundedTask(
          'CONSENSUS_REFRESH', () => consensusLoader(ticker, snapshot.currency), INTERACTIVE_SOURCE_TIMEOUT_MS,
        ), { refresh: true, waitForRefresh: true })
        const fundamentals = consensusResult.value?.value ?? consensusResult.value
        if (!fundamentals) {
          refreshed.set(ticker, { ...snapshot, consensusSnapshot: {
            ...(snapshot.consensusSnapshot ?? {}), state: 'STALE', reason: 'CONSENSUS_REFRESH_FAILED',
          } })
          continue
        }
        const updated = applyConsensusToFinancialSnapshot(snapshot, fundamentals, years)
        const saved = await snapshotRepository.save(supabase, ticker, snapshotFinancialRow(updated), {
          actualYears: years.actual,
          updatedAt: snapshot.financialSnapshot?.updatedAt,
        })
        refreshed.set(ticker, saved)
      }
      snapshotResult = { ...snapshotResult, snapshots: new Map([...snapshotResult.snapshots, ...refreshed]) }
    } else {
      snapshotResult = await measureLatency(profile, 'financialSnapshotRead', () =>
        snapshotRepository.load(supabase, tickers, { actualYears: years.actual }))
      if (profile) {
        profile.caches.financialSnapshot = snapshotResult.snapshots.size === tickers.length ? 'HIT' : 'PARTIAL'
        profile.flags.canonicalHistoryRebuilt = false
        profile.flags.adjustedEbitdaRan = false
      }
    }
    const quotes = await quotesPromise
    const results = tickers.map((ticker) => {
      const snapshot = snapshotResult.snapshots.get(ticker)
      const usable = snapshot && snapshot.financialSnapshot?.state !== FINANCIAL_SNAPSHOT_STATE.INCOMPATIBLE
      const diagnostic = snapshot?.financialSnapshot?.state === FINANCIAL_SNAPSHOT_STATE.INCOMPATIBLE
        ? { stage: 'FINANCIAL_SNAPSHOT_READ', reason: 'FINANCIAL_SNAPSHOT_INCOMPATIBLE',
            detail: snapshot.financialSnapshot.reasons?.join(', ') }
        : snapshotResult.diagnostic
      return usable
        ? applyMarketDataToFinancialSnapshot(snapshot, quotes.get(ticker), quotes.get(ticker)?.chart)
        : loadingFinancialRow(ticker, quotes.get(ticker), quotes.get(ticker)?.chart, diagnostic)
    })
    const value = {
      periods: { actual: years.actual.map((year) => `${year}A`), ltm: 'LTM', ntm: 'NTM', estimate: years.estimate.map((year) => `${year}E`) },
      rows: results,
      retrievedAt: new Date().toISOString(),
      diagnostics: [snapshotResult.diagnostic, ...(snapshotResult.refreshDiagnostics ?? [])].filter(Boolean),
      providerCache: { state: options.financialRefresh
        ? snapshotResult.refreshDiagnostics?.length ? 'FINANCIAL_REFRESH_DEGRADED_REJECTED' : 'FINANCIAL_REFRESHED' :
        options.consensusRefresh ? 'CONSENSUS_REFRESHED' : 'NOT_REQUESTED' },
    }
    value.audit = auditSummary(value.rows)
    value.historicalAudit = Object.fromEntries(Object.keys(value.rows[0]?.historicalAudit ?? {}).map((status) => [status,
      value.rows.reduce((total, row) => total + (row.historicalAudit?.[status] ?? 0), 0),
    ]))
    if (!responseHasPendingSources(value)) {
      cache.set(cacheKey, { value, expiresAt: Date.now() + VALUATION_CACHE_TTL_MS })
    }
    recordLatency(profile, 'totalRequest', performance.now() - requestStartedAt)
    return value
  })().finally(() => inFlight.delete(cacheKey))

  inFlight.set(cacheKey, request)
  return request
}
