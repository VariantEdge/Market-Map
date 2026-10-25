import test from 'node:test'
import assert from 'node:assert/strict'
import {
  adaptFiscalAiObservations, compareFiscalAdjustedEbitda, fetchFiscalAiHistorical,
  fiscalAdjustedEbitdaCandidates,
} from '../server/valuation/fiscalAiFinancials.js'
import { resolveFiscalAiWithSecMetric } from '../server/valuation/secCanonicalFinancials.js'
import {
  createCanonicalObservation, DATE_AUTHORITY, OBSERVATION_BASIS, PERIOD_TYPE,
} from '../server/valuation/canonicalFinancialObservation.js'
import { buildCalendarYear } from '../server/valuation/historicalPeriodEngine.js'

const secUrl = 'https://www.sec.gov/Archives/edgar/data/1996810/000199681026000015/gev-20251231.htm'

function fiscalMetric(value, options = {}) {
  return {
    value, unit: 'M', currency: 'USD', isCalculated: false,
    calcType: options.calcType ?? 'reported', mappingType: options.mappingType ?? 'direct',
    asReportedValues: (options.components ?? [{ metricName: 'Reported value', value,
      originalSourceUrl: secUrl }]).map((component, index) => ({
      asReportedMetricId: `test_${index}`, metricName: component.metricName,
      operation: '+', value: component.value, unit: 'M', currency: 'USD',
      isCalculated: false, sources: [{ originalSourceUrl: component.originalSourceUrl ?? secUrl }],
    })),
  }
}

function payload(ticker, metricId, value, period = {}) {
  const record = {
    periodId: `${ticker}-${period.reportDate ?? '2025-12-31'}`,
    periodType: period.periodType ?? 'Annual',
    reportDate: period.reportDate ?? '2025-12-31',
    periodDuration: period.periodDuration ?? '12 Months',
    fiscalYear: period.fiscalYear ?? 2025,
    fiscalQuarter: period.fiscalQuarter,
    metricsValues: { [metricId]: fiscalMetric(value, period) },
  }
  const cash = metricId.startsWith('cash_flow_')
  return { ticker, companyKey: ticker === 'GEV' ? 'NYSE_GEV' : 'NASDAQ_IREN',
    standardizedIncome: cash ? { data: [] } : { data: [record] },
    standardizedCashFlow: cash ? { data: [record] } : { data: [] },
    adjustedMetrics: { data: [] } }
}

function secObservation(ticker, metric, value, start, end, periodType = PERIOD_TYPE.CALENDAR_YEAR) {
  return createCanonicalObservation({
    ticker, issuerId: ticker, metric, rawValue: value, rawUnits: 'USD',
    normalizedValue: value, currency: 'USD', normalizedUnits: 'USD',
    periodIdentity: { periodType, periodStart: start, periodEnd: end,
      fiscalYear: Number(end.slice(0, 4)), dateAuthority: DATE_AUTHORITY.REPORTED },
    sourceProvider: 'SEC', sourceId: `SEC:${ticker}:${metric}:${end}`,
    accession: '0001996810-26-000015', sourceUrl: secUrl, scope: 'CONSOLIDATED',
    reportedVsDerived: OBSERVATION_BASIS.REPORTED,
  })
}

test('documented REST client uses server key, all source endpoints, and bounded retry', async () => {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ path: url.pathname, companyKey: url.searchParams.get('companyKey'),
      periodType: url.searchParams.get('periodType'), key: options.headers['X-Api-Key'] })
    if (calls.length === 1) return { ok: false, status: 429,
      headers: { get: () => '0' } }
    return { ok: true, json: async () => ({ data: [], metrics: [] }) }
  }
  const result = await fetchFiscalAiHistorical(['GOOGL'], {
    apiKey: 'test-only', fetchImpl, retryDelay: async () => {}, includeAsReported: true,
  })
  assert.equal(result[0].companyKey, 'NASDAQ_GOOG')
  assert.equal(calls.length, 6)
  assert.equal(new Set(calls.map((call) => call.path)).size, 5)
  assert.ok(calls.every((call) => call.key === 'test-only' && call.companyKey === 'NASDAQ_GOOG'))
  assert.ok(calls.every((call) => call.periodType.includes('quarterly')))
  await assert.rejects(() => fetchFiscalAiHistorical(['BE'], { apiKey: '' }), /FISCAL_API_KEY/)
})

test('Fiscal authentication and schema failures never turn into an empty provider success', async () => {
  await assert.rejects(() => fetchFiscalAiHistorical(['BE'], {
    apiKey: 'invalid-test-key', fetchImpl: async () => ({ ok: false, status: 403 }),
  }), /FISCAL_AI_HTTP_403/)
  await assert.rejects(() => fetchFiscalAiHistorical(['BE'], {
    apiKey: 'test-only', fetchImpl: async () => ({ ok: true, json: async () => ({ data: null }) }),
  }), /FISCAL_AI_INVALID_PAYLOAD/)
})

test('controlled acquisition limits concurrent Fiscal API calls to two company batches', async () => {
  let active = 0
  let peak = 0
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    active += 1
    peak = Math.max(peak, active)
    await new Promise((resolve) => setImmediate(resolve))
    active -= 1
    return { ok: true, json: async () => ({ data: [], metrics: [] }) }
  }
  await fetchFiscalAiHistorical(['AMZN', 'BE', 'CRWV'], { apiKey: 'test-only', fetchImpl })
  assert.equal(calls, 9)
  assert.ok(peak <= 6)
})

test('other US Market Map tickers use the documented ticker lookup without WiseSheets', async () => {
  const calls = []
  const result = await fetchFiscalAiHistorical(['HIMS'], {
    apiKey: 'test-only', fetchImpl: async (url) => {
      calls.push({ ticker: url.searchParams.get('ticker'), key: url.searchParams.get('companyKey') })
      return { ok: true, json: async () => ({ company: { companyKey: 'NYSE_HIMS' }, data: [] }) }
    },
  })
  assert.equal(result[0].companyKey, 'NYSE_HIMS')
  assert.equal(calls.length, 3)
  assert.ok(calls.every((call) => call.ticker === 'HIMS' && call.key === null))
})

test('Fiscal annual end date alone cannot masquerade as an exact calendar year', () => {
  const source = payload('IREN', 'income_statement_total_revenues', 100,
    { reportDate: '2025-06-30', fiscalYear: 2025 })
  const adapted = adaptFiscalAiObservations(source)
  assert.equal(adapted.observations.length, 1)
  assert.equal(adapted.observations[0].periodIdentity.periodStart, null)
  assert.equal(buildCalendarYear(adapted.observations, 2025).value, null)
})

test('Fiscal value with explicit dates still requires an SEC value and period match', () => {
  const source = payload('GEV', 'income_statement_total_revenues', 1_000_000_000)
  source.standardizedIncome.data[0].periodStart = '2025-01-01'
  const adapted = adaptFiscalAiObservations(source)
  const resolved = resolveFiscalAiWithSecMetric(adapted.observations, [], 'revenue')
  assert.equal(resolved.records[0].deduplicationStatus, 'REQUIRES_REVIEW')
  assert.ok(resolved.records[0].warnings.includes('FISCAL_AI_SEC_PERIOD_UNVERIFIED'))
})

test('a derived gross profit mapping without any cost component is rejected', () => {
  const source = payload('IREN', 'income_statement_gross_profit', 42_500_000,
    { reportDate: '2023-12-31', calcType: 'derived_lineitem', mappingType: 'total',
      components: [
        { metricName: 'Bitcoin Mining Revenue', value: 42_000_000 },
        { metricName: 'Other income', value: 500_000 },
      ] })
  const result = adaptFiscalAiObservations(source)
  assert.equal(result.observations.length, 0)
  assert.equal(result.failures[0].reason, 'FISCAL_AI_GROSS_PROFIT_REQUIRES_COST_COMPONENT')
})

test('Fiscal reported mapping retains filing accession, source components, and period authority from SEC', () => {
  const source = payload('GEV', 'income_statement_operating_profit', 1_000_000_000)
  const adapted = adaptFiscalAiObservations(source)
  const observation = adapted.observations[0]
  assert.equal(observation.reportedVsDerived, 'REPORTED')
  assert.equal(observation.accession, '0001996810-26-000015')
  const resolved = resolveFiscalAiWithSecMetric(adapted.observations,
    [secObservation('GEV', 'ebit', 1_000_000_000, '2025-01-01', '2025-12-31')], 'ebit')
  assert.equal(resolved.records[0].periodIdentity.periodStart, '2025-01-01')
  assert.equal(resolved.records[0].sourceProvider, 'Fiscal.ai')
  assert.equal(resolved.records[0].derivation.reconciliation.matches, true)
  assert.equal(buildCalendarYear(resolved.records, 2025).value, 1_000_000_000)
  const withoutProviderUrl = { ...observation, sourceUrl: null, accession: null }
  const urlFilled = resolveFiscalAiWithSecMetric([withoutProviderUrl],
    [secObservation('GEV', 'ebit', 1_000_000_000, '2025-01-01', '2025-12-31')], 'ebit')
  assert.equal(urlFilled.records[0].sourceUrl, secUrl)
  assert.equal(urlFilled.records[0].accession, '0001996810-26-000015')
})

test('GEV source-backed $42m adjusted EBITDA disagreement remains a diagnostic, not a provider override', () => {
  const source = { ticker: 'GEV', companyKey: 'NYSE_GEV', adjustedMetrics: { data: [
    { periodId: 'GEV-LTM-2026-06-30', periodType: 'LTM', reportDate: '2026-06-30',
      metricValues: { adjusted_ebitda: { value: 4_157_000_000, currency: 'USD', adjusted: true,
        sources: [{ originalSourceUrl: 'https://www.sec.gov/Archives/edgar/data/1996810/000199681026000147/gevpressrelease2q26.htm' }] } } },
  ] } }
  const candidates = fiscalAdjustedEbitdaCandidates(source)
  const result = compareFiscalAdjustedEbitda({ value: 4_115_000_000 }, candidates, '2026-06-30')
  assert.equal(result.difference, 42_000_000)
  assert.equal(result.reason, 'FISCAL_AI_SEC_VALUE_MISMATCH')
  assert.equal(result.secValue, 3_196_000_000 + 2_146_000_000 - 1_227_000_000)
})

test('IREN Capex prepayment mapping is rejected; material SEC disagreement fails closed', () => {
  const source = payload('IREN', 'cash_flow_statement_purchases_of_property_plant_and_equipment',
    -4_433_391_000, { reportDate: '2026-06-30', fiscalYear: 2026,
      calcType: 'derived_lineitem', mappingType: 'composite', components: [
        { metricName: 'Payments for property, plant and equipment, net of computer hardware', value: -2_998_006_000 },
        { metricName: 'Payments for computer hardware', value: -1_335_081_000 },
        { metricName: 'Payments for computer hardware prepayments', value: -100_304_000 },
      ] })
  const rejected = adaptFiscalAiObservations(source)
  assert.equal(rejected.observations.length, 0)
  assert.equal(rejected.failures[0].reason,
    'FISCAL_AI_CAPEX_PREPAYMENT_OVERLAP_REQUIRES_SEC_RECONCILIATION')
  source.standardizedCashFlow.data[0].metricsValues
    .cash_flow_statement_purchases_of_property_plant_and_equipment.asReportedValues.pop()
  const admitted = adaptFiscalAiObservations(source)
  const secCapex = 2_998_006_000 + 1_335_081_000
  assert.equal(admitted.observations[0].normalizedValue, 4_433_391_000)
  const resolved = resolveFiscalAiWithSecMetric(admitted.observations,
    [secObservation('IREN', 'capitalExpenditures', secCapex, '2025-07-01', '2026-06-30', PERIOD_TYPE.FISCAL_YEAR)],
    'capitalExpenditures')
  assert.equal(resolved.records[0].deduplicationStatus, 'REQUIRES_REVIEW')
  assert.equal(resolved.records[0].derivation.reconciliation.difference, 100_304_000)
  assert.equal(2_100_418_000 - secCapex, -2_232_669_000)
})

test('mixed PP&E and project-asset cash spending does not redefine cash PP&E Capex', () => {
  const filing = 'https://www.sec.gov/Archives/edgar/data/886128/000110465925122302/fcel-20251031x10k.htm'
  const source = payload('FCEL', 'cash_flow_statement_purchases_of_property_plant_and_equipment',
    -22_540_000, { reportDate: '2025-10-31', fiscalYear: 2025,
      calcType: 'derived_lineitem', mappingType: 'composite', components: [
        { metricName: 'Capital expenditures', value: -18_601_000, originalSourceUrl: filing },
        { metricName: 'Project asset expenditures', value: -3_939_000, originalSourceUrl: filing },
      ] })
  source.companyKey = 'NASDAQ_FCEL'
  const adapted = adaptFiscalAiObservations(source)
  assert.equal(adapted.observations.length, 0)
  assert.equal(adapted.failures[0].reason,
    'FISCAL_AI_CAPEX_PROJECT_ASSET_SCOPE_REQUIRES_SEC_RECONCILIATION')
  const sec = { ...secObservation('FCEL', 'capitalExpenditures', 18_601_000,
    '2024-11-01', '2025-10-31', PERIOD_TYPE.FISCAL_YEAR),
    sourceUrl: filing, accession: '0001104659-25-122302' }
  const resolved = resolveFiscalAiWithSecMetric(adapted.observations, [sec], 'capitalExpenditures')
  assert.equal(resolved.records[0].sourceProvider, 'SEC')
  assert.equal(resolved.records[0].normalizedValue, 18_601_000)
})

test('generic Fiscal EBITDA does not qualify as company-defined Adjusted EBITDA', () => {
  const source = { ticker: 'AMZN', companyKey: 'NASDAQ_AMZN', adjustedMetrics: { data: [
    { periodId: 'FY25', periodType: 'Annual', reportDate: '2025-12-31',
      metricValues: { adjusted_ebitda: { value: 1_000, adjusted: false, currency: 'USD', sources: [] } } },
  ] } }
  assert.deepEqual(fiscalAdjustedEbitdaCandidates(source), [])
})
