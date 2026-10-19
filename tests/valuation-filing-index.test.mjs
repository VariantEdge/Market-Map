import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFilingIndex } from '../server/valuation/filingIndex.js'

const company = { ticker: 'INVENTORY', cik: '0000000001', name: 'Inventory Test Co' }

test('SEC filing inventory is complete only when accession, form, and report-date arrays align', async () => {
  const complete = await buildFilingIndex(company, { submissions: {
    filings: { recent: {
      form: ['10-K'], accessionNumber: ['0000000001-25-000001'],
      reportDate: ['2024-12-31'], filingDate: ['2025-02-01'], primaryDocument: ['annual.htm'],
    }, files: [] },
  } })
  assert.equal(complete.inventoryEvidence.complete, true)

  const missingDates = await buildFilingIndex(company, { submissions: {
    filings: { recent: {
      form: ['10-K'], accessionNumber: ['0000000001-25-000001'],
      reportDate: [], filingDate: ['2025-02-01'], primaryDocument: ['annual.htm'],
    }, files: [] },
  } })
  assert.equal(missingDates.inventoryEvidence.complete, false)
})
