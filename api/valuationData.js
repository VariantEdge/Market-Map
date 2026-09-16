import { fetchYahooChart, fetchYahooFundamentals, getPrice } from './marketData.js'
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
import {
  completeWithSecExceptionQuarters,
  fetchWiseSheetsQuarterlyFinancials,
} from '../server/valuation/wiseSheetsFinancials.js'

const VALUATION_CACHE_TTL_MS = 60 * 60 * 1000
const INTERACTIVE_SOURCE_TIMEOUT_MS = 8_000
const SEC_SOURCE_TIMEOUT_MS = 30_000
const cache = new Map()
const inFlight = new Map()

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
    const key = [component.sourceStart, component.sourceEnd, component.tag, component.sourceType, component.sourceValue].join(':')
    if (unique.has(key)) continue
    unique.set(key, {
      provider: component.provider ?? null,
      metric: component.metric ?? null,
      quarterEnd: component.quarterEnd ?? component.sourceEnd ?? null,
      sourceStart: component.sourceStart ?? null,
      sourceEnd: component.sourceEnd ?? null,
      sourceValue: component.sourceValue ?? null,
      rawValue: component.rawValue ?? null,
      sourceUrl: component.sourceUrl ?? null,
      tag: component.tag ?? null,
      filed: component.filed ?? null,
      accn: component.accn ?? null,
      sourceType: component.sourceType ?? null,
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
      contribution: component.contribution ?? null,
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

async function buildValuationRow(supabase, ticker, years, wiseSheetsHistorical = null) {
  const auditedFinancials = await loadAuditedFinancials(ticker, years.actual)
  const [quote, fundamentals, company, chart] = await Promise.all([
    settleWithin(getPrice(supabase, ticker), null),
    settleWithin(fetchYahooFundamentals(ticker), null),
    settleWithin(resolveCompany(ticker), null, SEC_SOURCE_TIMEOUT_MS),
    settleWithin(fetchYahooChart(ticker, '1y'), null),
  ])
  const filingIndex = company && !auditedFinancials ? await buildFilingIndex(company).catch(() => null) : null
  const issuerClassification = classifyIssuer({ ticker, company, filings: filingIndex?.filings ?? [] })
  const operatingCompany = isOperatingCompanyClassification(issuerClassification.classification)
  const facts = company && operatingCompany
    ? await settleWithin(getCompanyFacts(company.cik), null)
    : null
  const cachedSupplemental = company && operatingCompany && !auditedFinancials
    ? await loadLatestSupplementalSourceFacts(company).catch(() => null)
    : null
  const supplemental = company && filingIndex && operatingCompany && !auditedFinancials
    ? cachedSupplemental ?? await loadSupplementalFilingFacts({ company, filingIndex, years: years.actual }).catch(() => ({ records: [], errors: [] }))
    : { records: [], errors: [] }
  const historicalLedger = company && facts
    ? await buildCanonicalQuarterlyLedger({
      company,
      facts,
      years: years.actual,
      filingIndex,
      supplementalRawFacts: supplemental.records,
      fallbackStatus: issuerClassification.financialStatus ?? HISTORICAL_VALIDATION_STATUS.MISSING_BUT_AVAILABLE,
    })
    : null
  const normalizedHistorical = completeWithSecExceptionQuarters(
    ticker,
    wiseSheetsHistorical,
    historicalLedger?.ledger,
    years.actual,
  )
  const secMetricPeriods = Object.fromEntries(Object.entries({
    revenue: METRIC_TAGS.revenue,
    grossProfit: METRIC_TAGS.grossProfit,
    ebitda: METRIC_TAGS.ebitda,
    operatingCashFlow: METRIC_TAGS.operatingCashFlow,
    capitalExpenditures: METRIC_TAGS.capitalExpenditures,
  }).map(([metric, tags]) => [metric, normalizeCumulativeQuarterlyFacts(incomePeriodFacts(facts, tags, company?.cik))]))

  const unavailableStatus = issuerClassification.financialStatus ?? HISTORICAL_VALIDATION_STATUS.MISSING_BUT_AVAILABLE
  const unavailableActuals = Object.fromEntries(['revenue', 'grossProfit', 'ebitda', 'operatingCashFlow', 'capitalExpenditures', 'freeCashFlow'].map((metric) => [metric,
    Object.fromEntries(years.actual.map((year) => [year, {
      value: null,
      components: [],
      sourceType: 'Unavailable',
      validationStatus: unavailableStatus,
      method: unavailableStatus,
      warnings: [issuerClassification.reason],
    }]))]))
  const calendarizedActuals = {
    revenue: normalizedHistorical.calendarActuals.revenue ?? unavailableActuals.revenue,
    grossProfit: normalizedHistorical.calendarActuals.grossProfit ?? unavailableActuals.grossProfit,
    operatingCashFlow: normalizedHistorical.calendarActuals.operatingCashFlow ?? unavailableActuals.operatingCashFlow,
    capitalExpenditures: normalizedHistorical.calendarActuals.capitalExpenditures ?? unavailableActuals.capitalExpenditures,
    freeCashFlow: normalizedHistorical.calendarActuals.freeCashFlow ?? unavailableActuals.freeCashFlow,
    ebitda: historicalLedger?.calendarActuals?.ebitda ?? unavailableActuals.ebitda,
  }
  if (auditedFinancials) {
    for (const metric of ['ebitda']) {
      for (const year of years.actual) {
        const auditedEntry = auditedFinancials.actuals[metric]?.[year]
        if (auditedEntry) calendarizedActuals[metric][year] = auditedEntry
      }
    }
  }
  const unavailableLtm = { value: null, components: [], sourceType: 'Unavailable', validationStatus: unavailableStatus, method: unavailableStatus }
  const ltm = {
    revenue: normalizedHistorical.ltm.revenue ?? unavailableLtm,
    grossProfit: normalizedHistorical.ltm.grossProfit ?? unavailableLtm,
    ebitda: auditedFinancials?.ltm?.ebitda ?? historicalLedger?.adjustedEbitda?.ltm ?? unavailableLtm,
    freeCashFlow: normalizedHistorical.ltm.freeCashFlow ?? unavailableLtm,
  }
  const freeCashFlowActuals = calendarizedActuals.freeCashFlow
  // LTM is a historical financial metric. Do not substitute a provider
  // aggregate when four SEC-backed standalone quarters are unavailable.
  // Missing SEC coverage must remain unavailable in the table.
  const ltmRevenue = ltm.revenue
  const ltmGrossProfit = ltm.grossProfit
  const ltmEbitda = ltm.ebitda
  assertCanonicalAdjustedEbitdaEntry(ltmEbitda, ADJUSTED_EBITDA_PERIOD.LTM)
  const ltmFreeCashFlow = ltm.freeCashFlow
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
  // Yahoo's chartPreviousClose can describe the beginning of a multi-month
  // range. The penultimate daily bar is the actual prior trading close.
  const dailyBase = chart?.points?.at(-2)?.close ?? chart?.previousClose ?? null
  const financialTimestamp = [
    ...Object.values(secMetricPeriods).flat().map((period) => period.filed),
    ...Object.values(normalizedHistorical.records ?? {}).flat().map((period) => period.filingDate),
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
  revenue.NTM = ntmRevenue
  grossProfit.NTM = deriveMarginBasedForwardMetric(ntmRevenue, ltmGrossProfit, ltmRevenue, 'gross-profit', 'NTM')
  ebitda.NTM = {
    value: null,
    components: [],
    sourceType: 'Unavailable',
    validationStatus: HISTORICAL_VALIDATION_STATUS.LEGITIMATE_NA,
    method: 'NO_COMPANY_DEFINED_ADJUSTED_EBITDA_CONSENSUS',
    warnings: ['Adjusted EBITDA estimates are not synthesized from a trailing margin.'],
  }
  freeCashFlow.NTM = deriveMarginBasedForwardMetric(ntmRevenue, ltmFreeCashFlow, ltmRevenue, 'free-cash-flow', 'NTM')
  for (const year of years.estimate) {
    const period = `${year}E`
    grossProfit[period] = deriveMarginBasedForwardMetric(revenue[period], ltmGrossProfit, ltmRevenue, 'gross-profit', period)
    ebitda[period] = {
      value: null,
      components: [],
      sourceType: 'Unavailable',
      validationStatus: HISTORICAL_VALIDATION_STATUS.LEGITIMATE_NA,
      method: 'NO_COMPANY_DEFINED_ADJUSTED_EBITDA_CONSENSUS',
      warnings: ['Adjusted EBITDA estimates are not synthesized from a trailing margin.'],
    }
    freeCashFlow[period] = deriveMarginBasedForwardMetric(revenue[period], ltmFreeCashFlow, ltmRevenue, 'free-cash-flow', period)
  }
  const metricValues = (metric) => Object.fromEntries(Object.entries(metric).map(([period, entry]) => [period, entry?.value ?? null]))
  const revenueValues = metricValues(revenue)
  const grossProfitValues = metricValues(grossProfit)
  const ebitdaValues = metricValues(ebitda)
  const freeCashFlowValues = metricValues(freeCashFlow)

  const ranges = quoteRanges(chart, quote?.price)
  const row = {
    ticker,
    name: company?.name ?? ticker,
    cik: company?.cik ?? null,
    issuerClassification,
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
      ebitda: ebitdaValues,
      freeCashFlow: freeCashFlowValues,
      revenueGrowth: Object.fromEntries(Object.keys(revenueValues).map((period, index, list) => [period, index ? pct(revenueValues[period], revenueValues[list[index - 1]]) : null])),
      grossMargin: Object.fromEntries(Object.keys(grossProfitValues).map((period) => [period, pct(grossProfitValues[period], revenueValues[period] ?? null) == null ? null : grossProfitValues[period] / revenueValues[period]])),
      ebitdaMargin: Object.fromEntries(Object.keys(ebitdaValues).map((period) => [period, ebitdaValues[period] != null && revenueValues[period] ? ebitdaValues[period] / revenueValues[period] : null])),
    },
    multiples: {
      evRevenue: Object.fromEntries(Object.keys(revenueValues).map((period) => [period, valuationMultiple(structure.enterpriseValue, revenueValues[period])])),
      evGrossProfit: Object.fromEntries(Object.keys(grossProfitValues).map((period) => [period, valuationMultiple(structure.enterpriseValue, grossProfitValues[period])])),
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
      ebitda,
      freeCashFlow,
      capital: { cash: cash.source, debt: debt.source, dilutedShares: shares.source },
      market: { sourceType: 'Yahoo Finance market quote', confidence: 'Medium', retrievedAt: new Date().toISOString() },
    },
    marketTimestamp: quote?.fetchedAt ?? null,
    financialTimestamp,
    coverage: wiseSheetsHistorical
      ? 'WiseSheets primary quarterly actuals with missing-quarter SEC exceptions + SEC Adjusted EBITDA + Yahoo consensus'
      : 'SEC exception quarters only where WiseSheets observations are unavailable + SEC Adjusted EBITDA + Yahoo consensus',
    historicalAudit: Object.values(calendarizedActuals)
      .flatMap((byYear) => Object.values(byYear ?? {}))
      .reduce((summary, entry) => {
        const status = entry?.validationStatus ?? unavailableStatus
        summary[status] = (summary[status] ?? 0) + 1
        return summary
      }, {}),
  }
  row.auditInputs = { dailyBase, high52: ranges.high52, low52: ranges.low52 }
  row.audit = buildRowAudit(row)
  delete row.auditInputs
  return compactValuationRowForClient(row)
}

export async function getValuationRows(supabase, inputTickers = []) {
  const tickers = [...new Set(inputTickers.map((ticker) => String(ticker).trim().toUpperCase()).filter(Boolean))].slice(0, 40)
  const now = new Date()
  const currentYear = now.getFullYear()
  const years = { actual: [currentYear - 3, currentYear - 2, currentYear - 1], estimate: [currentYear, currentYear + 1] }
  const cacheKey = `calendar-v9-wisesheets-primary:${tickers.join(',')}:${years.actual.join(',')}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey)

  const request = (async () => {
    const wiseSheetsByTicker = await fetchWiseSheetsQuarterlyFinancials(tickers, years.actual).catch(() => new Map())
    const results = await Promise.allSettled(tickers.map((ticker) =>
      buildValuationRow(supabase, ticker, years, wiseSheetsByTicker.get(ticker) ?? null)))
    const value = {
      periods: { actual: years.actual.map((year) => `${year}A`), ltm: 'LTM', ntm: 'NTM', estimate: years.estimate.map((year) => `${year}E`) },
      rows: results.map((result, index) => result.status === 'fulfilled'
        ? result.value
        : { ticker: tickers[index], name: tickers[index], error: result.reason?.message ?? 'Financial data could not be loaded.' }),
      retrievedAt: new Date().toISOString(),
    }
    value.audit = auditSummary(value.rows)
    value.historicalAudit = Object.fromEntries(Object.keys(value.rows[0]?.historicalAudit ?? {}).map((status) => [status,
      value.rows.reduce((total, row) => total + (row.historicalAudit?.[status] ?? 0), 0),
    ]))
    cache.set(cacheKey, { value, expiresAt: Date.now() + VALUATION_CACHE_TTL_MS })
    return value
  })().finally(() => inFlight.delete(cacheKey))

  inFlight.set(cacheKey, request)
  return request
}
