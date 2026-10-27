import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFilingIndex } from '../server/valuation/filingIndex.js'

const company = { ticker: 'INVENTORY', cik: '0000000001', name: 'Inventory Test Co' }

test('SEC filing inventory requires aligned arrays and period dates on periodic reports', async () => {
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

  const unrelatedFormWithoutPeriod = await buildFilingIndex(company, { submissions: {
    filings: { recent: {
      form: ['10-K', '4'], accessionNumber: ['0000000001-25-000001', '0000000001-25-000002'],
      reportDate: ['2024-12-31', ''], filingDate: ['2025-02-01', '2025-02-02'],
      primaryDocument: ['annual.htm', 'ownership.htm'],
    }, files: [] },
  } })
  assert.equal(unrelatedFormWithoutPeriod.inventoryEvidence.complete, true)
})
