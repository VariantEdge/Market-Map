import test from 'node:test'
import assert from 'node:assert/strict'
import { applyConsensusToFinancialSnapshot, applyMarketDataToFinancialSnapshot, buildMarginBasedForwardSeries, getValuationRows,
  loadValuationMarketData } from '../api/valuationData.js'
import { getPrices } from '../api/marketData.js'
import { classifyAdjustedEbitdaSnapshotHealth, classifyFinancialSnapshot, createMemoryFinancialSnapshotRepository,
  evaluateFinancialSnapshotPromotion, loadFinancialSnapshots,
  PREVIOUS_VALUATION_FINANCIAL_ENGINE_VERSION, saveFinancialSnapshot,
  VALUATION_FINANCIAL_ENGINE_VERSION } from '../server/valuation/financialSnapshot.js'
import { snapshotFinancialRow } from '../server/valuation/financialSnapshot.js'
import { refreshAndVerifyAdjustedEbitdaSnapshot } from '../server/valuation/adjustedEbitdaSnapshotBackfill.js'

const ACTUAL_YEARS = [2023, 2024, 2025]

test('poisoned Adjusted EBITDA makes an otherwise current snapshot stale', () => {
  const snapshot = financialRow('BE')
  for (const period of ['2023A', '2024A', '2025A', 'LTM']) {
    snapshot.metrics.ebitda[period] = null
    snapshot.provenance.ebitda[period].status = 'MISSING_SOURCE_DATA'
  }
  const record = { ticker: 'BE', snapshot, actual_years: ACTUAL_YEARS,
    engine_version: VALUATION_FINANCIAL_ENGINE_VERSION, updated_at: new Date().toISOString() }
  assert.equal(classifyAdjustedEbitdaSnapshotHealth(snapshot, ACTUAL_YEARS).state, 'REPAIR_REQUIRED')
  assert.equal(classifyFinancialSnapshot(record, ACTUAL_YEARS).state, 'STALE')
  assert.deepEqual(classifyFinancialSnapshot(record, ACTUAL_YEARS).reasons, ['ADJUSTED_EBITDA_REPAIR_REQUIRED'])
  snapshot.provenance.ebitda['2026E'].status = 'MISSING_SOURCE_DATA'
  snapshot.provenance.ebitda['2027E'].status = 'MISSING_SOURCE_DATA'
  snapshot.provenance.ebitda.NTM.status = 'MISSING_SOURCE_DATA'
  for (const period of ['2023A', '2024A', '2025A', 'LTM']) {
    snapshot.provenance.ebitda[period].status = 'NOT_REPORTED'
  }
  assert.equal(classifyFinancialSnapshot(record, ACTUAL_YEARS).state, 'READY')
})

test('Adjusted EBITDA extraction failure in a snapshot requests repair', () => {
  const snapshot = financialRow('BE')
  snapshot.canonicalHistorical.failures.push({ reason: 'ADJUSTED_EBITDA_EXTRACTION_TIMEOUT' })
  assert.equal(classifyAdjustedEbitdaSnapshotHealth(snapshot, ACTUAL_YEARS).state, 'REPAIR_REQUIRED')
  snapshot.canonicalHistorical.failures = []
  snapshot.provenance.ebitda['2024A'].status = 'DEFINITION_INCOMPATIBLE'
  assert.equal(classifyAdjustedEbitdaSnapshotHealth(snapshot, ACTUAL_YEARS).state, 'HEALTHY')
})

test('failed EBITDA refresh is stale on save and cannot be counted by backfill', async () => {
  let stored
  const supabase = { from() {
    return {
      upsert(record) { stored = structuredClone(record); return this },
      select() { return this },
      eq() { return this },
      single() { return Promise.resolve({ data: stored, error: null }) },
    }
  } }
  const poisoned = financialRow('BE')
  for (const period of ['2023A', '2024A', '2025A', 'LTM']) {
    poisoned.provenance.ebitda[period].status = 'MISSING_SOURCE_DATA'
  }
  poisoned.canonicalHistorical.failures.push({ reason: 'ADJUSTED_EBITDA_EXTRACTION_FAILED' })
  let returned
  await assert.rejects(refreshAndVerifyAdjustedEbitdaSnapshot(supabase, 'BE', async () => {
    returned = await saveFinancialSnapshot(supabase, 'BE', poisoned, { actualYears: ACTUAL_YEARS })
    return { rows: [returned] }
  }), /ADJUSTED_EBITDA_REPAIR_REQUIRED/)
  assert.equal(stored.snapshot.financialSnapshot.state, 'STALE')
  assert.equal(returned.financialSnapshot.state, 'STALE')
  assert.deepEqual(returned.financialSnapshot.reasons, ['ADJUSTED_EBITDA_REPAIR_REQUIRED'])
  for (const period of ['2023A', '2024A', '2025A', 'LTM']) {
    poisoned.provenance.ebitda[period].status = 'NOT_REPORTED'
  }
  poisoned.canonicalHistorical.failures = []
  const healthy = await saveFinancialSnapshot(supabase, 'BE', poisoned, { actualYears: ACTUAL_YEARS })
  assert.equal(healthy.financialSnapshot.state, 'READY')
  await refreshAndVerifyAdjustedEbitdaSnapshot(supabase, 'BE', async () => ({ rows: [healthy] }))
  poisoned.metrics.ebitda['2023A'] = 81_791_000
  poisoned.provenance.ebitda['2023A'].status = 'VERIFIED_REPORTED'
  const reporter = await saveFinancialSnapshot(supabase, 'BE', poisoned, { actualYears: ACTUAL_YEARS })
  assert.equal(reporter.financialSnapshot.state, 'READY')
})

function financialRow(ticker, revenue = 100) {
  const periods = { '2023A': revenue, '2024A': revenue, '2025A': revenue, LTM: revenue, NTM: null, '2026E': null, '2027E': null }
  const provenance = Object.fromEntries(['revenue', 'grossProfit', 'ebit', 'operatingCashFlow', 'capitalExpenditures', 'freeCashFlow', 'ebitda']
    .map((metric) => [metric, Object.fromEntries(Object.keys(periods).map((period) => [period, {
      value: metric === 'revenue' ? periods[period] : metric === 'ebit' && periods[period] != null ? periods[period] / 4 : null,
      status: metric === 'revenue' || metric === 'ebit' ? 'VERIFIED_REPORTED' : 'NOT_REPORTED',
      components: [],
    }]))]))
  return {
    ticker, name: ticker, currency: 'USD',
    capital: { dilutedShares: 10, debt: 5, cash: 2, equityValue: 0, enterpriseValue: 0 },
    metrics: {
      revenue: periods,
      grossProfit: {}, ebit: Object.fromEntries(Object.entries(periods).map(([period, value]) =>
        [period, value == null ? null : value / 4])),
      operatingCashFlow: {}, capitalExpenditures: {}, freeCashFlow: {}, ebitda: {},
      revenueGrowth: {}, grossMargin: {}, ebitdaMargin: {},
    },
    multiples: {}, provenance, audit: { cells: {} }, historicalAudit: {},
    canonicalHistorical: { latestReportedPeriods: {}, failures: [] },
    actualYears: ACTUAL_YEARS,
    forwardBasisInputs: {
      revenue: { value: revenue, components: [] }, grossProfit: { value: revenue / 2, components: [] },
      ebit: { value: revenue / 4, components: [] },
      ebitRevenue: { value: revenue, components: [] },
      freeCashFlow: { value: revenue / 10, components: [] },
    },
    consensusContext: { revenueWeights: [0.25, 0.25, 0.25, 0.25], revenuePeriods: [] },
    consensusSnapshot: { updatedAt: new Date().toISOString(), state: 'READY' },
    loadingSections: { financialSnapshot: false, adjustedEbitda: false, forwardBasis: false },
  }
}

function marketLoader(calls) {
  return async (_supabase, tickers) => {
    calls.count += 1
    return new Map(tickers.map((ticker) => [ticker, {
      ticker, price: 20, previousClose: 19, currency: 'USD', fetchedAt: Date.now(),
    }]))
  }
}

function v2FinancialRow(ticker, revenue = 100, updatedAt = new Date().toISOString()) {
  const row = financialRow(ticker, revenue)
  delete row.forwardBasisInputs.ebitRevenue
  row.financialSnapshot = {
    engineVersion: PREVIOUS_VALUATION_FINANCIAL_ENGINE_VERSION,
    actualYears: ACTUAL_YEARS,
    updatedAt,
    state: 'INCOMPATIBLE',
  }
  return row
}

test('valid v2 snapshot migrates and persists without financial provider work', async () => {
  const repository = createMemoryFinancialSnapshotRepository()
  const updatedAt = '2026-08-01T00:00:00.000Z'
  const legacy = v2FinancialRow('BE', 3_113_150_000, updatedAt)
  const originalMetrics = structuredClone(legacy.metrics)
  const originalProvenance = structuredClone(legacy.provenance)
  repository.seed('BE', legacy)
  let wiseSheetsCalls = 0
  let rebuilds = 0
  const activityCounters = {}

  const response = await getValuationRows(null, ['BE'], {
    snapshotRepository: repository,
    marketLoader: marketLoader({ count: 0 }),
    providerLoader: async () => { wiseSheetsCalls += 1; return { value: [] } },
    financialRowBuilder: async () => { rebuilds += 1; return financialRow('BE') },
    activityCounters,
    profileCacheKey: `v2-migration-${Date.now()}`,
  })

  assert.equal(wiseSheetsCalls, 0)
  assert.equal(rebuilds, 0)
  assert.equal(activityCounters.secHistoryCalls, 0)
  assert.deepEqual(response.rows[0].metrics, originalMetrics)
  assert.equal(response.rows[0].financialSnapshot.updatedAt, updatedAt)
  assert.equal(response.rows[0].financialSnapshot.engineVersion, VALUATION_FINANCIAL_ENGINE_VERSION)
  const persisted = await repository.load(null, ['BE'], { actualYears: ACTUAL_YEARS })
  const persistedSnapshot = persisted.snapshots.get('BE')
  assert.deepEqual(persistedSnapshot.metrics, originalMetrics)
  assert.deepEqual(persistedSnapshot.provenance, originalProvenance)
  assert.deepEqual(persistedSnapshot.forwardBasisInputs.ebitRevenue, originalProvenance.revenue.LTM)
  assert.equal(persistedSnapshot.financialSnapshot.engineVersion, VALUATION_FINANCIAL_ENGINE_VERSION)
  assert.equal(persistedSnapshot.financialSnapshot.updatedAt, updatedAt)
})

test('Supabase v2 migration upserts once while preserving the financial timestamp', async () => {
  const updatedAt = '2026-08-15T00:00:00.000Z'
  const snapshot = v2FinancialRow('MSFT', 100, updatedAt)
  const record = {
    ticker: 'MSFT',
    engine_version: PREVIOUS_VALUATION_FINANCIAL_ENGINE_VERSION,
    actual_years: ACTUAL_YEARS,
    snapshot,
    updated_at: updatedAt,
  }
  let migratedRecords = null
  const supabase = { from() {
    return {
      select() { return this },
      in() { return Promise.resolve({ data: [record], error: null }) },
      upsert(records) {
        migratedRecords = structuredClone(records)
        return Promise.resolve({ error: null })
      },
    }
  } }
  const loaded = await loadFinancialSnapshots(supabase, ['MSFT'], { actualYears: ACTUAL_YEARS })
  assert.equal(migratedRecords.length, 1)
  assert.equal(migratedRecords[0].engine_version, VALUATION_FINANCIAL_ENGINE_VERSION)
  assert.equal(migratedRecords[0].updated_at, updatedAt)
  assert.deepEqual(migratedRecords[0].snapshot.forwardBasisInputs.ebitRevenue, snapshot.provenance.revenue.LTM)
  assert.equal(loaded.snapshots.get('MSFT').financialSnapshot.updatedAt, updatedAt)
})

test('invalid v2 snapshot remains incompatible for the normal rebuild path', async () => {
  const repository = createMemoryFinancialSnapshotRepository()
  const legacy = v2FinancialRow('INVALID')
  delete legacy.provenance.revenue.LTM
  repository.seed('INVALID', legacy)
  const loaded = await repository.load(null, ['INVALID'], { actualYears: ACTUAL_YEARS })
  assert.equal(loaded.snapshots.get('INVALID').financialSnapshot.state, 'INCOMPATIBLE')
  assert.deepEqual(loaded.snapshots.get('INVALID').financialSnapshot.reasons, ['ENGINE_VERSION_MISMATCH', 'SNAPSHOT_SCHEMA_INVALID'])
})

test('financial refresh scopes WiseSheets acquisition to only rebuilt tickers', async () => {
  const tickers = ['BE', 'MSFT']
  const universe = ['AMZN', 'BE', 'CRWV', 'FCEL', 'GEV', 'GOOGL', 'INTC', 'IREN', 'META', 'MU', 'MSFT', 'NBIS']
  const repository = createMemoryFinancialSnapshotRepository()
  const providerRequests = []
  const response = await getValuationRows(null, tickers, {
    financialRefresh: true,
    providerTickers: universe,
    snapshotRepository: repository,
    marketLoader: marketLoader({ count: 0 }),
    providerLoader: async (requested) => {
      providerRequests.push([...requested])
      return { value: requested.map((ticker) => ({ ticker })), cache: { state: 'MISS' } }
    },
    financialRowBuilder: async (_supabase, ticker) => financialRow(ticker),
    profileCacheKey: `scoped-provider-${Date.now()}`,
  })
  assert.equal(response.rows.length, 2)
  assert.deepEqual(providerRequests, [tickers])
})

test('transient degraded LTM refresh retains last-known-good snapshot and timestamp', () => {
  const existing = financialRow('SYNTH', 3_113_150_000)
  existing.financialSnapshot = { updatedAt: '2026-08-01T00:00:00.000Z', state: 'READY' }
  existing.canonicalHistorical.latestReportedPeriods.revenue = { periodEnd: '2026-06-30' }
  existing.provenance.revenue.LTM.status = 'VERIFIED_DERIVED'
  const candidate = structuredClone(existing)
  candidate.metrics.revenue.LTM = null
  candidate.provenance.revenue.LTM = {
    value: null, status: 'INSUFFICIENT_PERIOD_COVERAGE', reason: 'INSUFFICIENT_PERIOD_COVERAGE', components: [],
  }

  const result = evaluateFinancialSnapshotPromotion(existing, candidate, { actualYears: ACTUAL_YEARS })
  assert.equal(result.accepted, false)
  assert.equal(result.snapshot.metrics.revenue.LTM, 3_113_150_000)
  assert.equal(result.snapshot.financialSnapshot.updatedAt, existing.financialSnapshot.updatedAt)
  assert.equal(result.diagnostic.reason, 'DEGRADED_FINANCIAL_REFRESH_REJECTED')
  assert.deepEqual(result.diagnostic.affected[0], {
    metric: 'revenue', period: 'LTM', reason: 'INSUFFICIENT_PERIOD_COVERAGE',
  })
})

test('degraded financial refresh does not overwrite durable last-known-good values', async () => {
  const repository = createMemoryFinancialSnapshotRepository()
  const updatedAt = new Date().toISOString()
  const existing = financialRow('SYNTH', 3_113_150_000)
  existing.canonicalHistorical.latestReportedPeriods.revenue = { periodEnd: '2026-06-30' }
  existing.provenance.revenue.LTM.status = 'VERIFIED_DERIVED'
  await repository.save(null, 'SYNTH', existing, { actualYears: ACTUAL_YEARS, updatedAt })
  const candidate = structuredClone(existing)
  candidate.metrics.revenue.LTM = null
  candidate.provenance.revenue.LTM = {
    value: null, status: 'INSUFFICIENT_PERIOD_COVERAGE', reason: 'INSUFFICIENT_PERIOD_COVERAGE', components: [],
  }

  const response = await getValuationRows(null, ['SYNTH'], {
    financialRefresh: true,
    snapshotRepository: repository,
    marketLoader: marketLoader({ count: 0 }),
    providerLoader: async () => ({ value: [], cache: { state: 'MISS' } }),
    financialRowBuilder: async () => candidate,
    profileCacheKey: `promotion-guard-${Date.now()}`,
  })

  assert.equal(response.rows[0].metrics.revenue.LTM, 3_113_150_000)
  assert.equal(response.rows[0].financialSnapshot.updatedAt, updatedAt)
  assert.equal(response.rows[0].financialSnapshot.refreshDiagnostic.reason, 'DEGRADED_FINANCIAL_REFRESH_REJECTED')
  assert.equal(response.providerCache.state, 'FINANCIAL_REFRESH_DEGRADED_REJECTED')
  const stored = await repository.load(null, ['SYNTH'], { actualYears: ACTUAL_YEARS })
  assert.equal(stored.snapshots.get('SYNTH').metrics.revenue.LTM, 3_113_150_000)
  assert.equal(stored.snapshots.get('SYNTH').financialSnapshot.updatedAt, updatedAt)
})

test('newer authoritative period prevents stale LTM carry-forward', () => {
  const existing = financialRow('SYNTH', 3_113_150_000)
  existing.canonicalHistorical.latestReportedPeriods.revenue = { periodEnd: '2026-06-30' }
  existing.provenance.revenue.LTM.status = 'VERIFIED_DERIVED'
  const candidate = structuredClone(existing)
  candidate.metrics.revenue.LTM = null
  candidate.provenance.revenue.LTM = {
    value: null, status: 'INSUFFICIENT_PERIOD_COVERAGE', reason: 'INSUFFICIENT_PERIOD_COVERAGE', components: [],
  }
  candidate.canonicalHistorical.latestReportedPeriods.revenue = { periodEnd: '2026-09-30' }

  const result = evaluateFinancialSnapshotPromotion(existing, candidate, { actualYears: ACTUAL_YEARS })
  assert.equal(result.accepted, true)
  assert.equal(result.snapshot.metrics.revenue.LTM, null)
  assert.equal(result.snapshot.provenance.revenue.LTM.status, 'INSUFFICIENT_PERIOD_COVERAGE')
})

test('transient Adjusted EBITDA failure preserves the durable verified snapshot and timestamp', () => {
  const existing = financialRow('BE')
  existing.financialSnapshot = { updatedAt: '2026-08-01T00:00:00.000Z', state: 'READY' }
  existing.metrics.ebitda['2025A'] = 271_591_000
  existing.provenance.ebitda['2025A'] = {
    value: 271_591_000, validationStatus: 'VERIFIED_REPORTED',
    components: [{ sourceEnd: '2025-12-31' }],
  }
  const candidate = structuredClone(existing)
  candidate.metrics.ebitda['2025A'] = null
  candidate.provenance.ebitda['2025A'] = {
    value: null, validationStatus: 'NOT_REPORTED', method: 'ADJUSTED_EBITDA_EXTRACTION_FAILED', components: [],
  }

  const result = evaluateFinancialSnapshotPromotion(existing, candidate, { actualYears: ACTUAL_YEARS })
  assert.equal(result.accepted, false)
  assert.equal(result.snapshot.metrics.ebitda['2025A'], 271_591_000)
  assert.equal(result.snapshot.financialSnapshot.updatedAt, '2026-08-01T00:00:00.000Z')
  assert.equal(result.diagnostic.reason, 'DEGRADED_ADJUSTED_EBITDA_REFRESH_REJECTED')
})

test('newer company-reported Adjusted EBITDA period makes stale LTM fail closed', () => {
  const existing = financialRow('SYNTH')
  existing.metrics.ebitda.LTM = 100
  existing.provenance.ebitda.LTM = {
    value: 100, validationStatus: 'VERIFIED_DERIVED',
    components: [{ sourceEnd: '2025-03-31' }, { sourceEnd: '2025-06-30' },
      { sourceEnd: '2025-09-30' }, { sourceEnd: '2025-12-31' }],
  }
  const candidate = structuredClone(existing)
  candidate.metrics.ebitda.LTM = null
  candidate.provenance.ebitda.LTM = {
    value: null, validationStatus: 'INSUFFICIENT_PERIOD_COVERAGE', method: 'FOUR_STANDALONE_QUARTERS_UNAVAILABLE',
    components: [{ sourceEnd: '2026-03-31' }],
  }

  const result = evaluateFinancialSnapshotPromotion(existing, candidate, { actualYears: ACTUAL_YEARS })
  assert.equal(result.accepted, true)
  assert.equal(result.snapshot.metrics.ebitda.LTM, null)
})

test('mixed v2 and v3 cold load uses snapshots without historical providers', async () => {
  const tickers = ['AMZN', 'BE', 'CRWV', 'FCEL', 'GEV', 'GOOGL', 'INTC', 'IREN', 'META', 'MU', 'MSFT', 'NBIS']
  const repository = createMemoryFinancialSnapshotRepository()
  for (const ticker of tickers.slice(0, 4)) repository.seed(ticker, v2FinancialRow(ticker))
  for (const ticker of tickers.slice(4, -1)) await repository.save(null, ticker, financialRow(ticker))
  let providers = 0
  let rebuilds = 0
  const activityCounters = {}
  const response = await getValuationRows(null, tickers, {
    snapshotRepository: repository,
    marketLoader: marketLoader({ count: 0 }),
    providerLoader: async () => { providers += 1; return { value: [] } },
    financialRowBuilder: async () => { rebuilds += 1; return financialRow('UNEXPECTED') },
    activityCounters,
    profileCacheKey: `mixed-cold-${Date.now()}`,
  })
  assert.equal(response.rows.length, 12)
  assert.equal(response.rows.find((row) => row.ticker === 'BE').metrics.revenue.LTM, 100)
  assert.equal(response.rows.find((row) => row.ticker === 'NBIS').loadingSections.financialSnapshot, true)
  assert.equal(providers, 0)
  assert.equal(rebuilds, 0)
  assert.deepEqual(activityCounters, {
    secHistoryCalls: 0, wiseSheetsCalls: 0, canonicalRebuilds: 0, adjustedEbitdaRuns: 0, consensusCalls: 0,
  })
})

test('warm 12-ticker and normal refresh read snapshots without financial providers', async () => {
  const tickers = ['AMZN', 'BE', 'CRWV', 'FCEL', 'GEV', 'GOOGL', 'INTC', 'IREN', 'META', 'MU', 'MSFT', 'NBIS']
  const repository = createMemoryFinancialSnapshotRepository()
  for (const ticker of tickers) await repository.save(null, ticker, financialRow(ticker))
  const calls = { count: 0 }
  for (const refresh of [false, true]) {
    const activityCounters = {}
    const response = await getValuationRows(null, tickers, {
      refresh,
      snapshotRepository: repository,
      marketLoader: marketLoader(calls),
      activityCounters,
      profileCacheKey: `snapshot-${refresh}-${Date.now()}`,
    })
    assert.equal(response.rows.length, 12)
    assert.deepEqual(activityCounters, {
      secHistoryCalls: 0, wiseSheetsCalls: 0, canonicalRebuilds: 0, adjustedEbitdaRuns: 0, consensusCalls: 0,
    })
  }
  assert.equal(calls.count, 2)
})

test('12-ticker market bootstrap uses one Supabase price read', async () => {
  const tickers = ['AMZN', 'BE', 'CRWV', 'FCEL', 'GEV', 'GOOGL', 'INTC', 'IREN', 'META', 'MU', 'MSFT', 'NBIS']
  let reads = 0
  const fetchedAt = new Date().toISOString()
  const supabase = {
    from(table) {
      assert.equal(table, 'prices')
      reads += 1
      return {
        select() { return this },
        in(_column, requested) {
          return Promise.resolve({
            data: requested.map((ticker) => ({ ticker, price: 10, currency: 'USD', fetched_at: fetchedAt })),
            error: null,
          })
        },
      }
    },
  }
  const rows = await getPrices(supabase, tickers)
  assert.equal(reads, 1)
  assert.equal(rows.size, 12)
})

test('missing snapshot returns market data with financial loading state', async () => {
  const response = await getValuationRows(null, ['NEW'], {
    snapshotRepository: createMemoryFinancialSnapshotRepository(),
    marketLoader: marketLoader({ count: 0 }),
    profileCacheKey: `new-${Date.now()}`,
  })
  assert.equal(response.rows[0].price, 20)
  assert.equal(response.rows[0].loadingSections.financialSnapshot, true)
  assert.equal(response.rows[0].metrics.revenue, undefined)
})

test('explicit financial refresh awaits, persists, and keeps GAAP when EBITDA is unavailable', async () => {
  const repository = createMemoryFinancialSnapshotRepository()
  let saves = 0
  const wrapped = {
    load: repository.load,
    save: async (...args) => { saves += 1; return repository.save(...args) },
  }
  const activityCounters = {}
  const response = await getValuationRows(null, ['BE'], {
    financialRefresh: true,
    snapshotRepository: wrapped,
    marketLoader: marketLoader({ count: 0 }),
    providerLoader: async () => ({ value: [], cache: { state: 'MISS' } }),
    financialRowBuilder: async () => {
      const row = financialRow('BE', 3_113_150_000)
      row.metrics.ebitda = { LTM: null }
      row.provenance.ebitda.LTM = { value: null, status: 'MISSING_SOURCE_DATA', reason: 'ADJUSTED_EBITDA_EXTRACTION_TIMEOUT', components: [] }
      return row
    },
    activityCounters,
    profileCacheKey: `refresh-${Date.now()}`,
  })
  assert.equal(saves, 1)
  assert.equal(response.rows[0].metrics.revenue.LTM, 3_113_150_000)
  assert.equal(response.rows[0].metrics.ebitda.LTM, null)
  assert.deepEqual(activityCounters, {
    secHistoryCalls: 0, wiseSheetsCalls: 1, canonicalRebuilds: 1, adjustedEbitdaRuns: 1, consensusCalls: 0,
  })
  const stored = await repository.load(null, ['BE'])
  assert.equal(stored.snapshots.get('BE').metrics.revenue.LTM, 3_113_150_000)
})

test('snapshot engine-version, actual-year and age rules classify stored data', () => {
  const record = {
    engine_version: VALUATION_FINANCIAL_ENGINE_VERSION,
    actual_years: ACTUAL_YEARS,
    updated_at: new Date().toISOString(),
    snapshot: financialRow('MSFT'),
  }
  assert.equal(classifyFinancialSnapshot(record, ACTUAL_YEARS).state, 'READY')
  assert.deepEqual(classifyFinancialSnapshot({ ...record, engine_version: 'old' }, ACTUAL_YEARS).reasons,
    ['ENGINE_VERSION_MISMATCH'])
  assert.deepEqual(classifyFinancialSnapshot(record, [2022, 2023, 2024]).reasons,
    ['ACTUAL_YEAR_SET_MISMATCH'])
  assert.equal(classifyFinancialSnapshot({ ...record, updated_at: '2020-01-01' }, ACTUAL_YEARS).state, 'STALE')
  const preEbitSnapshot = structuredClone(record)
  delete preEbitSnapshot.snapshot.metrics.ebit
  delete preEbitSnapshot.snapshot.provenance.ebit
  assert.equal(classifyFinancialSnapshot(preEbitSnapshot, ACTUAL_YEARS).state, 'INCOMPATIBLE')
  const preEbitBasisSnapshot = structuredClone(record)
  delete preEbitBasisSnapshot.snapshot.forwardBasisInputs.ebitRevenue
  assert.equal(classifyFinancialSnapshot(preEbitBasisSnapshot, ACTUAL_YEARS).state, 'INCOMPATIBLE')
})

test('missing durable store returns an explicit non-loading diagnostic', async () => {
  const loaded = await loadFinancialSnapshots(null, ['BE'], { actualYears: ACTUAL_YEARS })
  assert.equal(loaded.diagnostic.reason, 'FINANCIAL_SNAPSHOT_STORE_NOT_CONFIGURED')
  const response = await getValuationRows(null, ['BE'], {
    snapshotRepository: { load: async () => loaded, save: async () => null },
    marketLoader: marketLoader({ count: 0 }),
    profileCacheKey: `unconfigured-${Date.now()}`,
  })
  assert.equal(response.rows[0].loadingSections.financialSnapshot, false)
  assert.equal(response.rows[0].error, 'FINANCIAL_SNAPSHOT_STORE_NOT_CONFIGURED')
})

test('market refresh updates price, daily change, ranges and multiples without financial dependencies', async () => {
  const repository = createMemoryFinancialSnapshotRepository()
  await repository.save(null, 'MSFT', financialRow('MSFT'), { actualYears: ACTUAL_YEARS })
  let providerCalls = 0
  let builderCalls = 0
  const response = await getValuationRows(null, ['MSFT'], {
    refresh: true,
    snapshotRepository: repository,
    marketLoader: async () => new Map([['MSFT', {
      price: 50, previousClose: 40, currency: 'USD', fetchedAt: Date.now(),
      chart: { points: [{ close: 25 }, { close: 40 }, { close: 50 }] },
    }]]),
    providerLoader: async () => { providerCalls += 1; return { value: [] } },
    financialRowBuilder: async () => { builderCalls += 1; return financialRow('MSFT') },
    profileCacheKey: `market-${Date.now()}`,
  })
  assert.equal(providerCalls, 0)
  assert.equal(builderCalls, 0)
  assert.equal(response.rows[0].price, 50)
  assert.equal(response.rows[0].dailyPercent, 0.25)
  assert.equal(response.rows[0].ranges.high52, 50)
  assert.equal(response.rows[0].ranges.low52, 25)
  assert.equal(response.rows[0].multiples.evRevenue.LTM, 5.03)
  assert.equal(response.rows[0].multiples.evEbit.LTM, 20.12)
})

test('slow financial snapshots exclude fast-changing market fields', () => {
  const row = { ...financialRow('MSFT'), price: 50, dailyChange: 1, dailyPercent: 0.02,
    ranges: { high52: 60, low52: 20 }, multiples: { evRevenue: { LTM: 5 } } }
  const snapshot = snapshotFinancialRow(row)
  assert.equal(snapshot.price, undefined)
  assert.equal(snapshot.dailyChange, undefined)
  assert.equal(snapshot.ranges, undefined)
  assert.equal(snapshot.multiples, undefined)
})

test('valuation market loader uses one batched price-history read for daily and 52-week fields', async () => {
  const fetchedAt = new Date().toISOString()
  let priceReads = 0
  let historyReads = 0
  const query = (result) => ({
    select() { return this }, in() { return this }, gte() { return Promise.resolve(result) },
    then(resolve) { return Promise.resolve(result).then(resolve) },
  })
  const supabase = { from(table) {
    if (table === 'prices') {
      priceReads += 1
      return query({ data: [{ ticker: 'BATCHX', price: 35, currency: 'USD', fetched_at: fetchedAt }], error: null })
    }
    assert.equal(table, 'price_history')
    historyReads += 1
    return query({ data: [
      { ticker: 'BATCHX', date: '2026-01-02', close: 10 },
      { ticker: 'BATCHX', date: '2026-09-09', close: 20 },
      { ticker: 'BATCHX', date: '2026-09-10', close: 30 },
    ], error: null })
  } }
  const result = await loadValuationMarketData(supabase, ['BATCHX'], {
    refresh: true,
    now: new Date('2026-09-11T12:00:00'),
    quoteLoader: async () => new Map([['BATCHX', {
      ticker: 'BATCHX', price: 35, previousClose: 30, currency: 'USD', fetchedAt: Date.now(),
    }]]),
  })
  assert.equal(priceReads, 0)
  assert.equal(historyReads, 1)
  assert.deepEqual(result.get('BATCHX').chart.points.map((point) => point.close), [10, 20, 30])
})

test('Yahoo previous close remains authoritative when stored history includes today', async () => {
  const query = (result) => ({ select() { return this }, in() { return this }, gte() { return Promise.resolve(result) } })
  const supabase = { from: () => query({ data: [
    { ticker: 'DAILY', date: '2026-09-10', close: 90 },
    { ticker: 'DAILY', date: '2026-09-11', close: 99 },
  ], error: null }) }
  const market = await loadValuationMarketData(supabase, ['DAILY'], {
    refresh: true,
    now: new Date('2026-09-11T12:00:00'),
    quoteLoader: async () => new Map([['DAILY', { price: 100, previousClose: 90, currency: 'USD' }]]),
  })
  const row = applyMarketDataToFinancialSnapshot(financialRow('DAILY'), market.get('DAILY'), market.get('DAILY').chart)
  assert.equal(market.get('DAILY').previousClose, 90)
  assert.equal(row.dailyPercent, 100 / 90 - 1)
})

test('stale non-empty price history is refreshed during a market refresh', async () => {
  const query = (result) => ({ select() { return this }, in() { return this }, gte() { return Promise.resolve(result) } })
  const supabase = { from: () => query({ data: [
    { ticker: 'STALEH', date: '2026-08-01', close: 50 },
  ], error: null }) }
  let chartCalls = 0
  const market = await loadValuationMarketData(supabase, ['STALEH'], {
    refresh: true,
    now: new Date('2026-09-11T12:00:00'),
    quoteLoader: async () => new Map([['STALEH', { price: 75, previousClose: 70, currency: 'USD' }]]),
    chartLoader: async () => {
      chartCalls += 1
      return { points: [{ date: '2026-09-10', close: 70 }, { date: '2026-09-11', close: 75 }] }
    },
  })
  assert.equal(chartCalls, 1)
  assert.equal(market.get('STALEH').chart.points.at(-1).close, 75)
})

test('current quote is included when it establishes a new 52-week high', () => {
  const row = applyMarketDataToFinancialSnapshot(financialRow('NEWHIGH'),
    { price: 120, previousClose: 100, currency: 'USD' },
    { points: [{ date: '2026-01-02', close: 60 }, { date: '2026-09-10', close: 110 }] })
  assert.equal(row.ranges.high52, 120)
  assert.equal(row.ranges.belowHigh52, 0)
})

test('consensus-only refresh changes forward values without invoking financial dependencies', async () => {
  const repository = createMemoryFinancialSnapshotRepository()
  await repository.save(null, 'MSFT', financialRow('MSFT'), { actualYears: ACTUAL_YEARS })
  let providerCalls = 0
  let builderCalls = 0
  const response = await getValuationRows(null, ['MSFT'], {
    consensusRefresh: true,
    snapshotRepository: repository,
    marketLoader: marketLoader({ count: 0 }),
    providerLoader: async () => { providerCalls += 1; return { value: [] } },
    financialRowBuilder: async () => { builderCalls += 1; return financialRow('MSFT') },
    consensusLoader: async () => ({ estimates: { revenueConsensus: [
      { value: 200, endDate: '2026-12-31' }, { value: 240, endDate: '2027-12-31' },
    ] } }),
    profileCacheKey: `consensus-${Date.now()}`,
  })
  assert.equal(providerCalls, 0)
  assert.equal(builderCalls, 0)
  assert.equal(response.rows[0].metrics.revenue['2026E'], 200)
  assert.equal(response.rows[0].metrics.grossProfit['2026E'], 100)
  assert.equal(response.rows[0].metrics.freeCashFlow['2026E'], 20)
  assert.equal(response.rows[0].metrics.ebit['2026E'], 50)
  assert.equal(response.rows[0].multiples.evEbit['2026E'], 4.06)
  assert.equal(response.rows[0].audit.cells['ebit:2026E'].status, 'VERIFIED_DERIVED')
})

test('negative EBIT remains visible while EV EBIT is not meaningful', () => {
  const row = financialRow('LOSS', 100)
  row.metrics.ebit.LTM = -25
  row.provenance.ebit.LTM = { value: -25, status: 'VERIFIED_REPORTED', components: [] }
  const refreshed = applyMarketDataToFinancialSnapshot(row,
    { price: 50, previousClose: 49, currency: 'USD' }, { points: [{ close: 49 }] })
  assert.equal(refreshed.metrics.ebit.LTM, -25)
  assert.equal(refreshed.multiples.evEbit.LTM, null)
})

test('consensus transformation leaves historical cells unchanged', () => {
  const before = financialRow('BE', 100)
  const after = applyConsensusToFinancialSnapshot(before, { estimates: { revenueConsensus: [
    { value: 200, endDate: '2026-12-31' },
  ] } }, { actual: ACTUAL_YEARS, estimate: [2026, 2027] })
  assert.equal(after.metrics.revenue['2025A'], 100)
  assert.equal(after.metrics.revenue.LTM, 100)
  assert.equal(after.metrics.ebit['2025A'], 25)
  assert.equal(after.metrics.ebit.LTM, 25)
  assert.equal(after.provenance.ebit['2026E'].method, '2026e-revenue-consensus-times-ltm-ebit-margin')
})

test('EBIT consensus refresh uses canonical revenue while GP and FCF retain the legacy basis', () => {
  const before = financialRow('BASIS', 100)
  before.forwardBasisInputs = {
    revenue: { value: 80, components: [{ sourceProvider: 'LEGACY' }] },
    grossProfit: { value: 40, components: [] },
    freeCashFlow: { value: 8, components: [] },
    ebit: { value: 20, components: [{ sourceProvider: 'SEC' }] },
    ebitRevenue: { value: 100, components: [{ sourceProvider: 'SEC' }] },
  }
  before.metrics.ebit.LTM = 20
  before.provenance.ebit.LTM = before.forwardBasisInputs.ebit
  const initial = buildMarginBasedForwardSeries({
    revenue: { '2026E': { value: 200, components: [] } }, estimateYears: [2026],
    ntmRevenue: { value: 180, components: [] }, basisMetric: before.forwardBasisInputs.ebit,
    basisRevenue: before.forwardBasisInputs.ebitRevenue, metricName: 'ebit',
  })
  assert.equal(initial['2026E'].value, 40)

  const after = applyConsensusToFinancialSnapshot(before, { estimates: { revenueConsensus: [
    { value: 200, endDate: '2026-12-31' },
  ] } }, { actual: ACTUAL_YEARS, estimate: [2026, 2027] })
  assert.equal(after.metrics.ebit['2026E'], 40)
  assert.equal(after.metrics.grossProfit['2026E'], 100)
  assert.equal(after.metrics.freeCashFlow['2026E'], 20)
  assert.equal(after.metrics.ebit.LTM, 20)
  assert.equal(after.forwardBasisInputs.revenue.value, 80)
})
