const DAY_MS = 24 * 60 * 60 * 1000

function localDate(value) {
  if (!value) return null
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function dateKey(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

function daysInclusive(start, end) {
  return Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1
}

function dayAfter(date) {
  const next = new Date(date)
  next.setDate(next.getDate() + 1)
  return next
}

function calendarYearRange(year) {
  return {
    start: new Date(year, 0, 1, 12),
    end: new Date(year, 11, 31, 12),
  }
}

export function normalizeCumulativeQuarterlyFacts(facts = []) {
  const sorted = [...facts]
    .filter((fact) => Number.isFinite(Number(fact.value)) && localDate(fact.start) && localDate(fact.end))
    .sort((left, right) => String(left.end).localeCompare(String(right.end)) || String(left.start).localeCompare(String(right.start)))
  const directByEnd = new Map()
  const cumulative = []

  for (const fact of sorted) {
    const start = localDate(fact.start)
    const end = localDate(fact.end)
    const duration = daysInclusive(start, end)
    const normalized = {
      ...fact,
      start: dateKey(start),
      end: dateKey(end),
      duration,
      value: Number(fact.value),
    }
    if (duration <= 130) {
      directByEnd.set(normalized.end, { ...normalized, method: 'reported-quarter' })
    } else {
      cumulative.push(normalized)
    }
  }

  const normalizedByEnd = new Map(directByEnd)
  const sameFiscalCohort = (left, right) => {
    const startDifference = Math.abs(localDate(left.start).getTime() - localDate(right.start).getTime()) / DAY_MS
    return startDifference <= 7 &&
      (left.unit ?? null) === (right.unit ?? null)
  }
  const predecessors = [...directByEnd.values(), ...cumulative]
  for (const period of cumulative.sort((left, right) => String(left.end).localeCompare(String(right.end)))) {
    const prior = predecessors
      .filter((candidate) => candidate.end < period.end && sameFiscalCohort(candidate, period))
      .sort((left, right) => String(right.end).localeCompare(String(left.end)))[0]
    if (!prior) continue
    const derivedStart = dayAfter(localDate(prior.end))
    const derivedEnd = localDate(period.end)
    const derivedDuration = daysInclusive(derivedStart, derivedEnd)
    // A fiscal year can move by several days in a 52/53-week calendar. Accept
    // that filed boundary drift only when subtraction produces one quarter.
    if (derivedDuration < 45 || derivedDuration > 130) continue
    const derived = {
      ...period,
      start: dateKey(derivedStart),
      duration: derivedDuration,
      value: period.value - prior.value,
      method: 'normalized-cumulative-ytd',
      cumulativeInputs: [prior, period],
      conceptBridge: prior.tag !== period.tag ? { from: prior.tag ?? null, to: period.tag ?? null } : null,
    }
    if (!normalizedByEnd.has(derived.end)) normalizedByEnd.set(derived.end, derived)
  }

  return [...normalizedByEnd.values()].sort((left, right) => String(left.end).localeCompare(String(right.end)))
}

export function calendarizePeriods(periods = [], years = []) {
  const output = Object.fromEntries(years.map((year) => [year, { value: 0, components: [], derived: false }]))

  for (const period of periods) {
    if (!Number.isFinite(Number(period.value))) continue
    const start = localDate(period.start)
    const end = localDate(period.end)
    if (!start || !end || start > end) continue
    const totalDays = daysInclusive(start, end)

    for (const year of years) {
      const calendar = calendarYearRange(year)
      const overlapStart = start > calendar.start ? start : calendar.start
      const overlapEnd = end < calendar.end ? end : calendar.end
      if (overlapStart > overlapEnd) continue
      const overlapDays = daysInclusive(overlapStart, overlapEnd)
      const contribution = Number(period.value) * (overlapDays / totalDays)
      output[year].value += contribution
      output[year].components.push({
        sourceStart: period.start,
        sourceEnd: period.end,
        sourceValue: Number(period.value),
        sourceUrl: period.sourceUrl ?? null,
        tag: period.tag ?? null,
        filed: period.filed ?? null,
        accn: period.accn ?? null,
        overlapDays,
        totalDays,
        contribution,
        sourceType: period.sourceType ?? 'SEC filed actual',
      })
      if (overlapDays !== totalDays || period.derived) output[year].derived = true
    }
  }

  return Object.fromEntries(Object.entries(output).map(([year, entry]) => [year, {
    ...entry,
    value: entry.components.length ? entry.value : null,
  }]))
}

// Standard public-comps convention for historical calendarized actuals: use
// the four reported fiscal quarters whose end dates fall in the calendar year.
// This intentionally does not invent monthly revenue by prorating a quarter
// that straddles December 31.
export function calendarizeReportedQuartersByEndDate(periods = [], years = []) {
  const output = Object.fromEntries(years.map((year) => [year, { value: 0, components: [], derived: false }]))

  for (const period of periods) {
    if (!Number.isFinite(Number(period.value))) continue
    const end = localDate(period.end)
    const start = localDate(period.start)
    if (!start || !end || start > end || !output[end.getFullYear()]) continue
    const year = end.getFullYear()
    output[year].value += Number(period.value)
    output[year].components.push({
      sourceStart: period.start,
      sourceEnd: period.end,
      sourceValue: Number(period.value),
      sourceUrl: period.sourceUrl ?? null,
      tag: period.tag ?? null,
      filed: period.filed ?? null,
      accn: period.accn ?? null,
      contribution: Number(period.value),
      sourceType: period.sourceType ?? 'SEC filed actual',
    })
    if (period.derived) output[year].derived = true
  }

  return Object.fromEntries(Object.entries(output).map(([year, entry]) => [year, {
    ...entry,
    value: entry.components.length === 4 ? entry.value : null,
    method: entry.components.length === 4
      ? 'four-reported-standalone-quarters-ended-in-calendar-year'
      : 'incomplete-quarter-coverage-for-calendarized-actual',
  }]))
}

export function calculateLtm(periods = []) {
  const latest = [...periods]
    .filter((period) => Number.isFinite(Number(period.value ?? period.normalizedValue)))
    .sort((left, right) => String(right.end ?? right.quarterEnd).localeCompare(String(left.end ?? left.quarterEnd)))
    .slice(0, 4)

  const ordered = latest.reverse()
  const contiguous = ordered.length === 4 && ordered.every((period, index) => {
    if (['FAILED', 'MISMATCH', 'REQUIRES_REVIEW'].includes(period.validationStatus)) return false
    if (!index) return true
    const priorEnd = localDate(ordered[index - 1].end ?? ordered[index - 1].quarterEnd)
    const currentStart = localDate(period.start ?? period.quarterStart)
    return Boolean(priorEnd && currentStart && dateKey(dayAfter(priorEnd)) === dateKey(currentStart))
  })
  if (!contiguous) {
    return {
      value: null,
      components: [],
      sourceType: 'Unavailable',
      validationStatus: 'MISSING_BUT_AVAILABLE',
      method: 'missing-or-noncontiguous-quarter-coverage-for-ltm',
    }
  }
  return {
    value: ordered.reduce((sum, period) => sum + Number(period.value ?? period.normalizedValue), 0),
    components: ordered,
    sourceType: ordered.every((period) => period.source?.sourceType === 'SEC filed actual' || period.sourceType === 'SEC filed actual')
      ? 'SEC filed actual'
      : 'Derived standardized metric',
    validationStatus: 'VERIFIED_DERIVED',
    method: 'latest-four-contiguous-sec-reconciled-quarters',
  }
}

export function enforceLtmFreshness(entry, expectedQuarterEnd) {
  if (!entry || entry.value == null || !expectedQuarterEnd) return entry
  const latestComponentEnd = (entry.components ?? [])
    .map((component) => component.end ?? component.quarterEnd ?? component.sourceEnd)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null
  if (latestComponentEnd && latestComponentEnd >= expectedQuarterEnd) return entry
  if (entry.staleFailure?.value == null && entry.staleFailure?.validationStatus) {
    return {
      ...entry.staleFailure,
      warnings: [
        ...(entry.staleFailure.warnings ?? []),
        `Latest valid LTM ends ${latestComponentEnd ?? 'unknown'}; newer source periods fail validation through ${expectedQuarterEnd}.`,
      ],
    }
  }
  return {
    ...entry,
    value: null,
    validationStatus: 'REQUIRES_REVIEW',
    method: 'stale-ltm-missing-latest-reported-quarter',
    warnings: [
      ...(entry.warnings ?? []),
      `LTM ends ${latestComponentEnd ?? 'unknown'} but the latest reported quarter ends ${expectedQuarterEnd}.`,
    ],
  }
}

export function historicalSeasonality(periods = []) {
  const recent = [...periods]
    .filter((period) => Number.isFinite(Number(period.value)) && Number(period.value) > 0)
    .sort((left, right) => String(right.end).localeCompare(String(left.end)))
    .slice(0, 4)
    .reverse()
  const total = recent.reduce((sum, period) => sum + Number(period.value), 0)
  if (!recent.length || total <= 0) return [0.25, 0.25, 0.25, 0.25]
  const weights = recent.map((period) => Number(period.value) / total)
  return weights.length === 4 ? weights : [0.25, 0.25, 0.25, 0.25]
}

export function calendarizeAnnualEstimate(estimate, years, weights = [0.25, 0.25, 0.25, 0.25]) {
  if (!estimate || !Number.isFinite(Number(estimate.value)) || !localDate(estimate.endDate)) return {}
  const end = localDate(estimate.endDate)
  const start = new Date(end)
  start.setFullYear(start.getFullYear() - 1)
  start.setDate(start.getDate() + 1)
  const normalizedWeights = weights.length === 4 ? weights : [0.25, 0.25, 0.25, 0.25]
  const quarterEnds = [
    new Date(start.getFullYear(), start.getMonth() + 3, start.getDate() - 1),
    new Date(start.getFullYear(), start.getMonth() + 6, start.getDate() - 1),
    new Date(start.getFullYear(), start.getMonth() + 9, start.getDate() - 1),
    end,
  ]
  let quarterStart = start
  const quarters = quarterEnds.map((quarterEnd, index) => {
    const quarter = {
      start: dateKey(quarterStart),
      end: dateKey(quarterEnd),
      value: Number(estimate.value) * normalizedWeights[index],
      derived: true,
      sourceType: estimate.sourceType ?? 'Derived Estimate',
      sourceUrl: estimate.sourceUrl ?? null,
    }
    quarterStart = dayAfter(quarterEnd)
    return quarter
  })
  const calendarized = calendarizePeriods(quarters, years)
  return Object.fromEntries(Object.entries(calendarized).map(([year, entry]) => [year, {
    ...entry,
    sourceType: estimate.sourceType ?? 'Derived Estimate',
    method: 'annual-consensus-allocated-by-historical-quarterly-seasonality',
    quarterlyWeights: normalizedWeights,
    originalFiscalPeriod: { start: dateKey(start), end: dateKey(end), value: Number(estimate.value) },
    sourceUrl: estimate.sourceUrl ?? null,
    confidence: 'Low',
  }]))
}

function overlapDays(leftStart, leftEnd, rightStart, rightEnd) {
  const start = leftStart > rightStart ? leftStart : rightStart
  const end = leftEnd < rightEnd ? leftEnd : rightEnd
  return start > end ? 0 : daysInclusive(start, end)
}

// Replaces forecast quarters with filed standalone quarters before allocating
// the consensus remainder. This prevents reported YTD values from being added
// on top of a full-year consensus estimate.
export function calendarizeAnnualEstimateWithReportedQuarters(estimate, years, weights = [0.25, 0.25, 0.25, 0.25], reportedQuarters = [], asOf = new Date()) {
  if (!estimate || !Number.isFinite(Number(estimate.value)) || !localDate(estimate.endDate)) return {}
  const end = localDate(estimate.endDate)
  const start = new Date(end)
  start.setFullYear(start.getFullYear() - 1)
  start.setDate(start.getDate() + 1)
  const normalizedWeights = weights.length === 4 ? weights : [0.25, 0.25, 0.25, 0.25]
  const quarterEnds = [
    new Date(start.getFullYear(), start.getMonth() + 3, start.getDate() - 1),
    new Date(start.getFullYear(), start.getMonth() + 6, start.getDate() - 1),
    new Date(start.getFullYear(), start.getMonth() + 9, start.getDate() - 1),
    end,
  ]
  const asOfDate = localDate(asOf) ?? new Date()
  let quarterStart = start
  const planned = quarterEnds.map((quarterEnd, index) => {
    const entry = { start: new Date(quarterStart), end: new Date(quarterEnd), weight: normalizedWeights[index] }
    quarterStart = dayAfter(quarterEnd)
    return entry
  })
  const filed = reportedQuarters
    .filter((period) => Number.isFinite(Number(period.value)) && localDate(period.start) && localDate(period.end) && localDate(period.end) <= asOfDate)
    .map((period) => ({ ...period, startDate: localDate(period.start), endDate: localDate(period.end) }))
  const usedReportedEnds = new Set()
  const assigned = planned.map((quarter) => {
    const duration = daysInclusive(quarter.start, quarter.end)
    const candidate = filed
      .filter((period) => !usedReportedEnds.has(period.end) && overlapDays(quarter.start, quarter.end, period.startDate, period.endDate) / duration >= 0.8)
      .sort((left, right) => overlapDays(quarter.start, quarter.end, right.startDate, right.endDate) - overlapDays(quarter.start, quarter.end, left.startDate, left.endDate))[0]
    if (candidate) usedReportedEnds.add(candidate.end)
    return { ...quarter, actual: candidate ?? null }
  })
  const actualTotal = assigned.reduce((sum, quarter) => sum + (quarter.actual ? Number(quarter.actual.value) : 0), 0)
  const forecasted = assigned.filter((quarter) => !quarter.actual)
  const remainingValue = Number(estimate.value) - actualTotal
  const remainingWeight = forecasted.reduce((sum, quarter) => sum + quarter.weight, 0)
  const quarters = assigned.map((quarter) => {
    if (quarter.actual) return { ...quarter.actual, sourceType: quarter.actual.sourceType ?? 'SEC filed actual' }
    return {
      start: dateKey(quarter.start),
      end: dateKey(quarter.end),
      value: remainingWeight > 0 ? remainingValue * (quarter.weight / remainingWeight) : null,
      derived: true,
      sourceType: estimate.sourceType ?? 'Street Consensus',
      sourceUrl: estimate.sourceUrl ?? null,
    }
  })
  const calendarized = calendarizePeriods(quarters, years)
  const staleConsensus = remainingValue < 0
  return Object.fromEntries(Object.entries(calendarized).map(([year, entry]) => [year, {
    ...entry,
    sourceType: estimate.sourceType ?? 'Street Consensus',
    method: 'reported-standalone-quarters-plus-consensus-remainder',
    quarterlyWeights: normalizedWeights,
    originalFiscalPeriod: { start: dateKey(start), end: dateKey(end), value: Number(estimate.value) },
    sourceUrl: estimate.sourceUrl ?? null,
    confidence: staleConsensus ? 'Low' : 'Medium',
    alternativeSources: estimate.alternativeSources ?? [],
    warnings: [...(estimate.warnings ?? []), ...(staleConsensus ? ['Reported quarters exceed the annual consensus estimate.'] : [])],
  }]))
}

// Builds a rolling NTM value from the same fiscal-quarter forecast components
// used for calendar-year estimates. It intentionally does not linearly blend
// annual totals, which can misstate an NTM period for seasonal businesses.
export function calculateNtmFromAnnualConsensus(estimates = [], weights = [0.25, 0.25, 0.25, 0.25], reportedQuarters = [], asOf = new Date()) {
  const asOfDate = localDate(asOf) ?? new Date()
  const start = dayAfter(asOfDate)
  const end = new Date(start)
  end.setFullYear(end.getFullYear() + 1)
  end.setDate(end.getDate() - 1)
  const years = [start.getFullYear(), end.getFullYear(), end.getFullYear() + 1]
  const componentsByPeriod = new Map()
  const warnings = []
  const alternativeSources = []

  for (const estimate of estimates) {
    const calendarized = calendarizeAnnualEstimateWithReportedQuarters(estimate, years, weights, reportedQuarters, asOfDate)
    for (const entry of Object.values(calendarized)) {
      for (const component of entry.components ?? []) {
        const key = `${component.sourceStart}:${component.sourceEnd}`
        if (!componentsByPeriod.has(key)) componentsByPeriod.set(key, component)
      }
      warnings.push(...(entry.warnings ?? []))
      alternativeSources.push(...(entry.alternativeSources ?? []))
    }
  }

  let coveredDays = 0
  let value = 0
  const components = []
  for (const component of componentsByPeriod.values()) {
    const sourceStart = localDate(component.sourceStart)
    const sourceEnd = localDate(component.sourceEnd)
    if (!sourceStart || !sourceEnd || !Number.isFinite(Number(component.sourceValue))) continue
    const overlap = overlapDays(start, end, sourceStart, sourceEnd)
    if (!overlap) continue
    const totalDays = daysInclusive(sourceStart, sourceEnd)
    const contribution = Number(component.sourceValue) * (overlap / totalDays)
    coveredDays += overlap
    value += contribution
    components.push({ ...component, overlapDays: overlap, totalDays, contribution })
  }
  if (coveredDays < 360) return { value: null, components: [], sourceType: 'Derived Estimate', confidence: 'Low', method: 'insufficient-consensus-coverage-for-next-twelve-months' }
  return {
    value,
    components,
    sourceType: 'Derived Estimate',
    confidence: coveredDays === 365 ? 'Medium' : 'Low',
    method: 'next-twelve-month-fiscal-consensus-with-reported-quarter-replacement',
    originalFiscalPeriod: { start: dateKey(start), end: dateKey(end) },
    alternativeSources,
    warnings: [...new Set(warnings)],
  }
}

export function enterpriseValue({ price, dilutedShares, debt, cash, preferredStock = 0, minorityInterest = 0, adjustments = 0 }) {
  const equityValue = price != null && dilutedShares != null && Number.isFinite(Number(price)) && Number.isFinite(Number(dilutedShares))
    ? Number(price) * Number(dilutedShares)
    : null
  const value = equityValue == null || debt == null || cash == null || !Number.isFinite(Number(debt)) || !Number.isFinite(Number(cash))
    ? null
    : equityValue + Number(debt) + Number(preferredStock || 0) + Number(minorityInterest || 0) - Number(cash) + Number(adjustments || 0)
  return { equityValue, enterpriseValue: value }
}

export function valuationMultiple(numerator, denominator) {
  if (numerator == null || denominator == null || !Number.isFinite(Number(numerator)) || !Number.isFinite(Number(denominator)) || Number(denominator) <= 0) return null
  return Number(numerator) / Number(denominator)
}
