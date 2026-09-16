import {
  createCanonicalObservation,
  createPeriodIdentity,
  DATE_AUTHORITY,
  epochDay,
  inclusiveDays,
  OBSERVATION_BASIS,
  PERIOD_TYPE,
} from './canonicalFinancialObservation.js'
import {
  classifyPeriod,
  deduplicateEconomicPeriods,
  deriveStandaloneQuarters,
} from './periodNormalization.js'
import {
  buildCalendarYear,
  buildLtm,
  createLatestReportedPeriod,
  HISTORICAL_RESULT_STATUS,
} from './historicalPeriodEngine.js'
import {
  adaptWiseSheetsObservations,
  fetchWiseSheetsCanonicalRows,
} from './wiseSheetsCanonicalShadow.js'
import { buildWiseSheetsHistorical } from './wiseSheetsFinancials.js'
import {
  getCompanyFacts,
  getCompanyFilings,
  fetchSecText,
  resolveCompany,
} from '../sec/edgar.js'
import { extractInlineXbrlFacts } from './filingFactExtractor.js'
import {
  adaptSecCanonicalFinancials,
  loadTargetedSecFinancialCompletion,
  resolveLatestReportedFinancialPeriod,
  resolveWiseSheetsWithSecMetric,
} from './secCanonicalFinancials.js'

const SUPPORTED_FORMS = new Set([
  '10-Q', '10-Q/A', '10-K', '10-K/A', '20-F', '20-F/A', '40-F', '40-F/A',
  '6-K', '6-K/A', '8-K', '8-K/A', 'S-1', 'S-1/A', 'F-1', 'F-1/A',
])
const DIRECT_REPORT_FORMS = new Set(['10-Q', '10-Q/A', '10-K', '10-K/A', '20-F', '20-F/A', '40-F', '40-F/A'])
const EXHIBIT_PERIOD_FORMS = new Set(['6-K', '6-K/A', '8-K', '8-K/A'])
const REVENUE_CONCEPTS = Object.freeze([
  'Revenues',
  'SalesRevenueNet',
  'RevenueFromContractWithCustomerExcludingAssessedTax',
  'RevenueFromContractWithCustomerIncludingAssessedTax',
  'RevenueFromContractsWithCustomers',
  'Revenue',
])
const EXTENSION_REVENUE_LABEL = /^(?:total |net )?revenues?$/i
const EXTENSION_EXCLUDE = /segment|product|service|geograph|related part|deferred|remaining performance|pro forma/i
const VALUE_TOLERANCE = 0.001

function finite(value) {
  return value != null && Number.isFinite(Number(value))
}

function paddedCik(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits ? digits.padStart(10, '0') : null
}

function fiscalQuarter(value) {
  const match = String(value ?? '').toUpperCase().match(/Q([1-4])/)
  return match ? Number(match[1]) : null
}

function fiscalYearFromEnd(periodEnd, fiscalYearEnd, fallback = null) {
  const end = String(periodEnd ?? '')
  const fye = String(fiscalYearEnd ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || !/^\d{4}$/.test(fye)) return finite(fallback) ? Number(fallback) : null
  const endYear = Number(end.slice(0, 4))
  const endMonth = Number(end.slice(5, 7))
  const fiscalEndMonth = Number(fye.slice(0, 2))
  return endYear + (endMonth > fiscalEndMonth ? 1 : 0)
}

function fiscalQuarterFromEnd(periodEnd, fiscalYearEnd, fallback = null) {
  const explicit = fiscalQuarter(fallback)
  if (explicit) return explicit
  const endMonth = Number(String(periodEnd ?? '').slice(5, 7))
  const fiscalEndMonth = Number(String(fiscalYearEnd ?? '').slice(0, 2))
  if (!Number.isInteger(endMonth) || !Number.isInteger(fiscalEndMonth)) return null
  const monthsBeforeYearEnd = (fiscalEndMonth - endMonth + 12) % 12
  const quarter = 4 - Math.round(monthsBeforeYearEnd / 3)
  return quarter >= 1 && quarter <= 4 ? quarter : null
}

function valuesAgree(left, right, tolerance = VALUE_TOLERANCE) {
  const scale = Math.max(1, Math.abs(Number(left)), Math.abs(Number(right)))
  return Math.abs(Number(left) - Number(right)) <= scale * tolerance
}

function conceptRank(concept, standard) {
  const index = REVENUE_CONCEPTS.indexOf(concept)
  if (index >= 0) return index
  return standard ? 500 : 100
}

function formRank(form, periodType) {
  const annual = [PERIOD_TYPE.FISCAL_YEAR, PERIOD_TYPE.CALENDAR_YEAR].includes(periodType)
  const order = annual
    ? ['10-K/A', '10-K', '20-F/A', '20-F', '40-F/A', '40-F', 'S-1/A', 'S-1', 'F-1/A', 'F-1', '6-K', '8-K/A', '8-K']
    : ['10-Q/A', '10-Q', '6-K/A', '6-K', '10-K/A', '10-K', '20-F/A', '20-F', '40-F/A', '40-F', 'S-1/A', 'S-1', 'F-1/A', 'F-1', '8-K/A', '8-K']
  const index = order.indexOf(form)
  return index < 0 ? 999 : index
}

function filingUrlByAccession(filings) {
  return new Map((filings?.filings ?? []).map((filing) => [filing.accessionNumber, filing.secUrl ?? filing.filingUrl]))
}

function rawSecRevenueCandidates({ company, facts, filings, retrievedAt }) {
  const output = []
  const cik = paddedCik(company?.cik ?? facts?.cik)
  const filingUrls = filingUrlByAccession(filings)
  const companyFactsUrl = cik ? `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json` : null
  const fiscalYearEnd = filings?.company?.fiscalYearEnd ?? company?.fiscalYearEnd ?? null
  for (const [namespace, concepts] of Object.entries(facts?.facts ?? {})) {
    for (const [concept, definition] of Object.entries(concepts ?? {})) {
      const label = definition?.label ?? concept
      const standard = namespace === 'us-gaap' || namespace === 'ifrs-full'
      const supportedConcept = REVENUE_CONCEPTS.includes(concept)
      const supportedExtension = !standard && EXTENSION_REVENUE_LABEL.test(label) && !EXTENSION_EXCLUDE.test(`${concept} ${label}`)
      if (!supportedConcept && !supportedExtension) continue
      for (const [unit, records] of Object.entries(definition?.units ?? {})) {
        if (!/^[A-Z]{3}$/.test(unit)) continue
        for (const item of records ?? []) {
          const form = String(item.form ?? '').toUpperCase()
          if (!SUPPORTED_FORMS.has(form) || !item.start || !item.end || !finite(item.val) || item.segment) continue
          const durationDays = inclusiveDays(item.start, item.end)
          if (durationDays == null || durationDays < 45 || durationDays > 400) continue
          const periodType = classifyPeriod({
            periodStart: item.start,
            periodEnd: item.end,
            dateAuthority: DATE_AUTHORITY.REPORTED,
          })
          if (periodType === PERIOD_TYPE.UNKNOWN) continue
          const accession = item.accn ?? null
          output.push({
            ticker: String(company?.ticker ?? '').toUpperCase(),
            issuerId: cik ?? String(company?.ticker ?? '').toUpperCase(),
            metric: 'revenue',
            namespace,
            concept,
            label,
            standard,
            rawValue: Number(item.val),
            currency: unit,
            normalizedUnits: unit,
            periodStart: item.start,
            periodEnd: item.end,
            periodType,
            fiscalYear: fiscalYearFromEnd(item.end, fiscalYearEnd, item.fy),
            fiscalQuarter: fiscalQuarter(item.fp),
            fiscalPeriod: item.fp ?? null,
            fiscalCalendarId: `SEC:${cik ?? String(company?.ticker ?? '').toUpperCase()}`,
            form,
            filingDate: item.filed ?? null,
            accession,
            sourceUrl: filingUrls.get(accession) ?? companyFactsUrl,
            sourceId: `SEC:${cik ?? company?.ticker}:${accession ?? 'NO_ACCESSION'}:${namespace}:${concept}:${item.start}:${item.end}`,
            retrievedAt,
          })
        }
      }
    }
  }
  return output
}

function rawSupplementalRevenueCandidates({ company, filings, records, retrievedAt }) {
  const cik = paddedCik(company?.cik)
  const fiscalYearEnd = filings?.company?.fiscalYearEnd ?? company?.fiscalYearEnd ?? null
  return (records ?? []).filter((record) => record.metricCandidates?.includes('revenue') && !record.segment &&
    record.startDate && record.endDate && finite(record.value) && /^[A-Z]{3}$/.test(String(record.currency ?? record.units ?? '')))
    .map((record) => {
      const periodType = classifyPeriod({
        periodStart: record.startDate,
        periodEnd: record.endDate,
        dateAuthority: DATE_AUTHORITY.REPORTED,
      })
      return {
        ticker: String(company?.ticker ?? '').toUpperCase(),
        issuerId: cik ?? String(company?.ticker ?? '').toUpperCase(),
        metric: 'revenue',
        namespace: record.namespace,
        concept: record.concept,
        label: record.label,
        standard: record.standardXbrl === true,
        rawValue: Number(record.value),
        currency: record.currency ?? record.units,
        normalizedUnits: record.currency ?? record.units,
        periodStart: record.startDate,
        periodEnd: record.endDate,
        periodType,
        fiscalYear: fiscalYearFromEnd(record.endDate, fiscalYearEnd, record.fiscalYear),
        fiscalQuarter: fiscalQuarterFromEnd(record.endDate, fiscalYearEnd, record.fiscalPeriod),
        fiscalPeriod: record.fiscalPeriod ?? null,
        fiscalCalendarId: `SEC:${cik ?? String(company?.ticker ?? '').toUpperCase()}`,
        form: String(record.filingForm ?? '').toUpperCase(),
        filingDate: record.filingDate ?? null,
        accession: record.accessionNumber ?? null,
        sourceUrl: record.filingUrl ?? null,
        sourceId: record.provenance?.sourceId ?? record.id,
        retrievedAt: record.provenance?.retrievedAt ?? retrievedAt,
      }
    }).filter((candidate) => candidate.periodType !== PERIOD_TYPE.UNKNOWN)
}

function candidateOrder(left, right) {
  return conceptRank(left.concept, left.standard) - conceptRank(right.concept, right.standard) ||
    formRank(left.form, left.periodType) - formRank(right.form, right.periodType) ||
    String(right.filingDate ?? '').localeCompare(String(left.filingDate ?? '')) ||
    String(right.accession ?? '').localeCompare(String(left.accession ?? ''))
}

function selectRevenuePeriod(group) {
  const byConcept = new Map()
  for (const candidate of group) {
    const key = `${candidate.namespace}:${candidate.concept}`
    const existing = byConcept.get(key)
    if (!existing || String(candidate.filingDate ?? '').localeCompare(String(existing.filingDate ?? '')) > 0) {
      byConcept.set(key, candidate)
    }
  }
  const resolvedConcepts = [...byConcept.values()].sort(candidateOrder)
  const selectedValue = resolvedConcepts[0]
  const identitySource = [...group].sort((left, right) =>
    String(left.filingDate ?? '').localeCompare(String(right.filingDate ?? '')) || candidateOrder(left, right))[0]
  const selectedRank = conceptRank(selectedValue.concept, selectedValue.standard)
  const conflicts = resolvedConcepts.filter((candidate) =>
    conceptRank(candidate.concept, candidate.standard) === selectedRank &&
    !valuesAgree(candidate.rawValue, selectedValue.rawValue))
  return {
    ...selectedValue,
    fiscalYear: identitySource.fiscalYear,
    fiscalQuarter: identitySource.fiscalQuarter,
    fiscalPeriod: identitySource.fiscalPeriod,
    alternatives: group.filter((candidate) => candidate.sourceId !== selectedValue.sourceId),
    restatedOrRecast: group.some((candidate) => candidate.concept === selectedValue.concept &&
      candidate.sourceId !== selectedValue.sourceId && !valuesAgree(candidate.rawValue, selectedValue.rawValue)),
    conflicts,
  }
}

function selectedRevenueCandidates(candidates) {
  const annualCandidates = candidates.filter((candidate) =>
    [PERIOD_TYPE.FISCAL_YEAR, PERIOD_TYPE.CALENDAR_YEAR].includes(candidate.periodType))
  const latestAnnual = [...annualCandidates].sort((left, right) =>
    String(right.periodEnd).localeCompare(String(left.periodEnd)) ||
    String(right.filingDate ?? '').localeCompare(String(left.filingDate ?? '')))[0]
  const preferredCurrency = latestAnnual?.currency ?? [...candidates]
    .sort((left, right) => String(right.periodEnd).localeCompare(String(left.periodEnd)))[0]?.currency
  const comparableCandidates = preferredCurrency
    ? candidates.filter((candidate) => candidate.currency === preferredCurrency)
    : candidates
  const groups = new Map()
  for (const candidate of comparableCandidates) {
    const key = [candidate.periodStart, candidate.periodEnd, candidate.currency].join('|')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(candidate)
  }
  return [...groups.values()].map(selectRevenuePeriod)
}

function canonicalSecObservation(candidate) {
  const base = createCanonicalObservation({
    ticker: candidate.ticker,
    issuerId: candidate.issuerId,
    metric: 'revenue',
    rawValue: candidate.rawValue,
    rawUnits: candidate.currency,
    normalizedValue: candidate.rawValue,
    currency: candidate.currency,
    normalizedUnits: candidate.normalizedUnits,
    periodIdentity: createPeriodIdentity({
      periodType: candidate.periodType,
      periodStart: candidate.periodStart,
      periodEnd: candidate.periodEnd,
      dateAuthority: DATE_AUTHORITY.REPORTED,
      fiscalYear: candidate.fiscalYear,
      fiscalQuarter: candidate.fiscalQuarter,
      fiscalCalendarId: candidate.fiscalCalendarId,
      startEvidence: 'SEC_XBRL_CONTEXT_START',
      endEvidence: 'SEC_XBRL_CONTEXT_END',
    }),
    sourceProvider: 'SEC',
    sourceId: candidate.sourceId,
    filingDate: candidate.filingDate,
    accession: candidate.accession,
    sourceUrl: candidate.sourceUrl,
    scope: 'CONSOLIDATED',
    confidence: candidate.conflicts.length ? 'LOW' : 'HIGH',
    reportedVsDerived: OBSERVATION_BASIS.REPORTED,
    definitionFingerprint: 'SEC_CONSOLIDATED_GAAP_REVENUE',
    retrievedAt: candidate.retrievedAt,
    restatedOrRecast: candidate.restatedOrRecast,
    warnings: candidate.conflicts.length ? ['COMPETING_CONSOLIDATED_REVENUE_CONCEPTS'] : [],
  })
  if (!candidate.conflicts.length) return { ...base, form: candidate.form, concept: candidate.concept,
    periodEvidenceSource: candidate.sourceUrl, alternatives: candidate.alternatives }
  return {
    ...base,
    form: candidate.form,
    concept: candidate.concept,
    periodEvidenceSource: candidate.sourceUrl,
    alternatives: candidate.alternatives,
    deduplicationStatus: 'REQUIRES_REVIEW',
    conflicts: [{
      type: 'VALUE_CONFLICT',
      sourceIds: [candidate.sourceId, ...candidate.conflicts.map((item) => item.sourceId)],
      values: [candidate.rawValue, ...candidate.conflicts.map((item) => item.rawValue)],
    }],
  }
}

export function adaptSecCanonicalRevenue({ company, facts, filings = null, supplementalFacts = [], retrievedAt = null, asOfDate = '9999-12-31' }) {
  const result = adaptSecCanonicalFinancials({
    company, facts, filings, supplementalFacts, retrievedAt, asOfDate, metrics: ['revenue'],
  })
  return {
    observations: result.observations,
    candidates: result.candidates.filter((item) => item.metric === 'revenue'),
    failures: result.failures,
  }
}

function secPeriodLineage(observation) {
  return {
    sourceProvider: observation.sourceProvider,
    sourceId: observation.sourceId,
    sourceUrl: observation.sourceUrl,
    accession: observation.accession,
    filingDate: observation.filingDate,
    form: observation.form ?? null,
    concept: observation.concept ?? null,
    periodIdentity: observation.periodIdentity,
    normalizedValue: observation.normalizedValue,
  }
}

function sameRevenueQuarter(wise, sec) {
  const wiseCik = paddedCik(wise.issuerId)
  const secCik = paddedCik(sec.issuerId)
  const sameIssuer = wise.ticker === sec.ticker && (!wiseCik || !secCik || wiseCik === secCik)
  if (!sameIssuer || wise.metric !== 'revenue' || sec.metric !== 'revenue') return false
  const a = wise.periodIdentity
  const b = sec.periodIdentity
  if (b.periodType !== PERIOD_TYPE.STANDALONE_QUARTER) return false
  const endDistance = Math.abs((epochDay(a.periodEnd) ?? -10_000) - (epochDay(b.periodEnd) ?? 10_000))
  if (endDistance > 7) return false
  if (a.fiscalYear != null && b.fiscalYear != null && a.fiscalYear !== b.fiscalYear) return false
  if (a.fiscalQuarter != null && b.fiscalQuarter != null && a.fiscalQuarter !== b.fiscalQuarter) return false
  return wise.scope === sec.scope && wise.currency === sec.currency && wise.normalizedUnits === sec.normalizedUnits
}

function enrichWiseWithSecPeriod(wise, sec) {
  const reconciles = valuesAgree(wise.normalizedValue, sec.normalizedValue)
  const periodEvidence = secPeriodLineage(sec)
  const enriched = {
    ...wise,
    issuerId: sec.issuerId,
    periodIdentity: sec.periodIdentity,
    definitionFingerprint: 'SEC_CONSOLIDATED_GAAP_REVENUE',
    derivation: {
      method: 'WISESHEETS_VALUE_WITH_SEC_PERIOD_EVIDENCE',
      valueSource: secPeriodLineage(wise),
      periodEvidence,
      reconciliation: {
        wiseSheetsValue: wise.normalizedValue,
        secValue: sec.normalizedValue,
        difference: wise.normalizedValue - sec.normalizedValue,
        tolerance: VALUE_TOLERANCE,
        matches: reconciles,
      },
    },
    periodEvidenceSource: sec.sourceUrl,
    warnings: [...(wise.warnings ?? []), reconciles ? 'SEC_PERIOD_EVIDENCE_ATTACHED' : 'WISESHEETS_SEC_REVENUE_MISMATCH'],
  }
  if (reconciles) return enriched
  return {
    ...enriched,
    deduplicationStatus: 'REQUIRES_REVIEW',
    conflicts: [{
      type: 'VALUE_CONFLICT',
      sourceIds: [wise.sourceId, sec.sourceId],
      values: [wise.normalizedValue, sec.normalizedValue],
    }],
  }
}

export function resolveWiseSheetsWithSecRevenue(wiseObservations = [], secObservations = []) {
  const result = resolveWiseSheetsWithSecMetric(wiseObservations, secObservations, 'revenue')
  return { ...result, secCompletion: result.secValueFilled }
}

export function resolveLatestReportedRevenuePeriod(observations = [], filings = null, asOfDate = '9999-12-31') {
  return resolveLatestReportedFinancialPeriod('revenue', observations, filings, asOfDate)
}

function normalizedFiling(filing) {
  return {
    ...filing,
    filingUrl: filing.filingUrl ?? filing.secUrl,
    immutableSourceId: filing.immutableSourceId ?? `SEC:${paddedCik(filing.cik)}:${filing.accessionNumber}`,
  }
}

export async function loadTargetedSecRevenueCompletion({ company, facts, filings, retrievedAt, asOfDate = '9999-12-31', fetchText = fetchSecText, hydrateExhibits }) {
  return loadTargetedSecFinancialCompletion({
    company, facts, filings, retrievedAt, asOfDate, fetchText, hydrateExhibits, metrics: ['revenue'],
  })
}

export function buildSecEnrichedRevenueShadow({ ticker, wiseSheetsRows, company, facts, filings, supplementalFacts = [], years, asOfDate, retrievedAt }) {
  const wiseAdapted = adaptWiseSheetsObservations(wiseSheetsRows, { providerFrequency: 'QUARTERLY', retrievedAt })
  const wiseRevenue = wiseAdapted.observations.filter((item) => item.metric === 'revenue')
  const sec = adaptSecCanonicalRevenue({ company, facts, filings, supplementalFacts, retrievedAt, asOfDate })
  const latestReportedPeriod = resolveLatestReportedRevenuePeriod(sec.observations, filings, asOfDate)
  const resolved = resolveWiseSheetsWithSecRevenue(wiseRevenue, sec.observations)
  const calendarActuals = Object.fromEntries(years.map((year) => [year, buildCalendarYear(resolved.records, year)]))
  const ltm = buildLtm(resolved.records, { asOfDate, latestReportedPeriod })
  return {
    ticker: String(ticker).toUpperCase(),
    records: resolved.records,
    calendarActuals,
    ltm,
    latestReportedPeriod,
    secCompletion: resolved.secCompletion,
    failures: [...wiseAdapted.failures, ...resolved.failures],
  }
}

function valueOf(entry) {
  return finite(entry?.value) ? Number(entry.value) : null
}

function latestCanonicalQuarter(result) {
  return result?.latestIngestedPeriod ?? (result?.components ?? [])
    .map((component) => component.periodEnd ?? component.sourceEnd)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null
}

function componentUsesSec(component) {
  return component.sourceProvider === 'SEC' || component.sourceProvider === 'DERIVED' ||
    component.derivation?.periodEvidence?.sourceProvider === 'SEC' ||
    component.derivation?.inputs?.some?.((input) => String(input).startsWith('SEC:'))
}

function resultSources(result) {
  const components = result?.components ?? []
  const valueProviders = [...new Set(components.map((component) => component.sourceProvider).filter(Boolean))]
  const evidence = components.map((component) => component.derivation?.periodEvidence?.sourceUrl ??
    (componentUsesSec(component) ? component.sourceUrl : null)).filter(Boolean)
  return {
    valueSource: valueProviders.join(' + ') || null,
    periodEvidenceSource: [...new Set(evidence)].join(' ; ') || null,
    secUsed: components.some(componentUsesSec),
  }
}

export function compareRevenueShadow(ticker, legacy, canonical, years) {
  return [...years.map((year) => `${year}A`), 'LTM'].map((period) => {
    const year = period === 'LTM' ? null : Number(period.slice(0, 4))
    const legacyResult = period === 'LTM' ? legacy?.ltm?.revenue : legacy?.calendarActuals?.revenue?.[year]
    const canonicalResult = period === 'LTM' ? canonical.ltm : canonical.calendarActuals[year]
    const legacyValue = valueOf(legacyResult)
    const canonicalValue = valueOf(canonicalResult)
    const difference = legacyValue == null || canonicalValue == null ? null : canonicalValue - legacyValue
    const percentageDifference = difference == null || legacyValue === 0 ? null : difference / Math.abs(legacyValue)
    const materiallyDifferent = canonicalValue != null && (legacyValue == null || Math.abs(percentageDifference ?? difference) > VALUE_TOLERANCE)
    const stale = canonicalResult?.status === HISTORICAL_RESULT_STATUS.STALE_SOURCE_COVERAGE
    const sources = resultSources(canonicalResult)
    return {
      ticker: String(ticker).toUpperCase(),
      period,
      legacyValue,
      canonicalValue,
      classification: canonicalResult?.classification ?? null,
      status: canonicalResult?.status ?? null,
      ...sources,
      latestReportedPeriod: canonical.latestReportedPeriod?.valid ? canonical.latestReportedPeriod.periodEnd : null,
      latestCanonicalQuarter: latestCanonicalQuarter(canonicalResult),
      difference,
      percentageDifference,
      reason: canonicalResult?.reason ?? (materiallyDifferent ? 'VALUE_DIFFERENCE' : null),
      matching: canonicalValue != null && !materiallyDifferent,
      materiallyDifferent,
      unavailable: canonicalValue == null && !stale,
      stale,
      secCompleted: canonicalValue != null && sources.secUsed,
    }
  })
}

export async function runSecRevenueShadowComparison(tickers, years, options = {}) {
  const normalizedTickers = [...new Set(tickers.map((ticker) => String(ticker).trim().toUpperCase()).filter(Boolean))]
  const retrievedAt = options.retrievedAt ?? new Date().toISOString()
  const wiseSheetsRows = options.wiseSheetsRows ?? await fetchWiseSheetsCanonicalRows(normalizedTickers, options)
  const comparisons = []
  const companies = {}
  for (const ticker of normalizedTickers) {
    const company = options.companies?.[ticker] ?? await resolveCompany(ticker, options)
    if (!company) {
      const unavailable = [...years.map((year) => `${year}A`), 'LTM'].map((period) => ({
        ticker, period, legacyValue: null, canonicalValue: null, classification: null,
        status: HISTORICAL_RESULT_STATUS.MISSING_SOURCE_DATA, valueSource: null, periodEvidenceSource: null,
        latestReportedPeriod: null, latestCanonicalQuarter: null, difference: null,
        percentageDifference: null, reason: 'SEC_ISSUER_NOT_RESOLVED', matching: false,
        materiallyDifferent: false, unavailable: true, stale: false, secCompleted: false,
      }))
      comparisons.push(...unavailable)
      companies[ticker] = { company: null, comparisons: unavailable }
      continue
    }
    const facts = options.companyFacts?.[ticker] ?? await getCompanyFacts(company.cik, options)
    const filings = options.companyFilings?.[ticker] ?? await getCompanyFilings(company.cik, options)
    const tickerRows = wiseSheetsRows.filter((row) => String(row.ticker).toUpperCase() === ticker)
    const legacy = buildWiseSheetsHistorical(ticker, tickerRows, years)
    const targeted = options.supplementalFacts?.[ticker]
      ? { records: options.supplementalFacts[ticker], failures: [] }
      : await loadTargetedSecRevenueCompletion({
        company, facts, filings, retrievedAt,
        asOfDate: options.asOfDate ?? '9999-12-31',
        fetchText: options.fetchSecText,
        hydrateExhibits: options.hydrateExhibits,
      })
    const canonical = buildSecEnrichedRevenueShadow({
      ticker, wiseSheetsRows: tickerRows, company, facts, filings, years,
      supplementalFacts: targeted.records,
      asOfDate: options.asOfDate ?? '9999-12-31', retrievedAt,
    })
    canonical.failures.push(...targeted.failures)
    const tickerComparisons = compareRevenueShadow(ticker, legacy, canonical, years)
    comparisons.push(...tickerComparisons)
    companies[ticker] = { company, legacy, canonical, comparisons: tickerComparisons }
  }
  return {
    comparisons,
    companies,
    summary: {
      matching: comparisons.filter((item) => item.matching).length,
      different: comparisons.filter((item) => item.materiallyDifferent).length,
      unavailable: comparisons.filter((item) => item.unavailable).length,
      stale: comparisons.filter((item) => item.stale).length,
      secCompleted: comparisons.filter((item) => item.secCompleted).length,
    },
  }
}

function reportValue(value) {
  if (!finite(value)) return '—'
  const absolute = Math.abs(Number(value))
  const scale = absolute >= 1e9 ? [1e9, 'B'] : absolute >= 1e6 ? [1e6, 'M'] : [1, '']
  return `${(Number(value) / scale[0]).toFixed(scale[0] === 1 ? 2 : 3)}${scale[1]}`
}

function reportText(value) {
  return String(value ?? '—').replaceAll('|', '\\|').replaceAll('\n', ' ')
}

export function renderSecRevenueShadowReport(result, options = {}) {
  const lines = [
    '# Valuation Revenue Shadow: WiseSheets + SEC Period Authority',
    '',
    `Generated: ${options.generatedAt ?? new Date().toISOString()}`,
    '',
    'Production values were not changed. SEC supplies reported period boundaries, latest-period evidence, direct annual observations, and missing revenue quarters; WiseSheets remains the selected value when it reconciles to the same SEC economic period.',
    '',
    '## Summary',
    '',
    '| Outcome | Cells |',
    '| --- | ---: |',
    `| MATCHING | ${result.summary.matching} |`,
    `| DIFFERENT | ${result.summary.different} |`,
    `| UNAVAILABLE | ${result.summary.unavailable} |`,
    `| STALE | ${result.summary.stale} |`,
    `| SEC_COMPLETED | ${result.summary.secCompleted} |`,
    '',
    '## Revenue Comparison',
    '',
    '| Ticker | Period | Legacy value | Canonical value | Classification | Status | Value source | Period evidence source | Latest reported period | Latest canonical quarter | Difference | Reason |',
    '| --- | --- | ---: | ---: | --- | --- | --- | --- | --- | --- | ---: | --- |',
  ]
  for (const item of result.comparisons) {
    lines.push(`| ${reportText(item.ticker)} | ${reportText(item.period)} | ${reportValue(item.legacyValue)} | ${reportValue(item.canonicalValue)} | ${reportText(item.classification)} | ${reportText(item.status)} | ${reportText(item.valueSource)} | ${reportText(item.periodEvidenceSource)} | ${reportText(item.latestReportedPeriod)} | ${reportText(item.latestCanonicalQuarter)} | ${reportValue(item.difference)} | ${reportText(item.reason ?? (item.matching ? 'MATCH' : null))} |`)
  }
  return `${lines.join('\n')}\n`
}
