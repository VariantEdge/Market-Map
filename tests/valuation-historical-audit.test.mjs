import test from 'node:test'
import assert from 'node:assert/strict'
import { validateHistoricalAuditRecords } from '../server/valuation/historicalAuditValidation.js'

const tickers = ['AAA']
const metrics = ['revenue', 'grossProfit', 'ebit', 'operatingCashFlow', 'capitalExpenditures', 'freeCashFlow', 'adjustedEbitda']
const periods = ['2023A', '2024A', '2025A', 'LTM']

function record(metric, period, overrides = {}) {
  return {
    ticker: 'AAA', metric, calendarYear: period, displayedValue: 10,
    validationStatus: 'VERIFIED_DERIVED', failureReason: null, warning: '',
    quarterlyComponents: [{ sourceProvider: 'SEC', sourceId: `${metric}:${period}`,
      sourceStart: '2025-01-01', sourceEnd: '2025-12-31' }],
    ...overrides,
  }
}

test('historical audit requires exactly seven metrics across all requested actual and LTM periods', () => {
  const records = metrics.flatMap((metric) => periods.map((period) => record(metric, period)))
  assert.deepEqual(validateHistoricalAuditRecords(records, { tickers, metrics, periods }), [])
  const missing = records.filter((item) => !(item.metric === 'ebit' && item.calendarYear === 'LTM'))
  assert.ok(validateHistoricalAuditRecords(missing, { tickers, metrics, periods })
    .some((issue) => issue.metric === 'ebit' && issue.period === 'LTM' && issue.reason === 'MISSING_AUDIT_CELL'))
})

test('historical audit accepts explicit fail-closed N/A and rejects stale generic nulls', () => {
  const base = metrics.flatMap((metric) => periods.map((period) => record(metric, period)))
  const explicit = base.map((item) => item.metric === 'adjustedEbitda' && item.calendarYear === 'LTM'
    ? record(item.metric, item.calendarYear, { displayedValue: null, validationStatus: 'LEGITIMATE_NA',
      quarterlyComponents: [], failureReason: 'LEGITIMATE_NA' }) : item)
  assert.deepEqual(validateHistoricalAuditRecords(explicit, { tickers, metrics, periods }), [])
  const unjustified = explicit.map((item) => item.metric === 'revenue' && item.calendarYear === '2025A'
    ? record(item.metric, item.calendarYear, { displayedValue: null, validationStatus: 'UNVERIFIED', quarterlyComponents: [] }) : item)
  assert.ok(validateHistoricalAuditRecords(unjustified, { tickers, metrics, periods })
    .some((issue) => issue.metric === 'revenue' && issue.reason === 'UNJUSTIFIED_NULL'))
})

function evidenceComponent(sourceId, overrides = {}) {
  return {
    sourceProvider: 'SEC', sourceId,
    sourceStart: '2025-01-01', sourceEnd: '2025-06-30',
    ...overrides,
  }
}

test('historical audit rejects DEFINITION_INCOMPATIBLE without source evidence', () => {
  const records = metrics.flatMap((metric) => periods.map((period) => record(metric, period)))
  Object.assign(records[0], {
    displayedValue: null,
    validationStatus: 'DEFINITION_INCOMPATIBLE',
    quarterlyComponents: [],
    failureReason: 'DEFINITION_INCOMPATIBLE',
  })
  assert.ok(validateHistoricalAuditRecords(records, { tickers, metrics, periods }).some((issue) =>
    issue.reason === 'NULL_WITHOUT_POSITIVE_EVIDENCE' && issue.status === 'DEFINITION_INCOMPATIBLE'))
})

test('historical audit accepts incompatible definition evidence with distinct source fingerprints', () => {
  const records = metrics.flatMap((metric) => periods.map((period) => record(metric, period)))
  Object.assign(records[0], {
    displayedValue: null,
    validationStatus: 'DEFINITION_INCOMPATIBLE',
    quarterlyComponents: [
      evidenceComponent('definition-a', { definitionFingerprint: 'definition-a' }),
      evidenceComponent('definition-b', { definitionFingerprint: 'definition-b' }),
    ],
    failureReason: 'DEFINITION_INCOMPATIBLE',
  })
  assert.deepEqual(validateHistoricalAuditRecords(records, { tickers, metrics, periods }), [])
})

test('historical audit rejects OPERATION_SCOPE_INCOMPATIBLE without source evidence', () => {
  const records = metrics.flatMap((metric) => periods.map((period) => record(metric, period)))
  Object.assign(records[0], {
    displayedValue: null,
    validationStatus: 'OPERATION_SCOPE_INCOMPATIBLE',
    quarterlyComponents: [],
    failureReason: 'OPERATION_SCOPE_INCOMPATIBLE',
  })
  assert.ok(validateHistoricalAuditRecords(records, { tickers, metrics, periods }).some((issue) =>
    issue.reason === 'NULL_WITHOUT_POSITIVE_EVIDENCE' && issue.status === 'OPERATION_SCOPE_INCOMPATIBLE'))
})

test('historical audit accepts incompatible operation-scope evidence from conflicting sources', () => {
  const records = metrics.flatMap((metric) => periods.map((period) => record(metric, period)))
  Object.assign(records[0], {
    displayedValue: null,
    validationStatus: 'OPERATION_SCOPE_INCOMPATIBLE',
    quarterlyComponents: [
      evidenceComponent('scope-a', { operationScope: 'CONTINUING_OPERATIONS' }),
      evidenceComponent('scope-b', { operationScope: 'TOTAL_INCLUDING_DISCONTINUED' }),
    ],
    failureReason: 'OPERATION_SCOPE_INCOMPATIBLE',
  })
  assert.deepEqual(validateHistoricalAuditRecords(records, { tickers, metrics, periods }), [])
})

for (const validationStatus of [
  'MISSING_SOURCE_DATA',
  'INSUFFICIENT_PERIOD_COVERAGE',
  'STALE_SOURCE_COVERAGE',
  'REQUIRES_REVIEW',
]) {
  test(`historical audit fails a mandatory null with ${validationStatus}`, () => {
    const records = metrics.flatMap((metric) => periods.map((period) => record(metric, period)))
    const target = records.find((item) => item.metric === 'adjustedEbitda' && item.calendarYear === 'LTM')
    Object.assign(target, { displayedValue: null, validationStatus, quarterlyComponents: [], failureReason: validationStatus })
    assert.ok(validateHistoricalAuditRecords(records, { tickers, metrics, periods }).some((issue) =>
      issue.metric === 'adjustedEbitda' && issue.period === 'LTM' &&
      issue.reason === 'MANDATORY_CELL_UNRESOLVED' && issue.status === validationStatus))
  })
}

test('historical audit rejects values without period identity and source provenance', () => {
  const records = metrics.flatMap((metric) => periods.map((period) => record(metric, period)))
  records[0].quarterlyComponents = [{ sourceProvider: 'SEC', sourceId: 'missing-dates' }]
  assert.ok(validateHistoricalAuditRecords(records, { tickers, metrics, periods })
    .some((issue) => issue.reason === 'INCOMPLETE_COMPONENT_PROVENANCE'))
})

test('historical audit accepts explicit fiscal-quarter identity when provider omits period start', () => {
  const records = metrics.flatMap((metric) => periods.map((period) => record(metric, period, {
    quarterlyComponents: [{
      sourceProvider: 'WiseSheets',
      sourceId: `${metric}:${period}`,
      sourceStart: null,
      sourceEnd: '2025-12-31',
      fiscalYear: 2025,
      fiscalQuarter: 4,
    }],
  })))
  assert.deepEqual(validateHistoricalAuditRecords(records, { tickers, metrics, periods }), [])
})
