import test from 'node:test'
import assert from 'node:assert/strict'
import { getValuationRows } from '../api/valuationData.js'
import {
  ADJUSTED_EBITDA_ENGINE_VERSION,
  ADJUSTED_EBITDA_PERIOD,
  adjustedEbitdaDenominatorIdentity,
  assertCanonicalAdjustedEbitdaEntry,
  buildCanonicalAdjustedEbitda,
} from '../server/valuation/adjustedEbitdaEngine.js'
import {
  VALUATION_FINANCIAL_ENGINE_VERSION,
  classifyAdjustedEbitdaSnapshotHealth,
  classifyFinancialSnapshot,
  createMemoryFinancialSnapshotRepository,
  evaluateFinancialSnapshotPromotion,
  migrateAdjustedEbitdaLtmSnapshotRecord,
} from '../server/valuation/financialSnapshot.js'
import { buildRowAudit } from '../server/valuation/validation.js'
import { financialSnapshotNeedsRefresh, runValuationRefreshSequence } from '../src/components/valuationRefreshSequence.js'

const ACTUAL_YEARS = [2023, 2024, 2025]
const company = { ticker: 'SYNTH', name: 'Synthetic Corp.', cik: '0000000001' }

function fact({ type, start, end, value, fiscalYear }) {
  const accession = `0000000001-${end.replaceAll('-', '')}-${type}`
  return {
    metricCandidates: ['adjustedEbitda'],
    rawSourceType: 'SEC_NON_GAAP_RECONCILIATION_TABLE',
    structuralIntegrity: { valid: true, mapping: 'EXPLICIT_TABLE_GRID' },
    tableContext: {
      tableTitle: 'Adjusted EBITDA reconciliation', rowLabel: 'Adjusted EBITDA',
      columnLabel: `${start} to ${end}`, rawCellValue: String(value),
      tableIndex: 0, rowIndex: 2, columnIndex: 3,
      rowLabels: ['stock compensation', 'depreciation amortization', 'restructuring costs', 'acquisition costs',
        'impairment charges', 'legal settlements', 'foreign exchange', 'mark to market', 'other charges',
        'interest expense', 'tax expense', 'one time costs'],
    },
    provenance: { sourceId: `SEC:${accession}`, sourceHash: `hash-${accession}`, retrievedAt: '2026-09-16T00:00:00.000Z' },
    filingUrl: `https://www.sec.gov/Archives/${accession}.htm`, accessionNumber: accession,
    filingForm: '8-K', filingDate: '2026-09-16', periodType: type, periodBasis: 'FISCAL',
    startDate: start, endDate: end, reportedUnits: 'USD millions', reportedScale: 1_000_000,
    rawReportedValue: value / 1_000_000, currency: 'USD', value, units: 'USD',
    label: 'Adjusted EBITDA', definitionFingerprint: 'stable-definition', fiscalYear,
  }
}

function directLedger() {
  return [
    fact({ type: 'CALENDAR_YEAR', start: '2025-01-01', end: '2025-12-31', value: 90_000_000, fiscalYear: 2025 }),
    fact({ type: 'LTM', start: '2025-07-01', end: '2026-06-30', value: 120_000_000, fiscalYear: 2026 }),
  ]
}

function fourQuarterLedger() {
  return [
    fact({ type: 'QUARTER', start: '2025-07-01', end: '2025-09-30', value: 10_000_000, fiscalYear: 2025 }),
    fact({ type: 'QUARTER', start: '2025-10-01', end: '2025-12-31', value: 20_000_000, fiscalYear: 2025 }),
    fact({ type: 'QUARTER', start: '2026-01-01', end: '2026-03-31', value: 30_000_000, fiscalYear: 2026 }),
    fact({ type: 'QUARTER', start: '2026-04-01', end: '2026-06-30', value: 40_000_000, fiscalYear: 2026 }),
  ]
}

function bridgeLedger() {
  return [
    fact({ type: 'CALENDAR_YEAR', start: '2024-01-01', end: '2024-12-31', value: 100_000_000, fiscalYear: 2024 }),
    fact({ type: 'YTD_6M', start: '2025-01-01', end: '2025-06-30', value: 60_000_000, fiscalYear: 2025 }),
    fact({ type: 'YTD_6M', start: '2024-01-01', end: '2024-06-30', value: 40_000_000, fiscalYear: 2024 }),
  ]
}

function snapshotFor(rawLedger, negativeSearchEvidence = null) {
  const canonical = buildCanonicalAdjustedEbitda({ company, rawLedger, years: ACTUAL_YEARS, negativeSearchEvidence })
  const periods = ['2023A', '2024A', '2025A', 'LTM', 'NTM', '2026E', '2027E']
  const revenue = Object.fromEntries(periods.map((period) => [period, period === 'LTM' ? 400_000_000 : 100_000_000]))
  const baseProvenance = Object.fromEntries(periods.map((period) => [period, {
    value: revenue[period], status: 'VERIFIED_REPORTED', components: [],
  }]))
  const ebitda = {
    '2023A': canonical.calendarActuals[2023],
    '2024A': canonical.calendarActuals[2024],
    '2025A': canonical.calendarActuals[2025],
    LTM: canonical.ltm,
    NTM: { value: null, status: 'NOT_REPORTED', components: [] },
    '2026E': { value: null, status: 'NOT_REPORTED', components: [] },
    '2027E': { value: null, status: 'NOT_REPORTED', components: [] },
  }
  const ebitdaValues = Object.fromEntries(Object.entries(ebitda).map(([period, entry]) => [period, entry.value]))
  const identity = canonical.ltm.denominatorIdentity
  return {
    ticker: 'SYNTH', name: 'Synthetic Corp.', currency: 'USD', actualYears: ACTUAL_YEARS,
    financialSnapshot: {
      engineVersion: VALUATION_FINANCIAL_ENGINE_VERSION, actualYears: ACTUAL_YEARS,
      updatedAt: new Date().toISOString(), state: 'READY', reasons: [],
    },
    capital: { dilutedShares: 10, debt: 20_000_000, cash: 10_000_000, equityValue: 490_000_000, enterpriseValue: 500_000_000 },
    metrics: {
      revenue, grossProfit: { ...revenue }, ebit: { ...revenue }, operatingCashFlow: { ...revenue },
      capitalExpenditures: { ...revenue }, freeCashFlow: { ...revenue }, ebitda: ebitdaValues,
      revenueGrowth: {}, grossMargin: {}, ebitdaMargin: {},
    },
    multiples: { evEbitda: Object.fromEntries(periods.map((period) => [period,
      ebitdaValues[period] > 0 ? 500_000_000 / ebitdaValues[period] : null])) },
    multipleDenominatorIdentity: { evEbitda: { LTM: identity } },
    provenance: {
      revenue: structuredClone(baseProvenance), grossProfit: structuredClone(baseProvenance),
      ebit: structuredClone(baseProvenance), operatingCashFlow: structuredClone(baseProvenance),
      capitalExpenditures: structuredClone(baseProvenance), freeCashFlow: structuredClone(baseProvenance),
      ebitda,
    },
    canonicalHistorical: { latestReportedPeriods: {}, failures: [] },
    forwardBasisInputs: {
      revenue: { value: 400_000_000 }, grossProfit: { value: 200_000_000 },
      ebit: { value: 100_000_000 }, ebitRevenue: { value: 400_000_000 }, freeCashFlow: { value: 80_000_000 },
    },
    consensusSnapshot: { updatedAt: new Date().toISOString(), state: 'READY' },
    loadingSections: { financialSnapshot: false, adjustedEbitda: false, forwardBasis: false },
  }
}

function legacySnapshot(rawLedger) {
  const snapshot = snapshotFor(rawLedger)
  delete snapshot.provenance.ebitda.LTM.ltmStart
  delete snapshot.provenance.ebitda.LTM.ltmEnd
  snapshot.provenance.ebitda.LTM.denominatorIdentity = 'legacy-denominator-identity'
  snapshot.multipleDenominatorIdentity.evEbitda.LTM = 'legacy-denominator-identity'
  return snapshot
}

function legacyNullSnapshot(status = 'INSUFFICIENT_PERIOD_COVERAGE') {
  const snapshot = snapshotFor(directLedger())
  snapshot.metrics.ebitda.LTM = null
  snapshot.provenance.ebitda.LTM = {
    value: null,
    components: [],
    sourceType: 'Unavailable',
    validationStatus: status,
    method: status,
    warnings: [status],
  }
  snapshot.multipleDenominatorIdentity.evEbitda.LTM = null
  delete snapshot.adjustedEbitdaEngineVersion
  delete snapshot.financialSnapshot.adjustedEbitdaEngineVersion
  return snapshot
}

function recordFor(snapshot) {
  return {
    ticker: snapshot.ticker,
    engine_version: VALUATION_FINANCIAL_ENGINE_VERSION,
    actual_years: ACTUAL_YEARS,
    snapshot,
    updated_at: snapshot.financialSnapshot.updatedAt,
  }
}

async function assertMigratesWithoutFinancialRefetch(rawLedger, expected) {
  const repository = createMemoryFinancialSnapshotRepository()
  const legacy = legacySnapshot(rawLedger)
  repository.seed('SYNTH', legacy)
  let providerCalls = 0
  let rebuilds = 0
  const activityCounters = {}
  const result = await getValuationRows(null, ['SYNTH'], {
    snapshotRepository: repository,
    marketLoader: async () => new Map([['SYNTH', {
      ticker: 'SYNTH', price: 49, previousClose: 48, currency: 'USD', fetchedAt: Date.now(),
    }]]),
    providerLoader: async () => { providerCalls += 1; return { value: [] } },
    financialRowBuilder: async () => { rebuilds += 1; throw new Error('Unexpected financial rebuild') },
    activityCounters,
    profileCacheKey: `legacy-ltm-${expected.derivation}-${Date.now()}-${Math.random()}`,
  })
  const migrated = result.rows[0].provenance.ebitda.LTM
  assert.equal(providerCalls, 0)
  assert.equal(rebuilds, 0)
  assert.equal(activityCounters.canonicalRebuilds, 0)
  assert.equal(result.rows[0].financialSnapshot.state, 'READY')
  assert.equal(migrated.derivation, expected.derivation)
  assert.equal(migrated.ltmStart, expected.ltmStart)
  assert.equal(migrated.ltmEnd, expected.ltmEnd)
  assert.equal(migrated.denominatorIdentity, adjustedEbitdaDenominatorIdentity(migrated))
  assertCanonicalAdjustedEbitdaEntry(migrated, ADJUSTED_EBITDA_PERIOD.LTM)
  return { repository, legacy, migrated: result.rows[0] }
}

test('legacy direct LTM snapshot migrates without external financial refetch', async () => {
  await assertMigratesWithoutFinancialRefetch(directLedger(), {
    derivation: 'DIRECT_REPORTED_LTM', ltmStart: '2025-07-01', ltmEnd: '2026-06-30',
  })
})

test('legacy four-quarter LTM snapshot migrates without external financial refetch', async () => {
  await assertMigratesWithoutFinancialRefetch(fourQuarterLedger(), {
    derivation: 'SUM_OF_LATEST_FOUR_COMPATIBLE_STANDALONE_QUARTERS',
    ltmStart: '2025-07-01', ltmEnd: '2026-06-30',
  })
})

test('legacy FY/YTD bridge snapshot migrates without external financial refetch', async () => {
  await assertMigratesWithoutFinancialRefetch(bridgeLedger(), {
    derivation: 'FY_PLUS_CURRENT_YTD_MINUS_PRIOR_YTD', ltmStart: '2024-07-01', ltmEnd: '2025-06-30',
  })
})

test('migration is idempotent and preserves verified annual Adjusted EBITDA', () => {
  const legacy = legacySnapshot(directLedger())
  const annualMetrics = structuredClone(Object.fromEntries(Object.entries(legacy.metrics.ebitda).filter(([period]) => period.endsWith('A'))))
  const annualProvenance = structuredClone(Object.fromEntries(Object.entries(legacy.provenance.ebitda).filter(([period]) => period.endsWith('A'))))
  const first = migrateAdjustedEbitdaLtmSnapshotRecord(recordFor(legacy))
  assert.equal(first.migrated, true)
  const second = migrateAdjustedEbitdaLtmSnapshotRecord(first.record)
  assert.equal(second.migrated, false)
  assert.deepEqual(second.record, first.record)
  assert.deepEqual(first.record.snapshot.metrics.ebitda, { ...annualMetrics, LTM: 120_000_000, NTM: null, '2026E': null, '2027E': null })
  assert.deepEqual(
    Object.fromEntries(Object.entries(first.record.snapshot.provenance.ebitda).filter(([period]) => period.endsWith('A'))),
    annualProvenance,
  )
})

test('unreconstructable verified legacy LTM is repair-required and enters controlled refresh path', () => {
  const legacy = legacySnapshot(directLedger())
  delete legacy.provenance.ebitda.LTM.components[0].sourceStart
  const record = recordFor(legacy)
  const migration = migrateAdjustedEbitdaLtmSnapshotRecord(record)
  assert.equal(migration.migrated, false)
  assert.equal(classifyAdjustedEbitdaSnapshotHealth(legacy, ACTUAL_YEARS).state, 'REPAIR_REQUIRED')
  const classification = classifyFinancialSnapshot(record, ACTUAL_YEARS)
  assert.equal(classification.state, 'STALE')
  assert.deepEqual(classification.reasons, ['ADJUSTED_EBITDA_REPAIR_REQUIRED'])
  assert.equal(financialSnapshotNeedsRefresh({ financialSnapshot: classification }), true)
})

test('healthy current-format snapshot remains byte-for-byte unchanged', () => {
  const current = snapshotFor(directLedger())
  const record = recordFor(current)
  const migration = migrateAdjustedEbitdaLtmSnapshotRecord(record)
  assert.equal(migration.migrated, false)
  assert.deepEqual(migration.record, record)
  assert.equal(classifyFinancialSnapshot(record, ACTUAL_YEARS).state, 'READY')
})

test('persisted migrated identity is accepted by row audit and EV-to-Adjusted-EBITDA validation', () => {
  const migrated = migrateAdjustedEbitdaLtmSnapshotRecord(recordFor(legacySnapshot(fourQuarterLedger())))
  assert.equal(migrated.migrated, true)
  const snapshot = migrated.record.snapshot
  const audit = buildRowAudit(snapshot)
  assert.equal(audit.cells['ebitda:LTM'].checks.canonicalAdjustedEbitda.passed, true)
  assert.equal(audit.cells['evEbitda:LTM'].checks.canonicalAdjustedEbitda.passed, true)
  assert.equal(snapshot.multipleDenominatorIdentity.evEbitda.LTM,
    snapshot.provenance.ebitda.LTM.denominatorIdentity)
})

test('legacy null LTM statuses without the current domain version require repair', () => {
  for (const status of ['INSUFFICIENT_PERIOD_COVERAGE', 'NOT_REPORTED', 'DEFINITION_INCOMPATIBLE', 'REQUIRES_REVIEW']) {
    const snapshot = legacyNullSnapshot(status)
    const health = classifyAdjustedEbitdaSnapshotHealth(snapshot, ACTUAL_YEARS)
    assert.equal(health.state, 'REPAIR_REQUIRED', status)
    assert.deepEqual(health.affected, ['LTM'], status)
    assert.equal(classifyFinancialSnapshot(recordFor(snapshot), ACTUAL_YEARS).state, 'STALE', status)
  }
})

test('controlled refresh replaces a legacy LTM N/A once, stamps the domain version, and preserves annuals', async () => {
  const repository = createMemoryFinancialSnapshotRepository()
  const legacy = legacyNullSnapshot('INSUFFICIENT_PERIOD_COVERAGE')
  const fresh = snapshotFor(directLedger())
  const annualMetrics = structuredClone(Object.fromEntries(Object.entries(legacy.metrics.ebitda)
    .filter(([period]) => period.endsWith('A'))))
  const annualProvenance = structuredClone(Object.fromEntries(Object.entries(legacy.provenance.ebitda)
    .filter(([period]) => period.endsWith('A'))))
  repository.seed('SYNTH', legacy)
  const marketLoader = async () => new Map([['SYNTH', {
    ticker: 'SYNTH', price: 49, previousClose: 48, currency: 'USD', fetchedAt: Date.now(),
  }]])
  let financialRuns = 0
  let providerCalls = 0
  const initial = await getValuationRows(null, ['SYNTH'], {
    snapshotRepository: repository,
    marketLoader,
    profileCacheKey: `legacy-null-initial-${Date.now()}-${Math.random()}`,
  })
  assert.equal(initial.rows[0].financialSnapshot.state, 'STALE')

  const refreshedRow = await runValuationRefreshSequence(initial.rows[0], {
    financial: async () => {
      financialRuns += 1
      const response = await getValuationRows(null, ['SYNTH'], {
        financialRefresh: true,
        snapshotRepository: repository,
        marketLoader,
        providerLoader: async () => { providerCalls += 1; return { value: [] } },
        financialRowBuilder: async () => structuredClone(fresh),
        profileCacheKey: `legacy-null-refresh-${Date.now()}-${Math.random()}`,
      })
      return response.rows[0]
    },
    consensus: async (row) => row,
  })
  assert.equal(financialRuns, 1)
  assert.equal(providerCalls, 1)
  assert.equal(refreshedRow.metrics.ebitda.LTM, 120_000_000)
  assert.equal(refreshedRow.provenance.ebitda.LTM.adjustedEbitdaEngineVersion,
    ADJUSTED_EBITDA_ENGINE_VERSION)
  assert.equal(refreshedRow.financialSnapshot.state, 'READY')

  const reloaded = await getValuationRows(null, ['SYNTH'], {
    snapshotRepository: repository,
    marketLoader,
    profileCacheKey: `legacy-null-reload-${Date.now()}-${Math.random()}`,
  })
  await runValuationRefreshSequence(reloaded.rows[0], {
    financial: async () => { financialRuns += 1; throw new Error('Unexpected second financial refresh') },
    consensus: async (row) => row,
  })
  assert.equal(financialRuns, 1)
  assert.equal(reloaded.rows[0].financialSnapshot.state, 'READY')
  const persisted = (await repository.load(null, ['SYNTH'], { actualYears: ACTUAL_YEARS })).snapshots.get('SYNTH')
  assert.deepEqual(Object.fromEntries(Object.entries(persisted.metrics.ebitda)
    .filter(([period]) => period.endsWith('A'))), annualMetrics)
  assert.deepEqual(Object.fromEntries(Object.entries(persisted.provenance.ebitda)
    .filter(([period]) => period.endsWith('A'))), annualProvenance)
})

test('current-engine legitimate LTM N/A is healthy and does not queue a rebuild', () => {
  const negativeSearchEvidence = {
    searchType: 'SEC_COMPANY_DEFINED_ADJUSTED_EBITDA', completed: true, failed: false, timedOut: false,
    coveredPeriods: ['2023A', '2024A', '2025A', 'LTM'], eligibleReconciliationsFound: 0,
    filingsExamined: [{ accessionNumber: '0001-26-000001', form: '10-K', extractionCompleted: true }],
  }
  const snapshot = snapshotFor([], negativeSearchEvidence)
  assert.equal(snapshot.metrics.ebitda.LTM, null)
  assert.equal(snapshot.provenance.ebitda.LTM.adjustedEbitdaEngineVersion,
    ADJUSTED_EBITDA_ENGINE_VERSION)
  const classification = classifyFinancialSnapshot(recordFor(snapshot), ACTUAL_YEARS)
  assert.equal(classification.state, 'READY')
  assert.equal(financialSnapshotNeedsRefresh({ financialSnapshot: classification }), false)
})

test('source outage cannot destroy a previously verified LTM value', () => {
  const existing = snapshotFor(directLedger())
  existing.financialSnapshot.updatedAt = '2026-09-16T00:00:00.000Z'
  const candidate = structuredClone(existing)
  candidate.metrics.ebitda.LTM = null
  candidate.provenance.ebitda.LTM = {
    value: null,
    validationStatus: 'MISSING_SOURCE_DATA',
    method: 'ADJUSTED_EBITDA_EXTRACTION_TIMEOUT',
    components: [],
  }
  const promotion = evaluateFinancialSnapshotPromotion(existing, candidate, { actualYears: ACTUAL_YEARS })
  assert.equal(promotion.accepted, false)
  assert.equal(promotion.snapshot.metrics.ebitda.LTM, 120_000_000)
  assert.equal(promotion.snapshot.provenance.ebitda.LTM.denominatorIdentity,
    existing.provenance.ebitda.LTM.denominatorIdentity)
  assert.equal(promotion.snapshot.financialSnapshot.updatedAt, '2026-09-16T00:00:00.000Z')
})
