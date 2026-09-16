import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCalendarYear,
  buildLtm,
  buildWiseSheetsHistorical,
  completeWithSecExceptionQuarters,
  deduplicateEconomicQuarters,
  deriveStandaloneQuarters,
  normalizeQuarterRecord,
  PERIOD_TYPE,
  WISESHEETS_METRICS,
} from '../server/valuation/wiseSheetsFinancials.js'

function observation(ticker, metric, periodEnd, value, overrides = {}) {
  return {
    ticker, metric, periodEnd, value: String(value), unit: 'USD', currency: 'USD',
    periodType: 'STANDALONE_QUARTER', scope: 'CONSOLIDATED',
    fiscalYear: Number(periodEnd.slice(0, 4)), fiscalPeriod: overrides.fiscalPeriod ?? null,
    source: { kind: 'reported', tag: metric, accession: `fixture-${ticker}-${periodEnd}`,
      filingDate: periodEnd, filingUrl: `https://www.sec.gov/fixture/${ticker}/${periodEnd}` },
    ...overrides,
  }
}

function quarters(ticker, metric, ends, values, options = {}) {
  return values.map((value, index) => observation(ticker, metric, ends[index], value, {
    fiscalYear: options.fiscalYears?.[index] ?? Number(ends[index].slice(0, 4)),
    fiscalPeriod: `Q${options.fiscalQuarters?.[index] ?? index + 1}`,
    ...options.overrides,
  }))
}

const calendarEnds = (year) => [`${year}-03-31`, `${year}-06-30`, `${year}-09-30`, `${year}-12-31`]

test('uses the authenticated WiseSheets catalog metric keys', () => {
  assert.deepEqual(WISESHEETS_METRICS, {
    revenue: 'revenue', grossProfit: 'gross_profit',
    operatingCashFlow: 'net_cash_from_operating_activities',
    capitalExpenditures: 'total_capex', providerFreeCashFlow: 'free_cash_flow',
  })
})

test('normalizes every observation into the canonical schema with explicit period type', () => {
  const record = normalizeQuarterRecord(observation('NEW', 'revenue', '2024-06-29', 10, { fiscalPeriod: 'Q2' }))
  for (const key of ['ticker', 'metric', 'value', 'currency', 'units', 'sourceProvider', 'sourceId',
    'periodStart', 'periodEnd', 'periodType', 'fiscalYear', 'fiscalQuarter', 'filingDate', 'scope', 'confidence']) {
    assert.ok(Object.hasOwn(record, key), key)
  }
  assert.equal(record.periodType, PERIOD_TYPE.STANDALONE_QUARTER)
})

test('generic calendar engine handles December, June, August, and October fiscal calendars', () => {
  const cases = [
    ['DEC', calendarEnds(2024), [2024, 2024, 2024, 2024], [1, 2, 3, 4]],
    ['JUN', ['2024-03-31', '2024-06-30', '2024-09-30', '2024-12-31'], [2024, 2024, 2025, 2025], [3, 4, 1, 2]],
    ['AUG', ['2024-02-29', '2024-05-31', '2024-08-31', '2024-11-30'], [2024, 2024, 2024, 2025], [2, 3, 4, 1]],
    ['OCT', ['2024-01-31', '2024-04-30', '2024-07-31', '2024-10-31'], [2024, 2024, 2024, 2024], [2, 3, 4, 1]],
  ]
  for (const [ticker, ends, fiscalYears, fiscalQuarters] of cases) {
    const result = buildWiseSheetsHistorical(ticker, quarters(ticker, 'revenue', ends, [1, 2, 3, 4], { fiscalYears, fiscalQuarters }), [2024])
    assert.equal(result.calendarActuals.revenue[2024].value, 10, ticker)
  }
})

test('supports 52-week and 53-week economic quarter dates without manufactured month ends', () => {
  for (const [ticker, ends] of [
    ['W52', ['2024-03-30', '2024-06-29', '2024-09-28', '2024-12-28']],
    ['W53', ['2024-03-30', '2024-06-29', '2024-09-28', '2025-01-04']],
  ]) {
    const records = quarters(ticker, 'revenue', ends, [1, 2, 3, 4]).map(normalizeQuarterRecord)
    assert.equal(buildLtm(ticker, 'revenue', '2025-02-01', deduplicateEconomicQuarters(records)).value, 10)
    assert.deepEqual(records.map((record) => record.periodEnd), ends)
  }
})

test('deduplicates provider-normalized dates and preserves WiseSheets source priority', () => {
  const wise = normalizeQuarterRecord(observation('NEW', 'revenue', '2024-06-29', 20, { fiscalPeriod: 'Q2' }))
  const sec = normalizeQuarterRecord(observation('NEW', 'revenue', '2024-06-30', 19, {
    fiscalYear: 2025, fiscalPeriod: 'Q1', sourceProvider: 'SEC', sourceId: 'sec-source', source: { consolidated: true },
  }))
  const result = deduplicateEconomicQuarters([sec, wise])
  assert.equal(result.length, 1)
  assert.equal(result[0].sourceProvider, 'WiseSheets')
})

test('later comparative filing replaces an older duplicate from the same provider', () => {
  const older = normalizeQuarterRecord(observation('NEW', 'revenue', '2024-06-30', 10, { fiscalPeriod: 'Q2', source: { filingDate: '2024-07-20' } }))
  const later = normalizeQuarterRecord(observation('NEW', 'revenue', '2024-06-30', 11, { fiscalPeriod: 'Q2', source: { filingDate: '2025-07-20' } }))
  assert.equal(deduplicateEconomicQuarters([older, later])[0].normalizedValue, 11)
})

test('fails closed for a missing middle quarter and for a recent IPO', () => {
  for (const [ticker, ends] of [['GAP', ['2024-03-31', '2024-06-30', '2024-12-31', '2025-03-31']], ['IPO', ['2024-09-30', '2024-12-31']]]) {
    const result = buildWiseSheetsHistorical(ticker, quarters(ticker, 'revenue', ends, ends.map(() => 1)), [2024])
    assert.equal(result.calendarActuals.revenue[2024].value, null)
  }
})

test('LTM always uses the latest four available unique consecutive quarters', () => {
  const ends = [...calendarEnds(2024), '2025-03-31']
  const records = deduplicateEconomicQuarters(quarters('NEW', 'revenue', ends, [1, 2, 3, 4, 5], {
    fiscalYears: [2024, 2024, 2024, 2024, 2025], fiscalQuarters: [1, 2, 3, 4, 1],
  }).map(normalizeQuarterRecord))
  const ltm = buildLtm('NEW', 'revenue', '2025-04-01', records)
  assert.equal(ltm.value, 14)
  assert.equal(ltm.components.at(-1).quarterEnd, '2025-03-31')
})

test('cumulative 6M, 9M, and fiscal-year records derive standalone Q2, Q3, and Q4', () => {
  const records = [
    observation('NEW', 'revenue', '2024-03-31', 10, { fiscalPeriod: 'Q1' }),
    observation('NEW', 'revenue', '2024-06-30', 30, { periodType: 'YTD_6M', fiscalPeriod: 'Q2' }),
    observation('NEW', 'revenue', '2024-09-30', 60, { periodType: 'YTD_9M', fiscalPeriod: 'Q3' }),
    observation('NEW', 'revenue', '2024-12-31', 100, { periodType: 'FISCAL_YEAR', fiscalPeriod: 'Q4' }),
  ].map(normalizeQuarterRecord)
  const derived = deduplicateEconomicQuarters(deriveStandaloneQuarters(records))
  assert.deepEqual(derived.map((record) => record.normalizedValue), [10, 20, 30, 40])
  assert.equal(buildCalendarYear('NEW', 'revenue', 2024, derived).value, 100)
})

test('normalizes thousands and millions before arithmetic', () => {
  const records = calendarEnds(2024).map((end, index) => normalizeQuarterRecord(observation('NEW', 'revenue', end, index < 2 ? 1_000 : 1, {
    fiscalPeriod: `Q${index + 1}`, unit: index < 2 ? 'USD thousands' : 'USD millions',
  })))
  assert.equal(buildCalendarYear('NEW', 'revenue', 2024, deduplicateEconomicQuarters(records)).value, 4_000_000)
})

test('rejects segment scope and retains the consolidated record', () => {
  const segment = normalizeQuarterRecord(observation('NEW', 'revenue', '2024-03-31', 90, { fiscalPeriod: 'Q1', scope: 'SEGMENT' }))
  const consolidated = normalizeQuarterRecord(observation('NEW', 'revenue', '2024-03-31', 100, { fiscalPeriod: 'Q1', scope: 'CONSOLIDATED' }))
  const valid = deduplicateEconomicQuarters([segment, consolidated].filter((record) => record.scopeValid))
  assert.equal(valid.length, 1)
  assert.equal(valid[0].normalizedValue, 100)
})

test('retains UNKNOWN period classification but excludes it from production aggregates', () => {
  const unknown = normalizeQuarterRecord({ ticker: 'NEW', metric: 'revenue', periodEnd: '2024-03-31',
    value: 10, unit: 'USD', scope: 'CONSOLIDATED', source: { accession: 'unknown-period' } })
  assert.equal(unknown.periodType, PERIOD_TYPE.UNKNOWN)
  const result = buildWiseSheetsHistorical('NEW', [{ ...unknown, value: unknown.normalizedValue }], [2024])
  assert.equal(result.calendarActuals.revenue[2024].value, null)
})

test('fills only missing economic quarters from a generic SEC secondary ledger', () => {
  const primary = buildWiseSheetsHistorical('NEW', quarters('NEW', 'revenue', calendarEnds(2024).slice(0, 3), [1, 2, 3]), [2024])
  const secLedger = { revenue: [{
    normalizedValue: 4, originalReportedValue: 4, currency: 'USD', units: 'USD',
    quarterStart: '2024-10-01', quarterEnd: '2024-12-31', fiscalYear: 2024, fiscalQuarter: 'Q4',
    validationStatus: 'VERIFIED_EXACT', rawMetricLabel: 'Revenue', warnings: [],
    source: { provider: 'SEC', sourceId: 'sec-q4', consolidated: true, filingDate: '2025-02-01', sourceUrl: 'https://sec.gov/q4' },
  }] }
  const completed = completeWithSecExceptionQuarters('NEW', primary, secLedger, [2024])
  assert.equal(completed.calendarActuals.revenue[2024].value, 10)
  assert.equal(completed.calendarActuals.revenue[2024].provider, 'WiseSheets + SEC')
  assert.equal(completed.calendarActuals.revenue[2024].components.filter((item) => item.provider === 'SEC').length, 1)
})

test('derives FCF only from matched CFO and capex quarters and reconciles provider FCF', () => {
  const ends = ['2024-02-29', '2024-05-30', '2024-08-29', '2024-11-28']
  const observations = ends.flatMap((end, index) => [
    observation('MU', 'net_cash_from_operating_activities', end, [1219, 2482, 3405, 3244][index], { fiscalPeriod: `Q${index + 1}`, unit: 'USD millions' }),
    observation('MU', 'total_capex', end, [-1_384_000_000, -2_086_000_000, -3_120_000_000, -3_206_000_000][index], { fiscalPeriod: `Q${index + 1}`, unit: 'ratio', currency: null }),
    observation('MU', 'free_cash_flow', end, [-165_000_000, 396_000_000, 285_000_000, 38_000_000][index], { fiscalPeriod: `Q${index + 1}`, unit: 'ratio', currency: null }),
  ])
  const result = buildWiseSheetsHistorical('MU', observations, [2024])
  assert.equal(result.calendarActuals.operatingCashFlow[2024].value, 10_350_000_000)
  assert.equal(result.calendarActuals.capitalExpenditures[2024].value, 9_796_000_000)
  assert.equal(result.calendarActuals.freeCashFlow[2024].value, 554_000_000)
})

test('reproduces SEC-confirmed calendar-year revenue regression truths', () => {
  const fixtures = [
    ['GEV', 2024, [7_260_000_000, 8_204_000_000, 8_913_000_000, 10_558_000_000], 34_935_000_000, ['03-31', '06-30', '09-30', '12-31']],
    ['GEV', 2025, [8_032_000_000, 9_111_000_000, 9_969_000_000, 10_956_000_000], 38_068_000_000, ['03-31', '06-30', '09-30', '12-31']],
    ['INTC', 2024, [12_724_000_000, 12_833_000_000, 13_284_000_000, 14_260_000_000], 53_101_000_000, ['03-30', '06-29', '09-28', '12-28']],
    ['MSFT', 2024, [61_858_000_000, 64_727_000_000, 65_585_000_000, 69_632_000_000], 261_802_000_000, ['03-31', '06-30', '09-30', '12-31']],
    ['BE', 2024, [235_298_000, 335_767_000, 330_399_000, 572_392_000], 1_473_856_000, ['03-31', '06-30', '09-30', '12-31']],
  ]
  for (const [ticker, year, values, expected, suffixes] of fixtures) {
    const ends = suffixes.map((suffix) => `${year}-${suffix}`)
    const result = buildWiseSheetsHistorical(ticker, quarters(ticker, 'revenue', ends, values), [year])
    assert.equal(result.calendarActuals.revenue[year].value, expected, ticker)
  }
})

test('known period-normalization failures remain generic regression fixtures', () => {
  const fixtures = [
    ['FCEL', ['2025-01-31', '2025-04-30', '2025-07-31', '2025-10-31', '2026-01-31', '2026-04-30', '2026-07-31'],
      [18_997_000, 37_406_000, 46_743_000, 55_016_000, 30_531_000, 35_589_000, 33_001_000], 158_162_000, 154_137_000],
    ['CRWV', ['2025-03-31', '2025-06-30', '2025-09-30', '2025-12-31', '2026-03-31'],
      [982_000_000, 1_212_788_000, 1_364_676_000, 1_571_536_000, 2_078_000_000], 5_131_000_000, 6_227_000_000],
    ['BE', ['2025-03-31', '2025-06-30', '2025-09-30', '2025-12-31', '2026-03-31'],
      [326_021_000, 401_242_000, 519_048_000, 777_683_000, 751_054_000], 2_023_994_000, 2_449_027_000],
    ['IREN', ['2025-03-31', '2025-06-30', '2025-09-30', '2025-12-31', '2026-03-31', '2026-06-30'],
      [144_823_000, 187_292_000, 240_295_000, 184_692_000, 144_795_000, 137_225_000], 757_102_000, 707_007_000],
    ['MU', ['2025-08-28', '2025-11-27', '2026-02-26', '2026-05-28'],
      [11_315_000_000, 13_643_000_000, 23_860_000_000, 41_456_000_000], null, 90_274_000_000],
  ]
  for (const [ticker, ends, values, cy2025, expectedLtm] of fixtures) {
    const records = values.map((value, index) => observation(ticker, 'revenue', ends[index], value, {
      fiscalYear: Number(ends[index].slice(0, 4)), fiscalPeriod: `Q${index % 4 + 1}`,
    }))
    const result = buildWiseSheetsHistorical(ticker, records, [2025])
    if (cy2025 != null) assert.equal(result.calendarActuals.revenue[2025].value, cy2025, `${ticker} CY2025`)
    assert.equal(result.ltm.revenue.value, expectedLtm, `${ticker} LTM`)
  }
})
