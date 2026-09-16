import { HISTORICAL_VALIDATION_STATUS } from './issuerClassification.js'

export const WISESHEETS_METRICS = Object.freeze({
  revenue: 'revenue',
  grossProfit: 'gross_profit',
  operatingCashFlow: 'net_cash_from_operating_activities',
  capitalExpenditures: 'total_capex',
  providerFreeCashFlow: 'free_cash_flow',
})

export const PERIOD_TYPE = Object.freeze({
  STANDALONE_QUARTER: 'STANDALONE_QUARTER', YTD_6M: 'YTD_6M', YTD_9M: 'YTD_9M',
  FISCAL_YEAR: 'FISCAL_YEAR', UNKNOWN: 'UNKNOWN',
})

const API_URL = 'https://api.wisesheets.io/v1/financials/'
const CACHE_TTL_MS = 60 * 60 * 1000
const DAY_MS = 86_400_000
const END_DATE_TOLERANCE_DAYS = 7
const cache = new Map()
const inFlight = new Map()

const finite = (value) => value != null && Number.isFinite(Number(value))

function isoDate(value) {
  const match = String(value ?? '').match(/^(\d{4}-\d{2}-\d{2})/)
  if (!match || Number.isNaN(Date.parse(`${match[1]}T12:00:00Z`))) return null
  return match[1]
}

function dayDifference(left, right) {
  const a = isoDate(left)
  const b = isoDate(right)
  return a && b ? Math.round(Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / DAY_MS) : null
}

function durationDays(start, end) {
  const a = isoDate(start)
  const b = isoDate(end)
  return a && b ? Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY_MS) + 1 : null
}

function fiscalQuarter(value) {
  const match = String(value ?? '').toUpperCase().match(/Q([1-4])/)
  return match ? Number(match[1]) : finite(value) && Number(value) >= 1 && Number(value) <= 4 ? Number(value) : null
}

function classifyPeriod(observation) {
  const explicit = String(observation.periodType ?? observation.source?.periodType ?? '').toUpperCase()
  if (['STANDALONE_QUARTER', 'QUARTER', 'QUARTERLY', '3M'].includes(explicit)) return PERIOD_TYPE.STANDALONE_QUARTER
  if (['YTD_6M', '6M', 'SEMI_ANNUAL'].includes(explicit)) return PERIOD_TYPE.YTD_6M
  if (['YTD_9M', '9M'].includes(explicit)) return PERIOD_TYPE.YTD_9M
  if (['FISCAL_YEAR', 'FY', 'ANNUAL', '12M'].includes(explicit)) return PERIOD_TYPE.FISCAL_YEAR
  const duration = durationDays(observation.periodStart ?? observation.quarterStart, observation.periodEnd ?? observation.quarterEnd)
  if (duration != null) {
    if (duration >= 70 && duration <= 120) return PERIOD_TYPE.STANDALONE_QUARTER
    if (duration >= 150 && duration <= 220) return PERIOD_TYPE.YTD_6M
    if (duration >= 230 && duration <= 310) return PERIOD_TYPE.YTD_9M
    if (duration >= 330 && duration <= 380) return PERIOD_TYPE.FISCAL_YEAR
  }
  return fiscalQuarter(observation.fiscalQuarter ?? observation.fiscalPeriod) != null
    ? PERIOD_TYPE.STANDALONE_QUARTER : PERIOD_TYPE.UNKNOWN
}

function normalizeUnits(rawValue, rawUnits, explicitCurrency) {
  const units = String(rawUnits ?? '').trim()
  const lower = units.toLowerCase()
  const currency = String(explicitCurrency ?? units.match(/\b(USD|EUR|GBP|JPY|CAD|AUD|CHF)\b/i)?.[1] ?? '').toUpperCase() || null
  let scale = 1
  if (/\b(thousand|thousands|000s)\b/.test(lower)) scale = 1_000
  else if (/\b(million|millions|mm)\b/.test(lower)) scale = 1_000_000
  else if (/\b(billion|billions|bn)\b/.test(lower)) scale = 1_000_000_000
  return { currency, units: units || currency, normalizedUnits: currency, normalizedValue: Number(rawValue) * scale, scale }
}

function normalizeScope(observation, sourceProvider) {
  const raw = String(observation.scope ?? observation.source?.scope ?? '').trim().toUpperCase()
  if (/SEGMENT|GEOGRAPH|PRODUCT|DIVISION/.test(raw)) return { scope: raw, valid: false, basis: 'EXPLICIT_NON_CONSOLIDATED' }
  if (/CONSOLIDATED|COMPANY|TOTAL/.test(raw)) return { scope: 'CONSOLIDATED', valid: true, basis: 'EXPLICIT' }
  if (sourceProvider === 'WiseSheets') return { scope: 'CONSOLIDATED', valid: true, basis: 'WISESHEETS_COMPANY_FINANCIALS_ENDPOINT' }
  if (observation.source?.consolidated === true || observation.consolidated === true) {
    return { scope: 'CONSOLIDATED', valid: true, basis: 'SOURCE_METADATA' }
  }
  return { scope: 'UNKNOWN', valid: false, basis: 'UNESTABLISHED' }
}

function economicIdentity(record) {
  return record.fiscalYear != null && record.fiscalQuarter != null
    ? `${record.ticker}:FY${record.fiscalYear}:Q${record.fiscalQuarter}`
    : `${record.ticker}:END:${record.periodEnd}`
}

function sourcePriority(record) {
  const provider = String(record.sourceProvider).toUpperCase()
  return (provider === 'WISESHEETS' ? 300 : provider === 'SEC' ? 200 : 100) +
    (record.sourceId && record.filingDate ? 20 : record.sourceId ? 10 : 0) +
    (record.confidence === 'HIGH' ? 3 : record.confidence === 'MEDIUM' ? 2 : 1)
}

function sameEconomicQuarter(left, right) {
  if (left.ticker !== right.ticker) return false
  if (left.fiscalYear != null && right.fiscalYear != null && left.fiscalQuarter != null && right.fiscalQuarter != null) {
    if (left.fiscalYear === right.fiscalYear && left.fiscalQuarter === right.fiscalQuarter) return true
  }
  const endGap = dayDifference(left.periodEnd, right.periodEnd)
  if (endGap == null || endGap > END_DATE_TOLERANCE_DAYS) return false
  const leftDuration = durationDays(left.periodStart, left.periodEnd)
  const rightDuration = durationDays(right.periodStart, right.periodEnd)
  return leftDuration == null || rightDuration == null || Math.abs(leftDuration - rightDuration) <= 14
}

export function deduplicateEconomicQuarters(records) {
  const accepted = []
  for (const record of [...records].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd))) {
    const index = accepted.findIndex((candidate) => sameEconomicQuarter(candidate, record))
    if (index < 0) {
      accepted.push({ ...record, economicQuarterId: economicIdentity(record), sourceSelection: record.sourceSelection ?? 'ONLY_SOURCE_FOR_ECONOMIC_QUARTER' })
      continue
    }
    const candidates = [accepted[index], record]
    const winner = [...candidates].sort((a, b) => sourcePriority(b) - sourcePriority(a) || String(b.filingDate ?? '').localeCompare(String(a.filingDate ?? '')))[0]
    accepted[index] = {
      ...winner,
      economicQuarterId: accepted[index].economicQuarterId,
      sourceSelection: winner.sourceProvider === 'WiseSheets' ? 'WISESHEETS_PRIMARY_FOR_ECONOMIC_QUARTER' : 'SECONDARY_SOURCE_FILLED_MISSING_WISESHEETS_QUARTER',
      alternativeSources: candidates.filter((item) => item !== winner).map((item) => item.sourceId),
    }
  }
  return accepted.sort((a, b) => a.periodEnd.localeCompare(b.periodEnd))
}

export function normalizeQuarterRecord(observation, retrievedAt = new Date().toISOString()) {
  const observedValue = observation?.value ?? observation?.normalizedValue
  const periodEnd = isoDate(observation?.periodEnd ?? observation?.quarterEnd)
  if (!observation?.ticker || !observation?.metric || !periodEnd || !finite(observedValue)) return null
  const sourceProvider = String(observation.sourceProvider ?? observation.provider ?? 'WiseSheets')
  const rawValue = Number(observation.rawValue ?? observedValue)
  const rawUnits = observation.rawUnits ?? observation.units ?? observation.unit ?? observation.currency ?? null
  const normalized = observation.normalizedValue != null
    ? { currency: observation.currency ?? String(rawUnits ?? '').match(/\b(USD|EUR|GBP|JPY|CAD|AUD|CHF)\b/i)?.[1]?.toUpperCase() ?? null,
        units: rawUnits, normalizedUnits: observation.normalizedUnits ?? observation.currency ?? null,
        normalizedValue: Number(observation.normalizedValue), scale: observation.normalizationScale ?? 1 }
    : normalizeUnits(rawValue, rawUnits, observation.currency)
  const metric = observation.metric
  if ([WISESHEETS_METRICS.capitalExpenditures, 'capitalExpenditures'].includes(metric)) normalized.normalizedValue = Math.abs(normalized.normalizedValue)
  const scope = normalizeScope(observation, sourceProvider)
  const fiscalQ = fiscalQuarter(observation.fiscalQuarter ?? observation.fiscalPeriod)
  const sourceId = observation.sourceId ?? observation.source?.sourceId ?? observation.source?.accession ?? observation.accession ??
    `${sourceProvider}:${String(observation.ticker).toUpperCase()}:${metric}:${periodEnd}:${observation.fiscalYear ?? ''}:${fiscalQ ?? ''}`
  return {
    ticker: String(observation.ticker).toUpperCase(), metric, value: normalized.normalizedValue,
    currency: normalized.currency, units: normalized.units, normalizedUnits: normalized.normalizedUnits,
    rawValue, rawUnits, normalizedValue: normalized.normalizedValue, normalizationScale: normalized.scale,
    sourceProvider, sourceId, periodStart: isoDate(observation.periodStart ?? observation.quarterStart), periodEnd,
    periodType: classifyPeriod(observation), fiscalYear: finite(observation.fiscalYear) ? Number(observation.fiscalYear) : null,
    fiscalQuarter: fiscalQ, filingDate: isoDate(observation.filingDate ?? observation.source?.filingDate),
    scope: scope.scope, scopeBasis: scope.basis, scopeValid: scope.valid,
    confidence: String(observation.confidence ?? (observation.source?.filingUrl || observation.sourceUrl ? 'HIGH' : 'MEDIUM')).toUpperCase(),
    sourceUrl: observation.sourceUrl ?? observation.source?.filingUrl ?? observation.source?.sourceUrl ?? null,
    tag: observation.tag ?? observation.source?.tag ?? null,
    accession: observation.accession ?? observation.source?.accession ?? observation.source?.accessionNumber ?? null,
    retrievedAt, derivation: observation.derivation ?? null,
    warnings: [...(observation.warnings ?? []), ...(scope.valid ? [] : ['REPORTING_SCOPE_NOT_COMPARABLE'])],
  }
}

function compatibleForDerivation(a, b) {
  return a && b && a.ticker === b.ticker && a.metric === b.metric && a.fiscalYear === b.fiscalYear &&
    a.currency === b.currency && a.normalizedUnits === b.normalizedUnits && a.scope === b.scope && a.scope === 'CONSOLIDATED'
}

export function deriveStandaloneQuarters(records) {
  const output = records.filter((record) => record.periodType === PERIOD_TYPE.STANDALONE_QUARTER)
  const groups = new Map()
  for (const record of records.filter((item) => item.fiscalYear != null)) {
    const key = [record.ticker, record.metric, record.fiscalYear, record.currency, record.normalizedUnits, record.scope].join('|')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(record)
  }
  for (const group of groups.values()) {
    const q1 = group.find((r) => r.periodType === PERIOD_TYPE.STANDALONE_QUARTER && r.fiscalQuarter === 1)
    const ytd6 = group.find((r) => r.periodType === PERIOD_TYPE.YTD_6M)
    const ytd9 = group.find((r) => r.periodType === PERIOD_TYPE.YTD_9M)
    const fy = group.find((r) => r.periodType === PERIOD_TYPE.FISCAL_YEAR)
    for (const { current, prior, quarter, method } of [
      { current: ytd6, prior: q1, quarter: 2, method: 'YTD_6M_MINUS_Q1' },
      { current: ytd9, prior: ytd6, quarter: 3, method: 'YTD_9M_MINUS_YTD_6M' },
      { current: fy, prior: ytd9, quarter: 4, method: 'FISCAL_YEAR_MINUS_YTD_9M' },
    ]) {
      if (!compatibleForDerivation(current, prior)) continue
      output.push({ ...current, value: current.normalizedValue - prior.normalizedValue, rawValue: null,
        normalizedValue: current.normalizedValue - prior.normalizedValue, periodStart: null,
        periodType: PERIOD_TYPE.STANDALONE_QUARTER, fiscalQuarter: quarter,
        sourceId: `${current.sourceId}|MINUS|${prior.sourceId}`,
        confidence: current.confidence === 'HIGH' && prior.confidence === 'HIGH' ? 'HIGH' : 'MEDIUM',
        derivation: { method, inputs: [current.sourceId, prior.sourceId] },
        sourceSelection: 'DERIVED_FROM_COMPATIBLE_CUMULATIVE_PERIODS' })
    }
  }
  return output
}

function consecutive(a, b) {
  if (a.fiscalYear != null && b.fiscalYear != null && a.fiscalQuarter != null && b.fiscalQuarter != null &&
      b.fiscalYear * 4 + b.fiscalQuarter - (a.fiscalYear * 4 + a.fiscalQuarter) === 1) return true
  const gap = dayDifference(a.periodEnd, b.periodEnd)
  return gap != null && gap >= 70 && gap <= 120
}

function structuralFailures(records) {
  const failures = []
  if (records.length !== 4) failures.push('UNIQUE_QUARTER_COUNT_NOT_FOUR')
  if (records.length && new Set(records.map((r) => r.economicQuarterId)).size !== records.length) failures.push('DUPLICATE_ECONOMIC_QUARTER')
  if (records.some((r) => r.periodType !== PERIOD_TYPE.STANDALONE_QUARTER)) failures.push('NON_STANDALONE_OR_UNKNOWN_PERIOD')
  if (records.some((r) => !r.scopeValid || r.scope !== 'CONSOLIDATED')) failures.push('REPORTING_SCOPE_NOT_COMPARABLE')
  if (records.length && (new Set(records.map((r) => r.currency)).size !== 1 || records.some((r) => !r.currency))) failures.push('INCONSISTENT_OR_UNKNOWN_CURRENCY')
  if (records.length && (new Set(records.map((r) => r.normalizedUnits)).size !== 1 || records.some((r) => !r.normalizedUnits))) failures.push('INCONSISTENT_OR_UNKNOWN_NORMALIZED_UNITS')
  if (records.some((r) => !r.sourceProvider || !r.sourceId)) failures.push('MISSING_SOURCE_PROVENANCE')
  if (records.length > 1 && !records.slice(1).every((r, i) => consecutive(records[i], r))) failures.push('NON_CONSECUTIVE_ECONOMIC_QUARTERS')
  return [...new Set(failures)]
}

function sourceComponent(r) {
  return { provider: r.sourceProvider, metric: r.providerMetric ?? r.metric, economicQuarterId: r.economicQuarterId,
    quarterEnd: r.periodEnd, sourceStart: r.periodStart, sourceEnd: r.periodEnd,
    sourceValue: r.normalizedValue, rawValue: r.rawValue, rawReportedValue: r.rawValue,
    normalizedValue: r.normalizedValue, reportedUnits: r.rawUnits, normalizedUnits: r.normalizedUnits,
    currency: r.currency, scope: r.scope, confidence: r.confidence,
    sourceType: r.sourceProvider === 'WiseSheets' ? 'SEC filed actual via WiseSheets' : 'SEC filed actual exception',
    sourceUrl: r.sourceUrl, sourceId: r.sourceId, tag: r.tag, filed: r.filingDate, accn: r.accession,
    sourcePeriodType: r.periodType, sourcePeriodBasis: r.fiscalQuarter ? `Q${r.fiscalQuarter}` : null,
    selectionDecision: r.sourceSelection, derivation: r.derivation }
}

function unavailableEntry(method, records = [], failures = []) {
  return { value: null, components: records.map(sourceComponent), sourceType: 'Unavailable',
    provider: records.some((r) => r.sourceProvider === 'WiseSheets') ? 'WiseSheets' : null,
    validationStatus: HISTORICAL_VALIDATION_STATUS.MISSING_BUT_AVAILABLE, method,
    failureReasons: failures.length ? failures : [method],
    warnings: failures.length ? failures : ['Four validated standalone quarters are unavailable.'] }
}

function aggregateValidated(records, method) {
  const ordered = [...records].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd))
  const failures = structuralFailures(ordered)
  if (failures.length) return unavailableEntry(method, ordered, failures)
  const value = ordered.reduce((total, record) => total + record.normalizedValue, 0)
  const warnings = [...new Set(ordered.flatMap((record) => record.warnings ?? []))]
  if (ordered[0].metric === WISESHEETS_METRICS.revenue && value < 0) warnings.push('NEGATIVE_REVENUE')
  const review = warnings.some((warning) => /REPORTING_SCOPE|NEGATIVE_REVENUE|FCF_RECONCILIATION_MISMATCH/.test(warning))
  return { value: review ? null : value, components: ordered.map(sourceComponent),
    sourceType: ordered.every((r) => r.sourceProvider === 'WiseSheets') ? 'SEC filed actual via WiseSheets' : 'WiseSheets primary with SEC exception quarter',
    provider: ordered.every((r) => r.sourceProvider === 'WiseSheets') ? 'WiseSheets' : 'WiseSheets + SEC',
    validationStatus: review ? HISTORICAL_VALIDATION_STATUS.REQUIRES_REVIEW : HISTORICAL_VALIDATION_STATUS.VERIFIED_DERIVED,
    exactness: 'RECONSTRUCTED', method, warnings,
    retrievedAt: ordered.map((r) => r.retrievedAt).filter(Boolean).sort().at(-1) ?? null,
    sourceUrl: ordered.map((r) => r.sourceUrl).find(Boolean) ?? null }
}

export function buildCalendarYear(ticker, metric, year, records) {
  const candidates = records.filter((r) => r.ticker === String(ticker).toUpperCase() && r.metric === metric &&
    r.periodType === PERIOD_TYPE.STANDALONE_QUARTER && Number(r.periodEnd.slice(0, 4)) === Number(year))
  return aggregateValidated(candidates, `FOUR_CANONICAL_${metric.toUpperCase()}_QUARTERS_ENDING_IN_CALENDAR_YEAR`)
}

export function buildLtm(ticker, metric, asOfDate, records) {
  const cutoff = isoDate(asOfDate) ?? '9999-12-31'
  const eligible = records.filter((r) => r.ticker === String(ticker).toUpperCase() && r.metric === metric &&
    r.periodType === PERIOD_TYPE.STANDALONE_QUARTER && r.periodEnd <= cutoff)
  const latest = eligible.at(-1)
  const selected = eligible.slice(-4)
  if (!latest || selected.at(-1)?.economicQuarterId !== latest.economicQuarterId) {
    return unavailableEntry(`LATEST_FOUR_CANONICAL_${metric.toUpperCase()}_QUARTERS`, selected, ['STALE_LTM'])
  }
  return aggregateValidated(selected, `LATEST_FOUR_CANONICAL_${metric.toUpperCase()}_QUARTERS`)
}

const matchEconomicRecord = (target, candidates) => candidates.find((candidate) => sameEconomicQuarter(target, candidate)) ?? null

function deriveFreeCashFlow(cfoRecords, capexRecords, providerFcfRecords) {
  return cfoRecords.flatMap((cfo) => {
    const capex = matchEconomicRecord(cfo, capexRecords)
    if (!capex || cfo.scope !== capex.scope || cfo.currency !== capex.currency || cfo.normalizedUnits !== capex.normalizedUnits) return []
    const value = cfo.normalizedValue - capex.normalizedValue
    const check = matchEconomicRecord(cfo, providerFcfRecords)
    const reconciled = !check || Math.abs(value - check.normalizedValue) <= Math.max(1, Math.abs(value)) * 0.001
    return [{ ...cfo, metric: 'freeCashFlow', value, rawValue: null, normalizedValue: value,
      economicQuarterId: economicIdentity(cfo), sourceId: `${cfo.sourceId}|CFO_MINUS_CAPEX|${capex.sourceId}`,
      sourceProvider: cfo.sourceProvider === 'WiseSheets' && capex.sourceProvider === 'WiseSheets' ? 'WiseSheets' : 'SEC',
      derivation: { method: 'CFO_MINUS_CAPEX', inputs: [cfo.sourceId, capex.sourceId] },
      reconciliation: check ? { providerMetric: check.metric, providerValue: check.normalizedValue, difference: value - check.normalizedValue } : null,
      warnings: reconciled ? [] : ['WISESHEETS_FCF_RECONCILIATION_MISMATCH'] }]
  })
}

function normalizeSecLedgerRecord(ticker, metric, record) {
  return normalizeQuarterRecord({ ticker, metric, value: record.normalizedValue,
    rawValue: record.originalReportedValue, normalizedValue: record.normalizedValue,
    currency: record.currency, units: record.units, normalizedUnits: record.currency,
    sourceProvider: 'SEC', sourceId: record.source?.sourceId,
    periodStart: record.quarterStart, periodEnd: record.quarterEnd,
    periodType: PERIOD_TYPE.STANDALONE_QUARTER, fiscalYear: record.fiscalYear,
    fiscalQuarter: record.fiscalQuarter, filingDate: record.source?.filingDate,
    scope: record.source?.consolidated === false ? 'SEGMENT' : 'CONSOLIDATED',
    confidence: record.validationStatus === 'VERIFIED_EXACT' ? 'HIGH' : 'MEDIUM',
    sourceUrl: record.source?.sourceUrl, accession: record.source?.accessionNumber,
    tag: record.rawMetricLabel, warnings: record.warnings }, record.source?.retrievalDate)
}

function repairProviderMonetaryUnits(records) {
  const monetaryMetrics = new Set(Object.values(WISESHEETS_METRICS))
  return records.map((record) => {
    if (record.sourceProvider !== 'WiseSheets' || !monetaryMetrics.has(record.metric) ||
        (record.currency && record.normalizedUnits && !/ratio/i.test(String(record.units)))) return record
    const peer = records.find((candidate) => candidate !== record && candidate.ticker === record.ticker &&
      candidate.sourceProvider === 'WiseSheets' && monetaryMetrics.has(candidate.metric) &&
      candidate.currency && candidate.normalizedUnits && !/ratio/i.test(String(candidate.units)) &&
      sameEconomicQuarter(record, candidate))
    if (!peer) return record
    return {
      ...record,
      currency: peer.currency,
      units: peer.units,
      normalizedUnits: peer.normalizedUnits,
      confidence: record.confidence === 'HIGH' ? 'MEDIUM' : record.confidence,
      warnings: [...record.warnings, 'PROVIDER_UNIT_REPAIRED_FROM_MATCHED_MONETARY_QUARTER'],
    }
  })
}

function compileHistorical(ticker, normalizedRecords, years) {
  const repairedRecords = repairProviderMonetaryUnits(normalizedRecords)
  const standalone = deriveStandaloneQuarters(repairedRecords)
  const byMetric = Object.fromEntries(Object.values(WISESHEETS_METRICS).map((metric) => [metric,
    deduplicateEconomicQuarters(standalone.filter((r) => r.metric === metric && r.scopeValid))]))
  const canonicalMetric = (records, metric) => records.map((record) => ({ ...record, providerMetric: record.metric, metric }))
  const records = {
    revenue: canonicalMetric(byMetric[WISESHEETS_METRICS.revenue], 'revenue'),
    grossProfit: canonicalMetric(byMetric[WISESHEETS_METRICS.grossProfit], 'grossProfit'),
    operatingCashFlow: canonicalMetric(byMetric[WISESHEETS_METRICS.operatingCashFlow], 'operatingCashFlow'),
    capitalExpenditures: canonicalMetric(byMetric[WISESHEETS_METRICS.capitalExpenditures], 'capitalExpenditures'),
  }
  records.freeCashFlow = deduplicateEconomicQuarters(deriveFreeCashFlow(records.operatingCashFlow, records.capitalExpenditures, byMetric[WISESHEETS_METRICS.providerFreeCashFlow]))
  const calendarActuals = Object.fromEntries(Object.entries(records).map(([metric, metricRecords]) => [metric,
    Object.fromEntries(years.map((year) => [year, buildCalendarYear(ticker, metric, year, metricRecords)]))]))
  const asOf = new Date().toISOString().slice(0, 10)
  const ltm = Object.fromEntries(Object.entries(records).map(([metric, metricRecords]) => [metric, buildLtm(ticker, metric, asOf, metricRecords)]))
  for (const period of [...years.map(String), 'LTM']) {
    const revenue = period === 'LTM' ? ltm.revenue : calendarActuals.revenue[period]
    const grossProfit = period === 'LTM' ? ltm.grossProfit : calendarActuals.grossProfit[period]
    if (finite(revenue?.value) && finite(grossProfit?.value) &&
        (grossProfit.value > revenue.value * 1.05 || grossProfit.value < -Math.abs(revenue.value))) {
      grossProfit.value = null
      grossProfit.validationStatus = HISTORICAL_VALIDATION_STATUS.REQUIRES_REVIEW
      grossProfit.warnings = [...new Set([...(grossProfit.warnings ?? []), 'GROSS_PROFIT_OUTSIDE_REVENUE_BOUNDS'])]
    }
  }
  const issues = Object.entries(calendarActuals).flatMap(([metric, values]) => Object.entries(values)
    .filter(([, entry]) => entry.value == null || entry.validationStatus === HISTORICAL_VALIDATION_STATUS.REQUIRES_REVIEW)
    .map(([year, entry]) => ({ ticker, metric, period: `${year}A`, reasons: entry.failureReasons ?? entry.warnings })))
  for (const [metric, entry] of Object.entries(ltm)) if (entry.value == null || entry.validationStatus === HISTORICAL_VALIDATION_STATUS.REQUIRES_REVIEW) {
    issues.push({ ticker, metric, period: 'LTM', reasons: entry.failureReasons ?? entry.warnings })
  }
  for (const record of repairedRecords.filter((item) => item.periodType === PERIOD_TYPE.UNKNOWN || !item.scopeValid)) {
    issues.push({ ticker, metric: record.metric, period: record.periodEnd,
      reasons: [record.periodType === PERIOD_TYPE.UNKNOWN ? 'UNKNOWN_PERIOD_TYPE' : 'REPORTING_SCOPE_NOT_COMPARABLE'] })
  }
  return { ticker, canonicalRecords: repairedRecords, records, calendarActuals, ltm, audit: { issues } }
}

export function buildWiseSheetsHistorical(ticker, observations, years) {
  const retrievedAt = new Date().toISOString()
  const normalized = observations.map((observation) => normalizeQuarterRecord(observation, retrievedAt))
    .filter((record) => record?.ticker === String(ticker).toUpperCase())
  return compileHistorical(String(ticker).toUpperCase(), normalized, years)
}

export function completeWithSecExceptionQuarters(ticker, wiseSheetsHistorical, secLedger, years) {
  const primary = wiseSheetsHistorical?.canonicalRecords ?? []
  const secondary = Object.entries({ revenue: WISESHEETS_METRICS.revenue, grossProfit: WISESHEETS_METRICS.grossProfit,
    operatingCashFlow: WISESHEETS_METRICS.operatingCashFlow, capitalExpenditures: WISESHEETS_METRICS.capitalExpenditures })
    .flatMap(([ledgerMetric, canonicalMetric]) => (secLedger?.[ledgerMetric] ?? [])
      .map((record) => normalizeSecLedgerRecord(ticker, canonicalMetric, record)).filter(Boolean))
  const primaryStandalone = deriveStandaloneQuarters(primary)
  const missingOnly = secondary.filter((sec) => !primaryStandalone.some((wise) => wise.metric === sec.metric && sameEconomicQuarter(wise, sec)))
  return compileHistorical(String(ticker).toUpperCase(), [...primary, ...missingOnly], years)
}

export async function fetchWiseSheetsQuarterlyFinancials(tickers, years, fetchImpl = fetch) {
  const normalizedTickers = [...new Set(tickers.map((ticker) => String(ticker).trim().toUpperCase()).filter(Boolean))]
  if (!normalizedTickers.length) return new Map()
  const apiKey = process.env.WISESHEETS_API_KEY
  if (!apiKey) throw new Error('WISESHEETS_API_KEY is not configured')
  const cacheKey = `${normalizedTickers.sort().join(',')}:${years.join(',')}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey)
  const request = (async () => {
    const params = new URLSearchParams({ tickers: normalizedTickers.join(','), metrics: Object.values(WISESHEETS_METRICS).join(','), period: 'last20q' })
    const response = await fetchImpl(`${API_URL}?${params}`, { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } })
    if (!response.ok) throw new Error(`WiseSheets returned HTTP ${response.status}`)
    const payload = await response.json()
    const observations = Array.isArray(payload?.data) ? payload.data : []
    const value = new Map(normalizedTickers.map((ticker) => [ticker, buildWiseSheetsHistorical(ticker, observations, years)]))
    cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS })
    return value
  })().finally(() => inFlight.delete(cacheKey))
  inFlight.set(cacheKey, request)
  return request
}
