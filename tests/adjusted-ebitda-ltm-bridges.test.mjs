import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ADJUSTED_EBITDA_PERIOD,
  assertCanonicalAdjustedEbitdaEntry,
  buildCanonicalAdjustedEbitda,
} from '../server/valuation/adjustedEbitdaEngine.js'

const company = { ticker: 'SYNTH', name: 'Synthetic Corp.', cik: '0000000001' }

function fact({ type, start, end, value, currency = 'USD', fingerprint = 'stable-definition', fiscalYear, weak = false }) {
  const accession = `0000000001-${end.replaceAll('-', '')}`
  return {
    metricCandidates: ['adjustedEbitda'],
    rawSourceType: weak ? 'GENERIC_EBITDA_PROXY' : 'SEC_NON_GAAP_RECONCILIATION_TABLE',
    structuralIntegrity: { valid: true, mapping: 'EXPLICIT_TABLE_GRID' },
    tableContext: {
      tableTitle: 'Adjusted EBITDA reconciliation', rowLabel: 'Adjusted EBITDA',
      columnLabel: `${start} to ${end}`, rawCellValue: String(value),
      tableIndex: 0, rowIndex: 2, columnIndex: 3,
      rowLabels: ['stock compensation', 'depreciation amortization', 'restructuring costs', 'acquisition costs',
        'impairment charges', 'legal settlements', 'foreign exchange', 'mark to market', 'other charges',
        'interest expense', 'tax expense', 'one time costs'],
    },
    provenance: { sourceId: `SEC:${accession}`, sourceHash: `hash-${accession}`, retrievedAt: '2026-09-16T00:00:00.000Z' },
    filingUrl: `https://www.sec.gov/Archives/${accession}.htm`, accessionNumber: accession,
    filingForm: '8-K', filingDate: '2026-09-16', periodType: type, periodBasis: 'FISCAL',
    startDate: start, endDate: end, reportedUnits: `${currency} millions`, reportedScale: 1_000_000,
    rawReportedValue: value / 1_000_000, currency, value, units: currency,
    label: 'Adjusted EBITDA', definitionFingerprint: fingerprint, fiscalYear,
  }
}

function build(rawLedger) {
  return buildCanonicalAdjustedEbitda({ company, rawLedger, years: [2024, 2025] }).ltm
}

test('accepts direct reported LTM with complete company-defined provenance', () => {
  const result = build([fact({ type: 'LTM', start: '2025-04-01', end: '2026-03-31', value: 125_000_000, fiscalYear: 2026 })])
  assert.equal(result.value, 125_000_000)
  assert.equal(result.validationStatus, 'VERIFIED_REPORTED')
  assert.equal(result.derivation, 'DIRECT_REPORTED_LTM')
  assertCanonicalAdjustedEbitdaEntry(result, ADJUSTED_EBITDA_PERIOD.LTM)
})

test('four-quarter LTM remains the preferred derived method', () => {
  const result = build([
    fact({ type: 'QUARTER', start: '2025-01-01', end: '2025-03-31', value: 10_000_000, fiscalYear: 2025 }),
    fact({ type: 'QUARTER', start: '2025-04-01', end: '2025-06-30', value: 20_000_000, fiscalYear: 2025 }),
    fact({ type: 'QUARTER', start: '2025-07-01', end: '2025-09-30', value: 30_000_000, fiscalYear: 2025 }),
    fact({ type: 'QUARTER', start: '2025-10-01', end: '2025-12-31', value: 40_000_000, fiscalYear: 2025 }),
  ])
  assert.equal(result.value, 100_000_000)
  assert.equal(result.derivation, 'SUM_OF_LATEST_FOUR_COMPATIBLE_STANDALONE_QUARTERS')
  assertCanonicalAdjustedEbitdaEntry(result, ADJUSTED_EBITDA_PERIOD.LTM)
})

function calendarBridge(type = 'YTD_6M') {
  const nine = type === 'YTD_9M'
  return [
    fact({ type: 'CALENDAR_YEAR', start: '2024-01-01', end: '2024-12-31', value: 100_000_000, fiscalYear: 2024 }),
    fact({ type, start: '2025-01-01', end: nine ? '2025-09-30' : '2025-06-30', value: nine ? 90_000_000 : 60_000_000, fiscalYear: 2025 }),
    fact({ type, start: '2024-01-01', end: nine ? '2024-09-30' : '2024-06-30', value: nine ? 70_000_000 : 40_000_000, fiscalYear: 2024 }),
  ]
}

for (const [type, expected] of [['YTD_6M', 120_000_000], ['YTD_9M', 120_000_000]]) {
  test(`constructs LTM from FY plus current ${type} minus comparable prior YTD`, () => {
    const result = build(calendarBridge(type))
    assert.equal(result.value, expected)
    assert.equal(result.validationStatus, 'VERIFIED_DERIVED')
    assert.equal(result.derivation, 'FY_PLUS_CURRENT_YTD_MINUS_PRIOR_YTD')
    assert.deepEqual(result.components.map((item) => item.inputRole),
      ['LATEST_VERIFIED_FULL_YEAR', 'CURRENT_YTD', 'PRIOR_YEAR_COMPARABLE_YTD'])
    assertCanonicalAdjustedEbitdaEntry(result, ADJUSTED_EBITDA_PERIOD.LTM)
  })
}

test('constructs a non-calendar fiscal-year LTM bridge from exact boundaries', () => {
  const result = build([
    fact({ type: 'FISCAL_YEAR', start: '2024-07-01', end: '2025-06-30', value: 200_000_000, fiscalYear: 2025 }),
    fact({ type: 'YTD_6M', start: '2025-07-01', end: '2025-12-31', value: 130_000_000, fiscalYear: 2026 }),
    fact({ type: 'YTD_6M', start: '2024-07-01', end: '2024-12-31', value: 80_000_000, fiscalYear: 2025 }),
  ])
  assert.equal(result.value, 250_000_000)
  assert.equal(result.derivation, 'FY_PLUS_CURRENT_YTD_MINUS_PRIOR_YTD')
  assertCanonicalAdjustedEbitdaEntry(result, ADJUSTED_EBITDA_PERIOD.LTM)
})

test('bridge fails closed for mismatched definitions', () => {
  const records = calendarBridge().map((item, index) => ({ ...item, definitionFingerprint: `definition-${index}`,
    tableContext: { ...item.tableContext, rowLabels: [`unique-${index}`] } }))
  assert.equal(build(records).validationStatus, 'DEFINITION_INCOMPATIBLE')
})

test('bridge fails closed for mismatched currencies', () => {
  const records = calendarBridge()
  records[1] = { ...records[1], currency: 'EUR' }
  assert.equal(build(records).validationStatus, 'REQUIRES_REVIEW')
})

test('bridge fails closed for mismatched YTD periods', () => {
  const records = calendarBridge()
  records[2] = { ...records[2], periodType: 'YTD_9M' }
  assert.equal(build(records).value, null)
})

test('bridge fails closed when prior comparable YTD is missing', () => {
  assert.equal(build(calendarBridge().slice(0, 2)).value, null)
})

test('bridge fails closed for non-contiguous fiscal relationships', () => {
  const records = calendarBridge()
  records[0] = { ...records[0], endDate: '2024-12-15' }
  assert.equal(build(records).value, null)
})

test('weak or unverified inputs cannot enter an LTM bridge', () => {
  const records = calendarBridge()
  records[1] = { ...records[1], rawSourceType: 'GENERIC_EBITDA_PROXY' }
  assert.equal(build(records).value, null)
})

test('bridge preserves complete component provenance in the final LTM result', () => {
  const result = build(calendarBridge())
  for (const item of result.components) {
    assert.ok(item.sourceUrl)
    assert.ok(item.accn)
    assert.ok(item.filed)
    assert.ok(item.tableTitle)
    assert.ok(item.rowLabel)
    assert.ok(item.columnLabel)
    assert.ok(item.rawCellValue)
    assert.ok(Number.isFinite(item.rawReportedValue))
    assert.ok(Number.isFinite(item.normalizedValue))
    assert.ok(item.sourceStart && item.sourceEnd && item.sourcePeriodType && item.currency)
  }
})
