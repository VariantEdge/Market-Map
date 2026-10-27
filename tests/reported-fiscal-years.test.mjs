import assert from 'node:assert/strict'
import test from 'node:test'
import { buildReportedFiscalYears } from '../server/valuation/reportedFiscalYears.js'
import { createCanonicalObservation, DATE_AUTHORITY, PERIOD_TYPE } from '../server/valuation/canonicalFinancialObservation.js'

const filingUrl = 'https://www.sec.gov/Archives/edgar/data/723125/000072312525000028/mu-20250828.htm'
function observation(metric, value, overrides = {}) {
  return createCanonicalObservation({
    ticker: 'MU', metric, normalizedValue: value, currency: 'USD', normalizedUnits: 'USD',
    sourceProvider: 'SEC', sourceId: `SEC:${metric}`, sourceUrl: filingUrl,
    accession: '0000723125-25-000028', scope: 'CONSOLIDATED',
    operationScope: 'CONTINUING_OPERATIONS',
    periodIdentity: { periodType: PERIOD_TYPE.FISCAL_YEAR,
      periodStart: '2024-08-30', periodEnd: '2025-08-28', fiscalYear: 2025,
      dateAuthority: DATE_AUTHORITY.REPORTED },
    ...overrides,
  })
}
const fiscal = (records, adjustedEbitda = null) => buildReportedFiscalYears({
  ticker: 'MU', canonical: { records }, adjustedEbitda, years: [2025],
})
const cell = (cells, metric) => cells.find((item) => item.metric === metric)

test('reported fiscal year retains exact non-calendar boundaries and never changes calendar audit', () => {
  const canonical = { records: { revenue: [observation('revenue', 120)] },
    calendarActuals: { revenue: { 2025: { value: null, status: 'INSUFFICIENT_PERIOD_COVERAGE' } } } }
  const cells = buildReportedFiscalYears({ ticker: 'MU', canonical, years: [2025] })
  assert.equal(cell(cells, 'revenue').value, 120)
  assert.equal(cell(cells, 'revenue').periodStart, '2024-08-30')
  assert.equal(cell(cells, 'revenue').periodEnd, '2025-08-28')
  assert.equal(canonical.calendarActuals.revenue[2025].value, null)
})

for (const [ticker, start, end] of [
  ['INTC', '2024-12-29', '2025-12-27'],
  ['FCEL', '2024-11-01', '2025-10-31'],
  ['MU', '2024-08-30', '2025-08-28'],
  ['IREN', '2024-07-01', '2025-06-30'],
  ['MSFT', '2024-07-01', '2025-06-30'],
]) test(`${ticker} fiscal year keeps its exact issuer boundaries`, () => {
  const source = observation('revenue', 120, { ticker,
    periodIdentity: { periodType: PERIOD_TYPE.FISCAL_YEAR, periodStart: start,
      periodEnd: end, dateAuthority: DATE_AUTHORITY.REPORTED } })
  const result = buildReportedFiscalYears({ ticker, canonical: { records: { revenue: [source] } },
    years: [2025] })
  assert.deepEqual([cell(result, 'revenue').periodStart, cell(result, 'revenue').periodEnd], [start, end])
  assert.equal(cell(result, 'revenue').fiscalYear, 2025)
})

test('provider-only, inferred-boundary, and conflicting annual observations fail closed', () => {
  const provider = observation('revenue', 120, { sourceProvider: 'Fiscal.ai', sourceId: 'FISCAL:1' })
  const inferred = observation('grossProfit', 30, { periodIdentity: {
    periodType: PERIOD_TYPE.FISCAL_YEAR, periodStart: '2024-08-30',
    periodEnd: '2025-08-28', fiscalYear: 2025, dateAuthority: DATE_AUTHORITY.INFERRED,
  } })
  const cells = fiscal({ revenue: [provider, observation('revenue', 121), observation('revenue', 120)],
    grossProfit: [inferred] })
  assert.equal(cell(cells, 'revenue').value, null)
  assert.equal(cell(cells, 'grossProfit').value, null)
})

test('matching provider observation with SEC period and value evidence is usable', () => {
  const sec = observation('revenue', 120)
  const fiscalObservation = observation('revenue', 120, {
    sourceProvider: 'Fiscal.ai', sourceId: 'FISCAL:1',
    derivation: { method: 'FISCAL_AI_VALUE_WITH_SEC_PERIOD_EVIDENCE',
      periodEvidence: { sourceProvider: 'SEC', sourceId: sec.sourceId,
        sourceUrl: sec.sourceUrl, normalizedValue: sec.normalizedValue, periodIdentity: sec.periodIdentity },
      reconciliation: { matches: true } },
  })
  assert.equal(cell(fiscal({ revenue: [fiscalObservation] }), 'revenue').value, 120)
})

test('exact fiscal Gross Profit from SEC Revenue minus Cost of Revenue remains usable', () => {
  const revenue = observation('revenue', 187192000)
  const cost = observation('costOfRevenue', 87067000)
  const grossProfit = observation('grossProfit', 100125000, {
    sourceProvider: 'DERIVED', sourceId: 'DERIVED:IREN:GP', reportedVsDerived: 'DERIVED',
    derivation: { method: 'REVENUE_MINUS_COST_OF_REVENUE', exactness: 'EXACT_ARITHMETIC',
      inputs: [revenue, cost] },
  })
  const result = fiscal({ grossProfit: [grossProfit] })
  assert.equal(cell(result, 'grossProfit').value, 100125000)
  assert.equal(cell(result, 'grossProfit').status, 'VERIFIED_DERIVED')
  assert.equal(cell(result, 'grossProfit').sourceRefs.length, 2)
})

test('fiscal FCF requires identical periods and operation scopes', () => {
  const records = { operatingCashFlow: [observation('operatingCashFlow', 100)],
    capitalExpenditures: [observation('capitalExpenditures', 40)] }
  assert.equal(cell(fiscal(records), 'freeCashFlow').value, 60)
  records.capitalExpenditures = [observation('capitalExpenditures', 40,
    { operationScope: 'UNSPECIFIED' })]
  assert.equal(cell(fiscal(records), 'freeCashFlow').value, null)
  records.freeCashFlow = [observation('freeCashFlow', 60,
    { operationScope: 'UNSPECIFIED' })]
  assert.equal(cell(fiscal(records), 'freeCashFlow').value, null)
})

test('Adjusted EBITDA uses only a selected SEC-filed company reconciliation', () => {
  const direct = { periodType: 'FISCAL_YEAR', startDate: '2024-08-30', endDate: '2025-08-28',
    value: 55, currency: 'USD', definitionFingerprint: 'company-definition',
    filingUrl, accessionNumber: '0000723125-25-000028',
    provenance: { sourceId: 'SEC:ADJUSTED', sourceHash: 'hash' } }
  assert.equal(cell(fiscal({}, { selectedFacts: [direct] }), 'adjustedEbitda').value, 55)
  assert.equal(cell(fiscal({}, { selectedFacts: [] }), 'adjustedEbitda').value, null)
})
