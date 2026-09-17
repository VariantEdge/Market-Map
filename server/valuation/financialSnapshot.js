import {
  ADJUSTED_EBITDA_PERIOD,
  adjustedEbitdaDenominatorIdentity,
  assertCanonicalAdjustedEbitdaEntry,
} from './adjustedEbitdaEngine.js'

export const VALUATION_FINANCIAL_SNAPSHOT_TABLE = 'valuation_financial_snapshots'
export const VALUATION_FINANCIAL_ENGINE_VERSION = 'canonical-financials-v3-ebit-forward-basis'
export const PREVIOUS_VALUATION_FINANCIAL_ENGINE_VERSION = 'canonical-financials-v2-ebit'
export const VALUATION_FINANCIAL_SNAPSHOT_STALE_MS = 30 * 24 * 60 * 60 * 1000

export const FINANCIAL_SNAPSHOT_STATE = Object.freeze({
  READY: 'READY',
  STALE: 'STALE',
  INCOMPATIBLE: 'INCOMPATIBLE',
})

function normalizeTicker(value) {
  return String(value ?? '').trim().toUpperCase()
}

function normalizedYears(years = []) {
  return [...new Set(years.map(Number).filter(Number.isInteger))].sort((left, right) => left - right)
}

function sameYears(left, right) {
  return JSON.stringify(normalizedYears(left)) === JSON.stringify(normalizedYears(right))
}

const VERIFIED_CANONICAL_STATUSES = new Set(['VERIFIED_REPORTED', 'VERIFIED_DERIVED'])
const AFFIRMATIVE_INVALIDATION_STATUSES = new Set([
  'REQUIRES_REVIEW', 'DEFINITION_INCOMPATIBLE', 'OPERATION_SCOPE_INCOMPATIBLE',
  'OUT_OF_SCOPE', 'NOT_REPORTED', 'LEGITIMATE_NA',
])
const TRANSIENT_DEGRADATION_STATUSES = new Set([
  'MISSING_SOURCE_DATA', 'MISSING_BUT_AVAILABLE', 'INSUFFICIENT_PERIOD_COVERAGE',
  'STALE_SOURCE_COVERAGE', 'UNAVAILABLE', 'UNVERIFIED',
])
const ADJUSTED_EBITDA_AFFIRMATIVE_INVALIDATION_STATUSES = new Set([
  'REQUIRES_REVIEW', 'DEFINITION_INCOMPATIBLE',
])
const SNAPSHOT_BASE_METRICS = Object.freeze([
  'revenue', 'grossProfit', 'ebit', 'operatingCashFlow', 'capitalExpenditures', 'freeCashFlow',
])

function canonicalStatus(entry) {
  return entry?.status ?? entry?.validationStatus ?? null
}

function finite(value) {
  return value != null && Number.isFinite(Number(value))
}

function validCanonicalLtmRevenue(entry) {
  return finite(entry?.value) && VERIFIED_CANONICAL_STATUSES.has(canonicalStatus(entry))
}

function nextDate(value) {
  const parsed = Date.parse(`${value}T12:00:00Z`)
  if (!Number.isFinite(parsed)) return null
  const date = new Date(parsed)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

function validCurrentAdjustedEbitdaLtm(snapshot) {
  const entry = snapshot?.provenance?.ebitda?.LTM
  const metricValue = snapshot?.metrics?.ebitda?.LTM
  if (!finite(metricValue) || !finite(entry?.value) || Number(metricValue) !== Number(entry.value) ||
      !VERIFIED_CANONICAL_STATUSES.has(canonicalStatus(entry))) return false
  try {
    assertCanonicalAdjustedEbitdaEntry(entry, ADJUSTED_EBITDA_PERIOD.LTM)
    return true
  } catch {
    return false
  }
}

function reconstructedLtmBoundaries(entry) {
  const components = entry?.components
  if (!Array.isArray(components)) return null
  if (entry.derivation === 'DIRECT_REPORTED_LTM' && components.length === 1) {
    return { ltmStart: components[0]?.sourceStart, ltmEnd: components[0]?.sourceEnd }
  }
  if (entry.derivation === 'SUM_OF_LATEST_FOUR_COMPATIBLE_STANDALONE_QUARTERS' && components.length === 4) {
    return { ltmStart: components[0]?.sourceStart, ltmEnd: components.at(-1)?.sourceEnd }
  }
  if (entry.derivation === 'FY_PLUS_CURRENT_YTD_MINUS_PRIOR_YTD' && components.length === 3) {
    const currentYtd = components.find((component) => component?.inputRole === 'CURRENT_YTD')
    const priorYtd = components.find((component) => component?.inputRole === 'PRIOR_YEAR_COMPARABLE_YTD')
    return { ltmStart: nextDate(priorYtd?.sourceEnd), ltmEnd: currentYtd?.sourceEnd }
  }
  return null
}

export function migrateAdjustedEbitdaLtmSnapshotRecord(record) {
  const snapshot = record?.snapshot
  const entry = snapshot?.provenance?.ebitda?.LTM
  const metricValue = snapshot?.metrics?.ebitda?.LTM
  if (!snapshot || !finite(metricValue) || !finite(entry?.value) ||
      Number(metricValue) !== Number(entry.value) ||
      !VERIFIED_CANONICAL_STATUSES.has(canonicalStatus(entry))) {
    return { record, migrated: false }
  }
  if (validCurrentAdjustedEbitdaLtm(snapshot)) return { record, migrated: false }
  if (entry.requestedPeriodType !== ADJUSTED_EBITDA_PERIOD.LTM) return { record, migrated: false }

  const boundaries = reconstructedLtmBoundaries(entry)
  if (!boundaries?.ltmStart || !boundaries?.ltmEnd) return { record, migrated: false }
  const repairedEntry = {
    ...structuredClone(entry),
    ltmStart: boundaries.ltmStart,
    ltmEnd: boundaries.ltmEnd,
  }
  repairedEntry.denominatorIdentity = adjustedEbitdaDenominatorIdentity(repairedEntry)
  try {
    assertCanonicalAdjustedEbitdaEntry(repairedEntry, ADJUSTED_EBITDA_PERIOD.LTM)
  } catch {
    return { record, migrated: false }
  }

  const migratedSnapshot = structuredClone(snapshot)
  migratedSnapshot.provenance.ebitda.LTM = repairedEntry
  migratedSnapshot.multipleDenominatorIdentity = {
    ...(migratedSnapshot.multipleDenominatorIdentity ?? {}),
    evEbitda: {
      ...(migratedSnapshot.multipleDenominatorIdentity?.evEbitda ?? {}),
      LTM: repairedEntry.denominatorIdentity,
    },
  }
  return { migrated: true, record: { ...record, snapshot: migratedSnapshot } }
}

function prepareFinancialSnapshotRecord(record, requestedActualYears, options = {}) {
  const versionMigration = migrateFinancialSnapshotRecord(record, requestedActualYears, options)
  const ltmMigration = migrateAdjustedEbitdaLtmSnapshotRecord(versionMigration.record)
  return {
    record: ltmMigration.record,
    migrated: versionMigration.migrated || ltmMigration.migrated,
  }
}

export function migrateFinancialSnapshotRecord(record, requestedActualYears, options = {}) {
  const currentVersion = options.engineVersion ?? VALUATION_FINANCIAL_ENGINE_VERSION
  if (record?.engine_version !== PREVIOUS_VALUATION_FINANCIAL_ENGINE_VERSION) {
    return { record, migrated: false }
  }
  const actualYears = normalizedYears(record?.actual_years ?? record?.snapshot?.actualYears ??
    record?.snapshot?.financialSnapshot?.actualYears)
  if (!sameYears(actualYears, requestedActualYears)) return { record, migrated: false }
  const snapshot = record?.snapshot
  const revenueLtm = snapshot?.provenance?.revenue?.LTM
  if (!snapshot?.metrics?.ebit || !snapshot?.provenance?.ebit || !snapshot?.forwardBasisInputs?.ebit ||
    !validCanonicalLtmRevenue(revenueLtm)) {
    return { record, migrated: false }
  }
  const migratedSnapshot = structuredClone(snapshot)
  migratedSnapshot.forwardBasisInputs.ebitRevenue = structuredClone(revenueLtm)
  migratedSnapshot.actualYears = actualYears
  migratedSnapshot.financialSnapshot = {
    ...(migratedSnapshot.financialSnapshot ?? {}),
    engineVersion: currentVersion,
    actualYears,
    updatedAt: record.updated_at,
  }
  if (!validateFinancialSnapshot(migratedSnapshot)) return { record, migrated: false }
  return {
    migrated: true,
    record: {
      ...record,
      engine_version: currentVersion,
      actual_years: actualYears,
      snapshot: migratedSnapshot,
    },
  }
}

function periodEndValues(value) {
  if (Array.isArray(value)) return value.flatMap(periodEndValues)
  if (typeof value === 'string') return [value]
  if (!value || typeof value !== 'object') return []
  return [value.periodEnd, value.sourceEnd, value.quarterEnd, value.end, value.date].filter(Boolean)
}

function latestReportedPeriod(snapshot, metric) {
  return periodEndValues(snapshot?.canonicalHistorical?.latestReportedPeriods?.[metric])
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort()
    .at(-1) ?? null
}

function latestAdjustedEbitdaPeriod(snapshot, period) {
  return periodEndValues(snapshot?.provenance?.ebitda?.[period]?.components)
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort()
    .at(-1) ?? null
}

function transientDegradation(entry) {
  if (!entry || !canonicalStatus(entry)) return true
  const status = canonicalStatus(entry)
  if (TRANSIENT_DEGRADATION_STATUSES.has(status)) return true
  const reason = String(entry?.reason ?? entry?.method ?? entry?.warnings?.join(' ') ?? '')
  return /TIMEOUT|EXTRACTION|PARSER|MISSING_SOURCE|INSUFFICIENT.*COVERAGE|SOURCE.*UNAVAILABLE/i.test(reason)
}

export function evaluateFinancialSnapshotPromotion(existing, candidate, options = {}) {
  if (!existing) return { accepted: true, snapshot: candidate, diagnostic: null }
  const actualYears = normalizedYears(options.actualYears ?? candidate?.actualYears ?? existing?.actualYears)
  const periods = [...actualYears.map((year) => `${year}A`), 'LTM']
  const affected = []
  for (const metric of SNAPSHOT_BASE_METRICS) {
    for (const period of periods) {
      const priorEntry = existing?.provenance?.[metric]?.[period]
      const candidateEntry = candidate?.provenance?.[metric]?.[period]
      const priorValue = existing?.metrics?.[metric]?.[period]
      const candidateValue = candidate?.metrics?.[metric]?.[period]
      if (!finite(priorValue) || !VERIFIED_CANONICAL_STATUSES.has(canonicalStatus(priorEntry))) continue
      if (finite(candidateValue) && VERIFIED_CANONICAL_STATUSES.has(canonicalStatus(candidateEntry))) continue
      const candidateStatus = canonicalStatus(candidateEntry)
      if (AFFIRMATIVE_INVALIDATION_STATUSES.has(candidateStatus)) continue
      const existingLatest = latestReportedPeriod(existing, metric)
      const candidateLatest = latestReportedPeriod(candidate, metric)
      const newerLtmEvidence = period === 'LTM' && candidateLatest &&
        (!existingLatest || Date.parse(candidateLatest) > Date.parse(existingLatest))
      if (newerLtmEvidence) continue
      if (transientDegradation(candidateEntry)) {
        affected.push({ metric, period, reason: candidateEntry?.reason ?? candidateEntry?.method ?? candidateStatus })
      }
    }
  }
  const adjustedEbitdaAffected = []
  for (const period of periods) {
    const priorEntry = existing?.provenance?.ebitda?.[period]
    const candidateEntry = candidate?.provenance?.ebitda?.[period]
    const priorValue = existing?.metrics?.ebitda?.[period]
    const candidateValue = candidate?.metrics?.ebitda?.[period]
    if (!finite(priorValue) || !VERIFIED_CANONICAL_STATUSES.has(canonicalStatus(priorEntry))) continue
    if (finite(candidateValue) && VERIFIED_CANONICAL_STATUSES.has(canonicalStatus(candidateEntry))) continue

    const candidateStatus = canonicalStatus(candidateEntry)
    const affirmativeEvidence = ADJUSTED_EBITDA_AFFIRMATIVE_INVALIDATION_STATUSES.has(candidateStatus) &&
      (candidateEntry?.components?.length ?? 0) > 0
    if (affirmativeEvidence) continue

    const existingLatest = latestAdjustedEbitdaPeriod(existing, period)
    const candidateLatest = latestAdjustedEbitdaPeriod(candidate, period)
    if (period === 'LTM' && candidateLatest &&
      (!existingLatest || Date.parse(candidateLatest) > Date.parse(existingLatest))) continue

    adjustedEbitdaAffected.push({
      metric: 'ebitda',
      period,
      reason: candidateEntry?.reason ?? candidateEntry?.method ?? candidateStatus ?? 'ADJUSTED_EBITDA_SOURCE_UNAVAILABLE',
    })
  }
  if (adjustedEbitdaAffected.length) {
    const diagnostic = { reason: 'DEGRADED_ADJUSTED_EBITDA_REFRESH_REJECTED', affected: adjustedEbitdaAffected }
    const retained = structuredClone(existing)
    retained.financialSnapshot = { ...(retained.financialSnapshot ?? {}), refreshDiagnostic: diagnostic }
    retained.canonicalHistorical = {
      ...(retained.canonicalHistorical ?? {}),
      failures: [...(retained.canonicalHistorical?.failures ?? []), diagnostic],
    }
    return { accepted: false, snapshot: retained, diagnostic }
  }
  if (!affected.length) return { accepted: true, snapshot: candidate, diagnostic: null }
  const diagnostic = { reason: 'DEGRADED_FINANCIAL_REFRESH_REJECTED', affected }
  const retained = structuredClone(existing)
  retained.financialSnapshot = { ...(retained.financialSnapshot ?? {}), refreshDiagnostic: diagnostic }
  retained.canonicalHistorical = {
    ...(retained.canonicalHistorical ?? {}),
    failures: [...(retained.canonicalHistorical?.failures ?? []), diagnostic],
  }
  return { accepted: false, snapshot: retained, diagnostic }
}

export function validateFinancialSnapshot(snapshot) {
  const requiredMetrics = ['revenue', 'grossProfit', 'ebit', 'operatingCashFlow', 'capitalExpenditures', 'freeCashFlow', 'ebitda']
  return Boolean(snapshot && typeof snapshot === 'object' && snapshot.ticker &&
    snapshot.metrics && typeof snapshot.metrics === 'object' &&
    snapshot.provenance && typeof snapshot.provenance === 'object' &&
    snapshot.capital && typeof snapshot.capital === 'object' &&
    snapshot.canonicalHistorical && typeof snapshot.canonicalHistorical === 'object' &&
    snapshot.forwardBasisInputs?.ebit && snapshot.forwardBasisInputs?.ebitRevenue &&
    requiredMetrics.every((metric) => snapshot.metrics[metric] && typeof snapshot.metrics[metric] === 'object' &&
      snapshot.provenance[metric] && typeof snapshot.provenance[metric] === 'object'))
}

const EBITDA_LEGITIMATE_NULL_STATUSES = new Set([
  'NOT_REPORTED', 'LEGITIMATE_NA', 'OUT_OF_SCOPE',
  'INSUFFICIENT_PERIOD_COVERAGE', 'DEFINITION_INCOMPATIBLE', 'REQUIRES_REVIEW',
])
const EBITDA_REPAIR_STATUSES = new Set([
  'MISSING_SOURCE_DATA', 'MISSING_BUT_AVAILABLE', 'UNAVAILABLE', 'UNVERIFIED',
  'STALE_SOURCE_COVERAGE',
])

export function classifyAdjustedEbitdaSnapshotHealth(snapshot, actualYears) {
  const periods = [...normalizedYears(actualYears).map((year) => `${year}A`), 'LTM']
  const failures = snapshot?.canonicalHistorical?.failures ?? []
  const extractionFailure = failures.some((failure) =>
    /ADJUSTED_EBITDA.*(TIMEOUT|FAILED|FAILURE|UNAVAILABLE)|SUPPLEMENTAL.*(TIMEOUT|FAILED|FAILURE|UNAVAILABLE)/i
      .test(JSON.stringify(failure)))
  const affected = periods.filter((period) => {
    const value = snapshot?.metrics?.ebitda?.[period]
    const status = canonicalStatus(snapshot?.provenance?.ebitda?.[period])
    if (finite(value)) {
      if (!VERIFIED_CANONICAL_STATUSES.has(status)) return true
      if (period === 'LTM') return !validCurrentAdjustedEbitdaLtm(snapshot)
      return false
    }
    return !EBITDA_LEGITIMATE_NULL_STATUSES.has(status) || EBITDA_REPAIR_STATUSES.has(status)
  })
  return {
    state: extractionFailure || affected.length ? 'REPAIR_REQUIRED' : 'HEALTHY',
    reason: extractionFailure || affected.length ? 'ADJUSTED_EBITDA_REPAIR_REQUIRED' : null,
    affected,
  }
}

export function classifyFinancialSnapshot(record, requestedActualYears, options = {}) {
  const engineVersion = options.engineVersion ?? VALUATION_FINANCIAL_ENGINE_VERSION
  const staleAfterMs = options.staleAfterMs ?? VALUATION_FINANCIAL_SNAPSHOT_STALE_MS
  const actualYears = normalizedYears(record?.actual_years ?? record?.snapshot?.actualYears ??
    record?.snapshot?.financialSnapshot?.actualYears)
  const updatedAtMs = Date.parse(record?.updated_at ?? '')
  const ageMs = Number.isFinite(updatedAtMs) ? Math.max(0, Date.now() - updatedAtMs) : null
  const reasons = []
  if (record?.engine_version !== engineVersion) reasons.push('ENGINE_VERSION_MISMATCH')
  if (!sameYears(actualYears, requestedActualYears)) reasons.push('ACTUAL_YEAR_SET_MISMATCH')
  if (!validateFinancialSnapshot(record?.snapshot)) reasons.push('SNAPSHOT_SCHEMA_INVALID')
  if (reasons.length) return { state: FINANCIAL_SNAPSHOT_STATE.INCOMPATIBLE, reasons, actualYears, ageMs }
  const ebitdaHealth = classifyAdjustedEbitdaSnapshotHealth(record.snapshot, actualYears)
  if (ebitdaHealth.reason) reasons.push(ebitdaHealth.reason)
  const stale = ageMs == null || ageMs > staleAfterMs || ebitdaHealth.state === 'REPAIR_REQUIRED'
  return { state: stale ? FINANCIAL_SNAPSHOT_STATE.STALE : FINANCIAL_SNAPSHOT_STATE.READY,
    reasons, actualYears, ageMs, adjustedEbitdaHealth: ebitdaHealth }
}

export async function loadFinancialSnapshots(supabase, tickers, options = {}) {
  const normalized = [...new Set(tickers.map(normalizeTicker).filter(Boolean))]
  if (!normalized.length) return { snapshots: new Map(), diagnostic: null }
  if (!supabase?.from) {
    return { snapshots: new Map(), diagnostic: {
      stage: 'FINANCIAL_SNAPSHOT_READ', reason: 'FINANCIAL_SNAPSHOT_STORE_NOT_CONFIGURED',
      detail: 'Supabase service-role snapshot store is unavailable.',
    } }
  }
  const { data, error } = await supabase
    .from(VALUATION_FINANCIAL_SNAPSHOT_TABLE)
    .select('ticker, engine_version, actual_years, snapshot, updated_at')
    .in('ticker', normalized)
  if (error) {
    const notConfigured = /relation .* does not exist|column .* does not exist|schema cache|permission denied|not configured/i.test(error.message ?? '')
    return {
      snapshots: new Map(),
      diagnostic: { stage: 'FINANCIAL_SNAPSHOT_READ',
        reason: notConfigured ? 'FINANCIAL_SNAPSHOT_STORE_NOT_CONFIGURED' : 'FINANCIAL_SNAPSHOT_READ_FAILED', detail: error.message },
    }
  }
  const prepared = (data ?? []).map((record) => prepareFinancialSnapshotRecord(record, options.actualYears, options))
  const migratedRecords = prepared.filter((item) => item.migrated).map((item) => item.record)
  if (migratedRecords.length) {
    const { error: migrationError } = await supabase
      .from(VALUATION_FINANCIAL_SNAPSHOT_TABLE)
      .upsert(migratedRecords, { onConflict: 'ticker' })
    if (migrationError) {
      return { snapshots: new Map(), diagnostic: {
        stage: 'FINANCIAL_SNAPSHOT_MIGRATION', reason: 'FINANCIAL_SNAPSHOT_MIGRATION_FAILED',
        detail: migrationError.message,
      } }
    }
  }
  return {
    snapshots: new Map(prepared.map(({ record }) => {
      const classification = classifyFinancialSnapshot(record, options.actualYears, options)
      return [normalizeTicker(record.ticker), {
        ...(record.snapshot ?? {}), ticker: normalizeTicker(record.ticker),
        actualYears: classification.actualYears,
        financialSnapshot: {
          engineVersion: record.engine_version, actualYears: classification.actualYears,
          updatedAt: record.updated_at, state: classification.state, reasons: classification.reasons,
          ageMs: classification.ageMs,
        },
      }]
    })),
    diagnostic: null,
  }
}

export async function saveFinancialSnapshot(supabase, ticker, snapshot, options = {}) {
  const updatedAt = options.updatedAt ?? new Date().toISOString()
  const engineVersion = options.engineVersion ?? VALUATION_FINANCIAL_ENGINE_VERSION
  const actualYears = normalizedYears(options.actualYears ?? snapshot.actualYears ?? snapshot.financialSnapshot?.actualYears)
  const ebitdaHealth = classifyAdjustedEbitdaSnapshotHealth(snapshot, actualYears)
  const staleByAge = !Number.isFinite(Date.parse(updatedAt)) ||
    Date.now() - Date.parse(updatedAt) > (options.staleAfterMs ?? VALUATION_FINANCIAL_SNAPSHOT_STALE_MS)
  const storedState = staleByAge || ebitdaHealth.state === 'REPAIR_REQUIRED'
    ? FINANCIAL_SNAPSHOT_STATE.STALE : FINANCIAL_SNAPSHOT_STATE.READY
  const reasons = ebitdaHealth.reason ? [ebitdaHealth.reason] : []
  const ageMs = Math.max(0, Date.now() - Date.parse(updatedAt))
  const record = {
    ticker: normalizeTicker(ticker),
    engine_version: engineVersion,
    actual_years: actualYears,
    snapshot: {
      ...snapshot,
      actualYears,
      financialSnapshot: { engineVersion, actualYears, updatedAt, state: storedState, reasons, ageMs },
    },
    updated_at: updatedAt,
  }
  const { data, error } = await supabase
    .from(VALUATION_FINANCIAL_SNAPSHOT_TABLE)
    .upsert(record, { onConflict: 'ticker' })
    .select('ticker, engine_version, actual_years, snapshot, updated_at')
    .single()
  if (error) throw new Error(`FINANCIAL_SNAPSHOT_WRITE_FAILED: ${error.message}`)
  return {
    ...(data?.snapshot ?? record.snapshot),
    ticker: normalizeTicker(data?.ticker ?? record.ticker),
    financialSnapshot: {
      engineVersion: data?.engine_version ?? engineVersion,
      actualYears: normalizedYears(data?.actual_years ?? actualYears),
      updatedAt: data?.updated_at ?? updatedAt,
      state: storedState,
      reasons,
      ageMs,
    },
  }
}

export function snapshotFinancialRow(row) {
  const snapshot = structuredClone(row)
  delete snapshot.price
  delete snapshot.dailyChange
  delete snapshot.dailyPercent
  delete snapshot.ranges
  delete snapshot.multiples
  delete snapshot.marketTimestamp
  delete snapshot.refreshing
  if (snapshot.provenance) delete snapshot.provenance.market
  snapshot.forwardBasisInputs = structuredClone(row.forwardBasisInputs ?? snapshot.forwardBasisInputs ?? null)
  return snapshot
}

export function createMemoryFinancialSnapshotRepository() {
  const values = new Map()
  return {
    async load(_supabase, tickers, options = {}) {
      return {
        snapshots: new Map(tickers.map(normalizeTicker).filter((ticker) => values.has(ticker))
          .map((ticker) => {
            let stored = structuredClone(values.get(ticker))
            const migration = prepareFinancialSnapshotRecord({
              engine_version: stored.financialSnapshot?.engineVersion,
              actual_years: stored.actualYears,
              updated_at: stored.financialSnapshot?.updatedAt,
              snapshot: stored,
            }, options.actualYears, options)
            if (migration.migrated) {
              stored = migration.record.snapshot
              values.set(ticker, structuredClone(stored))
            }
            const classification = classifyFinancialSnapshot({
              engine_version: stored.financialSnapshot?.engineVersion,
              actual_years: stored.actualYears,
              updated_at: stored.financialSnapshot?.updatedAt,
              snapshot: stored,
            }, options.actualYears, options)
            stored.financialSnapshot = { ...stored.financialSnapshot, ...classification }
            return [ticker, stored]
          })),
        diagnostic: null,
      }
    },
    async save(_supabase, ticker, snapshot, options = {}) {
      const actualYears = normalizedYears(options.actualYears ?? snapshot.actualYears ?? snapshot.financialSnapshot?.actualYears)
      const updatedAt = options.updatedAt ?? new Date().toISOString()
      const state = Date.now() - Date.parse(updatedAt) > (options.staleAfterMs ?? VALUATION_FINANCIAL_SNAPSHOT_STALE_MS)
        ? FINANCIAL_SNAPSHOT_STATE.STALE : FINANCIAL_SNAPSHOT_STATE.READY
      const value = {
        ...structuredClone(snapshot),
        ticker: normalizeTicker(ticker),
        actualYears,
        financialSnapshot: {
          engineVersion: options.engineVersion ?? VALUATION_FINANCIAL_ENGINE_VERSION,
          actualYears,
          updatedAt,
          state,
          reasons: [],
          ageMs: Math.max(0, Date.now() - Date.parse(updatedAt)),
        },
      }
      values.set(value.ticker, value)
      return structuredClone(value)
    },
    clear() {
      values.clear()
    },
    seed(ticker, snapshot) {
      values.set(normalizeTicker(ticker), structuredClone(snapshot))
    },
  }
}
