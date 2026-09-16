import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildMarginBasedForwardSeries,
  canonicalHistoricalForApi,
  loadAdjustedEbitdaProductionTask,
  loadLegacyForwardBasisProductionTask,
} from '../api/valuationData.js'
import {
  buildCanonicalHistoricalFinancials,
  buildSecEnrichedFinancialsShadow,
} from '../server/valuation/secCanonicalFinancials.js'
import { HISTORICAL_RESULT_STATUS } from '../server/valuation/historicalPeriodEngine.js'
import { buildWiseSheetsHistorical, completeWithSecExceptionQuarters } from '../server/valuation/wiseSheetsFinancials.js'
import { buildRowAudit } from '../server/valuation/validation.js'

const company = { ticker: 'SYNTH', cik: '0000000001', name: 'Synthetic Company', fiscalYearEnd: '1231' }

function fact(start, end, val, fp, concept) {
  return { start, end, val, fp, fy: 2024, form: '10-Q', filed: '2025-01-30', accn: `${concept}-${fp}` }
}

function companyFacts() {
  const periods = [
    ['2024-01-01', '2024-03-31', 'Q1'],
    ['2024-04-01', '2024-06-30', 'Q2'],
    ['2024-07-01', '2024-09-30', 'Q3'],
    ['2024-10-01', '2024-12-31', 'Q4'],
  ]
  const concept = (name, values) => ({ label: name, units: { USD: periods.map(([start, end, fp], index) =>
    fact(start, end, values[index], fp, name)) } })
  return { facts: { 'us-gaap': {
    Revenues: concept('Revenues', [10, 20, 30, 40]),
    GrossProfit: concept('GrossProfit', [4, 8, 12, 16]),
    NetCashProvidedByUsedInOperatingActivities: concept('NetCashProvidedByUsedInOperatingActivities', [3, 6, 9, 12]),
    PaymentsToAcquirePropertyPlantAndEquipment: concept('PaymentsToAcquirePropertyPlantAndEquipment', [1, 2, 3, 4]),
  } } }
}

test('frontend-facing historical API entries are the canonical engine result objects', () => {
  const canonical = buildSecEnrichedFinancialsShadow({
    ticker: company.ticker,
    company,
    facts: companyFacts(),
    filings: { company, filings: [{
      cik: company.cik, form: '10-Q', reportDate: '2024-12-31', filingDate: '2025-01-30',
      accessionNumber: 'latest', secUrl: 'https://www.sec.gov/latest',
    }] },
    wiseSheetsRows: [],
    years: [2024],
    asOfDate: '2025-02-01',
  })
  const api = canonicalHistoricalForApi(canonical, [2024])

  for (const metric of ['revenue', 'grossProfit', 'ebit', 'operatingCashFlow', 'capitalExpenditures', 'freeCashFlow']) {
    assert.strictEqual(api.calendarActuals[metric][2024], canonical.calendarActuals[metric][2024])
    assert.strictEqual(api.ltm[metric], canonical.ltm[metric])
    assert.equal(api.calendarActuals[metric][2024].value, canonical.calendarActuals[metric][2024].value)
    assert.equal(api.ltm[metric].value, canonical.ltm[metric].value)
  }
})

test('canonical invalid statuses remain fail-closed in the frontend-facing API entry', () => {
  const canonical = {
    calendarActuals: {
      freeCashFlow: { 2025: {
        value: null,
        classification: null,
        status: HISTORICAL_RESULT_STATUS.OPERATION_SCOPE_INCOMPATIBLE,
        reason: 'OPERATION_SCOPE_INCOMPATIBLE',
        components: [],
      } },
    },
    ltm: {},
  }
  const api = canonicalHistoricalForApi(canonical, [2025])
  assert.equal(api.calendarActuals.freeCashFlow[2025].value, null)
  assert.equal(api.calendarActuals.freeCashFlow[2025].status,
    HISTORICAL_RESULT_STATUS.OPERATION_SCOPE_INCOMPATIBLE)
  const audit = buildRowAudit({
    ticker: 'SYNTH', currency: 'USD', metrics: { revenue: {}, freeCashFlow: { '2025A': null } },
    provenance: { freeCashFlow: { '2025A': api.calendarActuals.freeCashFlow[2025] } },
  })
  assert.equal(audit.cells['freeCashFlow:2025A'].status,
    HISTORICAL_RESULT_STATUS.OPERATION_SCOPE_INCOMPATIBLE)
  assert.equal(audit.cells['freeCashFlow:2025A'].displayable, false)
})

for (const status of [
  HISTORICAL_RESULT_STATUS.MISSING_SOURCE_DATA,
  HISTORICAL_RESULT_STATUS.NOT_REPORTED,
  HISTORICAL_RESULT_STATUS.INSUFFICIENT_PERIOD_COVERAGE,
  HISTORICAL_RESULT_STATUS.STALE_SOURCE_COVERAGE,
  HISTORICAL_RESULT_STATUS.DEFINITION_INCOMPATIBLE,
  HISTORICAL_RESULT_STATUS.REQUIRES_REVIEW,
  HISTORICAL_RESULT_STATUS.OPERATION_SCOPE_INCOMPATIBLE,
  HISTORICAL_RESULT_STATUS.OUT_OF_SCOPE,
  HISTORICAL_RESULT_STATUS.LEGITIMATE_NA,
]) {
  test(`canonical ${status} survives provenance and audit unchanged`, () => {
    const entry = { value: null, classification: null, status, reason: status, components: [] }
    const canonical = { calendarActuals: { revenue: { 2025: entry } }, ltm: {} }
    const api = canonicalHistoricalForApi(canonical, [2025])
    const audit = buildRowAudit({
      ticker: 'SYNTH', currency: 'USD', metrics: { revenue: { '2025A': null } },
      provenance: { revenue: { '2025A': api.calendarActuals.revenue[2025] } },
    })
    assert.equal(api.calendarActuals.revenue[2025].status, status)
    assert.equal(audit.cells['revenue:2025A'].status, status)
    assert.equal(audit.cells['revenue:2025A'].displayable, false)
  })
}

test('production canonical builder returns the same approved canonical result without legacy comparison', async () => {
  const production = await buildCanonicalHistoricalFinancials({
    ticker: company.ticker,
    company,
    facts: companyFacts(),
    filings: { company, filings: [] },
    wiseSheetsRows: [],
    years: [2024],
    supplementalFacts: [],
    asOfDate: '2025-02-01',
  })
  assert.equal(production.canonical.calendarActuals.revenue[2024].value, 100)
  assert.equal(production.canonical.calendarActuals.grossProfit[2024].value, 40)
  assert.equal('comparisons' in production, false)
})

test('targeted SEC completion times out without hanging or substituting legacy GAAP values', async () => {
  const production = await buildCanonicalHistoricalFinancials({
    ticker: company.ticker,
    company,
    facts: { facts: {} },
    filings: { company, filings: [] },
    wiseSheetsRows: [],
    years: [2024],
    asOfDate: '2025-02-01',
    targetedSecTimeoutMs: 5,
    targetedCompletionLoader: () => new Promise(() => {}),
  })
  assert.equal(production.canonical.calendarActuals.revenue[2024].value, null)
  assert.ok(production.canonical.failures.some((failure) => failure.reason === 'TARGETED_SEC_COMPLETION_TIMEOUT'))
})

test('Adjusted EBITDA extraction failure is isolated from canonical GAAP loading', async () => {
  const result = await loadAdjustedEbitdaProductionTask({
    company, facts: companyFacts(), filingIndex: { filings: [] }, years: [2024], fallbackStatus: 'MISSING',
  }, {
    loadCached: async () => null,
    loadSupplemental: async () => ({ records: [], errors: [] }),
    buildLedger: async () => { throw new Error('Synthetic Adjusted EBITDA parser failure') },
  })
  assert.equal(result.ledger, null)
  assert.equal(result.failure, 'Synthetic Adjusted EBITDA parser failure')
})

test('the entire Adjusted EBITDA workflow has one timeout budget', async () => {
  const result = await loadAdjustedEbitdaProductionTask({
    company, facts: companyFacts(), filingIndex: { filings: [] }, years: [2024], fallbackStatus: 'MISSING',
  }, {
    loadCached: () => new Promise(() => {}),
    loadSupplemental: async () => { throw new Error('must not run') },
    buildLedger: async () => { throw new Error('must not run') },
  }, 5)
  assert.equal(result.ledger, null)
  assert.equal(result.failure, 'ADJUSTED_EBITDA_EXTRACTION_TIMEOUT')
  assert.deepEqual(result.supplemental.errors, ['ADJUSTED_EBITDA_EXTRACTION_TIMEOUT'])
})

test('forward basis builds independently when Adjusted EBITDA extraction fails', async () => {
  let includeAdjustedEbitda = null
  const basis = await loadLegacyForwardBasisProductionTask({
    ticker: 'SYNTH', company, facts: companyFacts(), filingIndex: { filings: [] },
    years: [2025], wiseSheetsRows: [], fallbackStatus: 'MISSING', skipSupplemental: true,
  }, {
    buildLedger: async (input) => {
      includeAdjustedEbitda = input.includeAdjustedEbitda
      return { ledger: {} }
    },
  })
  const adjusted = await loadAdjustedEbitdaProductionTask({
    company, facts: companyFacts(), filingIndex: { filings: [] }, years: [2025], fallbackStatus: 'MISSING',
  }, {
    loadCached: async () => ({ records: [], errors: [] }),
    buildLedger: async () => { throw new Error('Adjusted EBITDA failed') },
  })
  assert.equal(includeAdjustedEbitda, false)
  assert.ok(basis.value)
  assert.equal(adjusted.failure, 'Adjusted EBITDA failed')

  const productionBasis = await loadLegacyForwardBasisProductionTask({
    ticker: 'SYNTH', company, facts: companyFacts(), filingIndex: { filings: [] },
    years: [2024], wiseSheetsRows: [], fallbackStatus: 'MISSING', skipSupplemental: true,
  })
  assert.equal(productionBasis.diagnostic, null)
  assert.ok(productionBasis.value)
})

test('forward derived metrics retain the constructed pre-migration historical basis', () => {
  const ends = ['2025-03-31', '2025-06-30', '2025-09-30', '2025-12-31']
  const rows = Object.entries({
    revenue: [25, 25, 25, 25],
    gross_profit: [10, 10, 10, 10],
    net_cash_from_operating_activities: [8, 8, 8, 8],
    total_capex: [3, 3, 3, 3],
  }).flatMap(([metric, values]) => ends.map((periodEnd, index) => ({
    ticker: 'SYNTH', metric, periodEnd, value: values[index], unit: 'USD', currency: 'USD',
    periodType: 'STANDALONE_QUARTER', scope: 'CONSOLIDATED', fiscalYear: 2025,
    fiscalPeriod: `Q${index + 1}`, source: { accession: `${metric}-${periodEnd}`, filingDate: periodEnd },
  })))
  const preMigration = completeWithSecExceptionQuarters(
    'SYNTH', buildWiseSheetsHistorical('SYNTH', rows, [2025]), {}, [2025],
  )
  const canonicalHistorical = {
    ltm: { revenue: { value: 200 }, grossProfit: { value: 120 }, freeCashFlow: { value: 80 } },
  }
  const revenue = { '2026E': { value: 200 }, '2027E': { value: 250 } }
  const grossProfit = buildMarginBasedForwardSeries({ revenue, estimateYears: [2026, 2027],
    ntmRevenue: { value: 180 }, basisMetric: preMigration.ltm.grossProfit,
    basisRevenue: preMigration.ltm.revenue, metricName: 'gross-profit' })
  const freeCashFlow = buildMarginBasedForwardSeries({ revenue, estimateYears: [2026, 2027],
    ntmRevenue: { value: 180 }, basisMetric: preMigration.ltm.freeCashFlow,
    basisRevenue: preMigration.ltm.revenue, metricName: 'free-cash-flow' })
  const canonicalGrossProfit = buildMarginBasedForwardSeries({ revenue, estimateYears: [2026, 2027],
    ntmRevenue: { value: 180 }, basisMetric: canonicalHistorical.ltm.grossProfit,
    basisRevenue: canonicalHistorical.ltm.revenue, metricName: 'gross-profit' })
  assert.deepEqual([grossProfit.NTM.value, grossProfit['2026E'].value, grossProfit['2027E'].value], [72, 80, 100])
  assert.deepEqual([freeCashFlow.NTM.value, freeCashFlow['2026E'].value, freeCashFlow['2027E'].value], [36, 40, 50])
  assert.notEqual(grossProfit.NTM.value, canonicalGrossProfit.NTM.value)
})

test('independent forward basis is identical to the pre-decoupling WiseSheets plus SEC exception basis', async () => {
  const ends = ['2025-03-31', '2025-06-30', '2025-09-30']
  const wiseRows = Object.entries({
    revenue: [25, 25, 25],
    gross_profit: [10, 10, 10],
    net_cash_from_operating_activities: [8, 8, 8],
    total_capex: [3, 3, 3],
  }).flatMap(([metric, values]) => ends.map((periodEnd, index) => ({
    ticker: 'SYNTH', metric, periodEnd, value: values[index], unit: 'USD', currency: 'USD',
    periodType: 'STANDALONE_QUARTER', scope: 'CONSOLIDATED', fiscalYear: 2025,
    fiscalPeriod: `Q${index + 1}`, source: { accession: `${metric}-${periodEnd}`, filingDate: periodEnd },
  })))
  const secRecord = (metric, normalizedValue) => ({
    normalizedValue, originalReportedValue: normalizedValue, currency: 'USD', units: 'USD',
    quarterStart: '2025-10-01', quarterEnd: '2025-12-31', fiscalYear: 2025, fiscalQuarter: 'Q4',
    validationStatus: 'VERIFIED_EXACT', rawMetricLabel: metric, warnings: [],
    source: { provider: 'SEC', sourceId: `sec-${metric}-q4`, consolidated: true,
      filingDate: '2026-02-01', sourceUrl: `https://sec.gov/${metric}-q4` },
  })
  const secLedger = {
    revenue: [secRecord('Revenue', 30)],
    grossProfit: [secRecord('Gross Profit', 12)],
    operatingCashFlow: [secRecord('Operating Cash Flow', 9)],
    capitalExpenditures: [secRecord('Capital Expenditures', 4)],
  }
  const oldBasis = completeWithSecExceptionQuarters(
    'SYNTH', buildWiseSheetsHistorical('SYNTH', wiseRows, [2025]), secLedger, [2025],
  )
  const independent = await loadLegacyForwardBasisProductionTask({
    ticker: 'SYNTH', company, facts: companyFacts(), filingIndex: { filings: [] },
    years: [2025], wiseSheetsRows: wiseRows, fallbackStatus: 'MISSING', skipSupplemental: true,
  }, { buildLedger: async () => ({ ledger: secLedger }) })
  assert.equal(independent.diagnostic, null)
  for (const metric of ['grossProfit', 'freeCashFlow']) {
    assert.equal(independent.value.ltm[metric].value, oldBasis.ltm[metric].value)
  }
  const revenue = { '2026E': { value: 220 }, '2027E': { value: 250 } }
  const forward = (basis, metric, metricName) => buildMarginBasedForwardSeries({
    revenue, estimateYears: [2026, 2027], ntmRevenue: { value: 200 },
    basisMetric: basis.ltm[metric], basisRevenue: basis.ltm.revenue, metricName,
  })
  for (const [metric, name] of [['grossProfit', 'gross-profit'], ['freeCashFlow', 'free-cash-flow']]) {
    const oldForward = forward(oldBasis, metric, name)
    const newForward = forward(independent.value, metric, name)
    assert.deepEqual(
      ['NTM', '2026E', '2027E'].map((period) => newForward[period].value),
      ['NTM', '2026E', '2027E'].map((period) => oldForward[period].value),
    )
  }
})
