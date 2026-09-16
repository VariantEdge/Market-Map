import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCanonicalQuarterlyLedger,
  calculateLtmFromAnnualAndYtd,
  HISTORICAL_STATUS,
} from '../server/valuation/financialLedger.js'
import { selectMetricSourceFacts } from '../server/valuation/sourceLedger.js'

const company = { name: 'Fixture Co', ticker: 'FIX', cik: '0000000001' }

function fact({ tag, start, end, value, fy = 2025, fp = 'Q1', filed = '2026-02-01', form = '10-Q' }) {
  return { tag, start, end, val: value, fy, fp, filed, form }
}

function companyFacts(entries) {
  const facts = {}
  for (const entry of entries) {
    facts[entry.tag] ??= { units: { USD: [] } }
    facts[entry.tag].units.USD.push(entry)
  }
  return { facts: { 'us-gaap': facts } }
}

function standardQuarterFacts(year = 2025) {
  return [
    ['01-01', '03-31', 10, 4, 3, 18, 2],
    ['04-01', '06-30', 20, 8, 4, 20, 3],
    ['07-01', '09-30', 30, 12, 5, 22, 4],
    ['10-01', '12-31', 40, 16, 6, 24, 5],
  ].flatMap(([start, end, revenue, grossProfit, operatingIncome, cashFlow, capex], index) => [
    fact({ tag: 'RevenueFromContractWithCustomerExcludingAssessedTax', start: `${year}-${start}`, end: `${year}-${end}`, value: revenue, fp: `Q${index + 1}` }),
    fact({ tag: 'GrossProfit', start: `${year}-${start}`, end: `${year}-${end}`, value: grossProfit, fp: `Q${index + 1}` }),
    fact({ tag: 'OperatingIncomeLoss', start: `${year}-${start}`, end: `${year}-${end}`, value: operatingIncome, fp: `Q${index + 1}` }),
    fact({ tag: 'DepreciationDepletionAndAmortization', start: `${year}-${start}`, end: `${year}-${end}`, value: 2, fp: `Q${index + 1}` }),
    fact({ tag: 'NetCashProvidedByUsedInOperatingActivities', start: `${year}-${start}`, end: `${year}-${end}`, value: cashFlow, fp: `Q${index + 1}` }),
    fact({ tag: 'PaymentsToAcquirePropertyPlantAndEquipment', start: `${year}-${start}`, end: `${year}-${end}`, value: capex, fp: `Q${index + 1}` }),
  ])
}

test('never synthesizes displayed Adjusted EBITDA from GAAP operating metrics', async () => {
  const entries = [
    ...standardQuarterFacts(),
    fact({ tag: 'RevenueFromContractWithCustomerExcludingAssessedTax', start: '2025-01-01', end: '2025-12-31', value: 100, fp: 'FY', form: '10-K' }),
    fact({ tag: 'GrossProfit', start: '2025-01-01', end: '2025-12-31', value: 40, fp: 'FY', form: '10-K' }),
  ]
  const result = await buildCanonicalQuarterlyLedger({ company, facts: companyFacts(entries), years: [2025] })
  assert.equal(result.calendarActuals.revenue[2025].value, 100)
  assert.equal(result.calendarActuals.grossProfit[2025].value, 40)
  assert.equal(result.calendarActuals.ebitda[2025].value, null)
  assert.equal(result.calendarActuals.freeCashFlow[2025].value, 70)
  assert.equal(result.calendarActuals.revenue[2025].validationStatus, HISTORICAL_STATUS.RECONSTRUCTED)
  assert.equal(result.calendarActuals.ebitda[2025].validationStatus, 'NOT_REPORTED')
  assert.equal(result.calendarActuals.ebitda[2025].method, 'FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE')
  assert.deepEqual(result.ledger.ebitda, [])
})

test('normalizes cumulative year-to-date facts into standalone quarters and reconciles the annual value', async () => {
  const entries = [
    fact({ tag: 'RevenueFromContractWithCustomerExcludingAssessedTax', start: '2025-01-01', end: '2025-03-31', value: 10, fp: 'Q1' }),
    fact({ tag: 'RevenueFromContractWithCustomerExcludingAssessedTax', start: '2025-01-01', end: '2025-06-30', value: 30, fp: 'Q2' }),
    fact({ tag: 'RevenueFromContractWithCustomerExcludingAssessedTax', start: '2025-01-01', end: '2025-09-30', value: 60, fp: 'Q3' }),
    fact({ tag: 'RevenueFromContractWithCustomerExcludingAssessedTax', start: '2025-01-01', end: '2025-12-31', value: 100, fp: 'FY', form: '10-K' }),
  ]
  const result = await buildCanonicalQuarterlyLedger({ company, facts: companyFacts(entries), years: [2025] })
  assert.deepEqual(result.ledger.revenue.map((quarter) => quarter.normalizedValue), [10, 20, 30, 40])
  assert.equal(result.calendarActuals.revenue[2025].value, 100)
})

test('derives a 52-week fiscal Q4 when the annual start drifts within seven days', async () => {
  const entries = [
    fact({ tag: 'RevenueFromContractWithCustomerExcludingAssessedTax', start: '2024-02-01', end: '2024-04-30', value: 10, fp: 'Q1' }),
    fact({ tag: 'RevenueFromContractWithCustomerExcludingAssessedTax', start: '2024-02-01', end: '2024-07-31', value: 30, fp: 'Q2' }),
    fact({ tag: 'RevenueFromContractWithCustomerExcludingAssessedTax', start: '2024-02-01', end: '2024-10-31', value: 60, fp: 'Q3' }),
    fact({ tag: 'RevenueFromContractWithCustomerExcludingAssessedTax', start: '2024-01-29', end: '2025-01-31', value: 100, fp: 'FY', form: '10-K' }),
  ]
  const result = await buildCanonicalQuarterlyLedger({ company, facts: companyFacts(entries), years: [2024, 2025] })
  const q4 = result.ledger.revenue.find((record) => record.quarterEnd === '2025-01-31')
  assert.equal(q4.normalizedValue, 40)
  assert.equal(q4.quarterStart, '2024-11-01')
  assert.equal(q4.calculationLineage.method, 'CUMULATIVE_YTD_SUBTRACTION')
})

test('uses whole fiscal quarters ending in the calendar year without monthly allocation', async () => {
  const entries = [
    ['2024-11-01', '2025-01-31', 18.997, 'Q1'],
    ['2025-02-01', '2025-04-30', 37.406, 'Q2'],
    ['2025-05-01', '2025-07-31', 46.743, 'Q3'],
    ['2025-08-01', '2025-10-31', 55.016, 'Q4'],
  ].map(([start, end, value, fp]) => fact({ tag: 'RevenueFromContractWithCustomerExcludingAssessedTax', start, end, value, fp }))
  const result = await buildCanonicalQuarterlyLedger({ company, facts: companyFacts(entries), years: [2025] })
  assert.equal(result.calendarActuals.revenue[2025].value, 158.162)
  assert.equal(result.calendarActuals.revenue[2025].components.every((component) => !('overlapDays' in component)), true)
})

test('fails closed when a historical calendar year has incomplete quarterly coverage', async () => {
  const entries = standardQuarterFacts().filter((entry) => entry.end !== '2025-12-31')
  const result = await buildCanonicalQuarterlyLedger({ company, facts: companyFacts(entries), years: [2025] })
  assert.equal(result.calendarActuals.revenue[2025].value, null)
  assert.equal(result.calendarActuals.revenue[2025].validationStatus, HISTORICAL_STATUS.UNAVAILABLE)
})

test('uses Revenue minus Cost of Revenue only for gross-profit periods missing a direct tag', async () => {
  const base = standardQuarterFacts()
  const directGrossProfit = base.filter((entry) => entry.tag === 'GrossProfit' && entry.end <= '2025-06-30')
  const revenue = base.filter((entry) => entry.tag === 'RevenueFromContractWithCustomerExcludingAssessedTax')
  const costs = revenue.map((entry) => fact({
    tag: 'CostOfRevenue', start: entry.start, end: entry.end,
    value: entry.val - ({ '2025-03-31': 4, '2025-06-30': 8, '2025-09-30': 12, '2025-12-31': 16 }[entry.end]),
    fp: entry.fp,
  }))
  const entries = [
    ...base.filter((entry) => entry.tag !== 'GrossProfit'),
    ...directGrossProfit,
    ...costs,
    fact({ tag: 'RevenueFromContractWithCustomerExcludingAssessedTax', start: '2025-01-01', end: '2025-12-31', value: 100, fp: 'FY', form: '10-K' }),
    fact({ tag: 'CostOfRevenue', start: '2025-01-01', end: '2025-12-31', value: 60, fp: 'FY', form: '10-K' }),
  ]
  const result = await buildCanonicalQuarterlyLedger({ company, facts: companyFacts(entries), years: [2025] })
  assert.equal(result.calendarActuals.grossProfit[2025].value, 40)
  assert.equal(result.calendarActuals.grossProfit[2025].validationStatus, HISTORICAL_STATUS.RECONSTRUCTED)
  assert.equal(result.ledger.grossProfit.at(-1).source.sourceType, 'Derived SEC metric')
  assert.equal(result.ledger.grossProfit.at(-1).calculationLineage.method, 'REVENUE_MINUS_COST_OF_REVENUE')
})

test('preserves the latest authoritative comparable fact and its recast lineage', async () => {
  const entries = [
    ...standardQuarterFacts(),
    fact({ tag: 'RevenueFromContractWithCustomerExcludingAssessedTax', start: '2025-01-01', end: '2025-03-31', value: 9, filed: '2025-05-01' }),
  ]
  const result = await buildCanonicalQuarterlyLedger({ company, facts: companyFacts(entries), years: [2025] })
  assert.equal(result.ledger.revenue[0].normalizedValue, 10)
  assert.match(result.ledger.revenue[0].warnings[0], /latest authoritative comparable\/recast fact/)
  assert.equal(result.ledger.revenue[0].selectionDecision, 'LATEST_AUTHORITATIVE_COMPARABLE_RECAST')
  assert.equal(result.calendarActuals.revenue[2025].validationStatus, HISTORICAL_STATUS.RECONSTRUCTED)
})

test('uses an exact Jan-to-Dec SEC annual fact when standalone quarters are unavailable', async () => {
  const entries = [fact({
    tag: 'Revenues', start: '2025-01-01', end: '2025-12-31', value: 100,
    fp: 'FY', form: '20-F', filed: '2026-04-30',
  })]
  const result = await buildCanonicalQuarterlyLedger({ company, facts: companyFacts(entries), years: [2025] })
  const entry = result.calendarActuals.revenue[2025]
  assert.equal(entry.value, 100)
  assert.equal(entry.validationStatus, HISTORICAL_STATUS.EXACT)
  assert.equal(entry.method, 'CALENDAR_YEAR_REPORTED')
})

test('maps consolidated IFRS revenue from contracts with customers', async () => {
  const result = await buildCanonicalQuarterlyLedger({
    company,
    facts: null,
    years: [2025],
    supplementalRawFacts: [{
      id: 'ifrs-revenue', issuer: company.name, ticker: company.ticker, cik: company.cik,
      metricCandidates: ['revenue'], namespace: 'ifrs-full', concept: 'RevenueFromContractsWithCustomers',
      label: 'Revenue from contracts with customers', value: 19_889_000_000, units: 'EUR', currency: 'EUR',
      startDate: '2025-01-01', endDate: '2025-12-31', durationDays: 365, segment: null,
      filingForm: '20-F', accessionNumber: 'fixture-20f', filingDate: '2026-03-05',
      rawSourceType: 'SEC_INLINE_XBRL', standardXbrl: true, companyExtension: false,
      provenance: { sourceId: 'fixture-20f:revenue', sourceHash: 'fixture', retrievedAt: '2026-03-05T00:00:00.000Z' },
    }],
  })
  assert.equal(result.calendarActuals.revenue[2025].value, 19_889_000_000)
  assert.equal(result.calendarActuals.revenue[2025].validationStatus, HISTORICAL_STATUS.EXACT)
})

test('never promotes a dimensional revenue fact into a consolidated metric', () => {
  const selected = selectMetricSourceFacts([{
    id: 'discontinued-revenue', metricCandidates: ['revenue'], namespace: 'ifrs-full', concept: 'Revenue',
    value: 1_059_000_000, currency: 'EUR', startDate: '2024-01-01', endDate: '2024-12-31',
    durationDays: 366, segment: 'ifrs-full:DiscontinuedOperationsMember', filingForm: '20-F',
    filingDate: '2025-03-13', companyExtension: false,
  }], 'revenue')
  assert.deepEqual(selected, [])
})

test('maps IFRS investing cash purchases of PP&E into standardized free cash flow', async () => {
  const base = {
    issuer: company.name, ticker: company.ticker, cik: company.cik, units: 'USD', currency: 'USD',
    startDate: '2025-01-01', endDate: '2025-12-31', durationDays: 365, segment: null,
    filingForm: '20-F', accessionNumber: 'fixture-20f', filingDate: '2026-03-01',
    rawSourceType: 'SEC_INLINE_XBRL', standardXbrl: true, companyExtension: false,
    provenance: { sourceHash: 'fixture', retrievedAt: '2026-03-01T00:00:00.000Z' },
  }
  const supplementalRawFacts = [
    { ...base, id: 'cfo', metricCandidates: ['operatingCashFlow'], namespace: 'ifrs-full', concept: 'CashFlowsFromUsedInOperatingActivities', value: 100, provenance: { ...base.provenance, sourceId: 'cfo' } },
    { ...base, id: 'capex', metricCandidates: ['capitalExpenditures'], namespace: 'ifrs-full', concept: 'PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities', value: 35, provenance: { ...base.provenance, sourceId: 'capex' } },
  ]
  const result = await buildCanonicalQuarterlyLedger({ company, facts: null, years: [2025], supplementalRawFacts })
  assert.equal(result.calendarActuals.freeCashFlow[2025].value, 65)
  assert.equal(result.calendarActuals.freeCashFlow[2025].method, 'CALENDAR_YEAR_CFO_MINUS_CAPEX')
})

test('derives an exact LTM from the latest annual and comparable current/prior YTD periods', () => {
  const source = {
    segment: null, filingForm: '6-K', filingDate: '2026-08-12', filingUrl: 'https://www.sec.gov/fixture',
    accessionNumber: 'fixture', concept: 'Revenues', provenance: { sourceId: 'fixture', sourceHash: 'hash' },
  }
  const facts = [
    { ...source, startDate: '2025-01-01', endDate: '2025-12-31', durationDays: 365, value: 529_800_000 },
    { ...source, startDate: '2026-01-01', endDate: '2026-06-30', durationDays: 181, value: 981_300_000 },
    { ...source, startDate: '2025-01-01', endDate: '2025-06-30', durationDays: 181, value: 156_000_000 },
  ]
  const ltm = calculateLtmFromAnnualAndYtd('revenue', facts, {
    documentHash: 'hash', retrievedAt: '2026-08-12T00:00:00.000Z', companyFactsUrl: 'https://data.sec.gov/fixture',
  })
  assert.equal(ltm.value, 1_355_100_000)
  assert.equal(ltm.method, 'latest-sec-annual-plus-current-ytd-minus-prior-ytd')
  assert.deepEqual(ltm.components.map((component) => component.formula), [
    'LTM_BASE_ANNUAL', 'ADD_CURRENT_YTD', 'SUBTRACT_PRIOR_YTD',
  ])
})
