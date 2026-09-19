import {
  createCanonicalObservation,
  createPeriodIdentity,
  DATE_AUTHORITY,
  dateFromEpochDay,
  epochDay,
  inclusiveDays,
  OBSERVATION_BASIS,
  PERIOD_TYPE,
  periodTypeMatchesDuration,
} from './canonicalFinancialObservation.js'

const END_DATE_TOLERANCE_DAYS = 7

export function classifyPeriod(input = {}) {
  const explicit = String(input.periodType ?? '').trim().toUpperCase()
  const aliases = {
    QUARTER: PERIOD_TYPE.STANDALONE_QUARTER,
    QUARTERLY: PERIOD_TYPE.STANDALONE_QUARTER,
    '3M': PERIOD_TYPE.STANDALONE_QUARTER,
    '6M': PERIOD_TYPE.YTD_6M,
    SEMI_ANNUAL: PERIOD_TYPE.YTD_6M,
    '9M': PERIOD_TYPE.YTD_9M,
    FY: PERIOD_TYPE.FISCAL_YEAR,
    ANNUAL: PERIOD_TYPE.FISCAL_YEAR,
    '12M': PERIOD_TYPE.FISCAL_YEAR,
  }
  const requested = Object.values(PERIOD_TYPE).includes(explicit) ? explicit : aliases[explicit]
  const duration = inclusiveDays(input.periodStart, input.periodEnd)
  const authoritative = [DATE_AUTHORITY.REPORTED, DATE_AUTHORITY.DERIVED_FROM_REPORTED_BOUNDARIES]
    .includes(input.dateAuthority)
  if (requested) return authoritative && !periodTypeMatchesDuration(requested, duration) ? PERIOD_TYPE.UNKNOWN : requested
  if (duration != null) {
    if (duration >= 70 && duration <= 120) return PERIOD_TYPE.STANDALONE_QUARTER
    if (duration >= 150 && duration <= 220) return PERIOD_TYPE.YTD_6M
    if (duration >= 230 && duration <= 310) return PERIOD_TYPE.YTD_9M
    if (duration >= 330 && duration <= 380) return PERIOD_TYPE.FISCAL_YEAR
  }
  return PERIOD_TYPE.UNKNOWN
}

export function economicPeriodIdentity(observation) {
  const period = observation.periodIdentity
  const issuer = observation.issuerId || observation.ticker
  const operationScope = observation.operationScope ?? 'UNSPECIFIED'
  if (period.periodStart && period.periodEnd && period.dateAuthority !== DATE_AUTHORITY.UNKNOWN) {
    return `${issuer}:${operationScope}:${period.periodType}:${period.periodStart}:${period.periodEnd}`
  }
  if (period.fiscalCalendarId && period.fiscalYear != null && period.fiscalQuarter != null) {
    return `${issuer}:${operationScope}:${period.fiscalCalendarId}:FY${period.fiscalYear}:Q${period.fiscalQuarter}`
  }
  if (period.sequenceIndex != null) return `${issuer}:${operationScope}:SEQUENCE:${period.sequenceIndex}`
  return `${issuer}:${operationScope}:SOURCE:${observation.sourceId}`
}

function sameSeries(left, right) {
  return left.issuerId === right.issuerId && left.metric === right.metric && left.scope === right.scope &&
    left.operationScope === right.operationScope &&
    left.currency === right.currency && left.normalizedUnits === right.normalizedUnits &&
    (left.semanticDefinitionFingerprint ?? left.definitionFingerprint ?? null) ===
      (right.semanticDefinitionFingerprint ?? right.definitionFingerprint ?? null)
}

export function sameEconomicPeriod(left, right) {
  if (!sameSeries(left, right)) return false
  const a = left.periodIdentity
  const b = right.periodIdentity
  if (a.periodType !== b.periodType) return false
  const aEnd = epochDay(a.periodEnd)
  const bEnd = epochDay(b.periodEnd)
  const bothAuthoritative = [a, b].every((period) => [DATE_AUTHORITY.REPORTED, DATE_AUTHORITY.DERIVED_FROM_REPORTED_BOUNDARIES]
    .includes(period.dateAuthority) && period.periodStart && period.periodEnd)
  if (!bothAuthoritative && a.fiscalCalendarId && b.fiscalCalendarId && a.fiscalCalendarId === b.fiscalCalendarId &&
      a.fiscalYear != null && b.fiscalYear != null && a.fiscalQuarter != null && b.fiscalQuarter != null) {
    return a.fiscalYear === b.fiscalYear && a.fiscalQuarter === b.fiscalQuarter
  }
  if (aEnd == null || bEnd == null || Math.abs(aEnd - bEnd) > END_DATE_TOLERANCE_DAYS) return false
  const aStart = epochDay(a.periodStart)
  const bStart = epochDay(b.periodStart)
  if (aStart != null && bStart != null && Math.abs(aStart - bStart) > 14) return false
  const aDuration = inclusiveDays(a.periodStart, a.periodEnd)
  const bDuration = inclusiveDays(b.periodStart, b.periodEnd)
  return aDuration == null || bDuration == null || Math.abs(aDuration - bDuration) <= 14
}

function sameSequenceCandidate(left, right) {
  if (!sameSeries(left, right) || left.periodIdentity.periodType !== right.periodIdentity.periodType) return false
  const a = left.periodIdentity
  const b = right.periodIdentity
  return Boolean(a.fiscalCalendarId && a.fiscalCalendarId === b.fiscalCalendarId &&
    a.fiscalYear != null && a.fiscalYear === b.fiscalYear &&
    a.fiscalQuarter != null && a.fiscalQuarter === b.fiscalQuarter)
}

function valuesAgree(left, right, tolerance = 0.001) {
  const scale = Math.max(1, Math.abs(left.normalizedValue), Math.abs(right.normalizedValue))
  return Math.abs(left.normalizedValue - right.normalizedValue) <= scale * tolerance
}

function explicitRestatementWinner(left, right) {
  const laterAnnualRemainder = [left, right]
    .filter((item) => item.reportedVsDerived === OBSERVATION_BASIS.DERIVED &&
      item.derivation?.method === 'FISCAL_YEAR_MINUS_YTD_9M')
    .sort((a, b) => String(b.filingDate ?? '').localeCompare(String(a.filingDate ?? '')))[0]
  const other = laterAnnualRemainder === left ? right : left
  if (laterAnnualRemainder && String(laterAnnualRemainder.filingDate ?? '') > String(other?.filingDate ?? '')) {
    return laterAnnualRemainder
  }
  if (left.sourceProvider === right.sourceProvider && left.filingDate !== right.filingDate) {
    return String(right.filingDate ?? '').localeCompare(String(left.filingDate ?? '')) > 0 ? right : left
  }
  const candidates = [left, right].filter((item) => item.restatedOrRecast)
    .sort((a, b) => String(b.filingDate ?? '').localeCompare(String(a.filingDate ?? '')))
  return candidates[0] ?? null
}

function withConflict(observation, conflict) {
  return {
    ...observation,
    deduplicationStatus: 'REQUIRES_REVIEW',
    conflicts: [...(observation.conflicts ?? []), conflict],
  }
}

function sourceRank(observation) {
  const provider = observation.sourceProvider.toUpperCase()
  return (provider === 'WISESHEETS' ? 300 : provider === 'SEC' ? 200 : 100) +
    (observation.accession ? 20 : 0) + (observation.sourceUrl ? 10 : 0)
}

function dateAuthorityRank(observation) {
  return {
    [DATE_AUTHORITY.REPORTED]: 3,
    [DATE_AUTHORITY.DERIVED_FROM_REPORTED_BOUNDARIES]: 2,
    [DATE_AUTHORITY.INFERRED]: 1,
    [DATE_AUTHORITY.UNKNOWN]: 0,
  }[observation?.periodIdentity?.dateAuthority] ?? 0
}

function preferredObservation(left, right) {
  if (left.sourceProvider === right.sourceProvider) {
    const filingOrder = String(right.filingDate ?? '').localeCompare(String(left.filingDate ?? ''))
    if (filingOrder) return filingOrder > 0 ? right : left
  }
  const rankDifference = sourceRank(right) - sourceRank(left)
  if (rankDifference) return rankDifference > 0 ? right : left
  return String(right.filingDate ?? '').localeCompare(String(left.filingDate ?? '')) >= 0 ? right : left
}

export function deduplicateEconomicPeriods(observations = []) {
  const accepted = []
  for (const observation of observations) {
    const index = accepted.findIndex((candidate) => sameEconomicPeriod(candidate, observation))
    if (index < 0) {
      const sequenceConflictIndex = accepted.findIndex((candidate) => sameSequenceCandidate(candidate, observation))
      if (sequenceConflictIndex >= 0) {
        const existing = accepted[sequenceConflictIndex]
        const conflict = {
          type: 'PERIOD_IDENTITY_CONFLICT',
          sourceIds: [existing.sourceId, observation.sourceId],
          boundaries: [existing.periodIdentity, observation.periodIdentity],
        }
        accepted[sequenceConflictIndex] = withConflict(existing, conflict)
        accepted.push(withConflict({ ...observation, economicPeriodKey: economicPeriodIdentity(observation), alternatives: [] }, conflict))
      } else {
        accepted.push({ ...observation, economicPeriodKey: economicPeriodIdentity(observation), alternatives: [] })
      }
      continue
    }
    const current = accepted[index]
    const authoritativeAnnualRemainder = explicitRestatementWinner(current, observation)
    if (authoritativeAnnualRemainder?.derivation?.method === 'FISCAL_YEAR_MINUS_YTD_9M') {
      const loser = authoritativeAnnualRemainder === current ? observation : current
      accepted[index] = {
        ...authoritativeAnnualRemainder,
        economicPeriodKey: current.economicPeriodKey,
        alternatives: [...(authoritativeAnnualRemainder.alternatives ?? []), loser],
        selectionReason: 'LATEST_AUTHORITATIVE_RESTATEMENT',
      }
      continue
    }
    const authorityDifference = dateAuthorityRank(observation) - dateAuthorityRank(current)
    if (authorityDifference) {
      const winner = authorityDifference > 0 ? observation : current
      const loser = winner === current ? observation : current
      accepted[index] = {
        ...winner,
        economicPeriodKey: current.economicPeriodKey,
        alternatives: [...(winner.alternatives ?? []), loser],
        selectionReason: 'AUTHORITATIVE_PERIOD_BOUNDARIES',
      }
      continue
    }
    const restatement = explicitRestatementWinner(current, observation)
    if (!restatement && !valuesAgree(current, observation)) {
      const conflict = {
        type: 'VALUE_CONFLICT',
        sourceIds: [current.sourceId, observation.sourceId],
        values: [current.normalizedValue, observation.normalizedValue],
      }
      accepted[index] = withConflict(current, conflict)
      accepted.push(withConflict({ ...observation, economicPeriodKey: current.economicPeriodKey, alternatives: [] }, conflict))
      continue
    }
    const winner = restatement ?? preferredObservation(current, observation)
    const loser = winner === current ? observation : current
    accepted[index] = {
      ...winner,
      economicPeriodKey: current.economicPeriodKey,
      alternatives: [...(winner.alternatives ?? []), loser],
      selectionReason: restatement ? 'LATEST_AUTHORITATIVE_RESTATEMENT' : 'PREFERRED_AGREEING_SOURCE',
    }
  }
  return accepted.sort((left, right) => String(left.periodIdentity.periodEnd ?? '').localeCompare(String(right.periodIdentity.periodEnd ?? '')))
}

function cumulativePairFailure(current, prior) {
  if (!current || !prior) return 'MISSING_CUMULATIVE_SOURCE_PERIOD'
  if (!sameSeries(current, prior)) return 'INCOMPATIBLE_CUMULATIVE_SERIES'
  const a = current.periodIdentity
  const b = prior.periodIdentity
  const authoritativeBoundaries = [a, b].every((period) =>
    [DATE_AUTHORITY.REPORTED, DATE_AUTHORITY.DERIVED_FROM_REPORTED_BOUNDARIES].includes(period.dateAuthority) &&
    period.periodStart && period.periodEnd)
  if (authoritativeBoundaries) {
    return a.periodStart === b.periodStart ? null : 'INCOMPATIBLE_FISCAL_COHORT'
  }
  if (a.fiscalYear == null || b.fiscalYear == null || a.fiscalYear !== b.fiscalYear) {
    return 'INCOMPATIBLE_FISCAL_COHORT'
  }
  if (a.fiscalCalendarId && b.fiscalCalendarId && a.fiscalCalendarId !== b.fiscalCalendarId) {
    return 'INCOMPATIBLE_FISCAL_COHORT'
  }
  if (!a.periodStart || a.periodStart !== b.periodStart) return 'INCOMPATIBLE_FISCAL_COHORT'
  return null
}

function derivedBoundaryAuthority(current, prior) {
  const accepted = new Set([DATE_AUTHORITY.REPORTED, DATE_AUTHORITY.DERIVED_FROM_REPORTED_BOUNDARIES])
  return accepted.has(current.periodIdentity.dateAuthority) && accepted.has(prior.periodIdentity.dateAuthority)
    ? DATE_AUTHORITY.DERIVED_FROM_REPORTED_BOUNDARIES
    : DATE_AUTHORITY.UNKNOWN
}

function derivationFailure(reason, method, fiscalQuarter, cohortKey, sources = []) {
  return {
    status: 'REQUIRES_REVIEW',
    reason,
    method,
    fiscalQuarter,
    fiscalCohortKey: cohortKey,
    sourceIds: sources.map((item) => item?.sourceId).filter(Boolean),
    conflicts: sources.flatMap((item) => item?.conflicts ?? []),
  }
}

function deriveQuarter(current, prior, fiscalQuarter, method, cohortKey) {
  const pairFailure = cumulativePairFailure(current, prior)
  if (pairFailure) return { observation: null, failure: derivationFailure(pairFailure, method, fiscalQuarter, cohortKey, [current, prior]) }
  const priorEnd = epochDay(prior.periodIdentity.periodEnd)
  const currentEnd = epochDay(current.periodIdentity.periodEnd)
  if (priorEnd == null || currentEnd == null || priorEnd >= currentEnd) {
    return { observation: null, failure: derivationFailure('INVALID_DERIVED_PERIOD_ORDER', method, fiscalQuarter, cohortKey, [current, prior]) }
  }
  const periodStart = dateFromEpochDay(priorEnd + 1)
  const periodEnd = dateFromEpochDay(currentEnd)
  const durationDays = inclusiveDays(periodStart, periodEnd)
  if (!periodTypeMatchesDuration(PERIOD_TYPE.STANDALONE_QUARTER, durationDays)) {
    return { observation: null, failure: derivationFailure('INVALID_DERIVED_QUARTER_DURATION', method, fiscalQuarter, cohortKey, [current, prior]) }
  }
  const authority = derivedBoundaryAuthority(current, prior)
  try {
    return { observation: createCanonicalObservation({
      ...current,
      id: `${current.id}|MINUS|${prior.id}`,
      rawValue: null,
      normalizedValue: current.normalizedValue - prior.normalizedValue,
      sourceProvider: 'DERIVED',
      sourceId: `${current.sourceId}|MINUS|${prior.sourceId}`,
      reportedVsDerived: OBSERVATION_BASIS.DERIVED,
      derivation: { method, inputs: [current.sourceId, prior.sourceId] },
      periodIdentity: createPeriodIdentity({
        periodType: PERIOD_TYPE.STANDALONE_QUARTER,
        periodStart,
        periodEnd,
        dateAuthority: authority,
        fiscalYear: current.periodIdentity.fiscalYear,
        fiscalQuarter,
        fiscalCalendarId: current.periodIdentity.fiscalCalendarId,
        sequenceIndex: current.periodIdentity.sequenceIndex,
        startEvidence: prior.periodIdentity.endEvidence,
        endEvidence: current.periodIdentity.endEvidence,
      }),
    }), failure: null }
  } catch (error) {
    return {
      observation: null,
      failure: {
        ...derivationFailure('INVALID_DERIVED_PERIOD', method, fiscalQuarter, cohortKey, [current, prior]),
        validationError: error instanceof Error ? error.message : String(error),
      },
    }
  }
}

export function deriveStandaloneQuarters(observations = []) {
  const output = deduplicateEconomicPeriods(
    observations.filter((item) => item.periodIdentity.periodType === PERIOD_TYPE.STANDALONE_QUARTER),
  )
  const failures = []
  const groups = new Map()
  for (const observation of observations.filter((item) => item.periodIdentity.fiscalYear != null)) {
    const key = [observation.issuerId, observation.metric, observation.periodIdentity.fiscalYear,
      observation.scope, observation.operationScope, observation.currency, observation.normalizedUnits,
      observation.semanticDefinitionFingerprint ?? observation.definitionFingerprint ?? ''].join('|')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(observation)
  }
  for (const [cohortKey, group] of groups) {
    const resolve = (type, quarter = null, priorCumulative = null) => {
      let candidates = group.filter((item) => item.periodIdentity.periodType === type &&
        (quarter == null || item.periodIdentity.fiscalQuarter === quarter))
      // SEC comparative annual facts sometimes inherit the current filing's
      // fiscal-year label.  When deriving Q4, bind the annual to the resolved
      // nine-month period by its authoritative economic boundaries instead of
      // accepting every comparative annual carrying that label.
      if (type === PERIOD_TYPE.FISCAL_YEAR && priorCumulative?.observation) {
        const priorPeriod = priorCumulative.observation.periodIdentity
        candidates = candidates.filter((item) => {
          const period = item.periodIdentity
          const remainingDays = epochDay(period.periodEnd) - epochDay(priorPeriod.periodEnd)
          return period.periodStart === priorPeriod.periodStart &&
            Number.isFinite(remainingDays) && remainingDays >= 75 && remainingDays <= 110
        })
      }
      if (!candidates.length) return { observation: null, failure: null }
      const resolved = deduplicateEconomicPeriods(candidates)
      const conflicted = resolved.filter((item) => item.deduplicationStatus === 'REQUIRES_REVIEW')
      if (conflicted.length) {
        const reason = conflicted.flatMap((item) => item.conflicts ?? [])[0]?.type ?? 'UNRESOLVED_SOURCE_PERIOD_CONFLICT'
        return {
          observation: null,
          failure: derivationFailure(reason, 'RESOLVE_CUMULATIVE_SOURCE', quarter, cohortKey, conflicted),
        }
      }
      if (resolved.length !== 1) {
        return {
          observation: null,
          failure: derivationFailure('AMBIGUOUS_CUMULATIVE_SOURCE_PERIOD', 'RESOLVE_CUMULATIVE_SOURCE', quarter, cohortKey, resolved),
        }
      }
      return { observation: resolved[0], failure: null }
    }
    const q1 = resolve(PERIOD_TYPE.STANDALONE_QUARTER, 1)
    const six = resolve(PERIOD_TYPE.YTD_6M)
    const nine = resolve(PERIOD_TYPE.YTD_9M)
    const year = resolve(PERIOD_TYPE.FISCAL_YEAR, null, nine)
    for (const source of [q1, six, nine, year]) if (source.failure) failures.push(source.failure)
    for (const [current, prior, fiscalQuarter, method] of [
      [six, q1, 2, 'YTD_6M_MINUS_Q1'],
      [nine, six, 3, 'YTD_9M_MINUS_YTD_6M'],
      [year, nine, 4, 'FISCAL_YEAR_MINUS_YTD_9M'],
    ]) {
      if (!current.observation || !prior.observation) {
        const sourceFailure = current.failure ?? prior.failure
        if (sourceFailure) failures.push({
          ...derivationFailure(
            sourceFailure.reason, method, fiscalQuarter, cohortKey,
            [...(current.observation ? [current.observation] : []), ...(prior.observation ? [prior.observation] : [])],
          ),
          blockedBy: sourceFailure,
        })
        continue
      }
      const derived = deriveQuarter(current.observation, prior.observation, fiscalQuarter, method, cohortKey)
      if (derived.observation) output.push(derived.observation)
      if (derived.failure) failures.push(derived.failure)
    }
  }
  const normalized = deduplicateEconomicPeriods(output)
  Object.defineProperty(normalized, 'failures', { value: Object.freeze(failures), enumerable: false })
  return normalized
}
