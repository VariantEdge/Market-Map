import test from 'node:test'
import assert from 'node:assert/strict'
import { VALIDATION_STATUS, buildRowAudit, createAuditRecord } from '../server/valuation/validation.js'
import { adjustedEbitdaDenominatorIdentity } from '../server/valuation/adjustedEbitdaEngine.js'

test('marks a complete SEC direct value as verified', () => {
  const record = createAuditRecord({
    ticker: 'TEST', metric: 'Revenue', period: '2025A', value: 100,
    source: { sourceType: 'SEC filed actual', tag: 'Revenues', filed: '2026-02-01' },
  })
  assert.equal(record.status, VALIDATION_STATUS.VERIFIED)
  assert.equal(record.displayable, true)
})

test('keeps a single-provider market quote out of the verified display set', () => {
  const record = createAuditRecord({
    ticker: 'TEST', metric: 'Price', value: 10,
    source: { sourceType: 'Yahoo Finance market quote' },
  })
  assert.equal(record.status, VALIDATION_STATUS.WARNING)
  assert.equal(record.displayable, false)
  assert.match(record.warnings[0], /Single market-data provider/)
})

test('keeps Yahoo trailing fundamentals out of verified historical actuals', () => {
  const record = createAuditRecord({
    ticker: 'TEST', metric: 'EBITDA', period: 'LTM', value: 125,
    source: { sourceType: 'Yahoo Finance trailing fundamentals' },
  })
  assert.equal(record.status, VALIDATION_STATUS.WARNING)
  assert.equal(record.displayable, false)
  assert.match(record.warnings[0], /trailing-fundamentals provider/)
})

test('preserves a ledger-provided reconstructed status for historical actuals', () => {
  const record = createAuditRecord({
    ticker: 'TEST', metric: 'Revenue', period: '2025A', value: 100,
    source: { sourceType: 'SEC filed actual', validationStatus: 'VERIFIED_RECONSTRUCTED', exactness: 'RECONSTRUCTED' },
  })
  assert.equal(record.status, VALIDATION_STATUS.RECONSTRUCTED)
  assert.equal(record.displayable, true)
  assert.equal(record.source.exactness, 'RECONSTRUCTED')
})

test('preserves a ledger-provided warning status and fails closed', () => {
  const record = createAuditRecord({
    ticker: 'TEST', metric: 'Revenue', period: '2025A', value: 100,
    source: { sourceType: 'SEC filed actual', validationStatus: 'VERIFIED_WITH_WARNING', exactness: 'RECONSTRUCTED' },
  })
  assert.equal(record.status, VALIDATION_STATUS.WARNING)
  assert.equal(record.displayable, false)
})

test('preserves an unavailable ledger status and fails closed', () => {
  const record = createAuditRecord({
    ticker: 'TEST', metric: 'Revenue', period: '2025A', value: null,
    source: { sourceType: 'Unavailable', validationStatus: 'UNAVAILABLE' },
  })
  assert.equal(record.status, VALIDATION_STATUS.UNAVAILABLE)
  assert.equal(record.displayable, false)
})

test('fails closed when an independent recomputation differs', () => {
  const record = createAuditRecord({
    ticker: 'TEST', metric: 'EV / Revenue', value: 8,
    source: { sourceType: 'Derived Calculation' }, formula: 'enterprise-value / revenue',
    inputs: { enterpriseValue: 900, revenue: 100 }, recomputed: 9,
  })
  assert.equal(record.status, VALIDATION_STATUS.FAILED)
  assert.equal(record.displayable, false)
})

function evRevenueAudit(storedMultiple) {
  return buildRowAudit({
    ticker: 'TEST',
    currency: 'USD',
    capital: { enterpriseValue: 500 },
    metrics: { revenue: { '2025A': 100 } },
    multiples: { evRevenue: { '2025A': storedMultiple } },
    provenance: {
      revenue: {
        '2025A': {
          value: 100,
          status: 'VERIFIED_REPORTED',
          sourceType: 'SEC filed actual',
          components: [{ sourceUrl: 'https://www.sec.gov/example', sourceStart: '2025-01-01', sourceEnd: '2025-12-31' }],
        },
      },
    },
  })
}

test('EV / Revenue fails when recomputation differs despite a verified-reported denominator', () => {
  const audit = evRevenueAudit(7)
  const record = audit.cells['evRevenue:2025A']
  assert.equal(audit.cells['revenue:2025A'].status, VALIDATION_STATUS.VERIFIED_REPORTED)
  assert.equal(record.status, VALIDATION_STATUS.FAILED)
  assert.equal(record.checks.calculation.passed, false)
  assert.equal(record.recomputedValue, 5)
})

test('a correct EV / Revenue calculation is verified as derived, never reported', () => {
  const record = evRevenueAudit(5).cells['evRevenue:2025A']
  assert.equal(record.checks.calculation.passed, true)
  assert.notEqual(record.status, VALIDATION_STATUS.VERIFIED_REPORTED)
  assert.equal(record.status, VALIDATION_STATUS.DERIVED)
})

function derivedMultipleAudit({ denominatorMetric, multipleMetric, status, storedMultiple }) {
  return buildRowAudit({
    ticker: 'TEST', currency: 'USD', capital: { enterpriseValue: 500 },
    metrics: { revenue: { '2025A': denominatorMetric === 'revenue' ? 100 : null }, [denominatorMetric]: { '2025A': 100 } },
    multiples: { [multipleMetric]: { '2025A': storedMultiple } },
    provenance: { [denominatorMetric]: { '2025A': {
      value: 100, status, sourceType: 'Derived Calculation', components: [],
    } } },
  }).cells[`${multipleMetric}:2025A`]
}

test('derived Revenue and FCF denominators remain input evidence for multiple audits', () => {
  for (const [denominatorMetric, multipleMetric] of [
    ['revenue', 'evRevenue'], ['ebit', 'evEbit'], ['freeCashFlow', 'evFreeCashFlow'],
  ]) {
    const correct = derivedMultipleAudit({ denominatorMetric, multipleMetric, status: 'VERIFIED_DERIVED', storedMultiple: 5 })
    assert.equal(correct.status, VALIDATION_STATUS.DERIVED)
    assert.equal(correct.displayable, true)
    const wrong = derivedMultipleAudit({ denominatorMetric, multipleMetric, status: 'VERIFIED_DERIVED', storedMultiple: 7 })
    assert.equal(wrong.status, VALIDATION_STATUS.FAILED)
    assert.equal(wrong.displayable, false)
  }
})

test('a valid four-quarter Adjusted EBITDA denominator produces a displayable derived multiple', () => {
  const quarterEnds = ['2025-03-31', '2025-06-30', '2025-09-30', '2025-12-31']
  const source = {
    value: 100,
    sourceType: 'SEC-filed company non-GAAP reconciliation',
    provider: 'SEC',
    validationStatus: 'VERIFIED_DERIVED',
    adjustedEbitdaMethod: 'COMPANY_DEFINED_DERIVED_ADJ_EBITDA',
    definitionFingerprint: 'fixture-definition',
    compatibleDefinitionFingerprints: ['fixture-definition'],
    requestedPeriodType: 'LTM',
    ltmStart: '2025-01-01',
    ltmEnd: '2025-12-31',
    sourcePeriodType: 'LTM',
    derivation: 'SUM_OF_LATEST_FOUR_COMPATIBLE_STANDALONE_QUARTERS',
    verificationBasis: 'STRUCTURAL_SEC_TABLE_CELL_PROVENANCE',
    components: quarterEnds.map((sourceEnd, index) => ({
      sourceStart: `${sourceEnd.slice(0, 5)}${['01-01', '04-01', '07-01', '10-01'][index]}`,
      sourceEnd,
      sourcePeriodType: 'QUARTER',
      sourceValue: 25,
      sourceUrl: 'https://www.sec.gov/example',
      sourceId: `SEC:fixture:${index}`,
      documentHash: `hash-${index}`,
      exactCompanyMetricLabel: 'Adjusted EBITDA',
      accn: `0000000000-25-00000${index}`,
      filingForm: '8-K',
      document: 'fixture.htm',
      sourceType: 'SEC-filed company non-GAAP reconciliation',
      tableTitle: 'Reconciliation',
      tableIndex: 0,
      rowIndex: 2,
      columnIndex: index + 1,
      rowLabel: 'Adjusted EBITDA',
      columnLabel: sourceEnd,
      rawCellValue: '$25',
      rawReportedValue: 25,
      reportedScale: 1,
      reportedUnits: 'USD',
      currency: 'USD',
      normalizedValue: 25,
      definitionFingerprint: 'fixture-definition',
      adjustedEbitdaMethod: 'COMPANY_REPORTED_ADJ_EBITDA',
    })),
  }
  source.denominatorIdentity = adjustedEbitdaDenominatorIdentity(source)
  const audit = buildRowAudit({
    ticker: 'TEST', currency: 'USD', capital: { enterpriseValue: 500 },
    metrics: { revenue: { LTM: null }, ebitda: { LTM: 100 } },
    multiples: { evEbitda: { LTM: 5 } },
    provenance: { ebitda: { LTM: source } },
    multipleDenominatorIdentity: { evEbitda: { LTM: source.denominatorIdentity } },
  })
  assert.equal(audit.cells['evEbitda:LTM'].status, VALIDATION_STATUS.DERIVED)
  assert.equal(audit.cells['evEbitda:LTM'].displayable, true)
})

test('does not display a missing value as verified data', () => {
  const record = createAuditRecord({ ticker: 'TEST', metric: 'EBITDA', value: null })
  assert.equal(record.status, VALIDATION_STATUS.UNVERIFIED)
  assert.equal(record.displayable, false)
})
