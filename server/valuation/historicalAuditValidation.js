const VERIFIED_STATUSES = new Set(['VERIFIED_REPORTED', 'VERIFIED_DERIVED'])

const EXPLICIT_NULL_STATUSES = new Set([
  'NOT_REPORTED',
  'LEGITIMATE_NA',
  'OUT_OF_SCOPE',
  'OUT_OF_SEC_SCOPE',
  'ETF_NOT_APPLICABLE',
  'DEFINITION_INCOMPATIBLE',
  'OPERATION_SCOPE_INCOMPATIBLE',
])

const MANDATORY_FAILURE_STATUSES = new Set([
  'MISSING_SOURCE_DATA',
  'INSUFFICIENT_PERIOD_COVERAGE',
  'STALE_SOURCE_COVERAGE',
  'REQUIRES_REVIEW',
])

function key(ticker, metric, period) {
  return `${ticker}|${metric}|${period}`
}

function hasComponentPeriodIdentity(component) {
  const boundedPeriod = component?.sourceStart && component?.sourceEnd
  const explicitFiscalQuarter = component?.sourceEnd &&
    Number.isInteger(Number(component?.fiscalYear)) &&
    [1, 2, 3, 4].includes(Number(component?.fiscalQuarter))
  return Boolean(boundedPeriod || explicitFiscalQuarter)
}

function hasComponentProvenance(component) {
  return Boolean(component?.sourceProvider && component?.sourceId &&
    hasComponentPeriodIdentity(component))
}

function definitionFingerprint(component) {
  return component?.definitionFingerprint ?? component?.sourceDefinitionFingerprint ?? null
}

function hasDefinitionIncompatibilityEvidence(record) {
  const components = record.quarterlyComponents ?? []
  if (components.length < 2 || components.some((component) => !hasComponentProvenance(component))) return false
  const fingerprints = components.map(definitionFingerprint).filter(Boolean)
  return fingerprints.length === components.length && new Set(fingerprints).size > 1
}

function hasOperationScopeIncompatibilityEvidence(record) {
  const components = record.quarterlyComponents ?? []
  if (components.length < 2 || components.some((component) => !hasComponentProvenance(component))) return false
  const scopes = components.map((component) => component.operationScope).filter(Boolean)
  return scopes.length === components.length && new Set(scopes).size > 1
}

function hasCompletedNegativeSearchEvidence(record) {
  const evidence = record.negativeSearchEvidence
  if (!evidence || evidence.searchType !== 'SEC_COMPANY_DEFINED_ADJUSTED_EBITDA') return false
  if (evidence.completed !== true || evidence.timedOut === true || evidence.failed === true) return false
  if (Number(evidence.eligibleReconciliationsFound) !== 0) return false
  if (!(evidence.coveredPeriods ?? []).includes(String(record.calendarYear))) return false
  const filings = evidence.filingsExamined ?? []
  return filings.length > 0 && filings.every((filing) =>
    filing.accessionNumber && filing.form && filing.extractionCompleted === true)
}

function hasRequiredNullEvidence(record) {
  if (record.validationStatus === 'DEFINITION_INCOMPATIBLE') {
    return hasDefinitionIncompatibilityEvidence(record)
  }
  if (record.validationStatus === 'OPERATION_SCOPE_INCOMPATIBLE') {
    return hasOperationScopeIncompatibilityEvidence(record)
  }
  if (record.validationStatus === 'NOT_REPORTED') {
    return hasCompletedNegativeSearchEvidence(record)
  }
  return true
}

export function validateHistoricalAuditRecords(records = [], { tickers = [], metrics = [], periods = [] } = {}) {
  const issues = []
  const grouped = new Map()
  for (const record of records) {
    const recordKey = key(record.ticker, record.metric, record.calendarYear)
    if (!grouped.has(recordKey)) grouped.set(recordKey, [])
    grouped.get(recordKey).push(record)
  }
  for (const ticker of tickers) for (const metric of metrics) for (const period of periods) {
    const recordKey = key(ticker, metric, period)
    const matches = grouped.get(recordKey) ?? []
    if (matches.length !== 1) {
      issues.push({ ticker, metric, period, reason: matches.length ? 'DUPLICATE_AUDIT_CELL' : 'MISSING_AUDIT_CELL' })
      continue
    }
    const record = matches[0]
    if (!record.validationStatus) {
      issues.push({ ticker, metric, period, reason: 'MISSING_VALIDATION_STATUS' })
      continue
    }
    if (record.displayedValue == null) {
      if (MANDATORY_FAILURE_STATUSES.has(record.validationStatus)) {
        issues.push({ ticker, metric, period, reason: 'MANDATORY_CELL_UNRESOLVED', status: record.validationStatus })
      } else if (!EXPLICIT_NULL_STATUSES.has(record.validationStatus)) {
        issues.push({ ticker, metric, period, reason: 'UNJUSTIFIED_NULL', status: record.validationStatus })
      } else if (!hasRequiredNullEvidence(record)) {
        issues.push({ ticker, metric, period, reason: 'NULL_WITHOUT_POSITIVE_EVIDENCE', status: record.validationStatus })
      }
      if (!record.failureReason && !record.warning) {
        issues.push({ ticker, metric, period, reason: 'NULL_WITHOUT_EXPLICIT_REASON', status: record.validationStatus })
      }
      continue
    }
    if (!Number.isFinite(Number(record.displayedValue))) {
      issues.push({ ticker, metric, period, reason: 'NON_NUMERIC_VALUE' })
    }
    if (!VERIFIED_STATUSES.has(record.validationStatus)) {
      issues.push({ ticker, metric, period, reason: 'VALUE_NOT_VERIFIED', status: record.validationStatus })
    }
    if (!record.quarterlyComponents?.length) {
      issues.push({ ticker, metric, period, reason: 'VALUE_WITHOUT_COMPONENT_LINEAGE' })
    } else if (record.quarterlyComponents.some((component) => !hasComponentProvenance(component))) {
      issues.push({ ticker, metric, period, reason: 'INCOMPLETE_COMPONENT_PROVENANCE' })
    }
  }
  return issues
}

export const HISTORICAL_AUDIT_NULL_STATUSES = EXPLICIT_NULL_STATUSES
export const HISTORICAL_AUDIT_FAILURE_STATUSES = MANDATORY_FAILURE_STATUSES
