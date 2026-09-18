import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  adaptSecCanonicalFinancials,
  buildSecEnrichedFinancialsShadow,
  compareSecFinancialsShadow,
  loadTargetedSecFinancialCompletion,
  renderSecFinancialsShadowReport,
  resolveLatestReportedFinancialPeriod,
  resolveWiseSheetsWithSecMetric,
  requiredPeriodKey,
  requiredSecCompletionPeriods,
  SEC_CANONICAL_METRICS,
  SEC_GAAP_METRIC_DEFINITIONS,
} from '../server/valuation/secCanonicalFinancials.js'
import { adaptWiseSheetsObservations } from '../server/valuation/wiseSheetsCanonicalShadow.js'
import { DATE_AUTHORITY, OPERATION_SCOPE, PERIOD_TYPE } from '../server/valuation/canonicalFinancialObservation.js'
import { CY_CLASSIFICATION, HISTORICAL_RESULT_STATUS } from '../server/valuation/historicalPeriodEngine.js'
import { extractStructuredFinancialTableFacts } from '../server/valuation/filingFactExtractor.js'

const company = { ticker: 'TEST', cik: '0000000001', name: 'Test Company' }
const secGolden = JSON.parse(readFileSync(
  new URL('./fixtures/valuation-sec-financials-golden.json', import.meta.url),
  'utf8',
))

function fact(start, end, val, options = {}) {
  return {
    start,
    end,
    val,
    fp: options.fp ?? 'Q1',
    fy: options.fy ?? Number(end.slice(0, 4)),
    form: options.form ?? '10-Q',
    filed: options.filed ?? `${Number(end.slice(0, 4))}-05-01`,
    accn: options.accn ?? `0000000001-24-${end.replaceAll('-', '').slice(-6)}`,
    ...(options.segment ? { segment: options.segment } : {}),
  }
}

function factsByConcept(concepts) {
  return {
    cik: company.cik,
    facts: {
      'us-gaap': Object.fromEntries(Object.entries(concepts).map(([concept, entries]) => [concept, {
        label: concept,
        units: { USD: entries },
      }])),
    },
  }
}

function wiseRow(metric, start, end, value, fp = 'Q1', fy = Number(end.slice(0, 4))) {
  return {
    ticker: company.ticker,
    cik: company.cik,
    metric,
    periodStart: start,
    periodEnd: end,
    fiscalYear: fy,
    fiscalPeriod: fp,
    dateAuthority: DATE_AUTHORITY.REPORTED,
    value,
    unit: 'USD',
    source: { kind: 'reported' },
  }
}

test('generic SEC adapter exposes only approved GAAP metrics and never Adjusted EBITDA', () => {
  assert.deepEqual(SEC_CANONICAL_METRICS, [
    'revenue', 'grossProfit', 'ebit', 'operatingCashFlow', 'capitalExpenditures', 'freeCashFlow',
  ])
  assert.equal(Object.hasOwn(SEC_GAAP_METRIC_DEFINITIONS, 'adjustedEbitda'), false)
  assert.equal(SEC_GAAP_METRIC_DEFINITIONS.ebit.definitionFingerprint,
    'CANONICAL_CONSOLIDATED_GAAP_OPERATING_INCOME')
  assert.equal(SEC_GAAP_METRIC_DEFINITIONS.ebit.providerMetric, null)
})

test('direct SEC annual operating income produces reported calendar-year EBIT', () => {
  const facts = factsByConcept({
    OperatingIncomeLoss: [fact('2024-01-01', '2024-12-31', 400, {
      fp: 'FY', form: '10-K', filed: '2025-02-14', accn: 'annual-ebit',
    })],
  })
  const result = buildSecEnrichedFinancialsShadow({
    ticker: company.ticker, company, facts, wiseSheetsRows: [], years: [2024], asOfDate: '2025-03-01',
  })
  assert.equal(result.calendarActuals.ebit[2024].value, 400)
  assert.equal(result.calendarActuals.ebit[2024].classification, CY_CLASSIFICATION.REPORTED_CALENDAR_YEAR)
  assert.equal(result.calendarActuals.ebit[2024].status, HISTORICAL_RESULT_STATUS.VERIFIED_REPORTED)
  assert.equal(result.calendarActuals.ebit[2024].components[0].accession, 'annual-ebit')
})

test('four exact SEC quarters produce exact calendar-year and LTM EBIT', () => {
  const facts = factsByConcept({
    OperatingIncomeLoss: [
      fact('2024-01-01', '2024-03-31', 10, { fp: 'Q1', filed: '2024-04-25' }),
      fact('2024-04-01', '2024-06-30', 20, { fp: 'Q2', filed: '2024-07-25' }),
      fact('2024-07-01', '2024-09-30', 30, { fp: 'Q3', filed: '2024-10-25' }),
      fact('2024-10-01', '2024-12-31', 40, { fp: 'Q4', filed: '2025-01-25' }),
    ],
  })
  const result = buildSecEnrichedFinancialsShadow({
    ticker: company.ticker, company, facts, wiseSheetsRows: [], years: [2024], asOfDate: '2025-03-01',
  })
  assert.equal(result.calendarActuals.ebit[2024].value, 100)
  assert.equal(result.calendarActuals.ebit[2024].classification, CY_CLASSIFICATION.EXACT_FROM_CALENDAR_QUARTERS)
  assert.equal(result.calendarActuals.ebit[2024].status, HISTORICAL_RESULT_STATUS.VERIFIED_DERIVED)
  assert.equal(result.ltm.ebit.value, 100)
  assert.equal(result.ltm.ebit.status, HISTORICAL_RESULT_STATUS.VERIFIED_DERIVED)
})

test('off-calendar reported quarters produce calendarized-estimate EBIT', () => {
  const facts = factsByConcept({
    OperatingIncomeLoss: [
      fact('2023-11-01', '2024-01-31', 10, { fp: 'Q1', fy: 2024, filed: '2024-03-01' }),
      fact('2024-02-01', '2024-04-30', 20, { fp: 'Q2', fy: 2024, filed: '2024-06-01' }),
      fact('2024-05-01', '2024-07-31', 30, { fp: 'Q3', fy: 2024, filed: '2024-09-01' }),
      fact('2024-08-01', '2024-10-31', 40, { fp: 'Q4', fy: 2024, filed: '2024-12-01' }),
      fact('2024-11-01', '2025-01-31', 50, { fp: 'Q1', fy: 2025, filed: '2025-03-01' }),
    ],
  })
  const result = buildSecEnrichedFinancialsShadow({
    ticker: company.ticker, company: { ...company, fiscalYearEnd: '1031' }, facts,
    wiseSheetsRows: [], years: [2024], asOfDate: '2025-03-15',
  })
  assert.equal(result.calendarActuals.ebit[2024].classification, CY_CLASSIFICATION.CALENDARIZED_ESTIMATE)
  assert.equal(result.calendarActuals.ebit[2024].status, HISTORICAL_RESULT_STATUS.VERIFIED_DERIVED)
  assert.ok(result.calendarActuals.ebit[2024].value > 0)
})

test('incomplete EBIT quarter coverage fails closed and targets its missing period', () => {
  const facts = factsByConcept({
    OperatingIncomeLoss: [
      fact('2024-01-01', '2024-03-31', 10, { fp: 'Q1', filed: '2024-04-25' }),
      fact('2024-07-01', '2024-09-30', 30, { fp: 'Q3', filed: '2024-10-25' }),
      fact('2024-10-01', '2024-12-31', 40, { fp: 'Q4', filed: '2025-01-25' }),
    ],
  })
  const result = buildSecEnrichedFinancialsShadow({
    ticker: company.ticker, company, facts, wiseSheetsRows: [], years: [2024], asOfDate: '2025-03-01',
  })
  assert.equal(result.calendarActuals.ebit[2024].value, null)
  assert.equal(result.calendarActuals.ebit[2024].status, HISTORICAL_RESULT_STATUS.INSUFFICIENT_PERIOD_COVERAGE)
  const required = requiredSecCompletionPeriods(result, [2024])
  assert.ok(required.some((item) => item.metric === 'ebit' && item.purpose === '2024A' &&
    item.periodStart === '2024-04-01' && item.periodEnd === '2024-06-30'))
})

test('negative reported operating income remains a valid EBIT observation', () => {
  const facts = factsByConcept({
    OperatingIncomeLoss: [fact('2024-01-01', '2024-12-31', -125, {
      fp: 'FY', form: '10-K', filed: '2025-02-14', accn: 'loss-ebit',
    })],
  })
  const result = buildSecEnrichedFinancialsShadow({
    ticker: company.ticker, company, facts, wiseSheetsRows: [], years: [2024], asOfDate: '2025-03-01',
  })
  assert.equal(result.calendarActuals.ebit[2024].value, -125)
  assert.equal(result.calendarActuals.ebit[2024].status, HISTORICAL_RESULT_STATUS.VERIFIED_REPORTED)
})

test('Alphabet 2024 SEC annual fixture resolves canonical EBIT with accession provenance', () => {
  const alphabet = { ticker: 'GOOGL', cik: '0001652044', name: 'Alphabet Inc.' }
  const facts = {
    cik: alphabet.cik,
    facts: { 'us-gaap': { OperatingIncomeLoss: { label: 'Income From Operations', units: { USD: [
      fact('2024-01-01', '2024-12-31', 112_390_000_000, {
        fp: 'FY', fy: 2024, form: '10-K', filed: '2025-02-05', accn: '0001652044-25-000014',
      }),
    ] } } } },
  }
  const result = buildSecEnrichedFinancialsShadow({
    ticker: alphabet.ticker, company: alphabet, facts, wiseSheetsRows: [], years: [2024], asOfDate: '2025-03-01',
  })
  assert.equal(result.calendarActuals.ebit[2024].value, 112_390_000_000)
  assert.equal(result.calendarActuals.ebit[2024].status, HISTORICAL_RESULT_STATUS.VERIFIED_REPORTED)
  assert.equal(result.calendarActuals.ebit[2024].components[0].accession, '0001652044-25-000014')
  assert.match(result.calendarActuals.ebit[2024].components[0].sourceUrl, /^https:\/\/data\.sec\.gov\//)
})

for (const regression of [
  { ticker: 'GOOGL', fullYear: 140_000_000_000, currentYtd: 80_000_000_000, priorYtd: 72_372_000_000, expected: 147_628_000_000 },
  { ticker: 'GEV', fullYear: 1_600_000_000, currentYtd: 900_000_000, priorYtd: 700_000_000, expected: 1_800_000_000 },
  { ticker: 'CRWV', fullYear: -500_000_000, currentYtd: -100_000_000, priorYtd: -369_000_000, expected: -231_000_000 },
  { ticker: 'NBIS', fullYear: -738_000_000, currentYtd: -300_000_000, priorYtd: -353_900_000, expected: -684_100_000 },
]) {
  test(`${regression.ticker} LTM EBIT regression uses the generic FY plus comparable H1 bridge`, () => {
    const fixtureCompany = { ticker: regression.ticker, cik: '0000000001', name: regression.ticker, fiscalYearEnd: '1231' }
    const facts = factsByConcept({ OperatingIncomeLoss: [
      fact('2025-01-01', '2025-12-31', regression.fullYear,
        { fp: 'FY', fy: 2025, form: '10-K', filed: '2026-02-15', accn: `${regression.ticker}-fy` }),
      fact('2025-01-01', '2025-06-30', regression.priorYtd,
        { fp: 'Q2', fy: 2025, form: '10-Q', filed: '2025-07-30', accn: `${regression.ticker}-h1-prior` }),
      fact('2026-01-01', '2026-06-30', regression.currentYtd,
        { fp: 'Q2', fy: 2026, form: '10-Q', filed: '2026-07-30', accn: `${regression.ticker}-h1-current` }),
    ] })
    const result = buildSecEnrichedFinancialsShadow({
      ticker: regression.ticker, company: fixtureCompany, facts,
      wiseSheetsRows: [], years: [2025], asOfDate: '2026-08-01',
    })
    assert.equal(result.ltm.ebit.value, regression.expected)
    assert.equal(result.ltm.ebit.derivation, 'FY_PLUS_CURRENT_YTD_MINUS_PRIOR_YTD')
  })
}

test('EBIT accepts IFRS operating profit and a clear extension but rejects adjusted or segment facts', () => {
  const annual = { fp: 'FY', form: '20-F', filed: '2025-03-01' }
  const facts = {
    cik: company.cik,
    facts: {
      'ifrs-full': {
        ProfitLossFromOperatingActivities: { label: 'Profit from operating activities', units: { USD: [
          fact('2023-01-01', '2023-12-31', 30, { ...annual, fy: 2023, accn: 'ifrs-ebit' }),
        ] } },
      },
      testco: {
        ConsolidatedOperatingProfit: { label: 'Operating profit', units: { USD: [
          fact('2024-01-01', '2024-12-31', 40, { ...annual, fy: 2024, accn: 'extension-ebit' }),
        ] } },
        LossFromOperations: { label: 'Loss from operations', units: { USD: [
          fact('2025-01-01', '2025-12-31', -45, { ...annual, fy: 2025, accn: 'loss-from-operations' }),
        ] } },
        AdjustedOperatingIncome: { label: 'Adjusted operating income', units: { USD: [
          fact('2025-01-01', '2025-12-31', 50, { ...annual, fy: 2025, accn: 'adjusted-rejected' }),
        ] } },
      },
      'us-gaap': {
        OperatingIncomeLoss: { label: 'Operating Income (Loss)', units: { USD: [
          fact('2025-01-01', '2025-12-31', 60, { ...annual, fy: 2025, accn: 'segment-rejected', segment: true }),
        ] } },
      },
    },
  }
  const result = adaptSecCanonicalFinancials({ company, facts, metrics: ['ebit'] })
  assert.deepEqual(result.observations.map((item) => item.normalizedValue), [30, 40, -45])
})

test('selected restatement supplies value and fiscal metadata from the same latest observation', () => {
  const facts = factsByConcept({
    Revenues: [
      fact('2024-01-01', '2024-03-31', 100, { fy: 2023, filed: '2024-05-01', accn: 'old' }),
      fact('2024-01-01', '2024-03-31', 110, { fy: 2024, filed: '2024-08-01', accn: 'new' }),
    ],
  })
  const result = adaptSecCanonicalFinancials({ company, facts, metrics: ['revenue'] })
  assert.equal(result.observations.length, 1)
  assert.equal(result.observations[0].normalizedValue, 110)
  assert.equal(result.observations[0].periodIdentity.fiscalYear, 2024)
  assert.equal(result.observations[0].accession, 'new')
})

test('as-of filter rejects facts and reported periods not public by the requested date', () => {
  const facts = factsByConcept({
    Revenues: [
      fact('2024-01-01', '2024-03-31', 100, { filed: '2024-05-01' }),
      fact('2024-04-01', '2024-06-30', 200, { fp: 'Q2', filed: '2024-08-01' }),
    ],
  })
  const filings = { filings: [{
    cik: company.cik, form: '10-Q', reportDate: '2024-06-30', filingDate: '2024-08-01',
    accessionNumber: 'future', secUrl: 'https://www.sec.gov/future.htm',
  }] }
  const result = adaptSecCanonicalFinancials({ company, facts, filings, metrics: ['revenue'], asOfDate: '2024-06-01' })
  assert.deepEqual(result.observations.map((item) => item.normalizedValue), [100])
  const latest = resolveLatestReportedFinancialPeriod('revenue', result.observations, filings, '2024-06-01')
  assert.equal(latest.periodEnd, '2024-03-31')
})

test('latest reported period rejects a financial-table period ending after its filing date', () => {
  const observations = [{
    metric: 'ebit', form: '10-Q', filingDate: '2026-07-23', sourceId: 'forecast-column',
    periodIdentity: { periodEnd: '2026-12-31' },
  }, {
    metric: 'ebit', form: '10-Q', filingDate: '2026-07-23', sourceId: 'reported-h1',
    periodIdentity: { periodEnd: '2026-06-30' },
  }]
  const latest = resolveLatestReportedFinancialPeriod('ebit', observations, null, '2026-09-17')
  assert.equal(latest.periodEnd, '2026-06-30')
  assert.equal(latest.sourceId, 'reported-h1')
})

test('targeted 8-K loader accepts an explicit XBRL duration context and does not use filing date as period end', async () => {
  const filings = {
    company: { ...company, fiscalYearEnd: '1231' },
    filings: [{
      cik: company.cik,
      form: '8-K',
      reportDate: '2026-07-28',
      filingDate: '2026-07-28',
      accessionNumber: '0000000001-26-000002',
      primaryDocument: 'form8-k.htm',
      secUrl: 'https://www.sec.gov/form8-k.htm',
    }],
  }
  const html = `
    <xbrli:context id="q2"><xbrli:entity><xbrli:identifier scheme="x">1</xbrli:identifier></xbrli:entity>
      <xbrli:period><xbrli:startDate>2026-04-01</xbrli:startDate><xbrli:endDate>2026-06-30</xbrli:endDate></xbrli:period>
    </xbrli:context>
    <xbrli:unit id="USD"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>
    <ix:nonFraction name="us-gaap:GrossProfit" contextRef="q2" unitRef="USD" decimals="0">250</ix:nonFraction>`
  const result = await loadTargetedSecFinancialCompletion({
    company,
    facts: { facts: {} },
    filings,
    metrics: ['grossProfit'],
    asOfDate: '2026-08-01',
    fetchText: async (url) => url.includes('earnings') ? html : '',
    hydrateExhibits: async (filing) => ({
      ...filing,
      exhibits: [{ url: 'https://www.sec.gov/earnings.htm', isLikelyEarningsExhibit: true }],
    }),
  })
  const record = result.records.find((item) => item.metricCandidates.includes('grossProfit'))
  assert.equal(record.startDate, '2026-04-01')
  assert.equal(record.endDate, '2026-06-30')
  assert.notEqual(record.endDate, filings.filings[0].filingDate)
})

test('targeted 6-K/8-K filings after as-of date are never fetched', async () => {
  let requests = 0
  const result = await loadTargetedSecFinancialCompletion({
    company,
    facts: { facts: {} },
    filings: { filings: [{
      cik: company.cik, form: '6-K', reportDate: '2026-06-30', filingDate: '2026-08-15',
      accessionNumber: 'future', secUrl: 'https://www.sec.gov/future-6k.htm',
    }] },
    metrics: ['revenue'],
    asOfDate: '2026-08-01',
    fetchText: async () => { requests += 1; return '' },
  })
  assert.equal(requests, 0)
  assert.equal(result.filings.length, 0)
})

test('non-inline-XBRL earnings exhibit maps only explicit duration and end-date labels', async () => {
  const filings = { company: { ...company, fiscalYearEnd: '1231' }, filings: [{
    cik: company.cik, form: '6-K', reportDate: '2026-08-12', filingDate: '2026-08-12',
    accessionNumber: '0001104659-26-094568', primaryDocument: 'form6-k.htm',
    secUrl: 'https://www.sec.gov/form6-k.htm',
  }] }
  const html = `<body>All dollar amounts are presented in millions, unless otherwise noted.
    <table><tr><th>USD millions</th><th>Three Months Ended June 30, 2026</th><th>Six Months Ended June 30, 2026</th></tr>
    <tr><td>Revenues</td><td>582.3</td><td>981.3</td></tr>
    <tr><td>Purchases of property and equipment</td><td>(5657.4)</td><td>(8130.3)</td></tr></table></body>`
  const result = await loadTargetedSecFinancialCompletion({
    company, facts: { facts: {} }, filings, metrics: ['revenue', 'capitalExpenditures'],
    asOfDate: '2026-08-13', fetchText: async (url) => url.includes('earnings') ? html : '',
    hydrateExhibits: async (filing) => ({ ...filing,
      exhibits: [{ url: 'https://www.sec.gov/earnings.htm', isLikelyEarningsExhibit: true }] }),
  })
  const revenueQuarter = result.records.find((item) => item.metricCandidates.includes('revenue') && item.periodType === 'QUARTER')
  assert.equal(revenueQuarter.endDate, '2026-06-30')
  assert.equal(revenueQuarter.dateAuthority, DATE_AUTHORITY.DERIVED_FROM_REPORTED_BOUNDARIES)
  assert.equal(revenueQuarter.explicitPeriodMapping, true)
  const canonical = adaptSecCanonicalFinancials({
    company, facts: { facts: {} }, filings, supplementalFacts: result.records,
    metrics: ['revenue', 'capitalExpenditures'], asOfDate: '2026-08-13',
  })
  const latest = resolveLatestReportedFinancialPeriod('revenue', canonical.observations, filings, '2026-08-13')
  assert.equal(latest.periodEnd, '2026-06-30')
  assert.equal(latest.evidenceType, 'EARNINGS_EXHIBIT_PERIOD')
})

test('explicit H1 earnings-exhibit periods remain available for FY plus YTD LTM bridges', () => {
  const fixtureCompany = { ticker: 'FOREIGN', cik: '0001513845', name: 'Foreign Issuer', fiscalYearEnd: '1231' }
  const filing = {
    id: 'h1-results', form: '6-K', accessionNumber: 'h1-results', filingDate: '2026-08-12',
    reportDate: '2026-06-30', filingUrl: 'https://www.sec.gov/h1-results.htm', immutableSourceId: 'SEC:1513845:h1-results',
  }
  const html = `<body><p>USD millions</p><h3>Consolidated results</h3><table>
    <tr><th></th><th>Six months ended June 30, 2026</th><th>Six months ended June 30, 2025</th></tr>
    <tr><td>Gross profit</td><td>850.0</td><td>207.3</td></tr>
    <tr><td>Operating loss</td><td>(300.0)</td><td>(353.9)</td></tr>
    <tr><td>Net cash provided by operating activities, continuing operations</td><td>5,000.0</td><td>143.9</td></tr>
    </table></body>`
  const supplementalFacts = extractStructuredFinancialTableFacts({ company: fixtureCompany, filing, html })
  assert.ok(supplementalFacts.every((item) => item.explicitPeriodMapping === true))
  assert.deepEqual([...new Set(supplementalFacts.map((item) => item.periodType))], ['YTD_6M'])
  const annualFacts = {
    cik: fixtureCompany.cik,
    facts: { 'us-gaap': {
      GrossProfit: { label: 'Gross profit', units: { USD: [fact('2025-01-01', '2025-12-31', 363_600_000,
        { fp: 'FY', fy: 2025, form: '20-F', filed: '2026-04-30', accn: 'fy25' })] } },
      OperatingIncomeLoss: { label: 'Operating loss', units: { USD: [fact('2025-01-01', '2025-12-31', -738_000_000,
        { fp: 'FY', fy: 2025, form: '20-F', filed: '2026-04-30', accn: 'fy25' })] } },
      NetCashProvidedByUsedInOperatingActivitiesContinuingOperations: { label: 'Net cash from operating activities, continuing operations',
        units: { USD: [fact('2025-01-01', '2025-12-31', 401_900_000,
          { fp: 'FY', fy: 2025, form: '20-F', filed: '2026-04-30', accn: 'fy25' })] } },
    } },
  }
  const result = buildSecEnrichedFinancialsShadow({
    ticker: fixtureCompany.ticker, company: fixtureCompany, facts: annualFacts,
    filings: { company: fixtureCompany, filings: [filing] }, supplementalFacts,
    wiseSheetsRows: [], years: [2025], asOfDate: '2026-08-13',
  })
  assert.equal(result.records.grossProfit.filter((item) => item.periodIdentity.periodType === PERIOD_TYPE.YTD_6M).length, 2)
  assert.equal(result.ltm.grossProfit.value, 1_006_300_000)
  assert.equal(result.ltm.ebit.value, -684_100_000)
  assert.equal(result.ltm.operatingCashFlow.value, 5_258_000_000)
  for (const metric of ['grossProfit', 'ebit', 'operatingCashFlow']) {
    assert.equal(result.ltm[metric].derivation, 'FY_PLUS_CURRENT_YTD_MINUS_PRIOR_YTD')
    assert.equal(result.ltm[metric].components.length, 3)
    assert.ok(result.ltm[metric].components.every((item) => item.sourceUrl))
  }
})

test('an earnings filing date and FY label cannot manufacture a financial period end', async () => {
  const filings = { company: { ...company, fiscalYearEnd: '0630' }, filings: [{
    cik: company.cik, form: '8-K', reportDate: '2026-07-29', filingDate: '2026-07-29',
    accessionNumber: 'msft-like', secUrl: 'https://www.sec.gov/msft-like.htm',
  }] }
  const html = '<p>USD millions</p><table><tr><th>Metric</th><th>FY2026</th></tr><tr><td>Revenue</td><td>100</td></tr></table>'
  const loaded = await loadTargetedSecFinancialCompletion({
    company: { ...company, fiscalYearEnd: '0630' }, facts: { facts: {} }, filings, metrics: ['revenue'],
    requiredPeriods: [{ metric: 'revenue', periodEnd: '2026-06-30' }], fetchText: async () => html,
  })
  const canonical = adaptSecCanonicalFinancials({ company, facts: { facts: {} }, filings,
    supplementalFacts: loaded.records, metrics: ['revenue'] })
  const latest = resolveLatestReportedFinancialPeriod('revenue', canonical.observations, filings)
  assert.notEqual(latest.periodEnd, '2026-07-29')
})

test('explicit year-ended exhibit text supplies its stated period end', async () => {
  const filings = { company: { ...company, fiscalYearEnd: '0630' }, filings: [{
    cik: company.cik, form: '8-K', reportDate: '2026-07-29', filingDate: '2026-07-29',
    accessionNumber: 'explicit-year', secUrl: 'https://www.sec.gov/explicit-year.htm',
  }] }
  const html = '<p>USD millions</p><table><tr><th>Metric</th><th>Year ended June 30, 2026</th></tr><tr><td>Revenue</td><td>100</td></tr></table>'
  const loaded = await loadTargetedSecFinancialCompletion({ company, facts: { facts: {} }, filings,
    metrics: ['revenue'], requiredPeriods: [{ metric: 'revenue', periodEnd: '2026-06-30' }], fetchText: async () => html })
  assert.equal(loaded.records[0].endDate, '2026-06-30')
})

test('gap-driven completion targets an older filing even when newer SEC facts exist', async () => {
  const filings = { filings: [
    { cik: company.cik, form: '10-Q', reportDate: '2026-06-30', filingDate: '2026-07-30', accessionNumber: 'new', secUrl: 'https://www.sec.gov/new.htm' },
    { cik: company.cik, form: '10-Q', reportDate: '2025-09-30', filingDate: '2025-10-30', accessionNumber: 'gap', secUrl: 'https://www.sec.gov/gap.htm' },
  ] }
  const requested = []
  const result = await loadTargetedSecFinancialCompletion({ company,
    facts: factsByConcept({ Revenues: [fact('2026-04-01', '2026-06-30', 10, { fp: 'Q2', fy: 2026 })] }),
    filings, metrics: ['revenue'], requiredPeriods: [{ metric: 'revenue', periodEnd: '2025-09-30' }],
    fetchText: async (url) => { requested.push(url); return '' },
  })
  assert.deepEqual(result.filings.map((item) => item.accessionNumber), ['gap'])
  assert.deepEqual(requested, ['https://www.sec.gov/gap.htm'])
})

test('per-period filing cap cannot crowd out the older filing that covers the required gap', async () => {
  const newer = Array.from({ length: 12 }, (_, index) => ({
    cik: company.cik, form: '6-K', reportDate: '2025-12-31', filingDate: `2026-01-${String(index + 1).padStart(2, '0')}`,
    accessionNumber: `newer-${index}`, description: 'General corporate update', secUrl: `https://www.sec.gov/newer-${index}.htm`,
  }))
  const requiredEarnings = {
    cik: company.cik, form: '6-K', reportDate: '2025-10-31', filingDate: '2025-11-10',
    accessionNumber: 'required-earnings', description: 'Quarterly financial results',
    secUrl: 'https://www.sec.gov/required-earnings.htm',
  }
  const loaded = await loadTargetedSecFinancialCompletion({
    company, facts: { facts: {} }, filings: { filings: [...newer, requiredEarnings] }, metrics: ['grossProfit'],
    requiredPeriods: [{ metric: 'grossProfit', purpose: '2025A', gapStart: '2025-08-01', gapEnd: '2025-10-31', periodEnd: '2025-10-31' }],
    maxFilings: 1, fetchText: async () => '',
  })
  assert.deepEqual(loaded.filings.map((item) => item.accessionNumber), ['required-earnings'])
})

test('dated issuer 6-K primary document is prioritized as an earnings-period discovery candidate', async () => {
  const generic = Array.from({ length: 8 }, (_, index) => ({
    cik: company.cik, form: '6-K', reportDate: '2026-02-15', filingDate: `2026-02-${String(index + 15).padStart(2, '0')}`,
    accessionNumber: `generic-${index}`, primaryDocument: `tm${index}_6k.htm`, secUrl: `https://www.sec.gov/generic-${index}.htm`,
  }))
  const earnings = {
    cik: company.cik, form: '6-K', reportDate: '2026-03-31', filingDate: '2026-05-20',
    accessionNumber: 'dated-issuer-results', primaryDocument: 'issuer-20260331x6k.htm',
    secUrl: 'https://www.sec.gov/dated-issuer-results.htm',
  }
  const loaded = await loadTargetedSecFinancialCompletion({
    company, facts: { facts: {} }, filings: { filings: [...generic, earnings] }, metrics: ['revenue'],
    requiredPeriods: [{ metric: 'revenue', purpose: 'LTM', periodEnd: '2025-12-31' }],
    maxFilings: 1, fetchText: async () => '',
  })
  assert.deepEqual(loaded.filings.map((item) => item.accessionNumber), ['dated-issuer-results'])
})

test('explicit year-ended and three-month table headers establish deterministic boundaries', () => {
  const filing = {
    id: 'explicit-periods', form: '6-K', accessionNumber: 'explicit-periods', filingDate: '2026-08-12',
    reportDate: '2026-08-12', filingUrl: 'https://www.sec.gov/explicit-periods.htm', immutableSourceId: 'SEC:1:explicit-periods',
  }
  const html = `<body><p>USD millions</p>
    <table><tr><th>Metric</th><th colspan="2">Year ended December 31</th></tr>
      <tr><th></th><th>2023</th><th>2024</th></tr>
      <tr><td>Revenue</td><td>9.8</td><td>91.5</td></tr>
      <tr><td>Cost of revenue</td><td>19.6</td><td>43.7</td></tr></table>
    <table><tr><th>Metric</th><th>Three months ended December 31</th></tr>
      <tr><th></th><th>2025</th></tr><tr><td>Revenue</td><td>227.7</td></tr></table></body>`
  const records = extractStructuredFinancialTableFacts({ company: { ...company, fiscalYearEnd: '1231' }, filing, html })
  const annual2024 = records.find((item) => item.metricCandidates.includes('revenue') && item.endDate === '2024-12-31')
  const q4 = records.find((item) => item.metricCandidates.includes('revenue') && item.endDate === '2025-12-31')
  assert.equal(annual2024.startDate, '2024-01-01')
  assert.equal(annual2024.periodType, 'CALENDAR_YEAR')
  assert.equal(annual2024.dateAuthority, DATE_AUTHORITY.DERIVED_FROM_REPORTED_BOUNDARIES)
  assert.equal(annual2024.explicitPeriodMapping, true)
  assert.equal(q4.startDate, '2025-10-01')
  assert.equal(q4.periodType, 'QUARTER')
  assert.equal(q4.dateAuthority, DATE_AUTHORITY.DERIVED_FROM_REPORTED_BOUNDARIES)
})

test('segment operating tables cannot become consolidated financial observations', () => {
  const filing = {
    id: 'segment-table', form: '8-K', accessionNumber: 'segment-table', filingDate: '2026-07-24',
    reportDate: '2026-06-30', filingUrl: 'https://www.sec.gov/segment-table.htm', immutableSourceId: 'SEC:1:segment-table',
  }
  const html = `<body><p>USD millions</p><table>
    <tr><th></th><th>Three months ended June 30, 2026</th></tr>
    <tr><td>Revenues</td><td>5,477</td></tr><tr><td>Other segment expenses</td><td>45</td></tr>
    <tr><td>Segment EBITDA</td><td>1,031</td></tr></table></body>`
  assert.deepEqual(extractStructuredFinancialTableFacts({ company, filing, html }), [])
})

test('an unrelated continuing-operations row cannot leak operation scope into Revenue', () => {
  const filing = {
    id: 'continuing-results', form: '6-K', accessionNumber: 'continuing-results', filingDate: '2026-02-12',
    reportDate: '2025-12-31', filingUrl: 'https://www.sec.gov/continuing-results.htm', immutableSourceId: 'SEC:1:continuing-results',
  }
  const html = `<body><p>Consolidated results</p><p>USD millions</p><table>
    <tr><th></th><th>Three months ended December 31, 2025</th></tr>
    <tr><td>Revenues</td><td>227.7</td></tr>
    <tr><td>Net income from continuing operations</td><td>29.0</td></tr></table></body>`
  const supplementalFacts = extractStructuredFinancialTableFacts({ company, filing, html })
  const canonical = adaptSecCanonicalFinancials({
    company, facts: { facts: {} }, filings: { company, filings: [filing] }, supplementalFacts, metrics: ['revenue'],
  })
  assert.equal(canonical.observations[0].operationScope, OPERATION_SCOPE.UNSPECIFIED)
})

test('an explicit statement heading can scope the entire financial table to continuing operations', () => {
  const filing = {
    id: 'scoped-statement', form: '6-K', accessionNumber: 'scoped-statement', filingDate: '2026-02-12',
    reportDate: '2025-12-31', filingUrl: 'https://www.sec.gov/scoped-statement.htm', immutableSourceId: 'SEC:1:scoped-statement',
  }
  const html = `<body><p>USD millions</p><h3>Consolidated statements of operations from continuing operations</h3><table>
    <tr><th></th><th>Three months ended December 31, 2025</th></tr>
    <tr><td>Revenues</td><td>227.7</td></tr></table></body>`
  const supplementalFacts = extractStructuredFinancialTableFacts({ company, filing, html })
  const canonical = adaptSecCanonicalFinancials({
    company, facts: { facts: {} }, filings: { company, filings: [filing] }, supplementalFacts, metrics: ['revenue'],
  })
  assert.equal(canonical.observations[0].operationScope, OPERATION_SCOPE.CONTINUING_OPERATIONS)
})

test('direct reported annual survives a matching supplemental table with an unrelated continuing-operations row', () => {
  const fixtureCompany = { ...company, fiscalYearEnd: '1231' }
  const filing = {
    id: 'annual-supplement', form: '6-K', accessionNumber: 'annual-supplement', filingDate: '2024-02-20',
    reportDate: '2023-12-31', filingUrl: 'https://www.sec.gov/annual-supplement.htm',
    immutableSourceId: 'SEC:1:annual-supplement',
  }
  const html = `<body><p>Consolidated results</p><p>USD millions</p><table>
    <tr><th></th><th>Year ended December 31</th></tr><tr><th></th><th>2023</th></tr>
    <tr><td>Revenue</td><td>9.8</td></tr>
    <tr><td>Net income from continuing operations</td><td>1.0</td></tr></table></body>`
  const supplementalFacts = extractStructuredFinancialTableFacts({ company: fixtureCompany, filing, html })
  const facts = factsByConcept({
    Revenues: [fact('2023-01-01', '2023-12-31', 9_800_000, {
      fp: 'FY', fy: 2023, form: '20-F', filed: '2024-04-30', accn: 'direct-annual',
    })],
  })
  const adapted = adaptSecCanonicalFinancials({
    company: fixtureCompany, facts, filings: { company: fixtureCompany, filings: [filing] },
    supplementalFacts, metrics: ['revenue'],
  })
  const direct = adapted.observations.find((item) => item.sourceId.includes('direct-annual'))
  assert.equal(supplementalFacts.find((item) => item.metricCandidates.includes('revenue')).tableContext.statementScopeEvidence, null)
  assert.equal(adapted.observations.find((item) => item.metric === 'revenue').operationScope, OPERATION_SCOPE.UNSPECIFIED)
  assert.equal(direct.periodIdentity.dateAuthority, DATE_AUTHORITY.REPORTED)
  const result = buildSecEnrichedFinancialsShadow({
    ticker: fixtureCompany.ticker, company: fixtureCompany, facts,
    filings: { company: fixtureCompany, filings: [filing] }, wiseSheetsRows: [], supplementalFacts,
    years: [2023], asOfDate: '2024-05-01',
  })
  assert.equal(result.calendarActuals.revenue[2023].value, 9_800_000)
  assert.equal(result.calendarActuals.revenue[2023].classification, CY_CLASSIFICATION.REPORTED_CALENDAR_YEAR)
  assert.equal(result.calendarActuals.revenue[2023].status, HISTORICAL_RESULT_STATUS.VERIFIED_REPORTED)
})

test('lower-authority supplemental conflicts cannot poison a direct reported annual', () => {
  const fixtureCompany = { ...company, fiscalYearEnd: '1231' }
  const filing = {
    id: 'lower-authority-annual', form: '20-F', accessionNumber: 'lower-authority-annual', filingDate: '2024-04-30',
    reportDate: '2023-12-31', filingUrl: 'https://www.sec.gov/lower-authority-annual.htm',
    immutableSourceId: 'SEC:1:lower-authority-annual',
  }
  const supplementalFacts = extractStructuredFinancialTableFacts({
    company: fixtureCompany,
    filing,
    html: `<body><p>USD millions</p><table>
      <tr><th></th><th>Year ended December 31</th></tr><tr><th></th><th>2023</th></tr>
      <tr><td>Revenue</td><td>9,344.8</td></tr></table></body>`,
  })
  const facts = factsByConcept({
    Revenues: [fact('2023-01-01', '2023-12-31', 9_800_000, {
      fp: 'FY', fy: 2023, form: '20-F', filed: '2024-04-30', accn: 'direct-reported-annual',
    })],
  })
  const result = buildSecEnrichedFinancialsShadow({
    ticker: fixtureCompany.ticker, company: fixtureCompany, facts,
    filings: { company: fixtureCompany, filings: [filing] }, wiseSheetsRows: [], supplementalFacts,
    years: [2023], asOfDate: '2024-05-01',
  })
  assert.equal(result.calendarActuals.revenue[2023].value, 9_800_000)
  assert.equal(result.calendarActuals.revenue[2023].classification, CY_CLASSIFICATION.REPORTED_CALENDAR_YEAR)
  assert.equal(result.calendarActuals.revenue[2023].status, HISTORICAL_RESULT_STATUS.VERIFIED_REPORTED)
})

test('direct consolidated Gross Profit is preferred over a Revenue less Cost derivation', () => {
  const facts = factsByConcept({
    Revenues: [fact('2024-01-01', '2024-03-31', 100)],
    CostOfRevenue: [fact('2024-01-01', '2024-03-31', 70)],
    GrossProfit: [fact('2024-01-01', '2024-03-31', 35)],
  })
  const result = adaptSecCanonicalFinancials({ company, facts, metrics: ['grossProfit'] })
  assert.equal(result.observations.length, 1)
  assert.equal(result.observations[0].normalizedValue, 35)
  assert.equal(result.observations[0].sourceProvider, 'SEC')
})

test('Gross Profit derives only from exact compatible consolidated Revenue and Cost periods', () => {
  const facts = factsByConcept({
    Revenues: [fact('2024-01-01', '2024-03-31', 100)],
    CostOfRevenue: [fact('2024-01-01', '2024-03-31', 70)],
  })
  const result = adaptSecCanonicalFinancials({ company, facts, metrics: ['grossProfit'] })
  assert.equal(result.observations[0].normalizedValue, 30)
  assert.equal(result.observations[0].sourceProvider, 'DERIVED')
  assert.equal(result.observations[0].derivation.method, 'REVENUE_MINUS_COST_OF_REVENUE')
  assert.equal(result.observations[0].derivation.inputs.length, 2)
})

test('exact annual GP and FCF arithmetic receives exact-derived CY classification', () => {
  const annual = { fp: 'FY', form: '10-K', filed: '2025-02-01' }
  const facts = factsByConcept({
    Revenues: [fact('2024-01-01', '2024-12-31', 100, annual)],
    CostOfRevenue: [fact('2024-01-01', '2024-12-31', 60, annual)],
    NetCashProvidedByUsedInOperatingActivities: [fact('2024-01-01', '2024-12-31', 90, annual)],
    PaymentsToAcquirePropertyPlantAndEquipment: [fact('2024-01-01', '2024-12-31', 30, annual)],
  })
  const result = buildSecEnrichedFinancialsShadow({
    ticker: company.ticker, company, facts, filings: null, wiseSheetsRows: [], years: [2024], asOfDate: '2025-03-01',
  })
  assert.equal(result.calendarActuals.grossProfit[2024].value, 40)
  assert.equal(result.calendarActuals.grossProfit[2024].classification, CY_CLASSIFICATION.EXACT_DERIVED_CALENDAR_YEAR)
  assert.equal(result.calendarActuals.grossProfit[2024].status, HISTORICAL_RESULT_STATUS.VERIFIED_DERIVED)
  assert.equal(result.calendarActuals.freeCashFlow[2024].value, 60)
  assert.equal(result.calendarActuals.freeCashFlow[2024].classification, CY_CLASSIFICATION.EXACT_DERIVED_CALENDAR_YEAR)
  assert.equal(result.calendarActuals.freeCashFlow[2024].status, HISTORICAL_RESULT_STATUS.VERIFIED_DERIVED)
})

test('continuing-operations CFO wins over a total that includes discontinued operations', () => {
  const annual = { fp: 'FY', form: '20-F', filed: '2026-04-30', accn: 'nbis-2025' }
  const facts = factsByConcept({
    Revenues: [fact('2025-01-01', '2025-12-31', 529.8, annual)],
    NetCashProvidedByUsedInOperatingActivities: [fact('2025-01-01', '2025-12-31', 384.8, annual)],
    NetCashProvidedByUsedInOperatingActivitiesContinuingOperations: [fact('2025-01-01', '2025-12-31', 401.9, annual)],
    CashProvidedByUsedInOperatingActivitiesDiscontinuedOperations: [fact('2025-01-01', '2025-12-31', -17.1, annual)],
    PaymentsToAcquirePropertyPlantAndEquipment: [fact('2025-01-01', '2025-12-31', 100, annual)],
  })
  const result = adaptSecCanonicalFinancials({ company, facts, metrics: ['revenue', 'operatingCashFlow', 'capitalExpenditures'] })
  const cfo = result.observations.find((item) => item.metric === 'operatingCashFlow')
  assert.equal(cfo.normalizedValue, 401.9)
  assert.equal(cfo.operationScope, OPERATION_SCOPE.CONTINUING_OPERATIONS)
  assert.equal(result.observations.find((item) => item.metric === 'revenue').operationScope, OPERATION_SCOPE.UNSPECIFIED)
  assert.equal(result.observations.find((item) => item.metric === 'capitalExpenditures').operationScope, OPERATION_SCOPE.UNSPECIFIED)
})

test('structured cash-flow tables accept an explicit from-continuing-operations CFO row', () => {
  const filing = {
    id: 'continuing-cfo', immutableSourceId: 'SEC:fixture:continuing-cfo', form: '6-K',
    accessionNumber: 'continuing-cfo', filingDate: '2026-08-12', reportDate: '2026-06-30',
    filingUrl: 'https://www.sec.gov/continuing-cfo.htm',
  }
  const html = `<p>USD millions</p><table>
    <tr><th>Metric</th><th>Six months ended June 30, 2026</th></tr>
    <tr><td>Net cash provided by operating activities from continuing operations</td><td>4,900.0</td></tr>
  </table>`
  const supplementalFacts = extractStructuredFinancialTableFacts({ company, filing, html })
  const result = adaptSecCanonicalFinancials({ company, facts: { facts: {} }, filings: { filings: [filing] },
    supplementalFacts, metrics: ['operatingCashFlow'] })
  assert.equal(result.observations[0].normalizedValue, 4_900_000_000)
  assert.equal(result.observations[0].operationScope, OPERATION_SCOPE.CONTINUING_OPERATIONS)
})

test('an explicit cash-flow scope sentence applies to a slash-form operating-cash-flow row', () => {
  const filing = {
    id: 'scoped-cfo', immutableSourceId: 'SEC:fixture:scoped-cfo', form: '6-K',
    accessionNumber: 'scoped-cfo', filingDate: '2026-08-12', reportDate: '2026-06-30',
    filingUrl: 'https://www.sec.gov/scoped-cfo.htm',
  }
  const html = `<p>USD millions</p><p>Set out below is a summary of cash flows from continuing operations for the six months ended June 30, 2025 and 2026.</p><table>
    <tr><th>Metric</th><th>Six months ended June 30, 2025</th><th>Six months ended June 30, 2026</th></tr>
    <tr><td>Net cash provided by / (used in) operating activities</td><td>(352.0)</td><td>4,504.1</td></tr>
  </table>`
  const supplementalFacts = extractStructuredFinancialTableFacts({ company, filing, html })
  const result = adaptSecCanonicalFinancials({ company, facts: { facts: {} }, filings: { filings: [filing] },
    supplementalFacts, metrics: ['operatingCashFlow'] })
  assert.deepEqual(result.observations.map((item) => [item.normalizedValue, item.operationScope]), [
    [-352_000_000, OPERATION_SCOPE.CONTINUING_OPERATIONS],
    [4_504_100_000, OPERATION_SCOPE.CONTINUING_OPERATIONS],
  ])
})

test('continuing CFO and unspecified capex fail FCF closed by operation scope', () => {
  const annual = { fp: 'FY', form: '20-F', filed: '2026-04-30', accn: 'scope-test' }
  const facts = factsByConcept({
    NetCashProvidedByUsedInOperatingActivitiesContinuingOperations: [fact('2025-01-01', '2025-12-31', 100, annual)],
    PaymentsToAcquirePropertyPlantAndEquipment: [fact('2025-01-01', '2025-12-31', 30, annual)],
  })
  const result = buildSecEnrichedFinancialsShadow({ ticker: company.ticker, company, facts,
    wiseSheetsRows: [], years: [2025], asOfDate: '2026-05-01' })
  assert.equal(result.calendarActuals.freeCashFlow[2025].status, HISTORICAL_RESULT_STATUS.OPERATION_SCOPE_INCOMPATIBLE)
  assert.equal(result.records.freeCashFlow.length, 0)
})

test('required completion periods identify missing CY and LTM targets', () => {
  const canonical = buildSecEnrichedFinancialsShadow({ ticker: company.ticker, company, facts: { facts: {} },
    wiseSheetsRows: [], filings: { filings: [{ cik: company.cik, form: '10-Q', reportDate: '2026-06-30',
      filingDate: '2026-07-30', accessionNumber: 'latest', secUrl: 'https://www.sec.gov/latest' }] },
    years: [2025], asOfDate: '2026-08-01' })
  const required = requiredSecCompletionPeriods(canonical, [2025])
  assert.ok(required.some((item) => item.purpose === '2025A' && item.periodEnd === '2025-12-31'))
  assert.ok(required.some((item) => item.purpose === 'LTM' && item.periodEnd === '2026-06-30'))
})

test('required completion periods preserve exact CY coverage gaps including an off-calendar quarter', () => {
  const canonical = {
    calendarActuals: {}, ltm: {}, latestReportedPeriods: {}, records: {},
  }
  for (const metric of ['revenue', 'grossProfit', 'ebit', 'operatingCashFlow', 'capitalExpenditures']) {
    canonical.calendarActuals[metric] = {
      2025: { value: null, coverage: { gaps: [{ start: '2025-08-01', end: '2025-10-31' }] } },
    }
    canonical.ltm[metric] = { value: null, missingPeriods: ['2026-06-30'] }
    canonical.latestReportedPeriods[metric] = { valid: true, periodEnd: '2026-06-30' }
    canonical.records[metric] = []
  }
  const required = requiredSecCompletionPeriods(canonical, [2025])
  const gap = required.find((item) => item.metric === 'grossProfit' && item.purpose === '2025A')
  assert.deepEqual(gap, {
    metric: 'grossProfit', purpose: '2025A', periodStart: '2025-08-01', periodEnd: '2025-10-31',
    gapStart: '2025-08-01', gapEnd: '2025-10-31',
  })
  assert.ok(required.some((item) => item.metric === 'grossProfit' && item.purpose === 'LTM' && item.periodEnd === '2026-06-30'))
})

test('follow-up period identity includes metric, purpose, start, and end', () => {
  const revenue = requiredPeriodKey({
    metric: 'revenue', purpose: '2025A', gapStart: '2025-08-01', gapEnd: '2025-10-31',
  })
  const grossProfit = requiredPeriodKey({
    metric: 'grossProfit', purpose: '2025A', gapStart: '2025-08-01', gapEnd: '2025-10-31',
  })
  const ltm = requiredPeriodKey({
    metric: 'revenue', purpose: 'LTM', periodStart: '2025-08-01', periodEnd: '2025-10-31',
  })
  assert.equal(revenue, 'revenue|2025A|2025-08-01|2025-10-31')
  assert.notEqual(revenue, grossProfit)
  assert.notEqual(revenue, ltm)
})

test('generic SEC table shapes produce exact NBIS-shaped annual GP and four-quarter revenue LTM', () => {
  const fixtureCompany = { ...company, ticker: 'SYNTHETIC_FOREIGN', fiscalYearEnd: '1231' }
  const filing = {
    id: 'generic-foreign-results', form: '6-K', accessionNumber: 'generic-foreign-results', filingDate: '2026-08-12',
    reportDate: '2026-06-30', filingUrl: 'https://www.sec.gov/generic-foreign-results.htm',
    immutableSourceId: 'SEC:1:generic-foreign-results',
  }
  const html = `<body><p>USD millions</p>
    <table><tr><th>Metric</th><th colspan="3">Year ended December 31</th></tr>
      <tr><th></th><th>2023</th><th>2024</th><th>2025</th></tr>
      <tr><td>Revenue</td><td>9.8</td><td>91.5</td><td>529.8</td></tr>
      <tr><td>Cost of revenue</td><td>19.6</td><td>43.7</td><td>166.2</td></tr></table>
    <table><tr><th>Expense allocation</th><th>2023</th><th>2024</th><th>2025</th></tr>
      <tr><td>Cost of revenue</td><td>0.1</td><td>0.3</td><td>1.2</td></tr>
      <tr><td>Sales and marketing</td><td>0.2</td><td>0.4</td><td>0.8</td></tr></table>
    <table><tr><th>Metric</th><th>Three months ended September 30</th><th>Three months ended December 31</th><th>Three months ended March 31</th><th>Three months ended June 30</th></tr>
      <tr><th></th><th>2025</th><th>2025</th><th>2026</th><th>2026</th></tr>
      <tr><td>Revenue</td><td>146.1</td><td>227.7</td><td>399.0</td><td>582.3</td></tr></table></body>`
  const supplementalFacts = extractStructuredFinancialTableFacts({ company: fixtureCompany, filing, html })
  const result = buildSecEnrichedFinancialsShadow({
    ticker: fixtureCompany.ticker, company: fixtureCompany, facts: { facts: {} },
    filings: { company: fixtureCompany, filings: [filing] }, wiseSheetsRows: [], supplementalFacts,
    years: [2023, 2024, 2025], asOfDate: '2026-08-13',
  })
  assert.equal(result.calendarActuals.grossProfit[2023].value, -9_800_000)
  assert.equal(result.calendarActuals.grossProfit[2024].value, 47_800_000)
  assert.equal(result.calendarActuals.grossProfit[2025].value, 363_600_000)
  assert.equal(result.ltm.revenue.value, 1_355_100_000)
  assert.equal(result.ltm.revenue.status, HISTORICAL_RESULT_STATUS.VERIFIED_DERIVED)
})

test('standalone operating cost tables remain eligible while expense allocations are excluded', () => {
  const filing = {
    id: 'cost-tables', form: '6-K', accessionNumber: 'cost-tables', filingDate: '2026-08-12',
    reportDate: '2026-06-30', filingUrl: 'https://www.sec.gov/cost-tables.htm',
    immutableSourceId: 'SEC:1:cost-tables',
  }
  const html = `<body><p>USD millions</p>
    <h2>Operating costs and expenses</h2>
    <table><tr><th>Metric</th><th>Six months ended June 30, 2025</th><th>Six months ended June 30, 2026</th></tr>
      <tr><td>Cost of revenues</td><td>54.8</td><td>237.4</td></tr></table>
    <h2>Share-based compensation expense allocation</h2>
    <table><tr><th colspan="3">Share-based compensation expense included within:</th></tr>
      <tr><th>Metric</th><th>Six months ended June 30, 2025</th><th>Six months ended June 30, 2026</th></tr>
      <tr><td>Cost of revenues</td><td>0.3</td><td>1.2</td></tr></table></body>`
  const facts = extractStructuredFinancialTableFacts({ company, filing, html })
    .filter((item) => item.metricCandidates.includes('costOfRevenue'))
  assert.deepEqual(facts.map((item) => item.value).sort((a, b) => a - b), [54_800_000, 237_400_000])
})

test('ambiguous Cost of Revenue concepts fail Gross Profit derivation closed', () => {
  const facts = factsByConcept({
    Revenues: [fact('2024-01-01', '2024-03-31', 100)],
    CostOfRevenue: [fact('2024-01-01', '2024-03-31', 70)],
    CostOfGoodsAndServicesSold: [fact('2024-01-01', '2024-03-31', 60)],
  })
  const result = adaptSecCanonicalFinancials({ company, facts, metrics: ['grossProfit'] })
  assert.equal(result.observations.length, 0)
  assert.ok(result.failures.some((item) => item.reason === 'SOURCE_VALUE_CONFLICT'))
})

test('CFO cumulative YTD facts use the common standalone-quarter normalizer', () => {
  const facts = factsByConcept({
    NetCashProvidedByUsedInOperatingActivities: [
      fact('2024-01-01', '2024-03-31', 10, { fp: 'Q1' }),
      fact('2024-01-01', '2024-06-30', 30, { fp: 'Q2' }),
      fact('2024-01-01', '2024-09-30', 60, { fp: 'Q3' }),
      fact('2024-01-01', '2024-12-31', 100, { fp: 'FY', form: '10-K', filed: '2025-02-01' }),
    ],
  })
  const result = buildSecEnrichedFinancialsShadow({
    ticker: company.ticker, company, facts, filings: null, wiseSheetsRows: [], years: [2024], asOfDate: '2025-06-01',
  })
  assert.deepEqual(result.records.operatingCashFlow.filter((item) => item.periodIdentity.periodType === PERIOD_TYPE.STANDALONE_QUARTER)
    .map((item) => item.normalizedValue), [10, 20, 30, 40])
  assert.equal(result.calendarActuals.operatingCashFlow[2024].value, 100)
})

test('a trailing-12-month 10-Q context is not accepted as a fiscal-year subtraction input', () => {
  const facts = factsByConcept({
    NetCashProvidedByUsedInOperatingActivities: [
      fact('2025-01-01', '2025-03-31', 10, { fp: 'Q1' }),
      fact('2025-01-01', '2025-06-30', 30, { fp: 'Q2' }),
      fact('2025-01-01', '2025-09-30', 60, { fp: 'Q3' }),
      fact('2024-10-01', '2025-09-30', 90, { fp: 'Q3', form: '10-Q' }),
      fact('2025-01-01', '2025-12-31', 100, { fp: 'FY', form: '10-K', filed: '2026-02-01' }),
    ],
  })
  const result = buildSecEnrichedFinancialsShadow({
    ticker: company.ticker, company, facts, filings: null, wiseSheetsRows: [], years: [2025], asOfDate: '2026-03-01',
  })
  const q4 = result.records.operatingCashFlow.find((item) => item.periodIdentity.fiscalQuarter === 4)
  assert.equal(q4.normalizedValue, 40)
  assert.equal(q4.periodIdentity.periodStart, '2025-10-01')
  assert.equal(result.calendarActuals.operatingCashFlow[2025].value, 100)
})

test('capex semantic selection excludes investments and normalizes sign only after selection', () => {
  const facts = factsByConcept({
    PaymentsToAcquirePropertyPlantAndEquipment: [fact('2024-01-01', '2024-03-31', -30)],
    PaymentsToAcquireInvestments: [fact('2024-01-01', '2024-03-31', 500)],
  })
  const result = adaptSecCanonicalFinancials({ company, facts, metrics: ['capitalExpenditures'] })
  assert.equal(result.observations.length, 1)
  assert.equal(result.observations[0].rawValue, -30)
  assert.equal(result.observations[0].normalizedValue, 30)
})

test('distinct same-filing cash capex components are summed only when labels prove non-overlap', () => {
  const fixtureCompany = { ticker: 'CAPEXCO', cik: '0001878848', name: 'Capex Company', fiscalYearEnd: '0630' }
  const accessionNumber = 'capex-components'
  const common = {
    units: 'USD', currency: 'USD', startDate: '2025-07-01', endDate: '2026-06-30',
    periodType: 'FISCAL_YEAR', fiscalPeriod: 'FY', fiscalYear: 2026,
    filingForm: '20-F', filingDate: '2026-08-28', accessionNumber,
    filingUrl: 'https://www.sec.gov/capex-components.htm', dateAuthority: DATE_AUTHORITY.REPORTED,
    explicitPeriodMapping: true, metricCandidates: ['capitalExpenditures'], namespace: 'iren',
  }
  const supplementalFacts = [
    { ...common, id: 'ppe-xbrl', namespace: 'us-gaap', concept: 'PaymentsToAcquirePropertyPlantAndEquipment',
      label: 'Payments to acquire property, plant and equipment', value: -2_998_006_000 },
    { ...common, id: 'ppe', concept: 'PaymentsToAcquirePropertyPlantAndEquipment',
      label: 'Payments for property, plant and equipment, net of computer hardware', value: -2_998_006_000 },
    { ...common, id: 'hardware', concept: 'PurchasesOfComputerHardware',
      label: 'Purchases of computer hardware', value: -1_335_081_000 },
  ]
  const facts = {
    cik: fixtureCompany.cik,
    facts: { 'us-gaap': { NetCashProvidedByUsedInOperatingActivities: {
      label: 'Net cash provided by operating activities', units: { USD: [fact('2025-07-01', '2026-06-30', 2_100_418_000,
        { fp: 'FY', fy: 2026, form: '20-F', filed: '2026-08-28', accn: accessionNumber })] },
    } } },
  }
  const result = buildSecEnrichedFinancialsShadow({
    ticker: fixtureCompany.ticker, company: fixtureCompany, facts,
    filings: { company: fixtureCompany, filings: [{ accessionNumber, filingUrl: common.filingUrl }] },
    supplementalFacts, wiseSheetsRows: [], years: [2025], asOfDate: '2026-09-01',
  })
  const capex = result.records.capitalExpenditures.find((item) => item.periodIdentity.periodEnd === '2026-06-30')
  const fcf = result.records.freeCashFlow.find((item) => item.periodIdentity.periodEnd === '2026-06-30')
  assert.equal(capex.normalizedValue, 4_333_087_000)
  assert.equal(capex.reportedVsDerived, 'DERIVED')
  assert.equal(capex.derivation.method, 'ADDITIVE_NON_OVERLAPPING_CASH_CAPEX_COMPONENTS')
  assert.deepEqual(capex.derivation.componentClasses, ['PROPERTY_PLANT_EQUIPMENT', 'COMPUTER_HARDWARE'])
  assert.equal(fcf.normalizedValue, -2_232_669_000)
  assert.equal(fcf.derivation.inputs[1].normalizedValue, 4_333_087_000)
})

test('structured cash-flow extraction recognizes a separate computer-hardware capex component', () => {
  const filing = {
    id: 'hardware-capex', immutableSourceId: 'SEC:fixture:hardware-capex', form: '20-F',
    accessionNumber: 'hardware-capex', filingDate: '2026-08-27', reportDate: '2026-06-30',
    filingUrl: 'https://www.sec.gov/hardware-capex.htm',
  }
  const html = `<p>USD thousands</p><table>
    <tr><th>Metric</th><th>Year ended June 30, 2026</th></tr>
    <tr><td>Payments for property, plant and equipment, net of computer hardware</td><td>(2,998,006)</td></tr>
    <tr><td>Payments for computer hardware</td><td>(1,335,081)</td></tr>
  </table>`
  const supplementalFacts = extractStructuredFinancialTableFacts({
    company: { ...company, fiscalYearEnd: '0630' }, filing, html,
  }).filter((item) => item.metricCandidates.includes('capitalExpenditures'))
  assert.deepEqual(supplementalFacts.map((item) => item.value), [-2_998_006_000, -1_335_081_000])
})

test('ambiguous capex concepts remain a conflict and are never blindly summed', () => {
  const facts = factsByConcept({
    PaymentsToAcquirePropertyPlantAndEquipment: [fact('2025-01-01', '2025-12-31', -100, { fp: 'FY', form: '10-K' })],
    PaymentsToAcquireProductiveAssets: [fact('2025-01-01', '2025-12-31', -150, { fp: 'FY', form: '10-K' })],
  })
  const result = adaptSecCanonicalFinancials({ company, facts, metrics: ['capitalExpenditures'] })
  assert.equal(result.observations[0].deduplicationStatus, 'REQUIRES_REVIEW')
  assert.equal(result.observations[0].derivation, null)
})

test('legacy supplemental metric candidates cannot bypass capex semantic exclusions', () => {
  const records = [
    ['Financing purchases of equipment', 'FinancingPurchasesOfEquipment'],
    ['Payments for finance leases', 'PaymentsForFinanceLeases'],
    ['Payments to acquire businesses', 'PaymentsToAcquireBusinesses'],
    ['Purchases of investments and securities', 'PaymentsToAcquireInvestments'],
    ['Purchases of property and equipment', 'PurchasesOfPropertyAndEquipment'],
  ].map(([label, concept], index) => ({
    id: `supplemental-${index}`, metricCandidates: ['capitalExpenditures'], namespace: 'company-table', concept, label,
    value: 10 + index, units: 'USD', currency: 'USD', startDate: '2024-01-01', endDate: '2024-03-31',
    filingForm: '10-Q', filingDate: '2024-05-01', accessionNumber: 'supplemental', filingUrl: 'https://www.sec.gov/example',
  }))
  const result = adaptSecCanonicalFinancials({
    company, facts: { facts: {} }, supplementalFacts: records, metrics: ['capitalExpenditures'],
  })
  assert.equal(result.observations.length, 1)
  assert.equal(result.observations[0].label, 'Purchases of property and equipment')
})

test('FCF is derived only after independently canonicalized CFO and capex and retains both lineages', () => {
  const period = ['2024-01-01', '2024-03-31']
  const facts = factsByConcept({
    NetCashProvidedByUsedInOperatingActivities: [fact(...period, 100)],
    PaymentsToAcquirePropertyPlantAndEquipment: [fact(...period, 30)],
  })
  const result = buildSecEnrichedFinancialsShadow({
    ticker: company.ticker, company, facts, filings: null, wiseSheetsRows: [], years: [2024], asOfDate: '2024-06-01',
  })
  assert.equal(result.records.freeCashFlow[0].normalizedValue, 70)
  assert.equal(result.records.freeCashFlow[0].derivation.inputs.length, 2)
  assert.equal(result.records.freeCashFlow[0].derivation.reconciliation, null)
})

test('FCF preserves nested SEC period evidence from reconciled WiseSheets CFO and capex', () => {
  const facts = factsByConcept({
    NetCashProvidedByUsedInOperatingActivities: [fact('2024-01-01', '2024-03-31', 100)],
    PaymentsToAcquirePropertyPlantAndEquipment: [fact('2024-01-01', '2024-03-31', 30)],
  })
  const wiseSheetsRows = [
    wiseRow('net_cash_from_operating_activities', '2024-01-01', '2024-03-31', 100),
    wiseRow('total_capex', '2024-01-01', '2024-03-31', -30),
  ]
  const result = buildSecEnrichedFinancialsShadow({
    ticker: company.ticker, company, facts, filings: null, wiseSheetsRows, years: [2024], asOfDate: '2024-06-01',
  })
  const inputs = result.records.freeCashFlow[0].derivation.inputs
  assert.equal(inputs.length, 2)
  assert.ok(inputs.every((input) => input.derivation?.periodEvidence?.sourceProvider === 'SEC'))
})

test('WiseSheets value is retained only when it reconciles to the same SEC economic period', () => {
  const sec = adaptSecCanonicalFinancials({
    company,
    facts: factsByConcept({ GrossProfit: [fact('2024-01-01', '2024-03-31', 40)] }),
    metrics: ['grossProfit'],
  })
  const wise = adaptWiseSheetsObservations([
    wiseRow('gross_profit', '2024-01-01', '2024-03-31', 40.01),
  ]).observations
  const result = resolveWiseSheetsWithSecMetric(wise, sec.observations, 'grossProfit')
  assert.equal(result.records[0].sourceProvider, 'WiseSheets')
  assert.equal(result.records[0].periodIdentity.dateAuthority, DATE_AUTHORITY.REPORTED)
  assert.equal(result.records[0].derivation.periodEvidence.sourceProvider, 'SEC')
})

test('metric freshness is independent and stale LTM fails closed', () => {
  const quarterRows = [
    ['2025-04-01', '2025-06-30', 'Q2', 10],
    ['2025-07-01', '2025-09-30', 'Q3', 20],
    ['2025-10-01', '2025-12-31', 'Q4', 30],
    ['2026-01-01', '2026-03-31', 'Q1', 40],
  ].map(([start, end, fp, value]) => fact(start, end, value, { fp, fy: fp === 'Q1' ? 2026 : 2025 }))
  const facts = factsByConcept({ Revenues: quarterRows })
  const filings = { filings: [{
    cik: company.cik, form: '10-Q', reportDate: '2026-06-30', filingDate: '2026-07-30',
    accessionNumber: 'latest', secUrl: 'https://www.sec.gov/latest.htm',
  }] }
  const result = buildSecEnrichedFinancialsShadow({
    ticker: company.ticker, company, facts, filings, wiseSheetsRows: [], years: [2025], asOfDate: '2026-08-01',
  })
  assert.equal(result.ltm.revenue.status, HISTORICAL_RESULT_STATUS.STALE_SOURCE_COVERAGE)
  assert.equal(result.ltm.revenue.latestReportedPeriod.periodEnd, '2026-06-30')
})

test('off-calendar CFO uses CALENDARIZED_ESTIMATE and never fiscal-year substitution', () => {
  const periods = [
    ['2023-11-01', '2024-01-31', 10, 2024, 'Q1'],
    ['2024-02-01', '2024-04-30', 20, 2024, 'Q2'],
    ['2024-05-01', '2024-07-31', 30, 2024, 'Q3'],
    ['2024-08-01', '2024-10-31', 40, 2024, 'Q4'],
    ['2024-11-01', '2025-01-31', 50, 2025, 'Q1'],
  ]
  const facts = factsByConcept({
    NetCashProvidedByUsedInOperatingActivities: periods.map(([start, end, value, fy, fp]) =>
      fact(start, end, value, { fy, fp })),
  })
  const result = buildSecEnrichedFinancialsShadow({
    ticker: company.ticker, company, facts, filings: null, wiseSheetsRows: [], years: [2024], asOfDate: '2025-06-01',
  })
  assert.equal(result.calendarActuals.operatingCashFlow[2024].classification, CY_CLASSIFICATION.CALENDARIZED_ESTIMATE)
})

test('economic sanity rejects materially impossible Gross Profit without discarding the rejected value', () => {
  const facts = factsByConcept({
    Revenues: [fact('2024-01-01', '2024-12-31', 100, { fp: 'FY', form: '10-K', filed: '2025-02-01' })],
    GrossProfit: [fact('2024-01-01', '2024-12-31', 150, { fp: 'FY', form: '10-K', filed: '2025-02-01' })],
  })
  const result = buildSecEnrichedFinancialsShadow({
    ticker: company.ticker, company, facts, filings: null, wiseSheetsRows: [], years: [2024], asOfDate: '2025-03-01',
  })
  const grossProfit = result.calendarActuals.grossProfit[2024]
  assert.equal(grossProfit.status, HISTORICAL_RESULT_STATUS.REQUIRES_REVIEW)
  assert.equal(grossProfit.reason, 'GROSS_PROFIT_EXCEEDS_REVENUE')
  assert.equal(grossProfit.value, null)
  assert.equal(grossProfit.rejectedValue, 150)
})

test('comparison counts period enrichment, SEC value fill, and direct annual separately', () => {
  const facts = factsByConcept({
    Revenues: [
      fact('2024-01-01', '2024-03-31', 10, { fp: 'Q1' }),
      fact('2024-04-01', '2024-06-30', 20, { fp: 'Q2' }),
      fact('2024-07-01', '2024-09-30', 30, { fp: 'Q3' }),
      fact('2024-10-01', '2024-12-31', 40, { fp: 'Q4', form: '10-K', filed: '2025-02-01' }),
      fact('2025-01-01', '2025-12-31', 150, { fp: 'FY', form: '10-K', filed: '2026-02-01' }),
    ],
  })
  const wiseSheetsRows = [wiseRow('revenue', '2024-01-01', '2024-03-31', 10)]
  const canonical = buildSecEnrichedFinancialsShadow({
    ticker: company.ticker, company, facts, filings: null, wiseSheetsRows, years: [2024, 2025], asOfDate: '2026-03-01',
  })
  const legacy = { calendarActuals: { revenue: {} }, ltm: {} }
  const rows = compareSecFinancialsShadow(company.ticker, legacy, canonical, [2024, 2025])
  const revenue2024 = rows.find((item) => item.metric === 'revenue' && item.period === '2024A')
  const revenue2025 = rows.find((item) => item.metric === 'revenue' && item.period === '2025A')
  assert.equal(revenue2024.secPeriodEnriched, true)
  assert.equal(revenue2024.secValueFilled, true)
  assert.equal(revenue2024.secDirectAnnual, false)
  assert.equal(revenue2025.secDirectAnnual, true)
  assert.equal(revenue2025.secValueFilled, false)
})

test('shadow report contains the required distinct SEC contribution totals and cell fields', () => {
  const result = {
    summary: {
      matching: 1, different: 2, unavailable: 3, stale: 4, requiresReview: 5,
      secPeriodEnriched: 6, secValueFilled: 7, secDirectAnnual: 8,
    },
    comparisons: [{
      ticker: 'TEST', metric: 'revenue', period: '2024A', legacyValue: 1, canonicalValue: 2,
      classification: 'REPORTED_CALENDAR_YEAR', status: 'VERIFIED_REPORTED', valueSource: 'SEC',
      periodEvidenceSource: 'https://www.sec.gov/example', latestReportedPeriod: '2024-12-31',
      latestCanonicalQuarter: '2024-12-31', difference: 1, reason: 'VALUE_DIFFERENCE', matching: false,
    }],
  }
  const report = renderSecFinancialsShadowReport(result, { generatedAt: '2026-09-05T00:00:00.000Z' })
  assert.match(report, /SEC_PERIOD_ENRICHED \| 6/)
  assert.match(report, /SEC_VALUE_FILLED \| 7/)
  assert.match(report, /SEC_DIRECT_ANNUAL \| 8/)
  assert.match(report, /Production values were not changed/)
})

test('a completely synthetic ticker requires no production-specific rule', () => {
  const synthetic = { ...company, ticker: 'NEVER_SEEN', cik: '0000000999' }
  const result = adaptSecCanonicalFinancials({
    company: synthetic,
    facts: factsByConcept({ GrossProfit: [fact('2024-01-01', '2024-03-31', 42)] }),
    metrics: ['grossProfit'],
  })
  assert.equal(result.observations[0].ticker, 'NEVER_SEEN')
  assert.equal(result.observations[0].normalizedValue, 42)
})

test('real SEC financial fixtures retain accession-level values and reported boundaries', () => {
  assert.ok(secGolden.observations.length >= 10)
  for (const fixture of secGolden.observations) {
    const fixtureCompany = { ticker: fixture.ticker, cik: fixture.cik, name: fixture.ticker }
    const facts = {
      cik: fixture.cik,
      facts: {
        'us-gaap': {
          [fixture.concept]: {
            label: fixture.concept,
            units: {
              [fixture.currency]: [{
                start: fixture.periodStart,
                end: fixture.periodEnd,
                val: fixture.value,
                fy: 2024,
                fp: 'FY',
                form: fixture.form,
                filed: '2026-03-01',
                accn: fixture.accession,
              }],
            },
          },
        },
      },
    }
    const filings = {
      company: { fiscalYearEnd: fixture.periodEnd.slice(5, 7) + fixture.periodEnd.slice(8, 10) },
      filings: [{ accessionNumber: fixture.accession, filingUrl: fixture.sourceUrl }],
    }
    const result = adaptSecCanonicalFinancials({
      company: fixtureCompany,
      facts,
      filings,
      metrics: [fixture.metric],
      asOfDate: '2026-09-05',
    })
    assert.equal(result.observations.length, 1, `${fixture.ticker} ${fixture.metric}`)
    assert.equal(result.observations[0].normalizedValue, fixture.value, `${fixture.ticker} ${fixture.metric}`)
    assert.equal(result.observations[0].periodIdentity.periodStart, fixture.periodStart)
    assert.equal(result.observations[0].periodIdentity.periodEnd, fixture.periodEnd)
    assert.equal(result.observations[0].periodIdentity.dateAuthority, DATE_AUTHORITY.REPORTED)
    assert.equal(result.observations[0].accession, fixture.accession)
    assert.equal(result.observations[0].sourceUrl, fixture.sourceUrl)
  }
})

test('real NBIS and CRWV hardening fixtures preserve audited values and provenance', () => {
  assert.deepEqual(secGolden.operationScopeRegressions.map((item) => [item.period, item.continuingCfo]), [
    ['2023A', -222000000], ['2024A', -269900000], ['2025A', 401900000],
  ])
  assert.ok(secGolden.operationScopeRegressions.every((item) =>
    item.operationScope === OPERATION_SCOPE.CONTINUING_OPERATIONS && item.accession === '0001104659-26-052948'))
  const nbisGp = secGolden.derivedAnnualRegressions.find((item) => item.ticker === 'NBIS')
  assert.equal(nbisGp.leftValue - nbisGp.rightValue, nbisGp.expectedValue)
  assert.equal(nbisGp.expectedValue, 363600000)
  const crwvFcf = secGolden.derivedAnnualRegressions.find((item) => item.ticker === 'CRWV')
  assert.equal(crwvFcf.leftValue - crwvFcf.rightValue, crwvFcf.expectedValue)
  assert.equal(crwvFcf.expectedValue, -1110000000)
  assert.ok(secGolden.earningsExhibitRegressions.every((item) =>
    item.ticker === 'NBIS' && item.periodEnd === '2026-06-30' && item.accession === '0001104659-26-094568'))
})
