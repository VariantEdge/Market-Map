import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const report = JSON.parse(await readFile(new URL('../docs/audits/fiscalai-latest.json', import.meta.url), 'utf8'))
const cellKey = (cell) => `${cell.ticker}|${cell.metric}|${cell.period}`

test('public Fiscal.ai review report covers the exact mandatory audit universe', () => {
  assert.equal(report.cells.length, 336)
  assert.equal(new Set(report.cells.map(cellKey)).size, 336)
  assert.equal(report.universe.tickers.length, 12)
  assert.equal(report.universe.metrics.length, 7)
  assert.equal(report.universe.periods.length, 4)
  assert.equal(report.summary.verifiedTotal + report.acceptedNaCells.length +
    report.unresolvedCells.length, 336)
  assert.equal(report.summary.unresolvedCellCount, report.unresolvedCells.length)
  assert.equal(report.providerMismatches.length, report.summary.fiscalAiDiscrepancyCount)
})

test('public audit does not redistribute bulk Fiscal.ai candidate values or credentials', () => {
  assert.ok(report.providerMismatches.every((row) => row.providerValueUsd === null &&
    row.providerValuePublication === 'WITHHELD_PENDING_PUBLIC_REDISTRIBUTION_RIGHTS'))
  assert.ok(report.providerMismatches.every((row) =>
    /^https:\/\/(?:www\.|data\.)sec\.gov\//.test(row.secSource.filingUrl ?? '')))
  const serialized = JSON.stringify(report)
  assert.doesNotMatch(serialized, /FISCAL_API_KEY\s*[:=]\s*[^\s,}]+/)
  assert.doesNotMatch(serialized, /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*[^\s,}]+/)
  assert.doesNotMatch(serialized, /fiscalValue|originalSourceUrl|rawProviderPayload/)
})

test('unresolved and accepted N/A classifications stay distinct', () => {
  const unresolved = new Set(report.unresolvedCells.map(cellKey))
  const accepted = new Set(report.acceptedNaCells.map(cellKey))
  assert.ok([...unresolved].every((key) => !accepted.has(key)))
  assert.ok(report.unresolvedCells.every((cell) => cell.valueUsd === null &&
    cell.validationEvidence.auditIssues.length > 0))
  assert.ok(report.acceptedNaCells.every((cell) => cell.valueUsd === null &&
    cell.validationEvidence.auditIssues.length === 0))
})
