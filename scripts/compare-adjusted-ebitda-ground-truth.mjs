import { readFile } from 'node:fs/promises'

const fixtureUrl = new URL('../tests/fixtures/adjusted-ebitda-sec-ground-truth.json', import.meta.url)
const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'))
const apiBase = process.env.VALUATION_API_BASE ?? 'http://127.0.0.1:5173'
const tickers = fixture.companies.map((company) => company.ticker)

const response = await fetch(`${apiBase}/api/valuation?tickers=${encodeURIComponent(tickers.join(','))}`)
if (!response.ok) throw new Error(`Valuation API returned HTTP ${response.status}`)
const payload = await response.json()
const productionRows = new Map((payload.rows ?? []).map((row) => [row.ticker, row]))

function mismatchReason(row, period, expected, actual) {
  if (period.productionPeriod == null) return 'NOT_COMPARABLE_TO_PRODUCTION_CALENDAR_COLUMNS'
  if (!row) return 'PRODUCTION_TICKER_MISSING'
  if (row.error) return `PRODUCTION_ROW_ERROR: ${row.error}`
  const source = row.provenance?.ebitda?.[period.productionPeriod]
  if (actual == null && expected != null) {
    return source?.method ?? source?.warnings?.[0] ?? 'PRODUCTION_VALUE_MISSING'
  }
  if (expected == null && actual != null) return 'PRODUCTION_VALUE_PRESENT_WHERE_GOLDEN_IS_NA'
  const component = source?.components?.[0]
  if (component) {
    const sourceCell = [component.accn, component.columnLabel, component.rawCellValue]
      .filter(Boolean)
      .join(' | ')
    return `VALUE_MISMATCH; production source cell: ${sourceCell}`
  }
  return 'VALUE_MISMATCH_WITHOUT_SOURCE_CELL'
}

const results = []
for (const company of fixture.companies) {
  const row = productionRows.get(company.ticker)
  for (const period of company.periods) {
    const expected = period.expectedValue
    const actual = period.productionPeriod == null ? null : row?.metrics?.ebitda?.[period.productionPeriod] ?? null
    const comparable = period.productionPeriod != null
    const match = comparable && (expected == null
      ? actual == null
      : actual != null && Math.abs(actual - expected) <= Math.max(1, Math.abs(expected) * 1e-9))
    results.push({
      ticker: company.ticker,
      period: period.period,
      goldenExpected: expected,
      productionActual: actual,
      match: comparable ? match : null,
      rootCause: comparable && match ? null : mismatchReason(row, period, expected, actual),
    })
  }
}

console.log('| Ticker | Period | Golden Expected | Production Actual | Match | Root Cause if Wrong |')
console.log('|---|---:|---:|---:|:---:|---|')
for (const result of results) {
  const expected = result.goldenExpected == null ? 'N/A' : String(result.goldenExpected)
  const actual = result.productionActual == null ? 'N/A' : String(result.productionActual)
  const match = result.match == null ? 'N/C' : result.match ? 'YES' : 'NO'
  console.log(`| ${result.ticker} | ${result.period} | ${expected} | ${actual} | ${match} | ${result.rootCause ?? ''} |`)
}

if (results.some((result) => result.match === false)) process.exitCode = 1
