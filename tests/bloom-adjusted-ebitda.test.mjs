import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { extractStructuredNonGaapTableFacts } from '../server/valuation/filingFactExtractor.js'
import { buildCanonicalQuarterlyLedger, HISTORICAL_STATUS } from '../server/valuation/financialLedger.js'

const company = { name: 'Bloom Energy Corporation', ticker: 'BE', cik: '0001664703' }
const filing2025 = {
  id: '0001664703:0001628280-26-005798',
  immutableSourceId: 'SEC:0001664703:0001628280-26-005798',
  form: '8-K',
  accessionNumber: '0001628280-26-005798',
  filingDate: '2026-02-05',
  reportDate: '2025-12-31',
  filingUrl: 'https://www.sec.gov/Archives/edgar/data/1664703/000162828026005798/ex991_q42025financialresul.htm',
}

const filing2023 = {
  id: '0001664703:0001628280-25-008626',
  immutableSourceId: 'SEC:0001664703:0001628280-25-008626',
  form: '8-K',
  accessionNumber: '0001628280-25-008626',
  filingDate: '2025-02-27',
  reportDate: '2024-12-31',
  filingUrl: 'https://www.sec.gov/Archives/edgar/data/1664703/000162828025008626/ex991_q42024financialresul.htm',
}

async function bloomFacts() {
  const fixtures = [
    [filing2023, './fixtures/be-adjusted-ebitda-2023-reconciliation.html'],
    [filing2025, './fixtures/be-adjusted-ebitda-2025-reconciliation.html'],
  ]
  const records = []
  for (const [filing, filename] of fixtures) {
    const fixtureUrl = new URL(filename, import.meta.url)
    const html = await readFile(fileURLToPath(fixtureUrl), 'utf8')
    records.push(...extractStructuredNonGaapTableFacts({ company, filing, html, retrievedAt: '2026-02-05T00:00:00.000Z' }))
  }
  return records
}

test('extracts Bloom Adjusted EBITDA by explicit row and year-column binding', async () => {
  const facts = await bloomFacts()
  const byYear = Object.fromEntries(facts.map((fact) => [fact.fiscalYear, fact]))

  assert.deepEqual(Object.keys(byYear).map(Number).sort(), [2023, 2024, 2025])
  assert.equal(byYear[2023].value, 81_791_000)
  assert.equal(byYear[2024].value, 160_651_000)
  assert.equal(byYear[2025].value, 271_591_000)
  assert.ok(Math.abs(byYear[2023].value - 81_800_000) <= 50_000)
  assert.ok(Math.abs(byYear[2024].value - 160_700_000) <= 100_000)
  assert.ok(Math.abs(byYear[2025].value - 271_600_000) <= 100_000)
  assert.equal(byYear[2023].rawSourceType, 'SEC_NON_GAAP_RECONCILIATION_TABLE')
  assert.equal(byYear[2023].tableContext.rowLabel, 'Adjusted EBITDA')
  assert.equal(byYear[2023].tableContext.columnLabel, '2023')
  assert.equal(byYear[2023].tableContext.rawCellValue, '81,791')
  assert.equal(byYear[2023].accessionNumber, filing2023.accessionNumber)
  assert.equal(byYear[2023].filingUrl, filing2023.filingUrl)
})

test('promotes Bloom direct company-reported Adjusted EBITDA into calendar actuals', async () => {
  const facts = await bloomFacts()
  const result = await buildCanonicalQuarterlyLedger({
    company,
    facts: null,
    years: [2023, 2024, 2025],
    supplementalRawFacts: facts,
  })

  const expected = { 2023: 81_791_000, 2024: 160_651_000, 2025: 271_591_000 }
  for (const [year, value] of Object.entries(expected)) {
    const actual = result.calendarActuals.ebitda[year]
    assert.equal(actual.value, value)
    assert.equal(actual.validationStatus, HISTORICAL_STATUS.EXACT)
    assert.equal(actual.adjustedEbitdaMethod, 'COMPANY_REPORTED_ADJ_EBITDA')
    assert.equal(actual.components[0].accn, year === '2023' ? filing2023.accessionNumber : filing2025.accessionNumber)
    assert.equal(actual.components[0].tableContext.columnLabel, year)
  }
})
