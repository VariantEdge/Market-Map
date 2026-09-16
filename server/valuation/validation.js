export const VALIDATION_STATUS = Object.freeze({
  VERIFIED: 'VERIFIED',
  EXACT: 'VERIFIED_EXACT',
  RECONSTRUCTED: 'VERIFIED_RECONSTRUCTED',
  DERIVED: 'VERIFIED_DERIVED',
  WARNING: 'VERIFIED WITH WARNING',
  UNAVAILABLE: 'UNAVAILABLE',
  UNVERIFIED: 'UNVERIFIED',
  FAILED: 'FAILED',
  MANUAL: 'MANUAL OVERRIDE',
  VERIFIED_REPORTED: 'VERIFIED_REPORTED',
  VERIFIED_DERIVED: 'VERIFIED_DERIVED',
  MISMATCH: 'MISMATCH',
  MISSING_BUT_AVAILABLE: 'MISSING_BUT_AVAILABLE',
  LEGITIMATE_NA: 'LEGITIMATE_NA',
  REQUIRES_REVIEW: 'REQUIRES_REVIEW',
  INSUFFICIENT_PERIOD_COVERAGE: 'INSUFFICIENT_PERIOD_COVERAGE',
  STALE_SOURCE_COVERAGE: 'STALE_SOURCE_COVERAGE',
  OPERATION_SCOPE_INCOMPATIBLE: 'OPERATION_SCOPE_INCOMPATIBLE',
  DEFINITION_INCOMPATIBLE: 'DEFINITION_INCOMPATIBLE',
  ETF_NOT_APPLICABLE: 'ETF_NOT_APPLICABLE',
  OUT_OF_SEC_SCOPE: 'OUT_OF_SEC_SCOPE',
  ...HISTORICAL_RESULT_STATUS,
})

export const FORMULA_VERSION = 'valuation-audit-v1'

const NUMERIC_TOLERANCE = 1e-9
const CANONICAL_RESULT_STATUSES = new Set(Object.values(HISTORICAL_RESULT_STATUS))
const ADJUSTED_EBITDA_NULL_STATUSES = new Set([...CANONICAL_RESULT_STATUSES].filter((status) =>
  ![HISTORICAL_RESULT_STATUS.VERIFIED_REPORTED, HISTORICAL_RESULT_STATUS.VERIFIED_DERIVED].includes(status)))
const BASE_CANONICAL_HISTORICAL_METRICS = new Set([
  'revenue', 'grossprofit', 'ebit', 'operatingcashflow', 'capitalexpenditures', 'freecashflow',
])
const DERIVED_OUTPUT_METRICS = new Set([
  'ebit', 'evrevenue', 'evgrossprofit', 'evebit', 'evfreecashflow', 'evebitda',
  'revenuegrowth', 'grossmargin', 'ebitdamargin',
])

function isBaseCanonicalHistoricalCell(metric, period) {
  const normalizedMetric = String(metric ?? '').replaceAll(/[^a-z]/gi, '').toLowerCase()
  return BASE_CANONICAL_HISTORICAL_METRICS.has(normalizedMetric) &&
    (period === 'LTM' || /^\d{4}A$/.test(String(period)))
}

function isDerivedOutputMetric(metric) {
  return DERIVED_OUTPUT_METRICS.has(String(metric ?? '').replaceAll(/[^a-z]/gi, '').toLowerCase())
}

function finite(value) {
  return value != null && Number.isFinite(Number(value))
}

function closeEnough(left, right) {
  if (!finite(left) || !finite(right)) return false
  const scale = Math.max(1, Math.abs(Number(left)), Math.abs(Number(right)))
  return Math.abs(Number(left) - Number(right)) <= scale * NUMERIC_TOLERANCE
}

function sourceTypeFor(source, fallback = 'Unavailable') {
  return source?.sourceType ?? fallback
}

function normalizedLedgerStatus(status) {
  if (status === 'VERIFIED_WITH_WARNING') return VALIDATION_STATUS.WARNING
  if (status === 'MANUAL_OVERRIDE') return VALIDATION_STATUS.MANUAL
  return status
}

function sourceValidation(source, ticker) {
  const sourceType = sourceTypeFor(source)
  if (!ticker) return { passed: false, reason: 'Missing ticker identity.' }
  if (sourceType === 'Unavailable') return { passed: false, reason: 'No source record is available.' }
  if (/SEC filed actual/i.test(sourceType)) return { passed: true, reason: null }
  if (/Yahoo Finance market quote/i.test(sourceType)) return { passed: true, reason: 'Single market-data provider; independent quote cross-check unavailable.' }
  if (/Yahoo Finance trailing fundamentals/i.test(sourceType)) return { passed: true, reason: 'Single trailing-fundamentals provider; independent financial-statement cross-check unavailable.' }
  if (/Street Consensus/i.test(sourceType)) return source?.alternativeSources?.length
    ? { passed: true, reason: null }
    : { passed: true, reason: 'Single public consensus provider; independent estimate cross-check unavailable.' }
  if (/Derived/i.test(sourceType)) return { passed: true, reason: 'Derived from validated inputs; not a directly sourced reported figure.' }
  return { passed: true, reason: 'Source classification is incomplete.' }
}

function rawValueValidation(value, source) {
  if (!finite(value)) return { passed: false, reason: 'Value is missing or non-numeric.' }
  if (source?.currency && typeof source.currency !== 'string') return { passed: false, reason: 'Source currency is malformed.' }
  return { passed: true, reason: null }
}

function calculationValidation(value, recomputed) {
  if (recomputed == null) return { passed: true, reason: null }
  return closeEnough(value, recomputed)
    ? { passed: true, reason: null }
    : { passed: false, reason: `Mechanical recomputation ${recomputed} does not match stored result ${value}.` }
}

function adjustedEbitdaPeriodType(period) {
  if (period === 'LTM') return ADJUSTED_EBITDA_PERIOD.LTM
  if (/^\d{4}A$/.test(String(period))) return ADJUSTED_EBITDA_PERIOD.CALENDAR_YEAR
  return null
}

function adjustedEbitdaValidation(source, requestedPeriodType, expectedDenominatorIdentity = null) {
  if (source?.value == null) return { passed: false, reason: 'No canonical company-defined Adjusted EBITDA is available.' }
  if (!requestedPeriodType) return { passed: false, reason: 'Adjusted EBITDA requested period type is missing.' }
  try {
    assertCanonicalAdjustedEbitdaEntry(source, requestedPeriodType)
  } catch (error) {
    return { passed: false, reason: error.message }
  }
  const sourceIdentity = adjustedEbitdaDenominatorIdentity(source)
  if (source.denominatorIdentity !== sourceIdentity) {
    return { passed: false, reason: 'Adjusted EBITDA source-lineage identity is invalid.' }
  }
  if (expectedDenominatorIdentity != null && expectedDenominatorIdentity !== sourceIdentity) {
    return { passed: false, reason: 'EV / Adjusted EBITDA uses a denominator from a different pipeline.' }
  }
  if (source.verificationBasis !== 'STRUCTURAL_SEC_TABLE_CELL_PROVENANCE') {
    return { passed: false, reason: 'Adjusted EBITDA verification basis is not the canonical SEC structural parser.' }
  }
  return { passed: true, reason: null }
}

function chooseStatus({ source, sourceCheck, raw, calculation, manual, derivedOutput }) {
  if (!raw.passed || !sourceCheck.passed || !calculation.passed) return VALIDATION_STATUS.FAILED
  if (manual) return VALIDATION_STATUS.MANUAL
  if (derivedOutput) return VALIDATION_STATUS.DERIVED
  const ledgerStatus = normalizedLedgerStatus(source?.validationStatus)
  if ([VALIDATION_STATUS.EXACT, VALIDATION_STATUS.RECONSTRUCTED,
    VALIDATION_STATUS.WARNING, VALIDATION_STATUS.MANUAL].includes(ledgerStatus)) {
    return ledgerStatus
  }
  const type = sourceTypeFor(source)
  if (/SEC filed actual/i.test(type) && !sourceCheck.reason && !calculation.reason) return VALIDATION_STATUS.VERIFIED
  return VALIDATION_STATUS.WARNING
}

export function createAuditRecord({
  ticker,
  metric,
  period = 'Current',
  value,
  currency = 'USD',
  source = null,
  formula = 'source-value',
  inputs = {},
  recomputed = null,
  components = [],
  warnings = [],
  manual = false,
  adjustedEbitdaRequestedPeriodType = null,
  expectedDenominatorIdentity = null,
}) {
  const canonicalAdjustedEbitda = ['ebitda', 'evEbitda'].includes(metric)
    ? adjustedEbitdaValidation(source, adjustedEbitdaRequestedPeriodType, expectedDenominatorIdentity)
    : null
  const sourceCheck = canonicalAdjustedEbitda ?? sourceValidation(source, ticker)
  const rawCheck = rawValueValidation(value, { ...source, currency })
  const calculationCheck = calculationValidation(value, recomputed)
  const adjustedEbitdaStatus = normalizedLedgerStatus(source?.validationStatus)
  const preserveAdjustedEbitdaStatus = metric === 'ebitda' &&
    (canonicalAdjustedEbitda?.passed || (!finite(value) && ADJUSTED_EBITDA_NULL_STATUSES.has(adjustedEbitdaStatus)))
  const preserveBaseCanonicalStatus = canonicalAdjustedEbitda == null && isBaseCanonicalHistoricalCell(metric, period)
  const canonicalStatus = (preserveBaseCanonicalStatus || preserveAdjustedEbitdaStatus) &&
    CANONICAL_RESULT_STATUSES.has(normalizedLedgerStatus(source?.validationStatus))
    ? normalizedLedgerStatus(source.validationStatus)
    : null
  const status = canonicalStatus ?? (finite(value)
    ? chooseStatus({
        source,
        sourceCheck,
        raw: rawCheck,
        calculation: calculationCheck,
        manual,
        derivedOutput: isDerivedOutputMetric(metric),
      })
    : [VALIDATION_STATUS.MISMATCH, VALIDATION_STATUS.FAILED].includes(source?.validationStatus)
      ? source.validationStatus
      : [VALIDATION_STATUS.MISSING_BUT_AVAILABLE, VALIDATION_STATUS.LEGITIMATE_NA,
        VALIDATION_STATUS.ETF_NOT_APPLICABLE, VALIDATION_STATUS.OUT_OF_SEC_SCOPE,
        VALIDATION_STATUS.REQUIRES_REVIEW, VALIDATION_STATUS.INSUFFICIENT_PERIOD_COVERAGE,
        VALIDATION_STATUS.STALE_SOURCE_COVERAGE, VALIDATION_STATUS.OPERATION_SCOPE_INCOMPATIBLE,
        VALIDATION_STATUS.DEFINITION_INCOMPATIBLE, VALIDATION_STATUS.MISSING_SOURCE_DATA,
        VALIDATION_STATUS.NOT_REPORTED, VALIDATION_STATUS.OUT_OF_SCOPE,
        VALIDATION_STATUS.UNAVAILABLE].includes(source?.validationStatus)
        ? source.validationStatus
        : VALIDATION_STATUS.UNVERIFIED)
  const allWarnings = [sourceCheck.reason, rawCheck.reason, calculationCheck.reason, ...(source?.warnings ?? []), ...warnings].filter(Boolean)

  return {
    ticker,
    metric,
    period,
    status,
    displayable: [VALIDATION_STATUS.VERIFIED, VALIDATION_STATUS.EXACT, VALIDATION_STATUS.RECONSTRUCTED,
      VALIDATION_STATUS.DERIVED, VALIDATION_STATUS.MANUAL, VALIDATION_STATUS.VERIFIED_REPORTED,
      VALIDATION_STATUS.VERIFIED_DERIVED].includes(status),
    value: finite(value) ? Number(value) : null,
    rawValue: finite(value) ? Number(value) : null,
    normalizedValue: finite(value) ? Number(value) : null,
    currency,
    units: currency,
    source: {
      provider: source?.provider ?? sourceTypeFor(source),
      sourceType: sourceTypeFor(source),
      sourceUrl: source?.sourceUrl ?? null,
      filingAccession: source?.accn ?? null,
      xbrlTag: source?.tag ?? null,
      filingDate: source?.filed ?? null,
      publicationDate: source?.publishedAt ?? null,
      retrievalDate: source?.retrievedAt ?? null,
      originalPeriod: source?.originalFiscalPeriod ?? (source?.start || source?.end ? { start: source.start ?? null, end: source.end ?? null } : null),
      alternativeSources: source?.alternativeSources ?? [],
      definition: source?.definition ?? null,
      exactness: source?.exactness ?? null,
      documentHash: source?.documentHash ?? null,
      denominatorIdentity: source?.denominatorIdentity ?? null,
      verificationBasis: source?.verificationBasis ?? null,
      adjustedEbitdaMethod: source?.adjustedEbitdaMethod ?? null,
      requestedPeriodType: source?.requestedPeriodType ?? null,
      sourcePeriodType: source?.sourcePeriodType ?? null,
      definitionFingerprint: source?.definitionFingerprint ?? null,
      derivation: source?.derivation ?? null,
    },
    formula,
    formulaVersion: FORMULA_VERSION,
    inputs,
    recomputedValue: recomputed == null ? null : Number(recomputed),
    components,
    checks: {
      source: sourceCheck,
      rawValue: rawCheck,
      calculation: calculationCheck,
      reconciliation: { passed: calculationCheck.passed, reason: calculationCheck.reason },
      canonicalAdjustedEbitda,
    },
    warnings: allWarnings,
    calculatedAt: new Date().toISOString(),
  }
}

function metricSource(row, metric, period) {
  const entry = row.provenance?.[metric]?.[period]
  if (!entry) return { sourceType: 'Derived Calculation' }
  const component = entry?.components?.[0]
  if (entry.status) {
    const reported = entry.status === VALIDATION_STATUS.VERIFIED_REPORTED
    return {
      ...entry,
      validationStatus: entry.status,
      sourceType: reported ? 'SEC filed actual' : 'Derived Calculation',
      sourceUrl: component?.sourceUrl ?? null,
      filed: component?.filingDate ?? component?.filed ?? null,
      accn: component?.accession ?? component?.accn ?? null,
      warnings: [entry.reason, ...(entry.warnings ?? [])].filter(Boolean),
      originalFiscalPeriod: component?.sourceStart
        ? { start: component.sourceStart, end: component.sourceEnd }
        : null,
    }
  }
  return entry?.sourceType ? entry : {
    ...entry,
    sourceType: component?.sourceType ?? 'SEC filed actual',
    sourceUrl: entry?.sourceUrl ?? component?.sourceUrl ?? null,
    tag: entry?.tag ?? component?.tag ?? null,
    filed: entry?.filed ?? component?.filed ?? null,
    accn: entry?.accn ?? component?.accn ?? null,
    originalFiscalPeriod: entry?.originalFiscalPeriod ?? (component?.sourceStart ? { start: component.sourceStart, end: component.sourceEnd } : null),
  }
}

function priorPeriod(periods, period) {
  const index = periods.indexOf(period)
  return index > 0 ? periods[index - 1] : null
}

export function buildRowAudit(row) {
  const cells = {}
  const set = (key, record) => { cells[key] = record }
  const marketSource = row.provenance?.market ?? { sourceType: 'Yahoo Finance market quote' }
  const capitalSource = row.provenance?.capital ?? {}
  const auditInputs = row.auditInputs ?? {}
  const metrics = row.metrics ?? {}
  const periods = Object.keys(metrics.revenue ?? {})

  set('price', createAuditRecord({ ticker: row.ticker, metric: 'Price', value: row.price, currency: row.currency, source: marketSource, formula: 'source-market-quote' }))
  set('dailyPercent', createAuditRecord({ ticker: row.ticker, metric: 'Daily change percent', value: row.dailyPercent, currency: row.currency, source: marketSource, formula: '(price / prior-close) - 1', inputs: { price: row.price, priorClose: auditInputs.dailyBase }, recomputed: finite(row.price) && finite(auditInputs.dailyBase) && Number(auditInputs.dailyBase) !== 0 ? Number(row.price) / Number(auditInputs.dailyBase) - 1 : null }))
  set('belowHigh52', createAuditRecord({ ticker: row.ticker, metric: 'Percent below 52-week high', value: row.ranges?.belowHigh52, currency: row.currency, source: marketSource, formula: '(price / 52-week-high) - 1', inputs: { price: row.price, high52: auditInputs.high52 }, recomputed: finite(row.price) && finite(auditInputs.high52) && Number(auditInputs.high52) !== 0 ? Number(row.price) / Number(auditInputs.high52) - 1 : null }))
  set('aboveLow52', createAuditRecord({ ticker: row.ticker, metric: 'Percent above 52-week low', value: row.ranges?.aboveLow52, currency: row.currency, source: marketSource, formula: '(price / 52-week-low) - 1', inputs: { price: row.price, low52: auditInputs.low52 }, recomputed: finite(row.price) && finite(auditInputs.low52) && Number(auditInputs.low52) !== 0 ? Number(row.price) / Number(auditInputs.low52) - 1 : null }))

  for (const key of ['equityValue', 'debt', 'cash', 'enterpriseValue']) {
    const source = key === 'equityValue'
      ? { ...(capitalSource.dilutedShares ?? {}), sourceType: capitalSource.dilutedShares?.sourceType ?? 'Derived Calculation' }
      : key === 'enterpriseValue'
        ? { sourceType: 'Derived Calculation' }
        : capitalSource[key]
    const formula = key === 'equityValue' ? 'price * SEC-reported-common-shares-outstanding' : key === 'enterpriseValue' ? 'equity-value + debt - cash' : 'source-balance-sheet-value'
    const recomputed = key === 'equityValue'
      ? finite(row.price) && finite(row.capital?.dilutedShares) ? Number(row.price) * Number(row.capital.dilutedShares) : null
      : key === 'enterpriseValue'
        ? finite(row.capital?.equityValue) && finite(row.capital?.debt) && finite(row.capital?.cash) ? Number(row.capital.equityValue) + Number(row.capital.debt) - Number(row.capital.cash) : null
        : null
    set(key, createAuditRecord({ ticker: row.ticker, metric: key, value: row.capital?.[key], currency: row.currency, source, formula, inputs: { price: row.price, dilutedShares: row.capital?.dilutedShares, equityValue: row.capital?.equityValue, debt: row.capital?.debt, cash: row.capital?.cash }, recomputed }))
  }

  for (const [metric, values] of Object.entries(metrics)) {
    for (const [period, value] of Object.entries(values ?? {})) {
      const prior = priorPeriod(periods, period)
      const revenue = metrics.revenue?.[period]
      const source = metricSource(row, metric, period)
      let formula = 'validated-source-or-calendarized-value'
      let inputs = {}
      let recomputed = null
      if (metric === 'revenueGrowth') {
        formula = '(current-revenue / prior-period-revenue) - 1'
        inputs = { currentRevenue: metrics.revenue?.[period], priorRevenue: prior ? metrics.revenue?.[prior] : null }
        recomputed = finite(inputs.currentRevenue) && finite(inputs.priorRevenue) && Number(inputs.priorRevenue) !== 0 ? Number(inputs.currentRevenue) / Number(inputs.priorRevenue) - 1 : null
      } else if (metric === 'grossMargin') {
        formula = 'gross-profit / revenue'
        inputs = { grossProfit: metrics.grossProfit?.[period], revenue }
        recomputed = finite(inputs.grossProfit) && finite(revenue) && Number(revenue) !== 0 ? Number(inputs.grossProfit) / Number(revenue) : null
      } else if (metric === 'ebitdaMargin') {
        formula = 'ebitda / revenue'
        inputs = { ebitda: metrics.ebitda?.[period], revenue }
        recomputed = finite(inputs.ebitda) && finite(revenue) && Number(revenue) !== 0 ? Number(inputs.ebitda) / Number(revenue) : null
      }
      set(`${metric}:${period}`, createAuditRecord({
        ticker: row.ticker,
        metric,
        period,
        value,
        currency: row.currency,
        source,
        formula,
        inputs,
        recomputed,
        components: row.provenance?.[metric]?.[period]?.components ?? [],
        adjustedEbitdaRequestedPeriodType: metric === 'ebitda' ? adjustedEbitdaPeriodType(period) : null,
      }))
    }
  }

  for (const [metric, values] of Object.entries(row.multiples ?? {})) {
    const denominatorMetric = metric === 'evRevenue' ? 'revenue' : metric === 'evGrossProfit' ? 'grossProfit'
      : metric === 'evEbit' ? 'ebit' : metric === 'evEbitda' ? 'ebitda' : 'freeCashFlow'
    for (const [period, value] of Object.entries(values ?? {})) {
      const denominator = metrics[denominatorMetric]?.[period]
      const recomputed = finite(row.capital?.enterpriseValue) && finite(denominator) && Number(denominator) > 0 ? Number(row.capital.enterpriseValue) / Number(denominator) : null
      set(`${metric}:${period}`, createAuditRecord({
        ticker: row.ticker,
        metric,
        period,
        value,
        currency: row.currency,
        source: metricSource(row, denominatorMetric, period),
        formula: 'enterprise-value / calendar-period-metric',
        inputs: { enterpriseValue: row.capital?.enterpriseValue, denominator },
        recomputed,
        adjustedEbitdaRequestedPeriodType: metric === 'evEbitda' ? adjustedEbitdaPeriodType(period) : null,
        expectedDenominatorIdentity: metric === 'evEbitda'
          ? row.multipleDenominatorIdentity?.evEbitda?.[period] ?? null
          : null,
      }))
    }
  }

  const records = Object.values(cells)
  const summary = Object.fromEntries(Object.values(VALIDATION_STATUS).map((status) => [status, records.filter((record) => record.status === status).length]))
  return { cells, summary, generatedAt: new Date().toISOString() }
}

export function auditSummary(rows = []) {
  const records = rows.flatMap((row) => Object.values(row.audit?.cells ?? {}))
  const byStatus = Object.fromEntries(Object.values(VALIDATION_STATUS).map((status) => [status, records.filter((record) => record.status === status).length]))
  return {
    total: records.length,
    ...byStatus,
    stale: records.filter((record) => record.warnings.some((warning) => /stale/i.test(warning))).length,
    sourceConflicts: records.filter((record) => record.warnings.some((warning) => /conflict|disagree/i.test(warning))).length,
    calculationMismatches: records.filter((record) => !record.checks.calculation.passed).length,
    incompleteCompanies: rows.filter((row) => Object.values(row.audit?.cells ?? {}).some((record) => [
      VALIDATION_STATUS.UNAVAILABLE, VALIDATION_STATUS.UNVERIFIED, VALIDATION_STATUS.FAILED,
      VALIDATION_STATUS.MISMATCH, VALIDATION_STATUS.MISSING_BUT_AVAILABLE,
      VALIDATION_STATUS.REQUIRES_REVIEW, VALIDATION_STATUS.INSUFFICIENT_PERIOD_COVERAGE,
      VALIDATION_STATUS.STALE_SOURCE_COVERAGE, VALIDATION_STATUS.OPERATION_SCOPE_INCOMPATIBLE,
      VALIDATION_STATUS.DEFINITION_INCOMPATIBLE, VALIDATION_STATUS.MISSING_SOURCE_DATA,
      VALIDATION_STATUS.NOT_REPORTED, VALIDATION_STATUS.OUT_OF_SCOPE, VALIDATION_STATUS.LEGITIMATE_NA,
    ].includes(record.status))).map((row) => row.ticker),
    lastSuccessfulValidationRun: new Date().toISOString(),
  }
}
import {
  adjustedEbitdaDenominatorIdentity,
  assertCanonicalAdjustedEbitdaEntry,
  ADJUSTED_EBITDA_PERIOD,
} from './adjustedEbitdaEngine.js'
import { HISTORICAL_RESULT_STATUS } from './historicalPeriodEngine.js'
