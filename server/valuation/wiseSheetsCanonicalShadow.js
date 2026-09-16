import {
  createCanonicalObservation,
  createPeriodIdentity,
  DATE_AUTHORITY,
  epochDay,
  inclusiveDays,
  isoDate,
  OBSERVATION_BASIS,
  PERIOD_TYPE,
  SEMANTIC_DEFINITION,
} from './canonicalFinancialObservation.js'
import {
  classifyPeriod,
  deduplicateEconomicPeriods,
  deriveStandaloneQuarters,
} from './periodNormalization.js'
import {
  buildCalendarYear,
  buildLtm,
  CY_CLASSIFICATION,
  HISTORICAL_RESULT_STATUS,
} from './historicalPeriodEngine.js'
import { buildWiseSheetsHistorical } from './wiseSheetsFinancials.js'

export const WISESHEETS_CANONICAL_METRIC_MAP = Object.freeze({
  revenue: 'revenue',
  gross_profit: 'grossProfit',
  net_cash_from_operating_activities: 'operatingCashFlow',
  total_capex: 'capitalExpenditures',
  free_cash_flow: 'providerFreeCashFlow',
})

export const SHADOW_METRICS = Object.freeze([
  'revenue',
  'grossProfit',
  'operatingCashFlow',
  'capitalExpenditures',
  'freeCashFlow',
])

const DATE_AUTHORITIES = new Set(Object.values(DATE_AUTHORITY))
const MATERIAL_DIFFERENCE_TOLERANCE = 0.001
const WISESHEETS_API_URL = 'https://api.wisesheets.io/v1/financials/'

function finite(value) {
  return value != null && Number.isFinite(Number(value))
}

function providerDate(value) {
  return isoDate(String(value ?? '').slice(0, 10))
}

function fiscalQuarter(value) {
  const match = String(value ?? '').toUpperCase().match(/Q([1-4])/)
  return match ? Number(match[1]) : [1, 2, 3, 4].includes(Number(value)) ? Number(value) : null
}

function currencyFrom(row) {
  const units = String(row.rawUnits ?? row.units ?? row.unit ?? '')
  return String(row.currency ?? units.match(/\b(USD|EUR|GBP|JPY|CAD|AUD|CHF)\b/i)?.[1] ?? '').toUpperCase() || null
}

function unitScale(units) {
  const normalized = String(units ?? '').toLowerCase()
  if (/\b(thousand|thousands|000s)\b/.test(normalized)) return 1_000
  if (/\b(million|millions|mm)\b/.test(normalized)) return 1_000_000
  if (/\b(billion|billions|bn)\b/.test(normalized)) return 1_000_000_000
  return 1
}

function sameProviderPeriod(left, right) {
  const leftQuarter = fiscalQuarter(left.fiscalQuarter ?? left.fiscalPeriod)
  const rightQuarter = fiscalQuarter(right.fiscalQuarter ?? right.fiscalPeriod)
  return String(left.ticker).toUpperCase() === String(right.ticker).toUpperCase() &&
    providerDate(left.periodEnd ?? left.quarterEnd) === providerDate(right.periodEnd ?? right.quarterEnd) &&
    (leftQuarter == null || rightQuarter == null || leftQuarter === rightQuarter) &&
    (left.fiscalYear == null || right.fiscalYear == null || Number(left.fiscalYear) === Number(right.fiscalYear))
}

function prepareProviderRows(rows) {
  return rows.map((row) => {
    if (currencyFrom(row)) return { ...row, adapterWarnings: [...(row.adapterWarnings ?? [])] }
    const peer = rows.find((candidate) => candidate !== row && sameProviderPeriod(row, candidate) && currencyFrom(candidate))
    if (!peer) return { ...row, adapterWarnings: [...(row.adapterWarnings ?? [])] }
    return {
      ...row,
      adapterCurrency: currencyFrom(peer),
      adapterNormalizedUnits: currencyFrom(peer),
      adapterWarnings: [...(row.adapterWarnings ?? []), 'PROVIDER_UNIT_REPAIRED_FROM_MATCHED_MONETARY_PERIOD'],
    }
  })
}

function mappedPeriodType(row, periodStart, periodEnd, dateAuthority, providerFrequency) {
  const explicit = row.periodType ?? row.source?.periodType
  if (explicit) {
    return classifyPeriod({ periodType: explicit, periodStart, periodEnd, dateAuthority })
  }
  if (periodStart && periodEnd) return classifyPeriod({ periodStart, periodEnd })
  if (providerFrequency === 'QUARTERLY' && fiscalQuarter(row.fiscalQuarter ?? row.fiscalPeriod) != null) {
    return PERIOD_TYPE.STANDALONE_QUARTER
  }
  return PERIOD_TYPE.UNKNOWN
}

function mappedScope(row) {
  const raw = String(row.scope ?? row.source?.scope ?? '').trim().toUpperCase()
  if (/SEGMENT|GEOGRAPH|PRODUCT|DIVISION/.test(raw)) return raw
  if (/CONSOLIDATED|COMPANY|TOTAL/.test(raw)) return 'CONSOLIDATED'
  return 'CONSOLIDATED'
}

function adaptProviderRow(row, { providerFrequency = 'QUARTERLY', retrievedAt = null } = {}) {
  const providerMetric = String(row.metric ?? '')
  const metric = WISESHEETS_CANONICAL_METRIC_MAP[providerMetric]
  if (!metric) return { observation: null, failure: { reason: 'UNSUPPORTED_PROVIDER_METRIC', providerMetric } }
  const rawValue = row.rawValue ?? row.value ?? row.normalizedValue
  const periodEnd = providerDate(row.periodEnd ?? row.quarterEnd)
  if (!row.ticker || !finite(rawValue) || !periodEnd) {
    return { observation: null, failure: { reason: 'INVALID_PROVIDER_OBSERVATION', providerMetric, periodEnd } }
  }
  const rawUnits = row.rawUnits ?? row.units ?? row.unit ?? row.currency ?? null
  const currency = currencyFrom(row) ?? row.adapterCurrency ?? null
  const normalizedUnits = row.normalizedUnits ?? row.adapterNormalizedUnits ?? currency
  if (!currency || !normalizedUnits) {
    return { observation: null, failure: { reason: 'UNKNOWN_PROVIDER_MONETARY_UNITS', providerMetric, periodEnd } }
  }
  const periodStart = providerDate(row.periodStart ?? row.quarterStart)
  const explicitAuthority = DATE_AUTHORITIES.has(row.dateAuthority) ? row.dateAuthority : null
  const dateAuthority = periodStart
    ? explicitAuthority ?? DATE_AUTHORITY.INFERRED
    : DATE_AUTHORITY.UNKNOWN
  const periodType = mappedPeriodType(row, periodStart, periodEnd, dateAuthority, providerFrequency)
  const source = row.source ?? {}
  const sourceKind = String(source.kind ?? row.sourceKind ?? 'reported').toLowerCase()
  const reportedVsDerived = sourceKind === 'calculated' || row.derivation
    ? OBSERVATION_BASIS.DERIVED
    : OBSERVATION_BASIS.REPORTED
  const fiscalQ = fiscalQuarter(row.fiscalQuarter ?? row.fiscalPeriod)
  const normalizedValue = row.normalizedValue != null
    ? Number(row.normalizedValue)
    : Number(rawValue) * unitScale(rawUnits)
  const canonicalValue = metric === 'capitalExpenditures' ? Math.abs(normalizedValue) : normalizedValue
  const accession = row.accession ?? source.accession ?? source.accessionNumber ?? null
  const sourceId = row.sourceId ?? source.sourceId ?? [
    'WiseSheets', String(row.ticker).toUpperCase(), providerMetric, periodEnd,
    row.fiscalYear ?? '', fiscalQ ?? '', accession ?? '',
  ].join(':')
  const warnings = [
    ...(row.warnings ?? []),
    ...(row.adapterWarnings ?? []),
    ...(!row.scope && !source.scope ? ['SCOPE_FROM_WISESHEETS_COMPANY_FINANCIALS_ENDPOINT'] : []),
    ...(source.isSuperseded ? ['PROVIDER_SOURCE_MARKED_SUPERSEDED'] : []),
  ]
  try {
    return {
      observation: createCanonicalObservation({
        ticker: row.ticker,
        issuerId: row.issuerId ?? row.cik ?? row.ticker,
        metric,
        rawValue,
        rawUnits,
        normalizedValue: canonicalValue,
        currency,
        normalizedUnits,
        periodIdentity: createPeriodIdentity({
          periodType,
          periodStart,
          periodEnd,
          dateAuthority,
          fiscalYear: row.fiscalYear,
          fiscalQuarter: fiscalQ,
          fiscalCalendarId: row.fiscalCalendarId ?? null,
          sequenceIndex: row.sequenceIndex,
          startEvidence: periodStart ? 'WISESHEETS_PROVIDER_PERIOD_START' : null,
          endEvidence: 'WISESHEETS_PROVIDER_PERIOD_END',
        }),
        sourceProvider: 'WiseSheets',
        sourceId,
        filingDate: providerDate(row.filingDate ?? source.filingDate),
        accession,
        sourceUrl: row.sourceUrl ?? source.filingUrl ?? source.sourceUrl ?? null,
        scope: mappedScope(row),
        confidence: String(row.confidence ?? (accession ? 'HIGH' : 'MEDIUM')).toUpperCase(),
        reportedVsDerived,
        derivation: row.derivation ?? (sourceKind === 'calculated'
          ? { method: 'WISESHEETS_PROVIDER_CALCULATED', providerMetric }
          : null),
        semanticDefinitionFingerprint: SEMANTIC_DEFINITION[metric],
        sourceDefinitionFingerprint: `WISESHEETS_STANDARDIZED:${providerMetric}`,
        retrievedAt,
        restatedOrRecast: source.isAmendment === true || row.restatedOrRecast === true,
        warnings,
      }),
      failure: null,
    }
  } catch (error) {
    return {
      observation: null,
      failure: {
        reason: 'CANONICAL_ADAPTER_REJECTION',
        providerMetric,
        periodEnd,
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }
}

export function adaptWiseSheetsObservations(rows = [], options = {}) {
  const observations = []
  const failures = []
  for (const row of prepareProviderRows(rows)) {
    const result = adaptProviderRow(row, options)
    if (result.observation) observations.push(result.observation)
    if (result.failure) failures.push({ ticker: String(row.ticker ?? '').toUpperCase(), ...result.failure })
  }
  return { observations, failures }
}

function economicPeriodIdentityCompatible(left, right) {
  if (!left || !right || left.issuerId !== right.issuerId) return false
  const a = left.periodIdentity
  const b = right.periodIdentity
  if (!a || !b || a.periodType !== b.periodType) return false
  if (a.fiscalYear != null && b.fiscalYear != null && a.fiscalYear !== b.fiscalYear) return false
  if (a.fiscalQuarter != null && b.fiscalQuarter != null && a.fiscalQuarter !== b.fiscalQuarter) return false
  if (a.fiscalCalendarId && b.fiscalCalendarId && a.fiscalCalendarId !== b.fiscalCalendarId) return false
  const aEnd = epochDay(a.periodEnd)
  const bEnd = epochDay(b.periodEnd)
  if (aEnd == null || bEnd == null || Math.abs(aEnd - bEnd) > 7) return false
  const aStart = epochDay(a.periodStart)
  const bStart = epochDay(b.periodStart)
  if (aStart != null && bStart != null) {
    if (Math.abs(aStart - bStart) > 14) return false
    const aDuration = inclusiveDays(a.periodStart, a.periodEnd)
    const bDuration = inclusiveDays(b.periodStart, b.periodEnd)
    return aDuration != null && bDuration != null && Math.abs(aDuration - bDuration) <= 14
  }
  return a.fiscalYear != null && b.fiscalYear != null && a.fiscalQuarter != null && b.fiscalQuarter != null
}

export function canonicalEconomicPeriodsCompatible(left, right) {
  return economicPeriodIdentityCompatible(left, right) && left.scope === right.scope &&
    left.operationScope === right.operationScope &&
    left.currency === right.currency && left.normalizedUnits === right.normalizedUnits
}

function lineage(observation) {
  return {
    metric: observation.metric,
    sourceProvider: observation.sourceProvider,
    sourceId: observation.sourceId,
    sourceUrl: observation.sourceUrl,
    accession: observation.accession,
    filingDate: observation.filingDate,
    rawValue: observation.rawValue,
    rawUnits: observation.rawUnits,
    normalizedValue: observation.normalizedValue,
    currency: observation.currency,
    normalizedUnits: observation.normalizedUnits,
    issuerId: observation.issuerId,
    scope: observation.scope,
    operationScope: observation.operationScope,
    deduplicationStatus: observation.deduplicationStatus ?? null,
    periodIdentity: observation.periodIdentity,
    definitionFingerprint: observation.definitionFingerprint,
    semanticDefinitionFingerprint: observation.semanticDefinitionFingerprint,
    sourceDefinitionFingerprint: observation.sourceDefinitionFingerprint,
    periodEvidenceSource: observation.periodEvidenceSource ?? null,
    derivation: observation.derivation ?? null,
  }
}

export function deriveCanonicalFreeCashFlow(cfoRecords = [], capexRecords = [], providerFcfRecords = []) {
  const observations = []
  const failures = []
  for (const cfo of cfoRecords) {
    const periodMatches = capexRecords.filter((capex) => economicPeriodIdentityCompatible(cfo, capex))
    const matches = periodMatches.filter((capex) => canonicalEconomicPeriodsCompatible(cfo, capex))
    if (matches.length !== 1) {
      const operationScopeMismatch = periodMatches.length > 0 &&
        periodMatches.every((capex) => capex.operationScope !== cfo.operationScope)
      failures.push({
        status: operationScopeMismatch ? 'OPERATION_SCOPE_INCOMPATIBLE' : 'REQUIRES_REVIEW',
        reason: matches.length ? 'AMBIGUOUS_CAPEX_PERIOD_MATCH' :
          operationScopeMismatch ? 'OPERATION_SCOPE_INCOMPATIBLE' :
            periodMatches.length ? 'INCOMPATIBLE_FCF_SOURCE_SERIES' : 'MISSING_MATCHED_CAPEX_PERIOD',
        cfoSourceId: cfo.sourceId,
        capexSourceIds: periodMatches.map((item) => item.sourceId),
        periodIdentity: cfo.periodIdentity,
        operationScopes: [cfo.operationScope, ...periodMatches.map((item) => item.operationScope)],
      })
      continue
    }
    const capex = matches[0]
    if (cfo.deduplicationStatus === 'REQUIRES_REVIEW' || capex.deduplicationStatus === 'REQUIRES_REVIEW') {
      failures.push({ status: 'REQUIRES_REVIEW', reason: 'SOURCE_VALUE_CONFLICT',
        sourceIds: [cfo.sourceId, capex.sourceId] })
      continue
    }
    if (cfo.scope !== capex.scope || cfo.currency !== capex.currency || cfo.normalizedUnits !== capex.normalizedUnits) {
      failures.push({ status: 'REQUIRES_REVIEW', reason: 'INCOMPATIBLE_FCF_SOURCE_SERIES',
        sourceIds: [cfo.sourceId, capex.sourceId] })
      continue
    }
    const value = cfo.normalizedValue - capex.normalizedValue
    const providerCheck = providerFcfRecords.find((record) => canonicalEconomicPeriodsCompatible(cfo, record)) ?? null
    const reconciliation = providerCheck ? {
      source: lineage(providerCheck),
      difference: value - providerCheck.normalizedValue,
      matches: Math.abs(value - providerCheck.normalizedValue) <= Math.max(1, Math.abs(value)) * MATERIAL_DIFFERENCE_TOLERANCE,
    } : null
    try {
      observations.push(createCanonicalObservation({
        ticker: cfo.ticker,
        issuerId: cfo.issuerId,
        metric: 'freeCashFlow',
        rawValue: null,
        rawUnits: cfo.normalizedUnits,
        normalizedValue: value,
        currency: cfo.currency,
        normalizedUnits: cfo.normalizedUnits,
        periodIdentity: cfo.periodIdentity,
        sourceProvider: 'DERIVED',
        sourceId: `${cfo.sourceId}|CFO_MINUS_CAPEX|${capex.sourceId}`,
        scope: cfo.scope,
        operationScope: cfo.operationScope,
        confidence: cfo.confidence === 'HIGH' && capex.confidence === 'HIGH' ? 'HIGH' : 'MEDIUM',
        reportedVsDerived: OBSERVATION_BASIS.DERIVED,
        derivation: { method: 'CFO_MINUS_CAPEX', exactness: 'EXACT_ARITHMETIC', inputs: [lineage(cfo), lineage(capex)], reconciliation },
        semanticDefinitionFingerprint: SEMANTIC_DEFINITION.freeCashFlow,
        sourceDefinitionFingerprint: 'DERIVED:CFO_MINUS_CAPEX',
        retrievedAt: [cfo.retrievedAt, capex.retrievedAt].filter(Boolean).sort().at(-1) ?? null,
        warnings: reconciliation && !reconciliation.matches ? ['WISESHEETS_FCF_RECONCILIATION_MISMATCH'] : [],
      }))
    } catch (error) {
      failures.push({ status: 'REQUIRES_REVIEW', reason: 'FCF_CANONICAL_ADAPTER_REJECTION',
        sourceIds: [cfo.sourceId, capex.sourceId], message: error instanceof Error ? error.message : String(error) })
    }
  }
  return { observations: deduplicateEconomicPeriods(observations), failures }
}

function normalizedMetricRecords(observations, metric) {
  const derived = deriveStandaloneQuarters(observations.filter((item) => item.metric === metric))
  return {
    records: deduplicateEconomicPeriods(derived),
    failures: [...(derived.failures ?? [])],
  }
}

export function buildWiseSheetsCanonicalShadow(ticker, rows = [], years = [], options = {}) {
  const normalizedTicker = String(ticker).trim().toUpperCase()
  const adapted = adaptWiseSheetsObservations(rows.filter((row) => String(row.ticker).toUpperCase() === normalizedTicker), options)
  const records = {}
  const failures = [...adapted.failures]
  for (const metric of ['revenue', 'grossProfit', 'operatingCashFlow', 'capitalExpenditures', 'providerFreeCashFlow']) {
    const normalized = normalizedMetricRecords(adapted.observations, metric)
    records[metric] = normalized.records
    failures.push(...normalized.failures.map((failure) => ({ ticker: normalizedTicker, metric, ...failure })))
  }
  const fcf = deriveCanonicalFreeCashFlow(
    records.operatingCashFlow,
    records.capitalExpenditures,
    records.providerFreeCashFlow,
  )
  records.freeCashFlow = fcf.observations
  failures.push(...fcf.failures.map((failure) => ({ ticker: normalizedTicker, metric: 'freeCashFlow', ...failure })))

  const calendarActuals = Object.fromEntries(SHADOW_METRICS.map((metric) => [metric,
    Object.fromEntries(years.map((year) => [year, buildCalendarYear(records[metric], year)])),
  ]))
  const ltm = Object.fromEntries(SHADOW_METRICS.map((metric) => [metric, buildLtm(records[metric], {
    asOfDate: options.asOfDate ?? '9999-12-31',
    latestReportedPeriod: options.latestReportedPeriod ?? null,
  })]))
  return { ticker: normalizedTicker, provider: 'WiseSheets', observations: adapted.observations,
    records, calendarActuals, ltm, failures }
}

function valueOf(entry) {
  return finite(entry?.value) ? Number(entry.value) : null
}

function discrepancyCause(legacyValue, canonicalResult) {
  if (canonicalResult?.status === HISTORICAL_RESULT_STATUS.STALE_SOURCE_COVERAGE) return 'STALE_SOURCE_COVERAGE'
  if (canonicalResult?.status === HISTORICAL_RESULT_STATUS.INSUFFICIENT_PERIOD_COVERAGE) return 'INSUFFICIENT_PERIOD_COVERAGE'
  if (canonicalResult?.reason === 'VALUE_CONFLICT') return 'SOURCE_VALUE_CONFLICT'
  if (canonicalResult?.reason === 'NON_CONSOLIDATED_SCOPE') return 'SCOPE_CONFLICT'
  if (canonicalResult?.classification === CY_CLASSIFICATION.CALENDARIZED_ESTIMATE) return 'CALENDARIZATION_METHOD_CHANGED'
  if (valueOf(canonicalResult) == null) return 'MISSING_PROVIDER_PERIOD'
  if (legacyValue == null) return 'PERIOD_CLASSIFICATION_DIFFERENCE'
  return 'PERIOD_CLASSIFICATION_DIFFERENCE'
}

export function compareWiseSheetsShadow(ticker, legacyHistorical, canonicalHistorical, years = []) {
  const comparisons = []
  for (const metric of SHADOW_METRICS) {
    for (const period of [...years.map((year) => `${year}A`), 'LTM']) {
      const year = period === 'LTM' ? null : Number(period.slice(0, 4))
      const legacyEntry = period === 'LTM' ? legacyHistorical?.ltm?.[metric] : legacyHistorical?.calendarActuals?.[metric]?.[year]
      const canonicalResult = period === 'LTM' ? canonicalHistorical?.ltm?.[metric] : canonicalHistorical?.calendarActuals?.[metric]?.[year]
      const legacyValue = valueOf(legacyEntry)
      const canonicalValue = valueOf(canonicalResult)
      const absoluteDifference = legacyValue == null || canonicalValue == null ? null : canonicalValue - legacyValue
      const percentageDifference = absoluteDifference == null || legacyValue === 0
        ? null
        : absoluteDifference / Math.abs(legacyValue)
      const unavailableCanonical = canonicalValue == null
      const materiallyDifferent = !unavailableCanonical && (legacyValue == null ||
        Math.abs(percentageDifference ?? absoluteDifference) > MATERIAL_DIFFERENCE_TOLERANCE)
      comparisons.push({
        ticker: String(ticker).toUpperCase(),
        metric,
        period,
        legacyValue,
        canonicalValue,
        canonicalClassification: canonicalResult?.classification ?? null,
        canonicalStatus: canonicalResult?.status ?? null,
        absoluteDifference,
        percentageDifference,
        canonicalComponents: canonicalResult?.components ?? [],
        reason: canonicalResult?.reason ?? null,
        materiallyDifferent,
        unavailableCanonical,
        cause: materiallyDifferent || unavailableCanonical ? discrepancyCause(legacyValue, canonicalResult) : null,
      })
    }
  }
  return {
    comparisons,
    summary: {
      matchingCells: comparisons.filter((item) => !item.materiallyDifferent && !item.unavailableCanonical).length,
      materiallyDifferentCells: comparisons.filter((item) => item.materiallyDifferent).length,
      unavailableCanonicalCells: comparisons.filter((item) => item.unavailableCanonical).length,
    },
  }
}

function countWhere(rows, predicate) {
  return rows.reduce((count, row) => count + (predicate(row) ? 1 : 0), 0)
}

export function auditWiseSheetsPeriodMetadata(rows = []) {
  const authorityFieldNames = new Set()
  const sourceKinds = {}
  for (const row of rows) {
    for (const [key, value] of Object.entries({ ...row, ...(row.source ?? {}) })) {
      if (/period.*(authority|basis|reported|inferred)|start.*(authority|basis|reported|inferred)/i.test(key) && value != null) {
        authorityFieldNames.add(key)
      }
    }
    const kind = row.source?.kind ?? row.sourceKind
    if (kind) sourceKinds[kind] = (sourceKinds[kind] ?? 0) + 1
  }
  return {
    observations: rows.length,
    withPeriodStart: countWhere(rows, (row) => providerDate(row.periodStart ?? row.quarterStart) != null),
    withOnlyPeriodEnd: countWhere(rows, (row) => !providerDate(row.periodStart ?? row.quarterStart) &&
      providerDate(row.periodEnd ?? row.quarterEnd) != null),
    withFiscalYear: countWhere(rows, (row) => finite(row.fiscalYear)),
    withFiscalQuarterOrPeriod: countWhere(rows, (row) => fiscalQuarter(row.fiscalQuarter ?? row.fiscalPeriod) != null),
    withFilingDate: countWhere(rows, (row) => providerDate(row.filingDate ?? row.source?.filingDate) != null),
    withAccession: countWhere(rows, (row) => Boolean(row.accession ?? row.source?.accession ?? row.source?.accessionNumber)),
    withSourceUrl: countWhere(rows, (row) => Boolean(row.sourceUrl ?? row.source?.filingUrl ?? row.source?.sourceUrl)),
    withExplicitScope: countWhere(rows, (row) => Boolean(row.scope ?? row.source?.scope)),
    periodStartAuthorityFields: [...authorityFieldNames].sort(),
    sourceKinds,
    periodStartAuthorityEstablished: authorityFieldNames.size > 0,
  }
}

function reportValue(value) {
  if (!finite(value)) return '—'
  const absolute = Math.abs(Number(value))
  const scale = absolute >= 1e9 ? [1e9, 'B'] : absolute >= 1e6 ? [1e6, 'M'] : absolute >= 1e3 ? [1e3, 'K'] : [1, '']
  return `${(Number(value) / scale[0]).toFixed(scale[0] === 1 ? 2 : 3)}${scale[1]}`
}

function reportPercentage(value) {
  return finite(value) ? `${(Number(value) * 100).toFixed(2)}%` : '—'
}

function reportText(value) {
  return String(value ?? '—').replaceAll('|', '\\|').replaceAll('\n', ' ')
}

function latestComponentPeriodEnd(comparison) {
  if (comparison.period !== 'LTM') return '—'
  const dates = (comparison.canonicalComponents ?? [])
    .map((component) => component.periodEnd ?? component.sourceEnd ?? component.overlapEnd)
    .filter(Boolean)
    .sort()
  return dates.at(-1) ?? '—'
}

export function renderWiseSheetsShadowReport(result, options = {}) {
  const metadata = result.providerMetadata ?? auditWiseSheetsPeriodMetadata([])
  const generatedAt = options.generatedAt ?? new Date().toISOString()
  const lines = [
    '# Valuation Shadow Comparison',
    '',
    `Generated: ${generatedAt}`,
    '',
    'This report compares the legacy WiseSheets historical calculation with the canonical engine in shadow mode. Production values were not changed.',
    '',
    '## Totals',
    '',
    '| Outcome | Cells |',
    '| --- | ---: |',
    `| MATCHING | ${result.summary.matchingCells} |`,
    `| MATERIALLY DIFFERENT | ${result.summary.materiallyDifferentCells} |`,
    `| CANONICAL UNAVAILABLE | ${result.summary.unavailableCanonicalCells} |`,
    '',
    '## WiseSheets Period Metadata Audit',
    '',
    '| Provider field | Observations | Total |',
    '| --- | ---: | ---: |',
    `| periodStart present | ${metadata.withPeriodStart} | ${metadata.observations} |`,
    `| periodEnd present without periodStart | ${metadata.withOnlyPeriodEnd} | ${metadata.observations} |`,
    `| fiscalYear present | ${metadata.withFiscalYear} | ${metadata.observations} |`,
    `| fiscalQuarter/fiscalPeriod present | ${metadata.withFiscalQuarterOrPeriod} | ${metadata.observations} |`,
    `| filingDate present | ${metadata.withFilingDate} | ${metadata.observations} |`,
    `| accession present | ${metadata.withAccession} | ${metadata.observations} |`,
    `| sourceUrl present | ${metadata.withSourceUrl} | ${metadata.observations} |`,
    `| explicit scope present | ${metadata.withExplicitScope} | ${metadata.observations} |`,
    '',
    `Observed source kinds: ${Object.entries(metadata.sourceKinds ?? {}).map(([key, value]) => `${key}=${value}`).join(', ') || 'none'}.`,
    `Period-start authority fields observed: ${metadata.periodStartAuthorityFields?.join(', ') || 'none'}.`,
    '',
    metadata.periodStartAuthorityEstablished
      ? 'The payload contains a possible period-start authority field; its semantics require provider-contract validation before any production authority change.'
      : 'No explicit payload field establishes whether a periodStart boundary is reported, standardized, calculated, or inferred. source.kind describes the metric value source and does not establish date-boundary authority. An unqualified periodStart therefore remains INFERRED in shadow mode.',
    '',
    '## Cell Comparison',
    '',
    '| Ticker | Metric | Period | Legacy | Canonical | Canonical classification | Canonical status | Difference | Discrepancy cause | Latest canonical component period end |',
    '| --- | --- | --- | ---: | ---: | --- | --- | ---: | --- | --- |',
  ]
  for (const comparison of result.comparisons) {
    lines.push(`| ${reportText(comparison.ticker)} | ${reportText(comparison.metric)} | ${reportText(comparison.period)} | ${reportValue(comparison.legacyValue)} | ${reportValue(comparison.canonicalValue)} | ${reportText(comparison.canonicalClassification)} | ${reportText(comparison.canonicalStatus)} | ${reportPercentage(comparison.percentageDifference)} | ${reportText(comparison.cause ?? 'MATCH')} | ${latestComponentPeriodEnd(comparison)} |`)
  }
  return `${lines.join('\n')}\n`
}

export async function fetchWiseSheetsCanonicalRows(tickers, options = {}) {
  const normalizedTickers = [...new Set(tickers.map((ticker) => String(ticker).trim().toUpperCase()).filter(Boolean))]
  const apiKey = options.apiKey ?? process.env.WISESHEETS_API_KEY
  if (!apiKey) throw new Error('WISESHEETS_API_KEY is not configured')
  const params = new URLSearchParams({
    tickers: normalizedTickers.join(','),
    metrics: Object.keys(WISESHEETS_CANONICAL_METRIC_MAP).join(','),
    period: 'last20q',
  })
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(`${WISESHEETS_API_URL}?${params}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`WiseSheets returned HTTP ${response.status}`)
  const payload = await response.json()
  return Array.isArray(payload?.data) ? payload.data : []
}

export async function runWiseSheetsCanonicalShadowComparison(tickers, years, options = {}) {
  const normalizedTickers = [...new Set(tickers.map((ticker) => String(ticker).trim().toUpperCase()).filter(Boolean))]
  const rows = await fetchWiseSheetsCanonicalRows(normalizedTickers, options)
  const comparisons = []
  const companies = {}
  for (const ticker of normalizedTickers) {
    const tickerRows = rows.filter((row) => String(row.ticker).toUpperCase() === ticker)
    const legacyHistorical = buildWiseSheetsHistorical(ticker, tickerRows, years)
    const canonicalHistorical = buildWiseSheetsCanonicalShadow(ticker, tickerRows, years, {
      asOfDate: options.asOfDate,
      latestReportedPeriod: options.latestReportedPeriods?.[ticker] ?? null,
      providerFrequency: 'QUARTERLY',
      retrievedAt: options.retrievedAt ?? null,
    })
    const comparison = compareWiseSheetsShadow(ticker, legacyHistorical, canonicalHistorical, years)
    comparisons.push(...comparison.comparisons)
    companies[ticker] = { legacyHistorical, canonicalHistorical, comparison }
  }
  return {
    companies,
    comparisons,
    providerMetadata: auditWiseSheetsPeriodMetadata(rows),
    summary: {
      matchingCells: comparisons.filter((item) => !item.materiallyDifferent && !item.unavailableCanonical).length,
      materiallyDifferentCells: comparisons.filter((item) => item.materiallyDifferent).length,
      unavailableCanonicalCells: comparisons.filter((item) => item.unavailableCanonical).length,
    },
  }
}
