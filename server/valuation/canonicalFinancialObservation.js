export const PERIOD_TYPE = Object.freeze({
  STANDALONE_QUARTER: 'STANDALONE_QUARTER',
  YTD_6M: 'YTD_6M',
  YTD_9M: 'YTD_9M',
  FISCAL_YEAR: 'FISCAL_YEAR',
  CALENDAR_YEAR: 'CALENDAR_YEAR',
  UNKNOWN: 'UNKNOWN',
})

export const DATE_AUTHORITY = Object.freeze({
  REPORTED: 'REPORTED',
  DERIVED_FROM_REPORTED_BOUNDARIES: 'DERIVED_FROM_REPORTED_BOUNDARIES',
  INFERRED: 'INFERRED',
  UNKNOWN: 'UNKNOWN',
})

export const OBSERVATION_BASIS = Object.freeze({
  REPORTED: 'REPORTED',
  DERIVED: 'DERIVED',
})

export const OPERATION_SCOPE = Object.freeze({
  CONTINUING_OPERATIONS: 'CONTINUING_OPERATIONS',
  TOTAL_INCLUDING_DISCONTINUED: 'TOTAL_INCLUDING_DISCONTINUED',
  UNSPECIFIED: 'UNSPECIFIED',
})

export const SEMANTIC_DEFINITION = Object.freeze({
  revenue: 'CANONICAL_CONSOLIDATED_GAAP_REVENUE',
  grossProfit: 'CANONICAL_CONSOLIDATED_GAAP_GROSS_PROFIT',
  ebit: 'CANONICAL_CONSOLIDATED_GAAP_OPERATING_INCOME',
  costOfRevenue: 'CANONICAL_CONSOLIDATED_GAAP_COST_OF_REVENUE',
  operatingCashFlow: 'CANONICAL_CONSOLIDATED_GAAP_OPERATING_CASH_FLOW',
  capitalExpenditures: 'CANONICAL_CASH_CAPITAL_EXPENDITURES',
  freeCashFlow: 'CANONICAL_FREE_CASH_FLOW_CFO_MINUS_CAPEX',
  providerFreeCashFlow: 'PROVIDER_REPORTED_FREE_CASH_FLOW',
})

const PERIOD_TYPES = new Set(Object.values(PERIOD_TYPE))
const DATE_AUTHORITIES = new Set(Object.values(DATE_AUTHORITY))
const OBSERVATION_BASES = new Set(Object.values(OBSERVATION_BASIS))
const OPERATION_SCOPES = new Set(Object.values(OPERATION_SCOPE))

const PERIOD_DURATION_RANGES = Object.freeze({
  [PERIOD_TYPE.STANDALONE_QUARTER]: [45, 130],
  [PERIOD_TYPE.YTD_6M]: [150, 220],
  [PERIOD_TYPE.YTD_9M]: [230, 310],
  [PERIOD_TYPE.FISCAL_YEAR]: [330, 380],
  [PERIOD_TYPE.CALENDAR_YEAR]: [350, 380],
})

export function isoDate(value) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const [, year, month, day] = match.map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? String(value)
    : null
}

export function epochDay(value) {
  const normalized = isoDate(value)
  if (!normalized) return null
  const [year, month, day] = normalized.split('-').map(Number)
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
}

export function dateFromEpochDay(value) {
  const date = new Date(Number(value) * 86_400_000)
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

export function inclusiveDays(start, end) {
  const first = epochDay(start)
  const last = epochDay(end)
  return first == null || last == null || first > last ? null : last - first + 1
}

export function periodTypeMatchesDuration(periodType, durationDays) {
  if (durationDays == null || !PERIOD_DURATION_RANGES[periodType]) return true
  const [minimum, maximum] = PERIOD_DURATION_RANGES[periodType]
  return durationDays >= minimum && durationDays <= maximum
}

export function createPeriodIdentity(input = {}) {
  const periodType = PERIOD_TYPES.has(input.periodType) ? input.periodType : PERIOD_TYPE.UNKNOWN
  const dateAuthority = DATE_AUTHORITIES.has(input.dateAuthority) ? input.dateAuthority : DATE_AUTHORITY.UNKNOWN
  const periodStart = isoDate(input.periodStart)
  const periodEnd = isoDate(input.periodEnd)
  const durationDays = periodStart && periodEnd ? inclusiveDays(periodStart, periodEnd) : null
  return Object.freeze({
    periodType,
    periodStart,
    periodEnd,
    dateAuthority,
    durationDays,
    fiscalYear: input.fiscalYear != null && Number.isInteger(Number(input.fiscalYear)) ? Number(input.fiscalYear) : null,
    fiscalQuarter: [1, 2, 3, 4].includes(Number(input.fiscalQuarter)) ? Number(input.fiscalQuarter) : null,
    fiscalCalendarId: input.fiscalCalendarId ? String(input.fiscalCalendarId) : null,
    sequenceIndex: input.sequenceIndex != null && Number.isInteger(Number(input.sequenceIndex)) ? Number(input.sequenceIndex) : null,
    economicPeriodKey: input.economicPeriodKey ? String(input.economicPeriodKey) : null,
    startEvidence: input.startEvidence ?? null,
    endEvidence: input.endEvidence ?? null,
  })
}

export function validateCanonicalObservation(observation) {
  const failures = []
  if (!observation?.ticker) failures.push('MISSING_TICKER')
  if (!observation?.metric) failures.push('MISSING_METRIC')
  if (observation?.normalizedValue == null || !Number.isFinite(Number(observation.normalizedValue))) failures.push('INVALID_NORMALIZED_VALUE')
  if (!observation?.currency) failures.push('MISSING_CURRENCY')
  if (!observation?.normalizedUnits) failures.push('MISSING_NORMALIZED_UNITS')
  if (!observation?.sourceProvider || !observation?.sourceId) failures.push('MISSING_SOURCE_PROVENANCE')
  if (!observation?.scope) failures.push('MISSING_SCOPE')
  if (!OPERATION_SCOPES.has(observation?.operationScope)) failures.push('INVALID_OPERATION_SCOPE')
  if (!observation?.periodIdentity) failures.push('MISSING_PERIOD_IDENTITY')
  if (!OBSERVATION_BASES.has(observation?.reportedVsDerived)) failures.push('INVALID_OBSERVATION_BASIS')
  const period = observation?.periodIdentity
  if (period?.periodStart && period?.periodEnd && period.periodStart > period.periodEnd) failures.push('INVALID_PERIOD_RANGE')
  if (period?.periodStart && !period.periodEnd) failures.push('INCOMPLETE_PERIOD_RANGE')
  if (period?.periodEnd && !period.periodStart && period.dateAuthority !== DATE_AUTHORITY.UNKNOWN) {
    failures.push('INCOMPLETE_AUTHORITATIVE_PERIOD_RANGE')
  }
  if (hasAuthoritativeBoundaries(period) && !periodTypeMatchesDuration(period.periodType, period.durationDays)) {
    failures.push('PERIOD_TYPE_DURATION_CONFLICT')
  }
  return { valid: failures.length === 0, failures }
}

export function createCanonicalObservation(input = {}) {
  const observation = {
    id: input.id ? String(input.id) : String(input.sourceId ?? ''),
    ticker: String(input.ticker ?? '').trim().toUpperCase(),
    issuerId: String(input.issuerId ?? input.ticker ?? '').trim().toUpperCase(),
    metric: String(input.metric ?? ''),
    rawValue: input.rawValue ?? input.normalizedValue ?? null,
    rawUnits: input.rawUnits ?? input.normalizedUnits ?? input.currency ?? null,
    normalizedValue: input.normalizedValue == null ? null : Number(input.normalizedValue),
    currency: input.currency ? String(input.currency).toUpperCase() : null,
    normalizedUnits: input.normalizedUnits ? String(input.normalizedUnits) : null,
    periodIdentity: createPeriodIdentity(input.periodIdentity),
    sourceProvider: String(input.sourceProvider ?? ''),
    sourceId: String(input.sourceId ?? ''),
    filingDate: isoDate(input.filingDate),
    accession: input.accession ?? null,
    sourceUrl: input.sourceUrl ?? null,
    scope: input.scope ? String(input.scope).toUpperCase() : null,
    operationScope: input.operationScope == null
      ? OPERATION_SCOPE.UNSPECIFIED
      : String(input.operationScope).toUpperCase(),
    confidence: input.confidence ?? null,
    reportedVsDerived: input.reportedVsDerived ?? OBSERVATION_BASIS.REPORTED,
    derivation: input.derivation ?? null,
    semanticDefinitionFingerprint: input.semanticDefinitionFingerprint ?? input.definitionFingerprint ?? null,
    sourceDefinitionFingerprint: input.sourceDefinitionFingerprint ?? input.definitionFingerprint ?? null,
    definitionFingerprint: input.semanticDefinitionFingerprint ?? input.definitionFingerprint ?? null,
    retrievedAt: input.retrievedAt ?? null,
    restatedOrRecast: input.restatedOrRecast === true,
    warnings: [...(input.warnings ?? [])],
  }
  const validation = validateCanonicalObservation(observation)
  if (!validation.valid) throw new TypeError(`Invalid CanonicalObservation: ${validation.failures.join(', ')}`)
  return Object.freeze(observation)
}

export function hasAuthoritativeBoundaries(periodIdentity) {
  return Boolean(periodIdentity?.periodStart && periodIdentity?.periodEnd && [
    DATE_AUTHORITY.REPORTED,
    DATE_AUTHORITY.DERIVED_FROM_REPORTED_BOUNDARIES,
  ].includes(periodIdentity.dateAuthority))
}
