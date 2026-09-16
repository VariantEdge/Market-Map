import {
  DATE_AUTHORITY,
  dateFromEpochDay,
  epochDay,
  hasAuthoritativeBoundaries,
  inclusiveDays,
  PERIOD_TYPE,
} from './canonicalFinancialObservation.js'
import { deduplicateEconomicPeriods } from './periodNormalization.js'

export const CY_CLASSIFICATION = Object.freeze({
  REPORTED_CALENDAR_YEAR: 'REPORTED_CALENDAR_YEAR',
  EXACT_DERIVED_CALENDAR_YEAR: 'EXACT_DERIVED_CALENDAR_YEAR',
  EXACT_FROM_CALENDAR_QUARTERS: 'EXACT_FROM_CALENDAR_QUARTERS',
  CALENDARIZED_ESTIMATE: 'CALENDARIZED_ESTIMATE',
})

export const HISTORICAL_RESULT_STATUS = Object.freeze({
  VERIFIED_REPORTED: 'VERIFIED_REPORTED',
  VERIFIED_DERIVED: 'VERIFIED_DERIVED',
  NOT_REPORTED: 'NOT_REPORTED',
  MISSING_SOURCE_DATA: 'MISSING_SOURCE_DATA',
  INSUFFICIENT_PERIOD_COVERAGE: 'INSUFFICIENT_PERIOD_COVERAGE',
  STALE_SOURCE_COVERAGE: 'STALE_SOURCE_COVERAGE',
  DEFINITION_INCOMPATIBLE: 'DEFINITION_INCOMPATIBLE',
  REQUIRES_REVIEW: 'REQUIRES_REVIEW',
  OPERATION_SCOPE_INCOMPATIBLE: 'OPERATION_SCOPE_INCOMPATIBLE',
  OUT_OF_SCOPE: 'OUT_OF_SCOPE',
  LEGITIMATE_NA: 'LEGITIMATE_NA',
})

function unavailable(status, reason, details = {}) {
  return { value: null, classification: null, status, reason, components: [], ...details }
}

function sameSeries(observations) {
  if (!observations.length) return true
  const first = observations[0]
  return observations.every((item) => item.issuerId === first.issuerId && item.metric === first.metric &&
    item.scope === first.scope && item.operationScope === first.operationScope &&
    item.currency === first.currency && item.normalizedUnits === first.normalizedUnits)
}

function compatibleDefinitions(observations) {
  const definitions = new Set(observations.map((item) =>
    item.semanticDefinitionFingerprint ?? item.definitionFingerprint).filter(Boolean))
  return definitions.size <= 1
}

function calendarRange(year) {
  return { start: `${year}-01-01`, end: `${year}-12-31` }
}

function nearBoundary(actual, expected, tolerance = 7) {
  const left = epochDay(actual)
  const right = epochDay(expected)
  return left != null && right != null && Math.abs(left - right) <= tolerance
}

function directCalendarYearCandidate(observation, year) {
  const period = observation.periodIdentity
  if (!hasAuthoritativeBoundaries(period) || period.dateAuthority !== DATE_AUTHORITY.REPORTED ||
      observation.reportedVsDerived !== 'REPORTED') return false
  const calendar = calendarRange(year)
  if (period.periodType === PERIOD_TYPE.CALENDAR_YEAR) {
    return period.periodStart === calendar.start && period.periodEnd === calendar.end
  }
  if (period.periodType !== PERIOD_TYPE.FISCAL_YEAR || period.durationDays < 350 || period.durationDays > 378) return false
  return nearBoundary(period.periodStart, calendar.start) && nearBoundary(period.periodEnd, calendar.end)
}

function coverageAnalysis(observations, year) {
  const calendar = calendarRange(year)
  const calendarStart = epochDay(calendar.start)
  const calendarEnd = epochDay(calendar.end)
  const intervals = observations.flatMap((observation) => {
    const period = observation.periodIdentity
    if (!hasAuthoritativeBoundaries(period)) return []
    const sourceStart = epochDay(period.periodStart)
    const sourceEnd = epochDay(period.periodEnd)
    const overlapStart = Math.max(sourceStart, calendarStart)
    const overlapEnd = Math.min(sourceEnd, calendarEnd)
    return overlapStart <= overlapEnd ? [{ observation, sourceStart, sourceEnd, overlapStart, overlapEnd }] : []
  }).sort((left, right) => left.overlapStart - right.overlapStart || left.overlapEnd - right.overlapEnd)

  const gaps = []
  const overlaps = []
  let cursor = calendarStart
  for (const interval of intervals) {
    if (interval.overlapStart > cursor) gaps.push({ start: dateFromEpochDay(cursor), end: dateFromEpochDay(interval.overlapStart - 1) })
    if (interval.overlapStart < cursor) overlaps.push({ start: dateFromEpochDay(interval.overlapStart), end: dateFromEpochDay(Math.min(interval.overlapEnd, cursor - 1)) })
    cursor = Math.max(cursor, interval.overlapEnd + 1)
  }
  if (cursor <= calendarEnd) gaps.push({ start: dateFromEpochDay(cursor), end: calendar.end })
  const totalDays = calendarEnd - calendarStart + 1
  const coveredDays = intervals.reduce((total, interval) => total + interval.overlapEnd - interval.overlapStart + 1, 0)
  return { intervals, gaps, overlaps, totalDays, coveredDays, complete: gaps.length === 0 && overlaps.length === 0 && coveredDays === totalDays }
}

function sourceComponent(interval, allocation) {
  const observation = interval.observation
  const period = observation.periodIdentity
  const totalDays = inclusiveDays(period.periodStart, period.periodEnd)
  const overlapDays = interval.overlapStart == null || interval.overlapEnd == null
    ? totalDays
    : interval.overlapEnd - interval.overlapStart + 1
  const allocationPercentage = allocation ? overlapDays / totalDays : 1
  return {
    sourceProvider: observation.sourceProvider,
    sourceId: observation.sourceId,
    sourceUrl: observation.sourceUrl,
    accession: observation.accession,
    filingDate: observation.filingDate,
    rawValue: observation.rawValue,
    rawUnits: observation.rawUnits,
    normalizedValue: observation.normalizedValue,
    currency: observation.currency,
    scope: observation.scope,
    operationScope: observation.operationScope,
    economicPeriodKey: observation.economicPeriodKey,
    sourceValue: observation.normalizedValue,
    sourceStart: period.periodStart,
    sourceEnd: period.periodEnd,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    overlapStart: interval.overlapStart == null ? period.periodStart : dateFromEpochDay(interval.overlapStart),
    overlapEnd: interval.overlapEnd == null ? period.periodEnd : dateFromEpochDay(interval.overlapEnd),
    overlapDays,
    totalDays,
    allocationPercentage,
    contribution: observation.normalizedValue * allocationPercentage,
    dateAuthority: period.dateAuthority,
    definitionFingerprint: observation.definitionFingerprint,
    semanticDefinitionFingerprint: observation.semanticDefinitionFingerprint,
    sourceDefinitionFingerprint: observation.sourceDefinitionFingerprint,
    reportedVsDerived: observation.reportedVsDerived,
    derivation: observation.derivation,
  }
}

function observationOverlapsYear(observation, year) {
  const period = observation.periodIdentity
  const calendar = calendarRange(year)
  return period.periodStart && period.periodEnd && period.periodStart <= calendar.end && period.periodEnd >= calendar.start
}

function exactDerivedCalendarYearCandidate(observation, year) {
  const period = observation.periodIdentity
  if (!hasAuthoritativeBoundaries(period) || observation.reportedVsDerived !== 'DERIVED' ||
      observation.deduplicationStatus === 'REQUIRES_REVIEW') return false
  const inputs = observation.derivation?.inputs
  if (!Array.isArray(inputs) || inputs.length < 2) return false
  if (observation.derivation?.exactness !== 'EXACT_ARITHMETIC' ||
      !['REVENUE_MINUS_COST_OF_REVENUE', 'CFO_MINUS_CAPEX'].includes(observation.derivation?.method)) return false
  const calendar = calendarRange(year)
  const exactAnnualPeriod = (period.periodType === PERIOD_TYPE.CALENDAR_YEAR &&
      period.periodStart === calendar.start && period.periodEnd === calendar.end) ||
    (period.periodType === PERIOD_TYPE.FISCAL_YEAR && period.durationDays >= 350 && period.durationDays <= 378 &&
      nearBoundary(period.periodStart, calendar.start) && nearBoundary(period.periodEnd, calendar.end))
  if (!exactAnnualPeriod) return false
  return inputs.every((input) => input.issuerId === observation.issuerId && input.scope === observation.scope &&
    input.operationScope === observation.operationScope && input.currency === observation.currency &&
    input.normalizedUnits === observation.normalizedUnits && input.reportedVsDerived !== 'CALENDARIZED_ESTIMATE' &&
    input.classification !== CY_CLASSIFICATION.CALENDARIZED_ESTIMATE && input.derivation?.exactness !== 'ESTIMATED' &&
    input.derivation?.method !== 'CALENDARIZED_ESTIMATE' &&
    input.periodIdentity?.periodStart === period.periodStart && input.periodIdentity?.periodEnd === period.periodEnd &&
    [DATE_AUTHORITY.REPORTED, DATE_AUTHORITY.DERIVED_FROM_REPORTED_BOUNDARIES]
      .includes(input.periodIdentity?.dateAuthority) && input.deduplicationStatus !== 'REQUIRES_REVIEW')
}

export function buildCalendarYear(observations = [], year) {
  const normalizedYear = Number(year)
  const deduped = deduplicateEconomicPeriods(observations)
  if (!deduped.length) return unavailable(HISTORICAL_RESULT_STATUS.MISSING_SOURCE_DATA, 'NO_OBSERVATIONS')

  const direct = deduped.filter((item) => directCalendarYearCandidate(item, normalizedYear))
  if (direct.length > 1) return unavailable(HISTORICAL_RESULT_STATUS.REQUIRES_REVIEW, 'DUPLICATE_REPORTED_CALENDAR_YEAR')
  if (direct.length === 1) {
    const item = direct[0]
    if (item.scope !== 'CONSOLIDATED') return unavailable(HISTORICAL_RESULT_STATUS.REQUIRES_REVIEW, 'NON_CONSOLIDATED_SCOPE')
    if (item.deduplicationStatus === 'REQUIRES_REVIEW') {
      return unavailable(HISTORICAL_RESULT_STATUS.REQUIRES_REVIEW, item.conflicts?.[0]?.type ?? 'DEDUPLICATION_CONFLICT')
    }
    return {
      value: item.normalizedValue,
      classification: CY_CLASSIFICATION.REPORTED_CALENDAR_YEAR,
      status: HISTORICAL_RESULT_STATUS.VERIFIED_REPORTED,
      reason: null,
      components: [sourceComponent({ observation: item, overlapStart: null, overlapEnd: null }, false)],
      coverage: { complete: true, gaps: [], overlaps: [], totalDays: inclusiveDays(`${normalizedYear}-01-01`, `${normalizedYear}-12-31`) },
    }
  }


  const exactDerived = deduped.filter((item) => exactDerivedCalendarYearCandidate(item, normalizedYear))
  if (exactDerived.length > 1) return unavailable(HISTORICAL_RESULT_STATUS.REQUIRES_REVIEW, 'DUPLICATE_EXACT_DERIVED_CALENDAR_YEAR')
  if (exactDerived.length === 1) {
    const item = exactDerived[0]
    if (item.scope !== 'CONSOLIDATED') return unavailable(HISTORICAL_RESULT_STATUS.REQUIRES_REVIEW, 'NON_CONSOLIDATED_SCOPE')
    return {
      value: item.normalizedValue,
      classification: CY_CLASSIFICATION.EXACT_DERIVED_CALENDAR_YEAR,
      status: HISTORICAL_RESULT_STATUS.VERIFIED_DERIVED,
      reason: null,
      components: [sourceComponent({ observation: item, overlapStart: null, overlapEnd: null }, false)],
      coverage: { complete: true, gaps: [], overlaps: [], totalDays: inclusiveDays(`${normalizedYear}-01-01`, `${normalizedYear}-12-31`) },
    }
  }

  const quarters = deduped.filter((item) => item.periodIdentity.periodType === PERIOD_TYPE.STANDALONE_QUARTER &&
    hasAuthoritativeBoundaries(item.periodIdentity))
  const contributingConflict = quarters.find((item) => item.deduplicationStatus === 'REQUIRES_REVIEW' &&
    observationOverlapsYear(item, normalizedYear))
  if (contributingConflict) {
    return unavailable(HISTORICAL_RESULT_STATUS.REQUIRES_REVIEW,
      contributingConflict.conflicts?.[0]?.type ?? 'DEDUPLICATION_CONFLICT')
  }
  const coverage = coverageAnalysis(quarters, normalizedYear)
  if (coverage.overlaps.length) return unavailable(HISTORICAL_RESULT_STATUS.REQUIRES_REVIEW, 'OVERLAPPING_PERIOD_COVERAGE', { coverage })
  if (!coverage.complete) return unavailable(HISTORICAL_RESULT_STATUS.INSUFFICIENT_PERIOD_COVERAGE, 'INSUFFICIENT_PERIOD_COVERAGE', { coverage })
  const contributors = coverage.intervals.map((item) => item.observation)
  if (!sameSeries(contributors)) return unavailable(HISTORICAL_RESULT_STATUS.REQUIRES_REVIEW, 'INCOMPATIBLE_SERIES', { coverage })
  if (contributors.some((item) => item.scope !== 'CONSOLIDATED')) {
    return unavailable(HISTORICAL_RESULT_STATUS.REQUIRES_REVIEW, 'NON_CONSOLIDATED_SCOPE', { coverage })
  }
  if (contributors.some((item) => item.deduplicationStatus === 'REQUIRES_REVIEW')) {
    return unavailable(HISTORICAL_RESULT_STATUS.REQUIRES_REVIEW,
      contributors.flatMap((item) => item.conflicts ?? [])[0]?.type ?? 'DEDUPLICATION_CONFLICT', { coverage })
  }
  if (!compatibleDefinitions(contributors)) {
    return unavailable(HISTORICAL_RESULT_STATUS.DEFINITION_INCOMPATIBLE, 'DEFINITION_INCOMPATIBLE', { coverage })
  }
  const economicKeys = coverage.intervals.map((item) => item.observation.economicPeriodKey)
  if (new Set(economicKeys).size !== economicKeys.length) {
    return unavailable(HISTORICAL_RESULT_STATUS.REQUIRES_REVIEW, 'DUPLICATE_ECONOMIC_PERIOD_CONTRIBUTION', { coverage })
  }

  const calendar = calendarRange(normalizedYear)
  const exact = coverage.intervals.length === 4 && coverage.intervals.every((interval) =>
    interval.sourceStart >= epochDay(calendar.start) && interval.sourceEnd <= epochDay(calendar.end))
  const components = coverage.intervals.map((interval) => sourceComponent(interval, !exact))
  return {
    value: components.reduce((total, component) => total + component.contribution, 0),
    classification: exact ? CY_CLASSIFICATION.EXACT_FROM_CALENDAR_QUARTERS : CY_CLASSIFICATION.CALENDARIZED_ESTIMATE,
    status: HISTORICAL_RESULT_STATUS.VERIFIED_DERIVED,
    reason: null,
    components,
    coverage,
  }
}

function consecutive(left, right) {
  const a = left.periodIdentity
  const b = right.periodIdentity
  if (hasAuthoritativeBoundaries(a) && hasAuthoritativeBoundaries(b)) {
    return epochDay(b.periodStart) === epochDay(a.periodEnd) + 1
  }
  const compatibleFiscalCalendars = !a.fiscalCalendarId || !b.fiscalCalendarId ||
    a.fiscalCalendarId === b.fiscalCalendarId
  if (compatibleFiscalCalendars &&
      a.fiscalYear != null && b.fiscalYear != null && a.fiscalQuarter != null && b.fiscalQuarter != null) {
    return b.fiscalYear * 4 + b.fiscalQuarter === a.fiscalYear * 4 + a.fiscalQuarter + 1
  }
  return a.sequenceIndex != null && b.sequenceIndex === a.sequenceIndex + 1
}

function shiftedQuarterEnd(value, quarters) {
  const normalized = epochDay(value)
  if (normalized == null) return null
  const [year, month, day] = value.split('-').map(Number)
  const sourceLastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const target = new Date(Date.UTC(year, month - 1 - quarters * 3, 1))
  const targetLastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(day === sourceLastDay ? targetLastDay : Math.min(day, targetLastDay))
  return dateFromEpochDay(Math.floor(target.getTime() / 86_400_000))
}

function missingLtmPeriods(observations, latestReportedPeriod) {
  const latest = latestReportedPeriod?.valid ? latestReportedPeriod.periodEnd :
    observations.map((item) => item.periodIdentity.periodEnd).filter(Boolean).sort().at(-1)
  if (!latest) return ['LATEST_QUARTER', 'PRECEDING_QUARTER_1', 'PRECEDING_QUARTER_2', 'PRECEDING_QUARTER_3']
  const expected = [0, 1, 2, 3].map((offset) => shiftedQuarterEnd(latest, offset)).filter(Boolean)
  return expected.filter((target) => !observations.some((item) => {
    const actual = epochDay(item.periodIdentity.periodEnd)
    return actual != null && Math.abs(actual - epochDay(target)) <= 10
  }))
}

export function createLatestReportedPeriod(input = {}) {
  const periodEnd = input.periodEnd && epochDay(input.periodEnd) != null ? input.periodEnd : null
  const form = String(input.form ?? '').toUpperCase()
  const evidenceType = input.evidenceType ?? null
  const validFormPeriod = ['10-Q', '10-Q/A', '10-K', '10-K/A', '20-F', '20-F/A', '40-F', '40-F/A'].includes(form) &&
    evidenceType === 'FORM_REPORT_PERIOD'
  const validExhibitPeriod = ['6-K', '6-K/A', '8-K', '8-K/A', '20-F', '20-F/A', '40-F', '40-F/A']
    .includes(form) && evidenceType === 'EARNINGS_EXHIBIT_PERIOD' && input.explicitPeriodMapping === true
  return Object.freeze({
    periodEnd,
    form: form || null,
    evidenceType,
    explicitPeriodMapping: input.explicitPeriodMapping === true,
    sourceId: input.sourceId ?? null,
    valid: Boolean(periodEnd && (validFormPeriod || validExhibitPeriod)),
  })
}

export function buildLtm(observations = [], { asOfDate = '9999-12-31', latestReportedPeriod = null } = {}) {
  const deduped = deduplicateEconomicPeriods(observations)
    .filter((item) => item.periodIdentity.periodType === PERIOD_TYPE.STANDALONE_QUARTER &&
      item.periodIdentity.periodEnd && item.periodIdentity.periodEnd <= asOfDate)
    .sort((left, right) => left.periodIdentity.periodEnd.localeCompare(right.periodIdentity.periodEnd))
  if (!deduped.length) return unavailable(HISTORICAL_RESULT_STATUS.MISSING_SOURCE_DATA,
    'FOUR_CONSECUTIVE_QUARTERS_UNAVAILABLE', { missingPeriods: missingLtmPeriods(deduped, latestReportedPeriod) })
  const grouped = new Map()
  for (const item of deduped) {
    const key = item.economicPeriodKey
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(item)
  }
  const orderedGroups = [...grouped.values()]
    .sort((left, right) => left[0].periodIdentity.periodEnd.localeCompare(right[0].periodIdentity.periodEnd))
  const latestAvailable = orderedGroups.slice(-4).map((group) => group[0])
  if (latestReportedPeriod?.valid && latestAvailable.length === 4 && sameSeries(latestAvailable) &&
      compatibleDefinitions(latestAvailable) &&
      latestAvailable.slice(1).every((item, index) => consecutive(latestAvailable[index], item)) &&
      latestAvailable.at(-1).periodIdentity.periodEnd < latestReportedPeriod.periodEnd) {
    return unavailable(HISTORICAL_RESULT_STATUS.STALE_SOURCE_COVERAGE, 'LATEST_REPORTED_PERIOD_NOT_INGESTED', {
      latestIngestedPeriod: latestAvailable.at(-1).periodIdentity.periodEnd,
      latestReportedPeriod,
      missingPeriods: missingLtmPeriods(latestAvailable, latestReportedPeriod),
    })
  }
  const expectedEnds = latestReportedPeriod?.valid
    ? [3, 2, 1, 0].map((offset) => shiftedQuarterEnd(latestReportedPeriod.periodEnd, offset))
    : null
  const selectedGroups = expectedEnds
    ? expectedEnds.map((target) => orderedGroups.find((group) =>
      Math.abs(epochDay(group[0].periodIdentity.periodEnd) - epochDay(target)) <= 10)).filter(Boolean)
    : orderedGroups.slice(-4)
  const selected = selectedGroups.map((group) => group[0])
  if (selected.length !== 4) return unavailable(HISTORICAL_RESULT_STATUS.INSUFFICIENT_PERIOD_COVERAGE,
    'FOUR_CONSECUTIVE_QUARTERS_UNAVAILABLE', { missingPeriods: missingLtmPeriods(selected, latestReportedPeriod) })
  if (!sameSeries(selected)) return unavailable(HISTORICAL_RESULT_STATUS.REQUIRES_REVIEW, 'INCOMPATIBLE_SERIES')
  if (selected.some((item) => item.scope !== 'CONSOLIDATED')) {
    return unavailable(HISTORICAL_RESULT_STATUS.REQUIRES_REVIEW, 'NON_CONSOLIDATED_SCOPE')
  }
  if (selectedGroups.some((group) => group.some((item) => item.deduplicationStatus === 'REQUIRES_REVIEW'))) {
    return unavailable(HISTORICAL_RESULT_STATUS.REQUIRES_REVIEW,
      selectedGroups.flat().flatMap((item) => item.conflicts ?? [])[0]?.type ?? 'DEDUPLICATION_CONFLICT')
  }
  if (!compatibleDefinitions(selected)) return unavailable(HISTORICAL_RESULT_STATUS.DEFINITION_INCOMPATIBLE, 'DEFINITION_INCOMPATIBLE')
  if (!selected.slice(1).every((item, index) => consecutive(selected[index], item))) {
    return unavailable(HISTORICAL_RESULT_STATUS.INSUFFICIENT_PERIOD_COVERAGE, 'LTM_PERIOD_GAP',
      { missingPeriods: missingLtmPeriods(selected, latestReportedPeriod) })
  }
  if (latestReportedPeriod?.valid && selected.at(-1).periodIdentity.periodEnd < latestReportedPeriod.periodEnd) {
    return unavailable(HISTORICAL_RESULT_STATUS.STALE_SOURCE_COVERAGE, 'LATEST_REPORTED_PERIOD_NOT_INGESTED', {
      latestIngestedPeriod: selected.at(-1).periodIdentity.periodEnd,
      latestReportedPeriod,
    })
  }
  return {
    value: selected.reduce((total, item) => total + item.normalizedValue, 0),
    classification: 'LTM',
    status: HISTORICAL_RESULT_STATUS.VERIFIED_DERIVED,
    reason: null,
    components: selected.map((item) => sourceComponent({
      observation: item,
      sourceStart: epochDay(item.periodIdentity.periodStart),
      sourceEnd: epochDay(item.periodIdentity.periodEnd),
      overlapStart: epochDay(item.periodIdentity.periodStart),
      overlapEnd: epochDay(item.periodIdentity.periodEnd),
    }, false)),
    latestIngestedPeriod: selected.at(-1).periodIdentity.periodEnd,
    latestReportedPeriod: latestReportedPeriod?.valid ? latestReportedPeriod : null,
  }
}
