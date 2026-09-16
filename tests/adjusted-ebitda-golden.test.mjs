import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { extractStructuredNonGaapTableFacts } from '../server/valuation/filingFactExtractor.js'
import {
  ADJUSTED_EBITDA_PERIOD,
  assertCanonicalAdjustedEbitdaEntry,
  buildCanonicalAdjustedEbitda,
} from '../server/valuation/adjustedEbitdaEngine.js'

const fixtureRoot = new URL('./fixtures/', import.meta.url)
const golden = JSON.parse(await readFile(fileURLToPath(new URL('adjusted-ebitda-golden.json', fixtureRoot)), 'utf8'))

function key(record) {
  return `${record.periodType}:${record.startDate}:${record.endDate}`
}

test('golden fixture set is independent, broad, and contains at least 30 SEC-sourced values', () => {
  const tickers = new Set(golden.sources.map((source) => source.ticker))
  const values = golden.sources.flatMap((source) => source.expected)
  assert.ok(golden.methodology.includes('manually transcribed'))
  assert.ok(tickers.size >= 10)
  assert.ok(values.length >= 40)
  for (const required of ['BE', 'CRWV', 'FCEL', 'GEV', 'IREN', 'NBIS']) assert.ok(tickers.has(required))
  for (const periodType of ['CALENDAR_YEAR', 'FISCAL_YEAR', 'QUARTER', 'YTD_6M']) {
    assert.ok(values.some((value) => value.periodType === periodType), `missing ${periodType} coverage`)
  }
  assert.ok(values.some((value) => value.value < 0), 'negative-value coverage is required')
  assert.ok(golden.sources.some((source) => source.form === '10-Q'), 'quarterly filing coverage is required')
  assert.ok(golden.sources.some((source) => ['S-1', 'F-1'].includes(source.form)) || tickers.has('CRWV'), 'IPO-history issuer coverage is required')
})

for (const source of golden.sources) {
  test(`golden SEC reconciliation: ${source.ticker} ${source.document}`, async () => {
    const html = await readFile(fileURLToPath(new URL(source.fixture, fixtureRoot)), 'utf8')
    const company = {
      ticker: source.ticker,
      name: source.name,
      cik: source.cik,
      fiscalYearEnd: source.fiscalYearEnd,
    }
    const filing = {
      id: `${source.cik}:${source.accession}`,
      immutableSourceId: `SEC:${source.cik}:${source.accession}`,
      form: source.form,
      accessionNumber: source.accession,
      filingDate: source.filingDate,
      reportDate: source.reportDate,
      filingUrl: source.url,
    }
    const actual = extractStructuredNonGaapTableFacts({
      company,
      filing,
      html,
      retrievedAt: '2026-08-28T00:00:00.000Z',
    })
    const actualByPeriod = new Map(actual.map((record) => [key(record), record]))
    assert.equal(actual.length, source.expected.length)
    for (const expected of source.expected) {
      const record = actualByPeriod.get(key(expected))
      assert.ok(record, `missing ${key(expected)}`)
      assert.equal(record.value, expected.value)
      assert.equal(record.rawReportedValue, expected.rawValue)
      assert.equal(record.reportedUnits, expected.reportedUnits)
      assert.equal(record.accessionNumber, source.accession)
      assert.equal(record.filingUrl, source.url)
      assert.equal(record.rawSourceType, 'SEC_NON_GAAP_RECONCILIATION_TABLE')
      assert.equal(record.structuralIntegrity.valid, true)
      assert.equal(record.structuralIntegrity.mapping, 'EXPLICIT_TABLE_GRID')
      assert.ok(record.tableContext.rowLabel)
      assert.ok(record.tableContext.columnLabel)
      assert.ok(record.definitionFingerprint)
    }
  })
}

test('golden SEC quarters produce Reddit 2025 LTM Adjusted EBITDA through the canonical engine', async () => {
  const sources = golden.sources.filter((source) => source.ticker === 'RDDT')
  const company = { ticker: 'RDDT', name: 'Reddit, Inc.', cik: '0001713445', fiscalYearEnd: '1231' }
  const rawLedger = []
  for (const source of sources) {
    const html = await readFile(fileURLToPath(new URL(source.fixture, fixtureRoot)), 'utf8')
    rawLedger.push(...extractStructuredNonGaapTableFacts({
      company,
      filing: {
        id: `${source.cik}:${source.accession}`,
        immutableSourceId: `SEC:${source.cik}:${source.accession}`,
        form: source.form,
        accessionNumber: source.accession,
        filingDate: source.filingDate,
        reportDate: source.reportDate,
        filingUrl: source.url,
      },
      html,
      retrievedAt: '2026-08-28T00:00:00.000Z',
    }))
  }
  const engine = buildCanonicalAdjustedEbitda({ company, rawLedger, years: [2025] })
  assert.equal(engine.ltm.value, 845_073_000)
  assert.equal(engine.ltm.components.length, 4)
  assert.deepEqual(engine.ltm.components.map((item) => item.sourceEnd), [
    '2025-03-31', '2025-06-30', '2025-09-30', '2025-12-31',
  ])
  assertCanonicalAdjustedEbitdaEntry(engine.ltm, ADJUSTED_EBITDA_PERIOD.LTM)
})
