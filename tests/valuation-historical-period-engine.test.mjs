import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  createCanonicalObservation,
  createPeriodIdentity,
  DATE_AUTHORITY,
  inclusiveDays,
  OBSERVATION_BASIS,
  PERIOD_TYPE,
} from '../server/valuation/canonicalFinancialObservation.js'
import {
  buildCalendarYear,
  buildLtm,
  createLatestReportedPeriod,
  CY_CLASSIFICATION,
  HISTORICAL_RESULT_STATUS,
} from '../server/valuation/historicalPeriodEngine.js'

function observation({ ticker = 'NEWCO', type = PERIOD_TYPE.STANDALONE_QUARTER, start, end, value,
  fiscalYear = null, fiscalQuarter = null, sequenceIndex = null, dateAuthority = DATE_AUTHORITY.REPORTED,
  provider = 'WiseSheets', sourceId, definitionFingerprint = null, scope = 'CONSOLIDATED',
  semanticDefinitionFingerprint = null, sourceDefinitionFingerprint = null, derivation = null,
  reportedVsDerived = OBSERVATION_BASIS.REPORTED, restatedOrRecast = false,
  operationScope = 'UNSPECIFIED', currency = 'USD', units = 'USD', metric = 'revenue' }) {
  return createCanonicalObservation({
    ticker, issuerId: `${ticker}-ISSUER`, metric, rawValue: value, normalizedValue: value,
    rawUnits: units, normalizedUnits: units, currency, sourceProvider: provider,
    sourceId: sourceId ?? `${provider}:${ticker}:${start}:${end}`, filingDate: end,
    sourceUrl: `https://example.test/${provider}/${ticker}`, accession: `${provider}-${ticker}-${end}`,
    scope, operationScope, reportedVsDerived, definitionFingerprint, semanticDefinitionFingerprint,
    sourceDefinitionFingerprint, derivation, restatedOrRecast,
    periodIdentity: createPeriodIdentity({
      periodType: type, periodStart: start, periodEnd: end, dateAuthority,
      fiscalYear, fiscalQuarter, fiscalCalendarId: `${ticker}-CALENDAR`, sequenceIndex,
    }),
  })
}

function ltmBridgeFacts(kind = '3M', overrides = {}) {
  const periods = {
    '3M': { type: PERIOD_TYPE.STANDALONE_QUARTER, priorEnd: '2024-03-31', currentEnd: '2025-03-31', quarter: 1 },
    '6M': { type: PERIOD_TYPE.YTD_6M, priorEnd: '2024-06-30', currentEnd: '2025-06-30', quarter: 2 },
    '9M': { type: PERIOD_TYPE.YTD_9M, priorEnd: '2024-09-30', currentEnd: '2025-09-30', quarter: 3 },
  }[kind]
  const common = { ticker: 'BRIDGE', metric: 'ebit', definitionFingerprint: 'GAAP_EBIT', ...overrides }
  return [
    observation({ ...common, type: PERIOD_TYPE.FISCAL_YEAR, start: '2024-01-01', end: '2024-12-31',
      value: 100, fiscalYear: 2024 }),
    observation({ ...common, type: periods.type, start: '2024-01-01', end: periods.priorEnd,
      value: 20, fiscalYear: 2024, fiscalQuarter: periods.quarter }),
    observation({ ...common, type: periods.type, start: '2025-01-01', end: periods.currentEnd,
      value: 30, fiscalYear: 2025, fiscalQuarter: periods.quarter }),
  ]
}

function calendarQuarters(year, ticker = 'NEWCO') {
  return [
    ['01-01', '03-31'], ['04-01', '06-30'], ['07-01', '09-30'], ['10-01', '12-31'],
  ].map(([start, end], index) => observation({ ticker, start: `${year}-${start}`, end: `${year}-${end}`, value: index + 1,
    fiscalYear: year, fiscalQuarter: index + 1, sequenceIndex: year * 4 + index }))
}

function formatDate(date) {
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, '0'), String(date.getUTCDate()).padStart(2, '0')].join('-')
}

function fiscalQuartersCovering(year, startMonth, ticker) {
  const targetStart = Date.UTC(year, 0, 1)
  const targetEnd = Date.UTC(year, 11, 31)
  let start = new Date(Date.UTC(year - 1, startMonth - 1, 1))
  while (Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 0) < targetStart) {
    start = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 1))
  }
  const records = []
  let sequence = 0
  while (start.getTime() <= targetEnd) {
    const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 1))
    const end = new Date(next.getTime() - 86_400_000)
    records.push(observation({ ticker, start: formatDate(start), end: formatDate(end),
      value: inclusiveDays(formatDate(start), formatDate(end)), sequenceIndex: sequence++ }))
    start = next
  }
  return records
}

test('Dec 31 annual uses the directly reported calendar-year path', () => {
  const annual = observation({ type: PERIOD_TYPE.CALENDAR_YEAR, start: '2024-01-01', end: '2024-12-31', value: 100 })
  const result = buildCalendarYear([annual], 2024)
  assert.equal(result.value, 100)
  assert.equal(result.classification, CY_CLASSIFICATION.REPORTED_CALENDAR_YEAR)
  assert.equal(result.status, HISTORICAL_RESULT_STATUS.VERIFIED_REPORTED)
})

test('direct reported CY takes priority when exact quarters are also available', () => {
  const annual = observation({ type: PERIOD_TYPE.CALENDAR_YEAR, start: '2024-01-01', end: '2024-12-31', value: 100 })
  const result = buildCalendarYear([...calendarQuarters(2024), annual], 2024)
  assert.equal(result.value, 100)
  assert.equal(result.classification, CY_CLASSIFICATION.REPORTED_CALENDAR_YEAR)
  assert.equal(result.components.length, 1)
})

test('a derived annual cannot be classified as reported CY', () => {
  const annual = observation({
    type: PERIOD_TYPE.CALENDAR_YEAR, start: '2024-01-01', end: '2024-12-31', value: 100,
    reportedVsDerived: OBSERVATION_BASIS.DERIVED,
  })
  const result = buildCalendarYear([annual], 2024)
  assert.equal(result.value, null)
  assert.equal(result.status, HISTORICAL_RESULT_STATUS.INSUFFICIENT_PERIOD_COVERAGE)
})

test('four exact calendar quarters cover every day exactly once', () => {
  const result = buildCalendarYear(calendarQuarters(2024), 2024)
  assert.equal(result.value, 10)
  assert.equal(result.classification, CY_CLASSIFICATION.EXACT_FROM_CALENDAR_QUARTERS)
  assert.equal(result.coverage.complete, true)
  assert.equal(result.coverage.coveredDays, 366)
  assert.deepEqual(result.coverage.gaps, [])
  assert.deepEqual(result.coverage.overlaps, [])
})

test('June FYE labels do not prevent exact CY when economic quarter boundaries align', () => {
  const quarters = calendarQuarters(2024, 'JUNECO').map((item, index) => observation({
    ticker: 'JUNECO', start: item.periodIdentity.periodStart, end: item.periodIdentity.periodEnd,
    value: item.normalizedValue, fiscalYear: index < 2 ? 2024 : 2025, fiscalQuarter: index < 2 ? index + 3 : index - 1,
  }))
  assert.equal(buildCalendarYear(quarters, 2024).classification, CY_CLASSIFICATION.EXACT_FROM_CALENDAR_QUARTERS)
})

for (const [label, startMonth] of [['January FYE', 2], ['August FYE', 9], ['October FYE', 11]]) {
  test(`${label} is overlap-weighted and explicitly classified as an estimate`, () => {
    const result = buildCalendarYear(fiscalQuartersCovering(2024, startMonth, label.replace(/\W/g, '').toUpperCase()), 2024)
    assert.equal(Math.round(result.value), 366)
    assert.equal(result.classification, CY_CLASSIFICATION.CALENDARIZED_ESTIMATE)
    assert.equal(result.coverage.complete, true)
  })
}

test('quarters crossing Dec 31 and Jan 1 preserve complete allocation lineage', () => {
  const result = buildCalendarYear(fiscalQuartersCovering(2024, 11, 'CROSS'), 2024)
  const crossing = result.components.filter((item) => item.sourceStart < '2024-01-01' || item.sourceEnd > '2024-12-31')
  assert.equal(crossing.length, 2)
  for (const component of crossing) {
    for (const field of ['sourceValue', 'sourceStart', 'sourceEnd', 'overlapStart', 'overlapEnd',
      'overlapDays', 'totalDays', 'allocationPercentage', 'contribution']) assert.notEqual(component[field], null, field)
  }
})

for (const [label, start, end, value] of [
  ['52-week', '2023-12-31', '2024-12-28', 364],
  ['53-week', '2023-12-31', '2025-01-04', 371],
]) {
  test(`${label} calendar issuer retains its reported annual observation`, () => {
    const annual = observation({ ticker: label, type: PERIOD_TYPE.FISCAL_YEAR, start, end, value })
    assert.equal(buildCalendarYear([annual], 2024).classification, CY_CLASSIFICATION.REPORTED_CALENDAR_YEAR)
  })
}

test('missing middle quarter and incomplete IPO history fail closed for uncovered days', () => {
  const quarters = calendarQuarters(2024)
  for (const records of [[quarters[0], quarters[1], quarters[3]], quarters.slice(2)]) {
    const result = buildCalendarYear(records, 2024)
    assert.equal(result.value, null)
    assert.equal(result.status, HISTORICAL_RESULT_STATUS.INSUFFICIENT_PERIOD_COVERAGE)
    assert.ok(result.coverage.gaps.length > 0)
  }
})

test('overlapping periods are rejected and no calendar day can contribute twice', () => {
  const records = calendarQuarters(2024)
  records[2] = observation({ start: '2024-06-30', end: '2024-09-30', value: 3 })
  const result = buildCalendarYear(records, 2024)
  assert.equal(result.value, null)
  assert.equal(result.reason, 'OVERLAPPING_PERIOD_COVERAGE')
  assert.ok(result.coverage.overlaps.length > 0)
})

test('duplicate WiseSheets and SEC periods contribute only once', () => {
  const quarters = calendarQuarters(2024)
  const duplicate = observation({ start: '2024-04-01', end: '2024-06-30', value: 2.001, fiscalYear: 2024, fiscalQuarter: 2, provider: 'SEC' })
  const result = buildCalendarYear([...quarters, duplicate], 2024)
  assert.equal(result.value, 10)
  assert.equal(result.components.length, 4)
  assert.equal(new Set(result.components.map((item) => item.economicPeriodKey)).size, 4)
})

test('a contributing cross-provider value conflict fails CY closed for review', () => {
  const quarters = calendarQuarters(2024)
  const conflicting = observation({ start: '2024-04-01', end: '2024-06-30', value: 200,
    fiscalYear: 2024, fiscalQuarter: 2, provider: 'SEC' })
  const result = buildCalendarYear([...quarters, conflicting], 2024)
  assert.equal(result.value, null)
  assert.equal(result.status, HISTORICAL_RESULT_STATUS.REQUIRES_REVIEW)
  assert.equal(result.reason, 'VALUE_CONFLICT')
})

test('definition compatibility is limited to periods contributing to requested CY', () => {
  const old = observation({ type: PERIOD_TYPE.CALENDAR_YEAR, start: '2022-01-01', end: '2022-12-31', value: 80,
    definitionFingerprint: 'OLD' })
  const current = calendarQuarters(2024).map((item) => observation({
    start: item.periodIdentity.periodStart, end: item.periodIdentity.periodEnd, value: item.normalizedValue,
    definitionFingerprint: 'CURRENT',
  }))
  assert.equal(buildCalendarYear([old, ...current], 2024).value, 10)
  const incompatible = current.map((item, index) => index === 2 ? observation({
    start: item.periodIdentity.periodStart, end: item.periodIdentity.periodEnd, value: item.normalizedValue,
    definitionFingerprint: 'CHANGED',
  }) : item)
  assert.equal(buildCalendarYear(incompatible, 2024).status, HISTORICAL_RESULT_STATUS.DEFINITION_INCOMPATIBLE)
})

test('segment-only CY and LTM series fail closed', () => {
  const segment = calendarQuarters(2024).map((item) => observation({
    start: item.periodIdentity.periodStart, end: item.periodIdentity.periodEnd,
    value: item.normalizedValue, scope: 'SEGMENT',
  }))
  const cy = buildCalendarYear(segment, 2024)
  const ltm = buildLtm(segment, { asOfDate: '2025-01-01' })
  assert.equal(cy.value, null)
  assert.equal(cy.reason, 'NON_CONSOLIDATED_SCOPE')
  assert.equal(ltm.value, null)
  assert.equal(ltm.reason, 'NON_CONSOLIDATED_SCOPE')
})

test('loose inferred dates cannot qualify for exact CY construction', () => {
  const inferred = calendarQuarters(2024).map((item) => observation({
    start: item.periodIdentity.periodStart, end: item.periodIdentity.periodEnd, value: item.normalizedValue,
    dateAuthority: DATE_AUTHORITY.INFERRED,
  }))
  const result = buildCalendarYear(inferred, 2024)
  assert.equal(result.value, null)
  assert.equal(result.status, HISTORICAL_RESULT_STATUS.INSUFFICIENT_PERIOD_COVERAGE)
})

test('LTM uses the latest four unique consecutive quarters and rejects a gap', () => {
  const five = [...calendarQuarters(2024), observation({ start: '2025-01-01', end: '2025-03-31', value: 5 })]
  assert.equal(buildLtm(five, { asOfDate: '2025-04-01' }).value, 14)
  const gap = [five[0], five[1], five[3], five[4]]
  assert.equal(buildLtm(gap, { asOfDate: '2025-04-01' }).reason, 'LTM_PERIOD_GAP')
})

for (const kind of ['3M', '6M', '9M']) {
  test(`LTM falls back to an exact FY plus current ${kind} minus prior comparable ${kind} bridge`, () => {
    const result = buildLtm(ltmBridgeFacts(kind), { asOfDate: '2026-01-01' })
    assert.equal(result.value, 110)
    assert.equal(result.status, HISTORICAL_RESULT_STATUS.VERIFIED_DERIVED)
    assert.equal(result.derivation, 'FY_PLUS_CURRENT_YTD_MINUS_PRIOR_YTD')
    assert.deepEqual(result.components.map((item) => item.role), [
      'LATEST_VERIFIED_FULL_YEAR', 'CURRENT_YTD', 'PRIOR_YEAR_COMPARABLE_YTD',
    ])
    assert.deepEqual(result.components.map((item) => item.sign), [1, 1, -1])
  })
}

test('LTM bridge fails closed when prior comparable YTD is missing', () => {
  const [fullYear, , current] = ltmBridgeFacts('6M')
  const result = buildLtm([fullYear, current], { asOfDate: '2026-01-01' })
  assert.equal(result.value, null)
  assert.equal(result.status, HISTORICAL_RESULT_STATUS.INSUFFICIENT_PERIOD_COVERAGE)
})

test('LTM bridge rejects incompatible definitions, operation scopes, and currencies', () => {
  const definitions = ltmBridgeFacts('6M')
  definitions[2] = observation({ ticker: 'BRIDGE', metric: 'ebit', type: PERIOD_TYPE.YTD_6M,
    start: '2025-01-01', end: '2025-06-30', value: 30, fiscalYear: 2025, fiscalQuarter: 2,
    definitionFingerprint: 'CHANGED' })
  assert.equal(buildLtm(definitions, { asOfDate: '2026-01-01' }).status,
    HISTORICAL_RESULT_STATUS.DEFINITION_INCOMPATIBLE)

  const operationScope = ltmBridgeFacts('6M')
  operationScope[2] = observation({ ticker: 'BRIDGE', metric: 'ebit', type: PERIOD_TYPE.YTD_6M,
    start: '2025-01-01', end: '2025-06-30', value: 30, fiscalYear: 2025, fiscalQuarter: 2,
    definitionFingerprint: 'GAAP_EBIT', operationScope: 'CONTINUING_OPERATIONS' })
  assert.equal(buildLtm(operationScope, { asOfDate: '2026-01-01' }).status,
    HISTORICAL_RESULT_STATUS.OPERATION_SCOPE_INCOMPATIBLE)

  const currency = ltmBridgeFacts('6M')
  currency[2] = observation({ ticker: 'BRIDGE', metric: 'ebit', type: PERIOD_TYPE.YTD_6M,
    start: '2025-01-01', end: '2025-06-30', value: 30, fiscalYear: 2025, fiscalQuarter: 2,
    definitionFingerprint: 'GAAP_EBIT', currency: 'EUR', units: 'EUR' })
  const currencyResult = buildLtm(currency, { asOfDate: '2026-01-01' })
  assert.equal(currencyResult.value, null)
  assert.equal(currencyResult.reason, 'INCOMPATIBLE_SERIES')
})

test('stale bridge YTD fails closed against the latest reported period', () => {
  const latestReportedPeriod = createLatestReportedPeriod({
    periodEnd: '2025-09-30', form: '10-Q', evidenceType: 'FORM_REPORT_PERIOD',
  })
  const result = buildLtm(ltmBridgeFacts('6M'), { asOfDate: '2026-01-01', latestReportedPeriod })
  assert.equal(result.value, null)
  assert.equal(result.status, HISTORICAL_RESULT_STATUS.STALE_SOURCE_COVERAGE)
})

test('four consecutive standalone quarters remain preferred over an available FY/YTD bridge', () => {
  const bridge = ltmBridgeFacts('3M')
  const quarters = [
    observation({ ticker: 'BRIDGE', metric: 'ebit', start: '2024-04-01', end: '2024-06-30', value: 40,
      fiscalYear: 2024, fiscalQuarter: 2, definitionFingerprint: 'GAAP_EBIT' }),
    observation({ ticker: 'BRIDGE', metric: 'ebit', start: '2024-07-01', end: '2024-09-30', value: 50,
      fiscalYear: 2024, fiscalQuarter: 3, definitionFingerprint: 'GAAP_EBIT' }),
    observation({ ticker: 'BRIDGE', metric: 'ebit', start: '2024-10-01', end: '2024-12-31', value: 60,
      fiscalYear: 2024, fiscalQuarter: 4, definitionFingerprint: 'GAAP_EBIT' }),
  ]
  const result = buildLtm([...bridge, ...quarters], { asOfDate: '2026-01-01' })
  assert.equal(result.value, 180)
  assert.equal(result.derivation, undefined)
  assert.equal(result.components.length, 4)
})

test('definition compatibility is limited to the latest four LTM contributors', () => {
  const old = observation({ start: '2023-10-01', end: '2023-12-31', value: 1, definitionFingerprint: 'OLD' })
  const current = calendarQuarters(2024).map((item) => observation({
    start: item.periodIdentity.periodStart, end: item.periodIdentity.periodEnd,
    value: item.normalizedValue, definitionFingerprint: 'CURRENT',
  }))
  assert.equal(buildLtm([old, ...current], { asOfDate: '2025-01-01' }).value, 10)
  const incompatible = current.map((item, index) => index === 3 ? observation({
    start: item.periodIdentity.periodStart, end: item.periodIdentity.periodEnd,
    value: item.normalizedValue, definitionFingerprint: 'CHANGED',
  }) : item)
  assert.equal(buildLtm(incompatible, { asOfDate: '2025-01-01' }).status, HISTORICAL_RESULT_STATUS.DEFINITION_INCOMPATIBLE)
})

test('provider-specific source definitions do not create a semantic definition mismatch', () => {
  const quarters = calendarQuarters(2024).map((item, index) => observation({
    start: item.periodIdentity.periodStart, end: item.periodIdentity.periodEnd, value: item.normalizedValue,
    provider: index % 2 ? 'SEC' : 'WiseSheets',
    semanticDefinitionFingerprint: 'CANONICAL_CONSOLIDATED_GAAP_REVENUE',
    sourceDefinitionFingerprint: index % 2 ? 'us-gaap:Revenue' : 'wisesheets:revenue',
  }))
  assert.equal(buildLtm(quarters, { asOfDate: '2025-01-01' }).value, 10)
})

test('estimated arithmetic cannot qualify as an exact-derived calendar year', () => {
  const inputs = [1, 2].map((value) => ({
    issuerId: 'NEWCO-ISSUER', scope: 'CONSOLIDATED', operationScope: 'UNSPECIFIED', currency: 'USD',
    normalizedUnits: 'USD', reportedVsDerived: 'REPORTED', deduplicationStatus: null,
    periodIdentity: { periodStart: '2024-01-01', periodEnd: '2024-12-31', dateAuthority: DATE_AUTHORITY.REPORTED },
    normalizedValue: value,
  }))
  const annual = observation({
    type: PERIOD_TYPE.CALENDAR_YEAR, start: '2024-01-01', end: '2024-12-31', value: 3,
    reportedVsDerived: OBSERVATION_BASIS.DERIVED,
    derivation: { method: 'REVENUE_MINUS_COST_OF_REVENUE', exactness: 'ESTIMATED', inputs },
  })
  assert.notEqual(buildCalendarYear([annual], 2024).classification, CY_CLASSIFICATION.EXACT_DERIVED_CALENDAR_YEAR)
  const exactWithEstimatedInput = observation({
    type: PERIOD_TYPE.CALENDAR_YEAR, start: '2024-01-01', end: '2024-12-31', value: 3,
    reportedVsDerived: OBSERVATION_BASIS.DERIVED,
    derivation: { method: 'REVENUE_MINUS_COST_OF_REVENUE', exactness: 'EXACT_ARITHMETIC',
      inputs: [{ ...inputs[0], derivation: { exactness: 'ESTIMATED' } }, inputs[1]] },
  })
  assert.notEqual(buildCalendarYear([exactWithEstimatedInput], 2024).classification,
    CY_CLASSIFICATION.EXACT_DERIVED_CALENDAR_YEAR)
})

test('latest reported period requires report-period evidence, never an 8-K filing date', () => {
  const invalid = createLatestReportedPeriod({ periodEnd: '2025-06-30', form: '8-K', evidenceType: 'FORM_REPORT_PERIOD' })
  const validForm = createLatestReportedPeriod({ periodEnd: '2025-06-30', form: '10-Q', evidenceType: 'FORM_REPORT_PERIOD' })
  const validExhibit = createLatestReportedPeriod({ periodEnd: '2025-06-30', form: '8-K', evidenceType: 'EARNINGS_EXHIBIT_PERIOD', explicitPeriodMapping: true })
  assert.equal(invalid.valid, false)
  assert.equal(validForm.valid, true)
  assert.equal(validExhibit.valid, true)
  const stale = buildLtm(calendarQuarters(2024), { asOfDate: '2025-07-01', latestReportedPeriod: validForm })
  assert.equal(stale.status, HISTORICAL_RESULT_STATUS.STALE_SOURCE_COVERAGE)
  assert.equal(stale.latestReportedPeriod.periodEnd, '2025-06-30')
})

test('latest reported period supports foreign forms only with explicit period evidence', () => {
  for (const form of ['20-F', '40-F']) {
    assert.equal(createLatestReportedPeriod({ periodEnd: '2025-12-31', form, evidenceType: 'FORM_REPORT_PERIOD' }).valid, true)
  }
  assert.equal(createLatestReportedPeriod({ periodEnd: '2025-06-30', form: '6-K', evidenceType: 'FORM_REPORT_PERIOD' }).valid, false)
  assert.equal(createLatestReportedPeriod({
    periodEnd: '2025-06-30', form: '6-K', evidenceType: 'EARNINGS_EXHIBIT_PERIOD', explicitPeriodMapping: true,
  }).valid, true)
  assert.equal(createLatestReportedPeriod({
    periodEnd: '2025-06-30', form: '6-K', evidenceType: 'EARNINGS_EXHIBIT_PERIOD', explicitPeriodMapping: false,
  }).valid, false)
})

test('CY and LTM components retain full canonical provenance', () => {
  const quarters = calendarQuarters(2024)
  for (const result of [buildCalendarYear(quarters, 2024), buildLtm(quarters, { asOfDate: '2025-01-01' })]) {
    for (const component of result.components) {
      for (const field of ['sourceProvider', 'sourceId', 'sourceUrl', 'accession', 'filingDate', 'rawValue',
        'rawUnits', 'normalizedValue', 'currency', 'scope', 'sourceStart', 'sourceEnd', 'periodStart', 'periodEnd', 'dateAuthority',
        'reportedVsDerived', 'contribution']) assert.notEqual(component[field], undefined, field)
    }
  }
})

test('a completely synthetic new ticker works with no ticker-specific period logic', async () => {
  const result = buildCalendarYear(calendarQuarters(2024, 'TOTALLY_NEW_SYMBOL'), 2024)
  assert.equal(result.value, 10)
  const sources = await Promise.all([
    readFile(new URL('../server/valuation/historicalPeriodEngine.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/valuation/periodNormalization.js', import.meta.url), 'utf8'),
  ])
  for (const ticker of ['AMZN', 'BE', 'CRWV', 'FCEL', 'GEV', 'GOOGL', 'INTC', 'IREN', 'META', 'MU', 'MSFT', 'NBIS']) {
    assert.equal(sources.some((source) => new RegExp(`['\"]${ticker}['\"]`).test(source)), false, ticker)
  }
})
