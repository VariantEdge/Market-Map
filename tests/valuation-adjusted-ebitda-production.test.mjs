import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  getValuationRows,
  hasCompleteAuditedAdjustedEbitda,
  loadAdjustedEbitdaProductionTask,
  loadLegacyForwardBasisProductionTask,
} from '../api/valuationData.js'
import { extractStructuredNonGaapTableFacts } from '../server/valuation/filingFactExtractor.js'
import { buildCanonicalAdjustedEbitda } from '../server/valuation/adjustedEbitdaEngine.js'
import { createMemoryFinancialSnapshotRepository } from '../server/valuation/financialSnapshot.js'
import { buildRowAudit } from '../server/valuation/validation.js'

const fixtureRoot = new URL('./fixtures/', import.meta.url)
const golden = JSON.parse(await readFile(fileURLToPath(new URL('adjusted-ebitda-golden.json', fixtureRoot)), 'utf8'))
const years = { actual: [2023, 2024, 2025], estimate: [2026, 2027] }

function verified(value) {
  return { value, validationStatus: 'VERIFIED_REPORTED', components: [] }
}

function audit(actualValues = {}, ltm = null) {
  return {
    actuals: { ebitda: Object.fromEntries(years.actual.map((year) => [year,
      actualValues[year] == null ? null : verified(actualValues[year])])) },
    ltm: { ebitda: ltm == null ? null : verified(ltm) },
  }
}

async function goldenRecords(ticker) {
  const records = []
  for (const source of golden.sources.filter((item) => item.ticker === ticker)) {
    const html = await readFile(fileURLToPath(new URL(source.fixture, fixtureRoot)), 'utf8')
    records.push(...extractStructuredNonGaapTableFacts({
      company: { ticker, name: source.name, cik: source.cik, fiscalYearEnd: source.fiscalYearEnd },
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
      retrievedAt: '2026-09-14T00:00:00.000Z',
    }))
  }
  return records
}

function auditedStatus(status, period = '2025A') {
  const row = {
    ticker: 'SYNTH', currency: 'USD',
    metrics: { revenue: {}, ebitda: { [period]: null } },
    provenance: { ebitda: { [period]: {
      value: null, validationStatus: status, method: status, components: [],
    } } },
  }
  return buildRowAudit(row).cells[`ebitda:${period}`]
}

test('successful extraction with zero company-defined evidence is NOT_REPORTED through audit', () => {
  const result = buildCanonicalAdjustedEbitda({
    company: { ticker: 'SYNTH', name: 'Synthetic', cik: '1' }, rawLedger: [], years: [2025],
  })
  assert.equal(result.calendarActuals[2025].validationStatus, 'NOT_REPORTED')
  assert.equal(result.ltm.validationStatus, 'NOT_REPORTED')
  assert.equal(auditedStatus(result.calendarActuals[2025].validationStatus).status, 'NOT_REPORTED')
})

test('extraction failure remains MISSING_SOURCE_DATA through audit', async () => {
  const result = await loadAdjustedEbitdaProductionTask({
    company: { ticker: 'SYNTH', cik: '1' }, facts: { facts: {} }, filingIndex: { filings: [] },
    years: [2025], preloadedSupplemental: Promise.resolve({
      records: [], errors: ['ADJUSTED_EBITDA_EXTRACTION_TIMEOUT'], failure: 'ADJUSTED_EBITDA_EXTRACTION_TIMEOUT',
    }),
  }, { buildLedger: async () => { throw new Error('must not build') } })
  assert.equal(result.failure, 'ADJUSTED_EBITDA_EXTRACTION_TIMEOUT')
  assert.equal(auditedStatus('MISSING_SOURCE_DATA').status, 'MISSING_SOURCE_DATA')
})

test('partial reported evidence is INSUFFICIENT_PERIOD_COVERAGE through audit', async () => {
  const records = await goldenRecords('CRWV')
  const result = buildCanonicalAdjustedEbitda({
    company: { ticker: 'CRWV', name: 'CoreWeave, Inc.', cik: '0001769628' },
    rawLedger: records.filter((record) => record.periodType === 'QUARTER').slice(0, 1),
    years: [2025],
  })
  assert.equal(result.ltm.validationStatus, 'INSUFFICIENT_PERIOD_COVERAGE')
  assert.equal(auditedStatus(result.ltm.validationStatus, 'LTM').status, 'INSUFFICIENT_PERIOD_COVERAGE')
})

test('incompatible reported definitions are DEFINITION_INCOMPATIBLE through audit', async () => {
  const records = []
  for (const ticker of ['RDDT']) records.push(...await goldenRecords(ticker))
  const quarters = records.filter((record) => record.periodType === 'QUARTER' && record.startDate.startsWith('2025-'))
    .sort((left, right) => left.startDate.localeCompare(right.startDate))
    .slice(0, 4)
    .map((record, index) => ({
      ...record,
      definitionFingerprint: `incompatible-definition-${index}`,
      tableContext: { ...record.tableContext, rowLabels: [`Unique adjustment ${index}`] },
    }))
  const result = buildCanonicalAdjustedEbitda({
    company: { ticker: 'SYNTH', name: 'Synthetic', cik: '1' }, rawLedger: quarters, years: [2025],
  })
  assert.equal(result.ltm.validationStatus, 'DEFINITION_INCOMPATIBLE')
  assert.equal(auditedStatus(result.ltm.validationStatus, 'LTM').status, 'DEFINITION_INCOMPATIBLE')
})

for (const status of ['LEGITIMATE_NA', 'REQUIRES_REVIEW', 'OUT_OF_SCOPE']) {
  test(`null Adjusted EBITDA preserves ${status} through audit`, () => {
    assert.equal(auditedStatus(status).status, status)
  })
}

test('audited GAAP presence does not suppress supplemental Adjusted EBITDA', async () => {
  const audited = audit()
  audited.actuals.revenue = { 2023: verified(1), 2024: verified(2), 2025: verified(3) }
  assert.equal(hasCompleteAuditedAdjustedEbitda(audited, years.actual), false)

  let supplementalLoads = 0
  const result = await loadAdjustedEbitdaProductionTask({
    company: { ticker: 'SYNTH', cik: '1' }, facts: { facts: {} }, filingIndex: { filings: [] },
    years: years.actual, skipSupplemental: false,
  }, {
    loadCached: async () => null,
    loadSupplemental: async () => { supplementalLoads += 1; return { records: [], errors: [] } },
    buildLedger: async ({ supplementalRawFacts }) => ({ supplementalRawFacts }),
  })
  assert.equal(supplementalLoads, 1)
  assert.deepEqual(result.ledger.supplementalRawFacts, [])
})

test('complete audited Adjusted EBITDA coverage is the only valid supplemental skip condition', () => {
  assert.equal(hasCompleteAuditedAdjustedEbitda(audit({ 2023: 1, 2024: 2, 2025: 3 }, 4), years.actual), true)
  assert.equal(hasCompleteAuditedAdjustedEbitda(audit({ 2023: 1, 2024: 2, 2025: 3 }), years.actual), false)
  assert.equal(hasCompleteAuditedAdjustedEbitda(audit({ 2023: 1, 2024: 2 }, 4), years.actual), false)
})

test('Adjusted EBITDA and forward basis consume one preloaded supplemental result', async () => {
  let supplementalLoads = 0
  const shared = Promise.resolve().then(() => {
    supplementalLoads += 1
    return { records: [{ sourceId: 'shared' }], errors: [], failure: null }
  })
  const input = {
    ticker: 'SYNTH', company: { ticker: 'SYNTH', cik: '1' }, facts: { facts: {} },
    filingIndex: { filings: [] }, years: [2025], wiseSheetsRows: [], preloadedSupplemental: shared,
  }
  const buildLedger = async ({ supplementalRawFacts }) => ({
    ledger: {}, adjustedEbitda: { ltm: null }, calendarActuals: { ebitda: {} }, supplementalRawFacts,
  })
  const [adjusted, forward] = await Promise.all([
    loadAdjustedEbitdaProductionTask(input, { buildLedger }),
    loadLegacyForwardBasisProductionTask(input, { buildLedger }),
  ])
  assert.equal(supplementalLoads, 1)
  assert.equal(adjusted.ledger.supplementalRawFacts[0].sourceId, 'shared')
  assert.equal(forward.diagnostic, null)
})

test('supplemental acquisition failure remains extraction failure, not legitimate non-reporting', async () => {
  const result = await loadAdjustedEbitdaProductionTask({
    company: { ticker: 'SYNTH', cik: '1' }, facts: { facts: {} }, filingIndex: { filings: [] },
    years: [2025], preloadedSupplemental: Promise.resolve({
      records: [], errors: ['ADJUSTED_EBITDA_EXTRACTION_FAILED'], failure: 'ADJUSTED_EBITDA_EXTRACTION_FAILED',
    }),
  }, { buildLedger: async () => { throw new Error('must not build') } })
  assert.equal(result.failure, 'ADJUSTED_EBITDA_EXTRACTION_FAILED')
  assert.notEqual(result.failure, 'NOT_REPORTED')
})

for (const expected of [
  ['BE', { '2023A': 81_791_000, '2024A': 160_651_000, '2025A': 271_591_000 }],
  ['CRWV', { '2024A': 1_219_000_000, '2025A': 3_093_000_000 }],
  ['GEV', { '2023A': 807_000_000, '2024A': 2_035_000_000, '2025A': 3_196_000_000 }],
]) {
  test(`${expected[0]} golden Adjusted EBITDA survives production row and durable snapshot`, async () => {
    const ticker = expected[0]
    const sources = golden.sources.filter((item) => item.ticker === ticker)
    const company = { ticker, name: sources[0].name, cik: sources[0].cik, fiscalYearEnd: sources[0].fiscalYearEnd }
    const records = await goldenRecords(ticker)
    let supplementalLoads = 0
    const repository = createMemoryFinancialSnapshotRepository()
    const response = await getValuationRows(null, [ticker], {
      financialRefresh: true,
      snapshotRepository: repository,
      providerLoader: async () => ({ value: [], cache: { state: 'MISS' } }),
      marketLoader: async () => new Map([[ticker, { price: 10, previousClose: 9, currency: 'USD' }]]),
      auditedFinancialsLoader: async () => audit(),
      priceLoader: async () => ({ price: 10, previousClose: 9, currency: 'USD' }),
      fundamentalsLoader: async () => ({ currency: 'USD', estimates: { revenueConsensus: [] } }),
      companyResolver: async () => company,
      chartLoader: async () => ({ points: [{ close: 9 }, { close: 10 }] }),
      filingIndexLoader: async () => ({ company, filings: sources.map((source) => ({ form: source.form })) }),
      companyFactsLoader: async () => ({ facts: {} }),
      canonicalHistoricalBuilder: async () => ({ canonical: {
        calendarActuals: {}, ltm: {}, records: {}, latestReportedPeriods: {}, failures: [],
      } }),
      supplementalDependencies: {
        loadCached: async () => null,
        loadSupplemental: async () => {
          supplementalLoads += 1
          return { records, errors: [], filingsExamined: sources.length }
        },
      },
      profileCacheKey: `adjusted-production-${ticker}-${Date.now()}`,
    })
    assert.equal(supplementalLoads, 1)
    const row = response.rows[0]
    for (const [period, value] of Object.entries(expected[1])) {
      assert.equal(row.metrics.ebitda[period], value)
      assert.equal(row.provenance.ebitda[period].validationStatus, 'VERIFIED_REPORTED')
      assert.match(row.provenance.ebitda[period].sourceType, /SEC-filed company non-GAAP reconciliation/)
      assert.equal(row.provenance.ebitda[period].components[0].adjustedEbitdaMethod, 'COMPANY_REPORTED_ADJ_EBITDA')
    }
    const stored = await repository.load(null, [ticker], { actualYears: years.actual })
    assert.deepEqual(stored.snapshots.get(ticker).metrics.ebitda, row.metrics.ebitda)
    const activityCounters = {}
    const normal = await getValuationRows(null, [ticker], {
      snapshotRepository: repository,
      marketLoader: async () => new Map([[ticker, { price: 10, previousClose: 9, currency: 'USD' }]]),
      providerLoader: async () => { throw new Error('Normal snapshot read must not acquire WiseSheets') },
      financialRowBuilder: async () => { throw new Error('Normal snapshot read must not extract EBITDA') },
      activityCounters,
      profileCacheKey: `adjusted-persisted-${ticker}-${Date.now()}`,
    })
    for (const [period, value] of Object.entries(expected[1])) {
      assert.equal(normal.rows[0].metrics.ebitda[period], value)
      assert.equal(normal.rows[0].provenance.ebitda[period].validationStatus, 'VERIFIED_REPORTED')
      assert.equal(normal.rows[0].audit.cells[`ebitda:${period}`].displayable, true)
    }
    assert.equal(activityCounters.adjustedEbitdaRuns, 0)
  })
}
