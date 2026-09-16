import test from 'node:test'
import assert from 'node:assert/strict'
import {
  adaptWiseSheetsObservations,
  buildWiseSheetsCanonicalShadow,
  canonicalEconomicPeriodsCompatible,
  compareWiseSheetsShadow,
  deriveCanonicalFreeCashFlow,
  renderWiseSheetsShadowReport,
  runWiseSheetsCanonicalShadowComparison,
  WISESHEETS_CANONICAL_METRIC_MAP,
} from '../server/valuation/wiseSheetsCanonicalShadow.js'
import {
  CY_CLASSIFICATION,
  createLatestReportedPeriod,
  HISTORICAL_RESULT_STATUS,
} from '../server/valuation/historicalPeriodEngine.js'
import { DATE_AUTHORITY, PERIOD_TYPE } from '../server/valuation/canonicalFinancialObservation.js'

function row(ticker, metric, start, end, value, options = {}) {
  return {
    ticker,
    cik: options.cik ?? `CIK-${ticker}`,
    metric,
    periodStart: start,
    periodEnd: end,
    fiscalYear: options.fiscalYear ?? Number(end.slice(0, 4)),
    fiscalPeriod: options.fiscalPeriod,
    periodType: options.periodType,
    fiscalCalendarId: options.fiscalCalendarId,
    dateAuthority: options.dateAuthority ?? (start ? DATE_AUTHORITY.REPORTED : undefined),
    value,
    unit: options.unit ?? 'USD',
    currency: options.currency,
    scope: options.scope,
    source: options.source ?? {
      kind: options.sourceKind ?? 'reported',
      accession: options.accession,
      filingUrl: options.sourceUrl,
      filingDate: options.filingDate,
    },
  }
}

function exactCalendarRows(ticker, metric = 'revenue', values = [1, 2, 3, 4], year = 2024) {
  const periods = [
    [`${year}-01-01`, `${year}-03-31`],
    [`${year}-04-01`, `${year}-06-30`],
    [`${year}-07-01`, `${year}-09-30`],
    [`${year}-10-01`, `${year}-12-31`],
  ]
  return periods.map(([start, end], index) => row(ticker, metric, start, end, values[index], {
    fiscalYear: year,
    fiscalPeriod: `Q${index + 1}`,
    fiscalCalendarId: `${ticker}-CALENDAR`,
  }))
}

test('maps only the approved WiseSheets standardized metrics', () => {
  assert.deepEqual(WISESHEETS_CANONICAL_METRIC_MAP, {
    revenue: 'revenue',
    gross_profit: 'grossProfit',
    net_cash_from_operating_activities: 'operatingCashFlow',
    total_capex: 'capitalExpenditures',
    free_cash_flow: 'providerFreeCashFlow',
  })
  assert.equal(Object.values(WISESHEETS_CANONICAL_METRIC_MAP).includes('adjustedEbitda'), false)
})

test('complete calendar quarters use the exact common-engine path', () => {
  const result = buildWiseSheetsCanonicalShadow('EXACT', exactCalendarRows('EXACT'), [2024])
  assert.equal(result.calendarActuals.revenue[2024].value, 10)
  assert.equal(result.calendarActuals.revenue[2024].classification, CY_CLASSIFICATION.EXACT_FROM_CALENDAR_QUARTERS)
  assert.equal(result.ltm.revenue.value, 10)
})

test('off-calendar fiscal quarters use overlap allocation instead of end-year summation', () => {
  const periods = [
    ['2023-11-01', '2024-01-31'],
    ['2024-02-01', '2024-04-30'],
    ['2024-05-01', '2024-07-31'],
    ['2024-08-01', '2024-10-31'],
    ['2024-11-01', '2025-01-31'],
  ]
  const rows = periods.map(([start, end], index) => row('OFFCAL', 'revenue', start, end, 90, {
    fiscalYear: index < 4 ? 2024 : 2025,
    fiscalPeriod: `Q${index % 4 + 1}`,
    fiscalCalendarId: 'JANUARY-FYE',
  }))
  const result = buildWiseSheetsCanonicalShadow('OFFCAL', rows, [2024])
  const cy = result.calendarActuals.revenue[2024]
  assert.equal(cy.classification, CY_CLASSIFICATION.CALENDARIZED_ESTIMATE)
  assert.equal(cy.coverage.complete, true)
  assert.equal(cy.components.length, 5)
  assert.ok(cy.components.some((component) => component.allocationPercentage < 1))
})

test('52-week and 53-week period boundaries remain intact', () => {
  for (const [ticker, periods] of [
    ['W52', [['2023-12-31', '2024-03-30'], ['2024-03-31', '2024-06-29'], ['2024-06-30', '2024-09-28'], ['2024-09-29', '2024-12-28']]],
    ['W53', [['2023-12-31', '2024-03-30'], ['2024-03-31', '2024-06-29'], ['2024-06-30', '2024-09-28'], ['2024-09-29', '2025-01-04']]],
  ]) {
    const rows = periods.map(([start, end], index) => row(ticker, 'revenue', start, end, index + 1, {
      fiscalYear: 2024, fiscalPeriod: `Q${index + 1}`, fiscalCalendarId: `${ticker}-CALENDAR`,
    }))
    const result = buildWiseSheetsCanonicalShadow(ticker, rows, [2024])
    assert.equal(result.ltm.revenue.value, 10)
    assert.deepEqual(result.records.revenue.map((item) => item.periodIdentity.periodEnd), periods.map((item) => item[1]))
  }
})

test('period-end-only provider rows retain sequence metadata without manufacturing a start', () => {
  const rows = ['2024-03-31', '2024-06-30', '2024-09-30', '2024-12-31'].map((end, index) =>
    row('ENDONLY', 'revenue', null, end, index + 1, { fiscalYear: 2024, fiscalPeriod: `Q${index + 1}` }))
  const result = buildWiseSheetsCanonicalShadow('ENDONLY', rows, [2024])
  assert.ok(result.records.revenue.every((item) => item.periodIdentity.periodStart === null))
  assert.ok(result.records.revenue.every((item) => item.periodIdentity.dateAuthority === DATE_AUTHORITY.UNKNOWN))
  assert.ok(result.records.revenue.every((item) => item.periodIdentity.periodType === PERIOD_TYPE.STANDALONE_QUARTER))
  assert.equal(result.calendarActuals.revenue[2024].status, HISTORICAL_RESULT_STATUS.INSUFFICIENT_PERIOD_COVERAGE)
  assert.equal(result.ltm.revenue.value, 10)
})

test('adapter rejects a provider quarter label contradicted by authoritative annual boundaries', () => {
  const adapted = adaptWiseSheetsObservations([
    row('BADTYPE', 'revenue', '2024-01-01', '2024-12-31', 100, {
      fiscalYear: 2024, fiscalPeriod: 'Q1', periodType: 'STANDALONE_QUARTER',
    }),
  ])
  assert.equal(adapted.observations[0].periodIdentity.periodType, PERIOD_TYPE.UNKNOWN)
})

test('unqualified provider starts remain inferred rather than reported', () => {
  const providerRow = row('UNQUALIFIED', 'revenue', '2024-01-01', '2024-03-31', 10, {
    fiscalYear: 2024, fiscalPeriod: 'Q1',
  })
  delete providerRow.dateAuthority
  const adapted = adaptWiseSheetsObservations([providerRow])
  assert.equal(adapted.observations[0].periodIdentity.dateAuthority, DATE_AUTHORITY.INFERRED)
})

test('authoritative cumulative provider observations use canonical quarter normalization', () => {
  const rows = [
    row('CUM', 'revenue', '2024-01-01', '2024-03-31', 10, { fiscalYear: 2024, fiscalPeriod: 'Q1' }),
    row('CUM', 'revenue', '2024-01-01', '2024-06-30', 30, { fiscalYear: 2024, fiscalPeriod: 'Q2', periodType: 'YTD_6M' }),
    row('CUM', 'revenue', '2024-01-01', '2024-09-30', 60, { fiscalYear: 2024, fiscalPeriod: 'Q3', periodType: 'YTD_9M' }),
    row('CUM', 'revenue', '2024-01-01', '2024-12-31', 100, { fiscalYear: 2024, fiscalPeriod: 'Q4', periodType: 'FISCAL_YEAR' }),
  ]
  const result = buildWiseSheetsCanonicalShadow('CUM', rows, [2024])
  assert.deepEqual(result.records.revenue.map((item) => item.normalizedValue), [10, 20, 30, 40])
  assert.equal(result.calendarActuals.revenue[2024].value, 100)
})

test('provider units normalize before common-engine arithmetic', () => {
  const rows = exactCalendarRows('UNITS').map((item) => ({ ...item, value: 1, unit: 'USD millions' }))
  const result = buildWiseSheetsCanonicalShadow('UNITS', rows, [2024])
  assert.equal(result.calendarActuals.revenue[2024].value, 4_000_000)
})

test('matched CFO and capex periods derive FCF with both-source lineage and reconciliation', () => {
  const rows = [
    row('FCF', 'net_cash_from_operating_activities', '2024-01-01', '2024-03-31', 100, { fiscalYear: 2024, fiscalPeriod: 'Q1', accession: 'cfo-accession' }),
    row('FCF', 'total_capex', '2024-01-01', '2024-03-31', -30, { fiscalYear: 2024, fiscalPeriod: 'Q1', sourceKind: 'calculated' }),
    row('FCF', 'free_cash_flow', '2024-01-01', '2024-03-31', 70, { fiscalYear: 2024, fiscalPeriod: 'Q1', sourceKind: 'calculated' }),
  ]
  const result = buildWiseSheetsCanonicalShadow('FCF', rows, [2024])
  assert.equal(result.records.freeCashFlow[0].normalizedValue, 70)
  assert.equal(result.records.freeCashFlow[0].derivation.inputs.length, 2)
  assert.equal(result.records.freeCashFlow[0].derivation.reconciliation.matches, true)
  assert.equal(result.records.providerFreeCashFlow.length, 1)
})

test('mismatched CFO and capex periods never derive FCF', () => {
  const rows = [
    row('FCF-GAP', 'net_cash_from_operating_activities', '2024-01-01', '2024-03-31', 100, { fiscalYear: 2024, fiscalPeriod: 'Q1' }),
    row('FCF-GAP', 'total_capex', '2024-04-01', '2024-06-30', -30, { fiscalYear: 2024, fiscalPeriod: 'Q2' }),
  ]
  const result = buildWiseSheetsCanonicalShadow('FCF-GAP', rows, [2024])
  assert.equal(result.records.freeCashFlow.length, 0)
  assert.ok(result.failures.some((failure) => failure.reason === 'MISSING_MATCHED_CAPEX_PERIOD'))
})

test('CFO and capex tolerate slight provider boundary differences for the same quarter', () => {
  const adapted = adaptWiseSheetsObservations([
    row('TOLERANCE', 'net_cash_from_operating_activities', '2024-04-01', '2024-06-29', 100, {
      fiscalYear: 2024, fiscalPeriod: 'Q2',
    }),
    row('TOLERANCE', 'total_capex', '2024-04-01', '2024-06-30', -30, {
      fiscalYear: 2024, fiscalPeriod: 'Q2',
    }),
  ])
  const cfo = adapted.observations.find((item) => item.metric === 'operatingCashFlow')
  const capex = adapted.observations.find((item) => item.metric === 'capitalExpenditures')
  assert.equal(canonicalEconomicPeriodsCompatible(cfo, capex), true)
  assert.equal(deriveCanonicalFreeCashFlow([cfo], [capex]).observations[0].normalizedValue, 70)
})

test('CFO Q2 and capex Q3 never match', () => {
  const adapted = adaptWiseSheetsObservations([
    row('SEQUENCE', 'net_cash_from_operating_activities', '2024-04-01', '2024-06-30', 100, {
      fiscalYear: 2024, fiscalPeriod: 'Q2',
    }),
    row('SEQUENCE', 'total_capex', '2024-07-01', '2024-09-30', -30, {
      fiscalYear: 2024, fiscalPeriod: 'Q3',
    }),
  ])
  const cfo = adapted.observations.find((item) => item.metric === 'operatingCashFlow')
  const capex = adapted.observations.find((item) => item.metric === 'capitalExpenditures')
  assert.equal(canonicalEconomicPeriodsCompatible(cfo, capex), false)
  assert.equal(deriveCanonicalFreeCashFlow([cfo], [capex]).observations.length, 0)
})

test('Bloom Energy shadow regression fails stale LTM coverage closed', () => {
  const rows = [
    ...exactCalendarRows('BE', 'revenue', [1, 2, 3, 4], 2025),
    row('BE', 'revenue', '2026-01-01', '2026-03-31', 5, { fiscalYear: 2026, fiscalPeriod: 'Q1', fiscalCalendarId: 'BE-CALENDAR' }),
  ]
  const latestReportedPeriod = createLatestReportedPeriod({
    periodEnd: '2026-06-30', form: '10-Q', evidenceType: 'FORM_REPORT_PERIOD', sourceId: 'latest-10q',
  })
  const result = buildWiseSheetsCanonicalShadow('BE', rows, [2025], {
    asOfDate: '2026-08-01', latestReportedPeriod,
  })
  assert.equal(result.ltm.revenue.status, HISTORICAL_RESULT_STATUS.STALE_SOURCE_COVERAGE)
})

test('FCEL-style fiscal quarters produce a calendarized estimate with allocation lineage', () => {
  const periods = [
    ['2024-11-01', '2025-01-31'],
    ['2025-02-01', '2025-04-30'],
    ['2025-05-01', '2025-07-31'],
    ['2025-08-01', '2025-10-31'],
    ['2025-11-01', '2026-01-31'],
  ]
  const rows = periods.map(([start, end], index) => row('FCEL', 'revenue', start, end, 100, {
    fiscalYear: index < 4 ? 2025 : 2026,
    fiscalPeriod: `Q${index % 4 + 1}`,
    fiscalCalendarId: 'JANUARY-FYE',
  }))
  const result = buildWiseSheetsCanonicalShadow('FCEL', rows, [2025])
  const cy = result.calendarActuals.revenue[2025]
  assert.equal(cy.classification, CY_CLASSIFICATION.CALENDARIZED_ESTIMATE)
  assert.ok(cy.components.every((component) => component.overlapDays && component.totalDays))
})

test('a completely new ticker requires no production rule', () => {
  const result = buildWiseSheetsCanonicalShadow('NEVER_SEEN', exactCalendarRows('NEVER_SEEN'), [2024])
  assert.equal(result.calendarActuals.revenue[2024].value, 10)
})

test('shadow comparison reports values, classifications, differences, evidence, and generic causes', () => {
  const canonical = buildWiseSheetsCanonicalShadow('COMPARE', exactCalendarRows('COMPARE'), [2024])
  const legacy = {
    calendarActuals: { revenue: { 2024: { value: 11 } } },
    ltm: { revenue: { value: 10 } },
  }
  const result = compareWiseSheetsShadow('COMPARE', legacy, canonical, [2024])
  const revenue2024 = result.comparisons.find((item) => item.metric === 'revenue' && item.period === '2024A')
  assert.equal(revenue2024.legacyValue, 11)
  assert.equal(revenue2024.canonicalValue, 10)
  assert.equal(revenue2024.materiallyDifferent, true)
  assert.equal(revenue2024.canonicalClassification, CY_CLASSIFICATION.EXACT_FROM_CALENDAR_QUARTERS)
  assert.ok(revenue2024.canonicalComponents.length > 0)
  assert.equal(result.comparisons.length, 10)
})

test('standalone FCF helper rejects an incompatible source pair', () => {
  const adapted = adaptWiseSheetsObservations([
    row('PAIR', 'net_cash_from_operating_activities', '2024-01-01', '2024-03-31', 100, { fiscalYear: 2024, fiscalPeriod: 'Q1' }),
    row('PAIR', 'total_capex', '2024-01-01', '2024-03-31', -30, { fiscalYear: 2024, fiscalPeriod: 'Q1', scope: 'SEGMENT' }),
  ])
  const cfo = adapted.observations.filter((item) => item.metric === 'operatingCashFlow')
  const capex = adapted.observations.filter((item) => item.metric === 'capitalExpenditures')
  const result = deriveCanonicalFreeCashFlow(cfo, capex)
  assert.equal(result.observations.length, 0)
  assert.equal(result.failures[0].reason, 'INCOMPATIBLE_FCF_SOURCE_SERIES')
})

test('server-only runner computes legacy and canonical shadow outputs from one provider payload', async () => {
  const rows = exactCalendarRows('RUNNER')
  const result = await runWiseSheetsCanonicalShadowComparison(['RUNNER'], [2024], {
    apiKey: 'test-key',
    fetchImpl: async () => ({ ok: true, json: async () => ({ data: rows }) }),
    asOfDate: '2025-01-01',
  })
  assert.equal(result.companies.RUNNER.legacyHistorical.calendarActuals.revenue[2024].value, 10)
  assert.equal(result.companies.RUNNER.canonicalHistorical.calendarActuals.revenue[2024].value, 10)
  assert.equal(result.comparisons.length, 10)
  assert.equal(Object.values(result.summary).reduce((total, count) => total + count, 0), 10)
  assert.equal(result.providerMetadata.withPeriodStart, rows.length)

  const report = renderWiseSheetsShadowReport(result, { generatedAt: '2026-09-05T00:00:00.000Z' })
  assert.match(report, /\| MATCHING \|/)
  assert.match(report, /Period-start authority fields observed:/)
  assert.match(report, /\| RUNNER \| revenue \| 2024A \|/)
})
