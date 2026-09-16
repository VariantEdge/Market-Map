import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  adaptSecCanonicalRevenue,
  buildSecEnrichedRevenueShadow,
  compareRevenueShadow,
  loadTargetedSecRevenueCompletion,
  resolveLatestReportedRevenuePeriod,
  resolveWiseSheetsWithSecRevenue,
  renderSecRevenueShadowReport,
  runSecRevenueShadowComparison,
} from '../server/valuation/secCanonicalRevenue.js'
import {
  DATE_AUTHORITY,
  PERIOD_TYPE,
} from '../server/valuation/canonicalFinancialObservation.js'
import {
  CY_CLASSIFICATION,
  HISTORICAL_RESULT_STATUS,
} from '../server/valuation/historicalPeriodEngine.js'
import { adaptWiseSheetsObservations } from '../server/valuation/wiseSheetsCanonicalShadow.js'

const company = { ticker: 'TEST', cik: '0000000001', name: 'Test Company' }
const golden = JSON.parse(readFileSync(new URL('./fixtures/valuation-sec-revenue-golden.json', import.meta.url), 'utf8'))

function secFact({ start, end, value, fp = 'Q1', fy = 2024, form = '10-Q', filed = '2024-05-01',
  accn = `0000000001-24-${end.replaceAll('-', '').slice(-6)}`, segment = undefined }) {
  return { start, end, val: value, fp, fy, form, filed, accn, ...(segment ? { segment } : {}) }
}

function companyFacts(entries, concept = 'RevenueFromContractWithCustomerExcludingAssessedTax') {
  return {
    cik: company.cik,
    facts: {
      'us-gaap': {
        [concept]: { label: 'Revenue', units: { USD: entries } },
      },
    },
  }
}

function wiseRow({ end, value, fy, fp }) {
  return {
    ticker: company.ticker,
    cik: company.cik,
    metric: 'revenue',
    periodEnd: end,
    fiscalYear: fy,
    fiscalPeriod: fp,
    value,
    unit: 'USD',
    source: { kind: 'reported' },
  }
}

test('SEC XBRL duration contexts become reported canonical revenue observations', () => {
  const result = adaptSecCanonicalRevenue({
    company,
    facts: companyFacts([secFact({ start: '2024-01-01', end: '2024-03-31', value: 100 })]),
    retrievedAt: '2024-05-02T00:00:00.000Z',
  })
  assert.equal(result.observations.length, 1)
  const observation = result.observations[0]
  assert.equal(observation.periodIdentity.periodType, PERIOD_TYPE.STANDALONE_QUARTER)
  assert.equal(observation.periodIdentity.dateAuthority, DATE_AUTHORITY.REPORTED)
  assert.equal(observation.periodIdentity.periodStart, '2024-01-01')
  assert.equal(observation.scope, 'CONSOLIDATED')
  assert.equal(observation.concept, 'RevenueFromContractWithCustomerExcludingAssessedTax')
})

test('dimensional revenue is never selected as consolidated revenue', () => {
  const result = adaptSecCanonicalRevenue({
    company,
    facts: companyFacts([
      secFact({ start: '2024-01-01', end: '2024-03-31', value: 30, segment: { dimension: 'ProductAxis' } }),
      secFact({ start: '2024-01-01', end: '2024-03-31', value: 100 }),
    ]),
  })
  assert.deepEqual(result.observations.map((item) => item.normalizedValue), [100])
})

test('current annual reporting currency defines one comparable consolidated series', () => {
  const facts = {
    facts: {
      'us-gaap': {
        Revenues: {
          label: 'Revenues',
          units: {
            RUB: [secFact({ start: '2023-01-01', end: '2023-12-31', value: 800_125_000_000, fp: 'FY', form: '20-F' })],
            USD: [
              secFact({ start: '2023-01-01', end: '2023-12-31', value: 9_800_000, fp: 'FY', form: '20-F', filed: '2026-04-01' }),
              secFact({ start: '2025-01-01', end: '2025-12-31', value: 529_800_000, fp: 'FY', fy: 2025, form: '20-F', filed: '2026-04-01' }),
            ],
          },
        },
      },
    },
  }
  const result = adaptSecCanonicalRevenue({ company, facts })
  assert.equal(result.observations.every((item) => item.currency === 'USD'), true)
  assert.equal(result.observations.find((item) => item.periodIdentity.periodEnd === '2023-12-31').normalizedValue, 9_800_000)
})

test('SEC cumulative facts use the common normalizer to derive standalone quarters', () => {
  const facts = companyFacts([
    secFact({ start: '2024-01-01', end: '2024-03-31', value: 100, fp: 'Q1' }),
    secFact({ start: '2024-01-01', end: '2024-06-30', value: 250, fp: 'Q2' }),
    secFact({ start: '2024-01-01', end: '2024-09-30', value: 450, fp: 'Q3' }),
    secFact({ start: '2024-01-01', end: '2024-12-31', value: 700, fp: 'FY', form: '10-K', filed: '2025-02-01' }),
  ])
  const result = buildSecEnrichedRevenueShadow({
    ticker: company.ticker, company, facts, wiseSheetsRows: [], years: [2024], asOfDate: '2025-03-01',
  })
  assert.equal(result.calendarActuals[2024].value, 700)
  assert.equal(result.calendarActuals[2024].classification, CY_CLASSIFICATION.REPORTED_CALENDAR_YEAR)
  assert.deepEqual(result.records.filter((item) => item.periodIdentity.periodType === PERIOD_TYPE.STANDALONE_QUARTER)
    .map((item) => item.normalizedValue), [100, 150, 200, 250])
})

test('reconciled WiseSheets value retains its source while SEC supplies period authority', () => {
  const sec = adaptSecCanonicalRevenue({
    company,
    facts: companyFacts([secFact({ start: '2024-04-01', end: '2024-06-30', value: 150, fp: 'Q2' })]),
  })
  const wise = adaptWiseSheetsObservations([wiseRow({ end: '2024-06-30', value: 150.05, fy: 2024, fp: 'Q2' })]).observations
  const result = resolveWiseSheetsWithSecRevenue(wise, sec.observations)
  assert.equal(result.records.length, 1)
  assert.equal(result.records[0].sourceProvider, 'WiseSheets')
  assert.equal(result.records[0].periodIdentity.dateAuthority, DATE_AUTHORITY.REPORTED)
  assert.equal(result.records[0].derivation.periodEvidence.sourceProvider, 'SEC')
})

test('material WiseSheets versus SEC disagreement fails closed for review', () => {
  const sec = adaptSecCanonicalRevenue({
    company,
    facts: companyFacts([secFact({ start: '2024-04-01', end: '2024-06-30', value: 150, fp: 'Q2' })]),
  })
  const wise = adaptWiseSheetsObservations([wiseRow({ end: '2024-06-30', value: 175, fy: 2024, fp: 'Q2' })]).observations
  const result = resolveWiseSheetsWithSecRevenue(wise, sec.observations)
  assert.equal(result.records[0].deduplicationStatus, 'REQUIRES_REVIEW')
  assert.equal(result.records[0].conflicts[0].type, 'VALUE_CONFLICT')
})

test('latest reported period comes from the financial context end, never filing date', () => {
  const sec = adaptSecCanonicalRevenue({
    company,
    facts: companyFacts([secFact({
      start: '2026-04-01', end: '2026-06-30', value: 250, fy: 2026, fp: 'Q2', filed: '2026-08-15',
    })]),
  })
  const latest = resolveLatestReportedRevenuePeriod(sec.observations)
  assert.equal(latest.valid, true)
  assert.equal(latest.periodEnd, '2026-06-30')
  assert.notEqual(latest.periodEnd, '2026-08-15')
})

test('targeted inline XBRL fills a report period newer than Company Facts', async () => {
  const filings = {
    company: { ...company, fiscalYearEnd: '1231' },
    filings: [{
      cik: company.cik,
      form: '10-Q',
      reportDate: '2026-06-30',
      filingDate: '2026-07-28',
      accessionNumber: '0000000001-26-000002',
      secUrl: 'https://www.sec.gov/Archives/fixture-q2.htm',
    }],
  }
  const existing = companyFacts([secFact({
    start: '2026-01-01', end: '2026-03-31', value: 750, fy: 2026, fp: 'Q1', filed: '2026-04-29',
  })])
  const html = `
    <xbrli:context id="q2"><xbrli:entity><xbrli:identifier scheme="x">1</xbrli:identifier></xbrli:entity>
      <xbrli:period><xbrli:startDate>2026-04-01</xbrli:startDate><xbrli:endDate>2026-06-30</xbrli:endDate></xbrli:period>
    </xbrli:context>
    <xbrli:unit id="USD"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>
    <ix:nonFraction name="us-gaap:Revenues" contextRef="q2" unitRef="USD" decimals="0">1,065,365,000</ix:nonFraction>`
  const result = await loadTargetedSecRevenueCompletion({
    company, facts: existing, filings, retrievedAt: '2026-07-29T00:00:00.000Z',
    fetchText: async () => html,
  })
  assert.equal(result.filings.length, 1)
  assert.equal(result.records.find((item) => item.metricCandidates.includes('revenue'))?.value, 1_065_365_000)
})

test('off-calendar SEC quarters flow through common overlap calendarization', () => {
  const entries = [
    ['2023-11-01', '2024-01-31', 100, 2024, 'Q1'],
    ['2024-02-01', '2024-04-30', 200, 2024, 'Q2'],
    ['2024-05-01', '2024-07-31', 300, 2024, 'Q3'],
    ['2024-08-01', '2024-10-31', 400, 2024, 'Q4'],
    ['2024-11-01', '2025-01-31', 500, 2025, 'Q1'],
  ].map(([start, end, value, fy, fp]) => secFact({ start, end, value, fy, fp }))
  const result = buildSecEnrichedRevenueShadow({
    ticker: company.ticker, company, facts: companyFacts(entries), wiseSheetsRows: [], years: [2024], asOfDate: '2025-02-01',
  })
  assert.equal(result.calendarActuals[2024].classification, CY_CLASSIFICATION.CALENDARIZED_ESTIMATE)
  assert.equal(result.calendarActuals[2024].status, HISTORICAL_RESULT_STATUS.VERIFIED_DERIVED)
  assert.notEqual(result.calendarActuals[2024].value, 1_000)
})

test('comparison exposes source split, freshness, and SEC completion status', () => {
  const facts = companyFacts([
    secFact({ start: '2024-01-01', end: '2024-03-31', value: 100, fp: 'Q1' }),
    secFact({ start: '2024-04-01', end: '2024-06-30', value: 150, fp: 'Q2' }),
    secFact({ start: '2024-07-01', end: '2024-09-30', value: 200, fp: 'Q3' }),
    secFact({ start: '2024-10-01', end: '2024-12-31', value: 250, fp: 'Q4', form: '10-K' }),
  ])
  const canonical = buildSecEnrichedRevenueShadow({
    ticker: company.ticker, company, facts, wiseSheetsRows: [], years: [2024], asOfDate: '2025-02-01',
  })
  const rows = compareRevenueShadow(company.ticker, { calendarActuals: { revenue: {} }, ltm: {} }, canonical, [2024])
  assert.equal(rows[0].secCompleted, true)
  assert.equal(rows[0].periodEvidenceSource.startsWith('https://data.sec.gov/'), true)
  assert.equal(rows[1].latestCanonicalQuarter, '2024-12-31')
})

test('real SEC revenue regressions preserve independently cited values and reported boundaries', () => {
  assert.ok(golden.observations.length >= 8)
  for (const fixture of golden.observations) {
    assert.match(fixture.sourceUrl, /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\//)
    const fixtureCompany = { ticker: fixture.ticker, cik: fixture.sourceUrl.split('/')[6], name: fixture.ticker }
    const facts = {
      facts: {
        'us-gaap': {
          [fixture.concept]: {
            label: fixture.concept,
            units: {
              [fixture.currency]: [{
                start: fixture.periodStart,
                end: fixture.periodEnd,
                val: fixture.value,
                fy: Number(fixture.periodEnd.slice(0, 4)),
                fp: fixture.period.startsWith('Q') ? fixture.period.slice(0, 2) : 'FY',
                form: fixture.form,
                filed: '2026-08-15',
                accn: fixture.accession,
              }],
            },
          },
        },
      },
    }
    const filing = {
      accessionNumber: fixture.accession,
      filingUrl: fixture.sourceUrl,
    }
    const result = adaptSecCanonicalRevenue({
      company: fixtureCompany,
      facts,
      filings: { company: { fiscalYearEnd: '1231' }, filings: [filing] },
    })
    assert.equal(result.observations[0].normalizedValue, fixture.value, `${fixture.ticker} ${fixture.period}`)
    assert.equal(result.observations[0].periodIdentity.dateAuthority, DATE_AUTHORITY.REPORTED)
    assert.equal(result.observations[0].sourceUrl, fixture.sourceUrl)
  }
})

test('server-only revenue runner and report remain independently testable in shadow mode', async () => {
  const entries = [
    secFact({ start: '2024-01-01', end: '2024-03-31', value: 100, fp: 'Q1' }),
    secFact({ start: '2024-01-01', end: '2024-06-30', value: 250, fp: 'Q2' }),
    secFact({ start: '2024-01-01', end: '2024-09-30', value: 450, fp: 'Q3' }),
    secFact({ start: '2024-01-01', end: '2024-12-31', value: 700, fp: 'FY', form: '10-K' }),
  ]
  const wiseSheetsRows = [
    wiseRow({ end: '2024-03-31', value: 100, fy: 2024, fp: 'Q1' }),
    wiseRow({ end: '2024-06-30', value: 150, fy: 2024, fp: 'Q2' }),
    wiseRow({ end: '2024-09-30', value: 200, fy: 2024, fp: 'Q3' }),
    wiseRow({ end: '2024-12-31', value: 250, fy: 2024, fp: 'Q4' }),
  ]
  const result = await runSecRevenueShadowComparison([company.ticker], [2024], {
    wiseSheetsRows,
    companies: { [company.ticker]: company },
    companyFacts: { [company.ticker]: companyFacts(entries) },
    companyFilings: { [company.ticker]: { company: { fiscalYearEnd: '1231' }, filings: [] } },
    supplementalFacts: { [company.ticker]: [] },
    asOfDate: '2025-03-01',
  })
  assert.equal(result.comparisons.length, 2)
  assert.equal(result.companies.TEST.canonical.calendarActuals[2024].value, 700)
  const report = renderSecRevenueShadowReport(result, { generatedAt: '2026-09-05T00:00:00.000Z' })
  assert.match(report, /Production values were not changed/)
  assert.match(report, /\| TEST \| 2024A \|/)
})
