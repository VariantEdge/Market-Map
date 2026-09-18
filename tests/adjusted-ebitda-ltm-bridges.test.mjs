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

test('CRWV directly reported 2023 calendar-year Adjusted EBITDA remains available', () => {
  const result = buildCanonicalAdjustedEbitda({
    company: { ...company, ticker: 'CRWV' },
    rawLedger: [fact({ type: 'CALENDAR_YEAR', start: '2023-01-01', end: '2023-12-31',
      value: 103_913_000, fiscalYear: 2023 })],
    years: [2023],
  }).calendarActuals[2023]
  assert.equal(result.value, 103_913_000)
  assert.equal(result.validationStatus, 'VERIFIED_REPORTED')
  assertCanonicalAdjustedEbitdaEntry(result, ADJUSTED_EBITDA_PERIOD.CALENDAR_YEAR)
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
  const three = type === 'QUARTER'
  return [
    fact({ type: 'CALENDAR_YEAR', start: '2024-01-01', end: '2024-12-31', value: 100_000_000, fiscalYear: 2024 }),
    fact({ type, start: '2025-01-01', end: three ? '2025-03-31' : nine ? '2025-09-30' : '2025-06-30',
      value: three ? 30_000_000 : nine ? 90_000_000 : 60_000_000, fiscalYear: 2025 }),
    fact({ type, start: '2024-01-01', end: three ? '2024-03-31' : nine ? '2024-09-30' : '2024-06-30',
      value: three ? 10_000_000 : nine ? 70_000_000 : 40_000_000, fiscalYear: 2024 }),
  ]
}

function directLtm(start, end, value = 500_000_000, overrides = {}) {
  return fact({ type: 'LTM', start, end, value, fiscalYear: Number(end.slice(0, 4)), ...overrides })
}

function fourQuarters(startYear = 2024, startMonth = 1, values = [10, 20, 30, 40]) {
  const ranges = startMonth === 1
    ? [[`${startYear}-01-01`, `${startYear}-03-31`], [`${startYear}-04-01`, `${startYear}-06-30`],
        [`${startYear}-07-01`, `${startYear}-09-30`], [`${startYear}-10-01`, `${startYear}-12-31`]]
    : [[`${startYear}-07-01`, `${startYear}-09-30`], [`${startYear}-10-01`, `${startYear}-12-31`],
        [`${startYear + 1}-01-01`, `${startYear + 1}-03-31`], [`${startYear + 1}-04-01`, `${startYear + 1}-06-30`]]
  return ranges.map(([start, end], index) => fact({
    type: 'QUARTER', start, end, value: values[index] * 1_000_000, fiscalYear: Number(end.slice(0, 4)),
  }))
}

for (const [type, expected] of [['QUARTER', 120_000_000], ['YTD_6M', 120_000_000], ['YTD_9M', 120_000_000]]) {
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

for (const regression of [
  { ticker: 'GEV', fullYear: 3_700_000_000, currentYtd: 2_300_000_000, priorYtd: 1_885_000_000, expected: 4_115_000_000 },
  { ticker: 'FCEL', fullYear: -74_000_000, currentYtd: -51_000_000, priorYtd: -36_499_000, expected: -88_501_000 },
]) {
  test(`${regression.ticker} Adjusted EBITDA LTM regression uses compatible company-defined periods`, () => {
    const records = [
      fact({ type: 'CALENDAR_YEAR', start: '2025-01-01', end: '2025-12-31', value: regression.fullYear, fiscalYear: 2025 }),
      fact({ type: 'YTD_6M', start: '2026-01-01', end: '2026-06-30', value: regression.currentYtd, fiscalYear: 2026 }),
      fact({ type: 'YTD_6M', start: '2025-01-01', end: '2025-06-30', value: regression.priorYtd, fiscalYear: 2025 }),
    ]
    const result = buildCanonicalAdjustedEbitda({ company: { ...company, ticker: regression.ticker }, rawLedger: records, years: [2025] }).ltm
    assert.equal(result.value, regression.expected)
    assert.equal(result.derivation, 'FY_PLUS_CURRENT_YTD_MINUS_PRIOR_YTD')
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

test('bridge accepts a stable reconciliation taxonomy when period-specific adjustment rows evolve', () => {
  const records = calendarBridge().map((item, index) => ({
    ...item,
    definitionFingerprint: `period-specific-${index}`,
    tableContext: {
      ...item.tableContext,
      rowLabels: [
        'Adjusted EBITDA',
        'Restructuring and other charges',
        'Purchases and sales of business interests',
        'Separation costs',
        'Non-operating benefit income',
        'Depreciation and amortization',
        'Interest and other financial charges',
        'Provision for income taxes',
        ...(index === 1 ? ['Arbitration refund'] : []),
      ],
    },
  }))
  assert.equal(build(records).value, 120_000_000)
})

test('bridge rejects a materially changed definition despite overlapping generic adjustment terms', () => {
  const commonGenericTerms = [
    'Adjusted EBITDA',
    'Depreciation and amortization',
    'Interest expense',
    'Provision for income taxes',
    'Stock compensation',
  ]
  const records = calendarBridge().map((item, index) => ({
    ...item,
    definitionFingerprint: `materially-changed-${index}`,
    tableContext: {
      ...item.tableContext,
      rowLabels: index === 1
        ? [...commonGenericTerms, 'Cryptocurrency remeasurement', 'Customer contract termination',
          'Founder liquidity program', 'Asset disposal program']
        : [...commonGenericTerms, 'Restructuring charges', 'Acquisition costs', 'Legal settlements', 'Foreign exchange'],
    },
  }))
  const result = build(records)
  assert.equal(result.value, null)
  assert.equal(result.validationStatus, 'DEFINITION_INCOMPATIBLE')
})

test('bridge requires definition compatibility across every input pair', () => {
  const terms = {
    fullYear: ['alpha adjustment', 'beta adjustment', 'gamma adjustment', 'delta adjustment',
      'epsilon adjustment', 'zeta adjustment', 'eta adjustment', 'theta adjustment'],
    currentYtd: ['alpha adjustment', 'beta adjustment', 'gamma adjustment', 'delta adjustment',
      'epsilon adjustment', 'zeta adjustment', 'eta adjustment', 'iota adjustment'],
    priorYtd: ['alpha adjustment', 'beta adjustment', 'gamma adjustment', 'delta adjustment',
      'epsilon adjustment', 'zeta adjustment', 'iota adjustment', 'kappa adjustment'],
  }
  const records = calendarBridge().map((item, index) => ({
    ...item,
    definitionFingerprint: `all-pair-${index}`,
    tableContext: {
      ...item.tableContext,
      rowLabels: index === 0 ? terms.fullYear : index === 1 ? terms.currentYtd : terms.priorYtd,
    },
  }))
  const result = build(records)
  assert.equal(result.value, null)
  assert.equal(result.validationStatus, 'DEFINITION_INCOMPATIBLE')
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

test('newer bridge beats older direct reported LTM', () => {
  const result = build([directLtm('2024-01-01', '2024-12-31'), ...calendarBridge()])
  assert.equal(result.derivation, 'FY_PLUS_CURRENT_YTD_MINUS_PRIOR_YTD')
  assert.equal(result.ltmEnd, '2025-06-30')
})

test('newer four-quarter result beats older direct reported LTM', () => {
  const result = build([directLtm('2024-01-01', '2024-12-31'), ...fourQuarters(2024, 7)])
  assert.equal(result.derivation, 'SUM_OF_LATEST_FOUR_COMPATIBLE_STANDALONE_QUARTERS')
  assert.equal(result.ltmEnd, '2025-06-30')
})

test('newer bridge beats older four-quarter result', () => {
  const result = build([...fourQuarters(2024), ...calendarBridge()])
  assert.equal(result.derivation, 'FY_PLUS_CURRENT_YTD_MINUS_PRIOR_YTD')
  assert.equal(result.ltmEnd, '2025-06-30')
})

test('same-endpoint direct reported LTM beats four-quarter result', () => {
  const result = build([directLtm('2024-07-01', '2025-06-30'), ...fourQuarters(2024, 7)])
  assert.equal(result.derivation, 'DIRECT_REPORTED_LTM')
  assert.equal(result.ltmEnd, '2025-06-30')
})

test('same-endpoint four-quarter result beats FY/YTD bridge', () => {
  const result = build([...fourQuarters(2024, 7), ...calendarBridge()])
  assert.equal(result.derivation, 'SUM_OF_LATEST_FOUR_COMPATIBLE_STANDALONE_QUARTERS')
  assert.equal(result.ltmEnd, '2025-06-30')
})

test('selected result exposes the exact constructed LTM start and end', () => {
  const bridge = build(calendarBridge())
  assert.equal(bridge.ltmStart, '2024-07-01')
  assert.equal(bridge.ltmEnd, '2025-06-30')
  const quarters = build(fourQuarters(2024, 7))
  assert.equal(quarters.ltmStart, '2024-07-01')
  assert.equal(quarters.ltmEnd, '2025-06-30')
})

test('invalid newer candidate does not beat an older valid candidate', () => {
  const invalidBridge = calendarBridge().map((item, index) => ({
    ...item,
    definitionFingerprint: `invalid-newer-${index}`,
    tableContext: { ...item.tableContext, rowLabels: [`unique-${index}`] },
  }))
  const result = build([directLtm('2024-01-01', '2024-12-31'), ...invalidBridge])
  assert.equal(result.derivation, 'DIRECT_REPORTED_LTM')
  assert.equal(result.ltmEnd, '2024-12-31')
})

test('LTM invariant rejects tampered period identity and construction arithmetic', () => {
  const bridge = build(calendarBridge())
  assert.throws(() => assertCanonicalAdjustedEbitdaEntry({ ...bridge, ltmEnd: '2025-07-01' }, ADJUSTED_EBITDA_PERIOD.LTM))
  const quarters = build(fourQuarters(2024, 7))
  assert.throws(() => assertCanonicalAdjustedEbitdaEntry({ ...quarters, value: quarters.value + 1 }, ADJUSTED_EBITDA_PERIOD.LTM))
})
