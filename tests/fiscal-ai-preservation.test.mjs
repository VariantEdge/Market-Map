import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const manifest = JSON.parse(await readFile(new URL('../docs/audits/fiscalai-preservation-manifest.json', import.meta.url), 'utf8'))
const expectedTickers = ['AMZN', 'BE', 'CRWV', 'FCEL', 'GEV', 'GOOGL', 'INTC', 'IREN', 'META', 'MU', 'MSFT', 'NBIS']
const expectedTypes = ['Annual', 'Quarterly', 'Semi-Annual', 'YTD', 'LTM']

test('Fiscal.ai preservation manifest covers every required ticker and archive input', () => {
  assert.deepEqual(manifest.scope.tickers, expectedTickers)
  assert.deepEqual(manifest.tickerCoverage.map((item) => item.ticker), expectedTickers)
  assert.equal(manifest.files.filter((item) => item.kind === 'fiscal_mcp_capture').length, 12)
  assert.equal(manifest.files.filter((item) => item.kind === 'targeted_as_reported_capture').length, 1)
  assert.equal(manifest.files.filter((item) => item.kind === 'local_audit_fixture').length, 6)
  assert.equal(new Set(manifest.files.map((item) => item.archiveRelativePath)).size, manifest.files.length)
  assert.ok(manifest.files.every((item) => /^[a-f0-9]{64}$/.test(item.sha256) && item.bytes > 0))
})

test('period coverage records missing as-reported and cash-flow periods explicitly', () => {
  for (const ticker of manifest.tickerCoverage) {
    for (const endpoint of Object.values(ticker.endpoints)) {
      assert.deepEqual(Object.keys(endpoint.periodTypes), expectedTypes)
      assert.ok(expectedTypes.every((type) => endpoint.periodTypes[type].rows > 0))
    }
    assert.ok(ticker.missingEndpointCaptures.includes('asReportedCashFlow'))
  }
  const iren = manifest.tickerCoverage.find((item) => item.ticker === 'IREN')
  const nbis = manifest.tickerCoverage.find((item) => item.ticker === 'NBIS')
  assert.ok(iren.missingPeriodEndsRelativeToIncome.standardizedCashFlow.Quarterly.includes('2022-12-31'))
  assert.ok(nbis.missingPeriodEndsRelativeToIncome.standardizedCashFlow.Quarterly.includes('2024-06-30'))
  assert.equal(manifest.tickerCoverage.find((item) => item.ticker === 'AMZN').targetedAsReportedIncome.rows, 67)
})

test('public manifest carries no provider values or credentials', () => {
  const serialized = JSON.stringify(manifest)
  assert.doesNotMatch(serialized, /"(?:value|providerValue|sourceValue)"\s*:/i)
  assert.doesNotMatch(serialized, /(?:api[_-]?key|authorization|bearer)\s*[:=]\s*[^\s,}]+/i)
})
