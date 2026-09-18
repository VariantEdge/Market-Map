import {
  createCanonicalObservation,
  createPeriodIdentity,
  DATE_AUTHORITY,
  epochDay,
  hasAuthoritativeBoundaries,
  inclusiveDays,
  OBSERVATION_BASIS,
  OPERATION_SCOPE,
  PERIOD_TYPE,
  SEMANTIC_DEFINITION,
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
  canonicalEconomicPeriodsCompatible,
  deriveCanonicalFreeCashFlow,
  fetchWiseSheetsCanonicalRows,
} from './wiseSheetsCanonicalShadow.js'
import { buildWiseSheetsHistorical } from './wiseSheetsFinancials.js'
import {
  getCompanyFacts,
  getCompanyFilings,
  fetchSecText,
  resolveCompany,
} from '../sec/edgar.js'
import { hydrateFilingExhibits } from './filingIndex.js'
import {
  extractInlineXbrlFacts,
  extractStructuredFinancialTableFacts,
  extractXbrlInstanceFacts,
} from './filingFactExtractor.js'

const VALUE_TOLERANCE = 0.001
const MAX_TARGETED_FILINGS_PER_PERIOD = 6

const SUPPORTED_FORMS = new Set([
  '10-Q', '10-Q/A', '10-K', '10-K/A', '20-F', '20-F/A', '40-F', '40-F/A',
  '6-K', '6-K/A', '8-K', '8-K/A', 'S-1', 'S-1/A', 'F-1', 'F-1/A',
])
const DIRECT_REPORT_FORMS = new Set([
  '10-Q', '10-Q/A', '10-K', '10-K/A', '20-F', '20-F/A', '40-F', '40-F/A',
])
const EXHIBIT_PERIOD_FORMS = new Set(['6-K', '6-K/A', '8-K', '8-K/A'])
const ANNUAL_REPORT_FORMS = new Set([
  '10-K', '10-K/A', '20-F', '20-F/A', '40-F', '40-F/A', 'S-1', 'S-1/A', 'F-1', 'F-1/A',
])

export const SEC_CANONICAL_METRICS = Object.freeze([
  'revenue',
  'grossProfit',
  'ebit',
  'operatingCashFlow',
  'capitalExpenditures',
  'freeCashFlow',
])

export const SEC_GAAP_METRIC_DEFINITIONS = Object.freeze({
  revenue: Object.freeze({
    providerMetric: 'revenue',
    concepts: Object.freeze([
      'Revenues',
      'SalesRevenueNet',
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'RevenueFromContractWithCustomerIncludingAssessedTax',
      'RevenueFromContractsWithCustomers',
      'Revenue',
    ]),
    extensionLabel: /^(?:total |net )?revenues?$/i,
    exclude: /segment|product|service|geograph|related part|deferred|remaining performance|pro forma/i,
    definitionFingerprint: 'SEC_CONSOLIDATED_GAAP_REVENUE',
  }),
  grossProfit: Object.freeze({
    providerMetric: 'gross_profit',
    concepts: Object.freeze(['GrossProfit']),
    extensionLabel: /^(?:total )?gross profit(?: \(loss\))?$/i,
    exclude: /segment|product|service|margin|percentage/i,
    definitionFingerprint: 'SEC_CONSOLIDATED_GAAP_GROSS_PROFIT',
  }),
  ebit: Object.freeze({
    providerMetric: null,
    concepts: Object.freeze(['OperatingIncomeLoss', 'ProfitLossFromOperatingActivities']),
    extensionLabel: /^(?:(?:total )?operating (?:income|profit|loss)(?: \(loss\))?|(?:income|profit|loss) from operations)$/i,
    exclude: /segment|adjusted|margin|percentage|non-gaap/i,
    definitionFingerprint: 'CANONICAL_CONSOLIDATED_GAAP_OPERATING_INCOME',
  }),
  costOfRevenue: Object.freeze({
    providerMetric: null,
    concepts: Object.freeze([
      'CostOfRevenue',
      'CostOfGoodsAndServicesSold',
      'CostOfGoodsSold',
      'CostOfSales',
    ]),
    extensionLabel: /^(?:total )?cost of (?:revenue|revenues|sales|goods and services sold)(?:\s*(?:\(\d+\)|[*†‡]))?$/i,
    exclude: /segment|product|service|percentage/i,
    definitionFingerprint: 'SEC_CONSOLIDATED_GAAP_COST_OF_REVENUE',
  }),
  operatingCashFlow: Object.freeze({
    providerMetric: 'net_cash_from_operating_activities',
    concepts: Object.freeze([
      'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
      'NetCashProvidedByUsedInOperatingActivities',
      'CashFlowsFromUsedInOperatingActivities',
    ]),
    extensionLabel: /^net cash (?:provided by|used in|provided by\s*\/\s*\(used in\)|provided by \(used in\)) operating activities(?:(?:,? | from )continuing operations)?$/i,
    exclude: /discontinued/i,
    definitionFingerprint: 'SEC_CONSOLIDATED_GAAP_OPERATING_CASH_FLOW',
  }),
  capitalExpenditures: Object.freeze({
    providerMetric: 'total_capex',
    concepts: Object.freeze([
      'PaymentsToAcquirePropertyPlantAndEquipment',
      'PaymentsToAcquireProductiveAssets',
      'PurchaseOfPropertyPlantAndEquipment',
      'PaymentsForAdditionsToPropertyPlantAndEquipment',
      'PaymentsToAcquireOtherPropertyPlantAndEquipment',
      'PaymentsToAcquireOtherProductiveAssets',
      'PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities',
    ]),
    extensionLabel: /^(?:payments|purchases|capital expenditures).*(?:property|plant|equipment|computer hardware)|^purchases of (?:property and equipment|computer hardware)$/i,
    exclude: /business|combination|subsidiar|affiliate|investment|security|financ|lease|proceeds|unpaid|incurred but not/i,
    definitionFingerprint: 'SEC_CONSOLIDATED_GAAP_CAPITAL_EXPENDITURES',
    normalize: (value) => Math.abs(Number(value)),
  }),
})

function finite(value) {
  return value != null && Number.isFinite(Number(value))
}

function normalizedAsOf(value) {
  const input = String(value ?? '9999-12-31').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : '9999-12-31'
}

function availableByAsOf(filingDate, periodEnd, asOfDate) {
  const asOf = normalizedAsOf(asOfDate)
  if (periodEnd && String(periodEnd).slice(0, 10) > asOf) return false
  if (asOf === '9999-12-31') return true
  return Boolean(filingDate && String(filingDate).slice(0, 10) <= asOf)
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

function definitionFor(metric) {
  const definition = SEC_GAAP_METRIC_DEFINITIONS[metric]
  if (!definition) throw new TypeError(`Unsupported SEC canonical metric: ${metric}`)
  return definition
}

function conceptSupported(namespace, concept, label, definition) {
  if (definition.concepts.includes(concept)) return true
  if (definition.exclude.test(`${concept} ${label}`)) return false
  const standard = namespace === 'us-gaap' || namespace === 'ifrs-full'
  return !standard && definition.extensionLabel.test(label) && !definition.exclude.test(`${concept} ${label}`)
}

function explicitOperationScope(concept, label, context = '') {
  const text = `${String(concept ?? '').replace(/([a-z])([A-Z])/g, '$1 $2')} ${label ?? ''} ${context ?? ''}`
  if (/continuing operations/i.test(text)) return OPERATION_SCOPE.CONTINUING_OPERATIONS
  if (/including (?:disposal group and )?discontinued operations|including discontinued|total.*discontinued/i.test(text)) {
    return OPERATION_SCOPE.TOTAL_INCLUDING_DISCONTINUED
  }
  return OPERATION_SCOPE.UNSPECIFIED
}

function operationEvidenceKeys(facts) {
  const continuing = new Set()
  const discontinued = new Set()
  for (const concepts of Object.values(facts?.facts ?? {})) {
    for (const [concept, definition] of Object.entries(concepts ?? {})) {
      const label = definition?.label ?? concept
      const text = `${String(concept).replace(/([a-z])([A-Z])/g, '$1 $2')} ${label}`
      const operatingActivities = /operating activities/i.test(text)
      const target = operatingActivities && /continuing operations/i.test(text) ? continuing
        : operatingActivities && /discontinued operations/i.test(text) ? discontinued : null
      if (!target) continue
      for (const records of Object.values(definition?.units ?? {})) {
        for (const item of records ?? []) {
          if (item.start && item.end) target.add(`${item.accn ?? ''}|${item.start}|${item.end}`)
        }
      }
    }
  }
  return { continuing, discontinued }
}

function resolvedOperationScope({ metric, concept, label, context, evidenceKey, operationEvidence }) {
  const explicit = explicitOperationScope(concept, label, context)
  if (explicit !== OPERATION_SCOPE.UNSPECIFIED) return explicit
  const splitOperations = operationEvidence?.continuing?.has(evidenceKey) && operationEvidence?.discontinued?.has(evidenceKey)
  if (!splitOperations) return OPERATION_SCOPE.UNSPECIFIED
  return metric === 'operatingCashFlow'
    ? OPERATION_SCOPE.TOTAL_INCLUDING_DISCONTINUED
    : OPERATION_SCOPE.UNSPECIFIED
}

function conceptRank(candidate, definition) {
  const index = definition.concepts.indexOf(candidate.concept)
  if (index >= 0) return index
  return candidate.standard ? 500 : 100
}

function formRank(form, periodType) {
  const annual = [PERIOD_TYPE.FISCAL_YEAR, PERIOD_TYPE.CALENDAR_YEAR].includes(periodType)
  const order = annual
    ? ['10-K/A', '10-K', '20-F/A', '20-F', '40-F/A', '40-F', 'S-1/A', 'S-1', 'F-1/A', 'F-1', '6-K/A', '6-K', '8-K/A', '8-K']
    : ['10-Q/A', '10-Q', '6-K/A', '6-K', '10-K/A', '10-K', '20-F/A', '20-F', '40-F/A', '40-F', 'S-1/A', 'S-1', 'F-1/A', 'F-1', '8-K/A', '8-K']
  const index = order.indexOf(form)
  return index < 0 ? 999 : index
}

function formSupportsPeriodType(form, periodType) {
  if (![PERIOD_TYPE.FISCAL_YEAR, PERIOD_TYPE.CALENDAR_YEAR].includes(periodType)) return true
  return ANNUAL_REPORT_FORMS.has(form) || EXHIBIT_PERIOD_FORMS.has(form)
}

function filingUrlByAccession(filings) {
  return new Map((filings?.filings ?? []).map((filing) => [filing.accessionNumber, filing.secUrl ?? filing.filingUrl]))
}

function rawCompanyFactCandidates({ company, facts, filings, metrics, retrievedAt, asOfDate }) {
  const output = []
  const cik = paddedCik(company?.cik ?? facts?.cik)
  const filingUrls = filingUrlByAccession(filings)
  const companyFactsUrl = cik ? `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json` : null
  const fiscalYearEnd = filings?.company?.fiscalYearEnd ?? company?.fiscalYearEnd ?? null
  const operationEvidence = operationEvidenceKeys(facts)
  for (const [namespace, concepts] of Object.entries(facts?.facts ?? {})) {
    for (const [concept, sourceDefinition] of Object.entries(concepts ?? {})) {
      const label = sourceDefinition?.label ?? concept
      const standard = namespace === 'us-gaap' || namespace === 'ifrs-full'
      const matchedMetrics = metrics.filter((metric) => conceptSupported(namespace, concept, label, definitionFor(metric)))
      if (!matchedMetrics.length) continue
      for (const [unit, records] of Object.entries(sourceDefinition?.units ?? {})) {
        if (!/^[A-Z]{3}$/.test(unit)) continue
        for (const item of records ?? []) {
          const form = String(item.form ?? '').toUpperCase()
          if (!SUPPORTED_FORMS.has(form) || !item.start || !item.end || !finite(item.val) || item.segment) continue
          if (!availableByAsOf(item.filed, item.end, asOfDate)) continue
          const durationDays = inclusiveDays(item.start, item.end)
          if (durationDays == null || durationDays < 45 || durationDays > 400) continue
          const periodType = classifyPeriod({
            periodStart: item.start,
            periodEnd: item.end,
            dateAuthority: DATE_AUTHORITY.REPORTED,
          })
          if (periodType === PERIOD_TYPE.UNKNOWN || !formSupportsPeriodType(form, periodType)) continue
          const accession = item.accn ?? null
          const evidenceKey = `${accession ?? ''}|${item.start}|${item.end}`
          for (const metric of matchedMetrics) {
            output.push({
              ticker: String(company?.ticker ?? '').toUpperCase(),
              issuerId: cik ?? String(company?.ticker ?? '').toUpperCase(),
              metric,
              namespace,
              concept,
              label,
              standard,
              rawValue: Number(item.val),
              normalizedValue: definitionFor(metric).normalize?.(item.val) ?? Number(item.val),
              currency: unit,
              normalizedUnits: unit,
              operationScope: resolvedOperationScope({
                metric, concept, label, evidenceKey, operationEvidence,
              }),
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
  }
  return output
}

function rawSupplementalCandidates({ company, filings, records, metrics, retrievedAt, asOfDate }) {
  const cik = paddedCik(company?.cik)
  const fiscalYearEnd = filings?.company?.fiscalYearEnd ?? company?.fiscalYearEnd ?? null
  const output = []
  const operationEvidence = { continuing: new Set(), discontinued: new Set() }
  for (const record of records ?? []) {
    const text = `${record.concept ?? ''} ${record.label ?? ''} ${record.tableContext?.statementScopeEvidence ?? ''}`
    const key = `${record.accessionNumber ?? ''}|${record.startDate ?? ''}|${record.endDate ?? ''}`
    if (/continuing operations/i.test(text)) operationEvidence.continuing.add(key)
    if (/discontinued operations/i.test(text)) operationEvidence.discontinued.add(key)
  }
  for (const record of records ?? []) {
    const form = String(record.filingForm ?? '').toUpperCase()
    const explicitEndOnly = record.explicitPeriodMapping === true && record.endDate && record.periodType
    if (!SUPPORTED_FORMS.has(form) || record.segment || (!record.startDate && !explicitEndOnly) ||
        !record.endDate || !finite(record.value)) continue
    if (!availableByAsOf(record.filingDate, record.endDate, asOfDate)) continue
    const currency = String(record.currency ?? record.units ?? '')
    if (!/^[A-Z]{3}$/.test(currency)) continue
    const periodStart = record.dateAuthority === DATE_AUTHORITY.INFERRED && explicitEndOnly ? null : record.startDate
    const dateAuthority = periodStart ? (record.dateAuthority ?? DATE_AUTHORITY.REPORTED) : DATE_AUTHORITY.UNKNOWN
    const periodType = classifyPeriod({
      periodType: record.periodType,
      periodStart,
      periodEnd: record.endDate,
      dateAuthority,
    })
    if (periodType === PERIOD_TYPE.UNKNOWN || !formSupportsPeriodType(form, periodType)) continue
    for (const metric of metrics) {
      const definition = definitionFor(metric)
      if (!record.metricCandidates?.includes(metric) ||
          !conceptSupported(record.namespace, record.concept, record.label ?? record.concept, definition)) continue
      const evidenceKey = `${record.accessionNumber ?? ''}|${record.startDate}|${record.endDate}`
      output.push({
        ticker: String(company?.ticker ?? '').toUpperCase(),
        issuerId: cik ?? String(company?.ticker ?? '').toUpperCase(),
        metric,
        namespace: record.namespace,
        concept: record.concept,
        label: record.label,
        standard: record.standardXbrl === true,
        rawValue: Number(record.value),
        normalizedValue: definition.normalize?.(record.value) ?? Number(record.value),
        currency,
        normalizedUnits: currency,
        operationScope: resolvedOperationScope({
          metric,
          concept: record.concept,
          label: record.label,
          context: record.tableContext?.statementScopeEvidence,
          evidenceKey,
          operationEvidence,
        }),
        periodStart,
        periodEnd: record.endDate,
        periodType,
        dateAuthority,
        explicitPeriodMapping: record.explicitPeriodMapping === true ||
          ['SEC_INLINE_XBRL', 'SEC_XBRL_INSTANCE'].includes(record.rawSourceType),
        fiscalYear: fiscalYearFromEnd(record.endDate, fiscalYearEnd, record.fiscalYear),
        fiscalQuarter: fiscalQuarterFromEnd(record.endDate, fiscalYearEnd, record.fiscalPeriod),
        fiscalPeriod: record.fiscalPeriod ?? null,
        fiscalCalendarId: `SEC:${cik ?? String(company?.ticker ?? '').toUpperCase()}`,
        form,
        filingDate: record.filingDate ?? null,
        accession: record.accessionNumber ?? null,
        sourceUrl: record.filingUrl ?? null,
        sourceId: record.provenance?.sourceId ?? record.id,
        retrievedAt: record.provenance?.retrievedAt ?? retrievedAt,
      })
    }
  }
  return output
}

function candidateOrder(left, right, definition) {
  return conceptRank(left, definition) - conceptRank(right, definition) ||
    formRank(left.form, left.periodType) - formRank(right.form, right.periodType) ||
    String(right.filingDate ?? '').localeCompare(String(left.filingDate ?? '')) ||
    String(right.accession ?? '').localeCompare(String(left.accession ?? ''))
}

function dateAuthorityRank(candidate) {
  const order = [
    DATE_AUTHORITY.REPORTED,
    DATE_AUTHORITY.DERIVED_FROM_REPORTED_BOUNDARIES,
    DATE_AUTHORITY.INFERRED,
    DATE_AUTHORITY.UNKNOWN,
  ]
  const index = order.indexOf(candidate.dateAuthority ?? candidate.periodIdentity?.dateAuthority ?? DATE_AUTHORITY.REPORTED)
  return index < 0 ? order.length : index
}

function additiveCapexClass(candidate) {
  const text = `${candidate.concept ?? ''} ${candidate.label ?? ''}`.toLowerCase().replace(/[^a-z0-9]+/g, ' ')
  if (/\bproperty\s+plant\s+(?:and\s+)?equipment\b|\bproperty\s+and\s+equipment\b/.test(text) &&
      /\b(?:net\s+of|excluding|exclusive\s+of)\s+(?:purchases?\s+of\s+)?computer\s+hardware\b/.test(text)) {
    return 'PROPERTY_PLANT_EQUIPMENT'
  }
  if (/\bcomputer\s+hardware\b/.test(text)) return 'COMPUTER_HARDWARE'
  return null
}

function capexDerivationInput(candidate) {
  return {
    issuerId: candidate.issuerId,
    metric: candidate.metric,
    scope: 'CONSOLIDATED',
    operationScope: candidate.operationScope,
    currency: candidate.currency,
    normalizedUnits: candidate.normalizedUnits,
    normalizedValue: candidate.normalizedValue,
    sourceProvider: 'SEC',
    sourceId: candidate.sourceId,
    sourceUrl: candidate.sourceUrl,
    accession: candidate.accession,
    filingDate: candidate.filingDate,
    reportedVsDerived: OBSERVATION_BASIS.REPORTED,
    deduplicationStatus: null,
    periodIdentity: createPeriodIdentity({
      periodType: candidate.periodType,
      periodStart: candidate.periodStart,
      periodEnd: candidate.periodEnd,
      dateAuthority: candidate.dateAuthority ?? DATE_AUTHORITY.REPORTED,
      fiscalYear: candidate.fiscalYear,
      fiscalQuarter: candidate.fiscalQuarter,
      fiscalCalendarId: candidate.fiscalCalendarId,
    }),
  }
}

function additiveCapexCandidate(candidates) {
  if (candidates.length < 2) return null
  const authority = dateAuthorityRank(candidates[0])
  const eligible = candidates.filter((candidate) => dateAuthorityRank(candidate) === authority)
  const accessions = new Set(eligible.map((candidate) => candidate.accession).filter(Boolean))
  if (eligible.length < 2 || accessions.size !== 1) return null
  const classified = eligible.map((candidate) => ({ candidate, componentClass: additiveCapexClass(candidate) }))
    .filter((item) => item.componentClass)
  if (classified.length < 2 || classified.some(({ candidate }) =>
    candidate.explicitPeriodMapping !== true || !candidate.sourceId || !candidate.accession)) return null
  const byComponentClass = new Map()
  for (const item of classified) {
    if (!byComponentClass.has(item.componentClass)) byComponentClass.set(item.componentClass, [])
    byComponentClass.get(item.componentClass).push(item.candidate)
  }
  if (byComponentClass.size !== 2 || [...byComponentClass.values()].some((group) =>
    group.some((candidate) => !valuesAgree(candidate.normalizedValue, group[0].normalizedValue)))) return null
  const components = [...byComponentClass.values()].map((group) => group[0])
  if (new Set(components.map((candidate) => candidate.sourceId)).size !== components.length) return null
  const first = components[0]
  return {
    ...first,
    rawValue: null,
    normalizedValue: components.reduce((total, item) => total + Number(item.normalizedValue), 0),
    namespace: 'derived',
    concept: 'AdditiveNonOverlappingCashCapexComponents',
    label: 'Additive non-overlapping cash capex components',
    sourceId: components.map((item) => item.sourceId).sort().join('|PLUS|'),
    alternatives: [],
    conflicts: [],
    restatedOrRecast: components.some((item) => item.restatedOrRecast),
    reportedVsDerived: OBSERVATION_BASIS.DERIVED,
    derivation: {
      method: 'ADDITIVE_NON_OVERLAPPING_CASH_CAPEX_COMPONENTS',
      exactness: 'EXACT_ARITHMETIC',
      componentClasses: [...byComponentClass.keys()],
      inputs: components.map(capexDerivationInput),
    },
  }
}

function selectCandidatePeriod(group, definition) {
  const byConcept = new Map()
  for (const candidate of group) {
    const key = `${candidate.namespace}:${candidate.concept}`
    const existing = byConcept.get(key)
    if (!existing || String(candidate.filingDate ?? '').localeCompare(String(existing.filingDate ?? '')) > 0 ||
        (candidate.filingDate === existing.filingDate && String(candidate.accession ?? '').localeCompare(String(existing.accession ?? '')) > 0)) {
      byConcept.set(key, candidate)
    }
  }
  const resolvedConcepts = [...byConcept.values()].sort((left, right) =>
    dateAuthorityRank(left) - dateAuthorityRank(right) || candidateOrder(left, right, definition))
  const selected = resolvedConcepts[0]
  const selectedRank = conceptRank(selected, definition)
  const selectedDateAuthorityRank = dateAuthorityRank(selected)
  const additiveCapex = selected.metric === 'capitalExpenditures' ? additiveCapexCandidate(resolvedConcepts) : null
  if (additiveCapex) return additiveCapex
  const allPlausibleConceptsMustAgree = selected.metric === 'costOfRevenue' || selected.metric === 'capitalExpenditures'
  const conflicts = resolvedConcepts.filter((candidate) =>
    dateAuthorityRank(candidate) === selectedDateAuthorityRank &&
    (allPlausibleConceptsMustAgree || conceptRank(candidate, definition) === selectedRank) &&
    !valuesAgree(candidate.normalizedValue, selected.normalizedValue))
  return {
    ...selected,
    alternatives: group.filter((candidate) => candidate.sourceId !== selected.sourceId),
    restatedOrRecast: group.some((candidate) => candidate.concept === selected.concept &&
      candidate.sourceId !== selected.sourceId && !valuesAgree(candidate.normalizedValue, selected.normalizedValue)),
    conflicts,
  }
}

function reportingCurrency(candidates) {
  const annual = candidates.filter((candidate) =>
    [PERIOD_TYPE.FISCAL_YEAR, PERIOD_TYPE.CALENDAR_YEAR].includes(candidate.periodType))
    .sort((left, right) => String(right.periodEnd).localeCompare(String(left.periodEnd)) ||
      String(right.filingDate ?? '').localeCompare(String(left.filingDate ?? '')))
  return annual[0]?.currency ?? [...candidates].sort((left, right) =>
    String(right.periodEnd).localeCompare(String(left.periodEnd)))[0]?.currency ?? null
}

function selectedCandidates(candidates, metric, preferredCurrency = null) {
  const definition = definitionFor(metric)
  const metricCandidates = candidates.filter((candidate) => candidate.metric === metric)
  const currency = preferredCurrency ?? reportingCurrency(metricCandidates)
  const comparable = currency ? metricCandidates.filter((candidate) => candidate.currency === currency) : metricCandidates
  const groups = new Map()
  for (const candidate of comparable) {
    const key = [candidate.periodStart, candidate.periodEnd, candidate.currency, candidate.operationScope].join('|')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(candidate)
  }
  const resolved = [...groups.values()].map((group) => selectCandidatePeriod(group, definition))
  const periods = new Map()
  for (const candidate of resolved) {
    const key = [candidate.periodStart, candidate.periodEnd, candidate.currency].join('|')
    if (!periods.has(key)) periods.set(key, [])
    periods.get(key).push(candidate)
  }
  const rank = (candidate) => candidate.operationScope === OPERATION_SCOPE.CONTINUING_OPERATIONS ? 0
    : candidate.operationScope === OPERATION_SCOPE.UNSPECIFIED ? 1 : 2
  return [...periods.values()].map((group) => group.sort((left, right) => dateAuthorityRank(left) - dateAuthorityRank(right) ||
    rank(left) - rank(right) ||
    candidateOrder(left, right, definition))[0])
}

function preferOperationScopedPeriods(observations) {
  const groups = new Map()
  for (const observation of observations) {
    const period = observation.periodIdentity
    const economicIdentity = period.fiscalYear != null && period.fiscalQuarter != null
      ? `${period.fiscalCalendarId ?? observation.issuerId}:FY${period.fiscalYear}:Q${period.fiscalQuarter}`
      : `${period.periodStart}:${period.periodEnd}`
    const key = [observation.issuerId, observation.metric, period.periodType, economicIdentity,
      observation.currency, observation.normalizedUnits].join('|')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(observation)
  }
  const rank = (item) => item.operationScope === OPERATION_SCOPE.CONTINUING_OPERATIONS ? 0
    : item.operationScope === OPERATION_SCOPE.UNSPECIFIED ? 1 : 2
  return [...groups.values()].map((group) => {
    const ordered = [...group].sort((left, right) => dateAuthorityRank(left) - dateAuthorityRank(right) ||
      rank(left) - rank(right) ||
      String(right.filingDate ?? '').localeCompare(String(left.filingDate ?? '')))
    return { ...ordered[0], operationScopeAlternatives: ordered.slice(1) }
  })
}

function canonicalSecObservation(candidate) {
  const definition = definitionFor(candidate.metric)
  const dateAuthority = candidate.dateAuthority ?? DATE_AUTHORITY.REPORTED
  const base = createCanonicalObservation({
    ticker: candidate.ticker,
    issuerId: candidate.issuerId,
    metric: candidate.metric,
    rawValue: candidate.rawValue,
    rawUnits: candidate.currency,
    normalizedValue: candidate.normalizedValue,
    currency: candidate.currency,
    normalizedUnits: candidate.normalizedUnits,
    periodIdentity: createPeriodIdentity({
      periodType: candidate.periodType,
      periodStart: candidate.periodStart,
      periodEnd: candidate.periodEnd,
      dateAuthority,
      fiscalYear: candidate.fiscalYear,
      fiscalQuarter: candidate.fiscalQuarter,
      fiscalCalendarId: candidate.fiscalCalendarId,
      startEvidence: dateAuthority === DATE_AUTHORITY.REPORTED
        ? 'SEC_XBRL_CONTEXT_START' : candidate.periodStart ? 'DERIVED_FROM_EXPLICIT_DURATION_AND_END' : null,
      endEvidence: dateAuthority === DATE_AUTHORITY.REPORTED
        ? 'SEC_XBRL_CONTEXT_END' : 'EXPLICIT_TABLE_PERIOD_LABEL',
    }),
    sourceProvider: 'SEC',
    sourceId: candidate.sourceId,
    filingDate: candidate.filingDate,
    accession: candidate.accession,
    sourceUrl: candidate.sourceUrl,
    scope: 'CONSOLIDATED',
    operationScope: candidate.operationScope,
    confidence: candidate.conflicts.length ? 'LOW' : 'HIGH',
    reportedVsDerived: candidate.reportedVsDerived ?? OBSERVATION_BASIS.REPORTED,
    derivation: candidate.derivation ?? null,
    semanticDefinitionFingerprint: SEMANTIC_DEFINITION[candidate.metric],
    sourceDefinitionFingerprint: candidate.derivation?.method
      ? `DERIVED:${candidate.derivation.method}` : `${candidate.namespace}:${candidate.concept}`,
    retrievedAt: candidate.retrievedAt,
    restatedOrRecast: candidate.restatedOrRecast,
    warnings: candidate.conflicts.length ? [`COMPETING_CONSOLIDATED_${candidate.metric.toUpperCase()}_CONCEPTS`] : [],
  })
  const observation = {
    ...base,
    form: candidate.form,
    concept: candidate.concept,
    label: candidate.label,
    periodEvidenceSource: candidate.sourceUrl,
    explicitPeriodMapping: candidate.explicitPeriodMapping === true,
    alternatives: candidate.alternatives,
  }
  if (!candidate.conflicts.length) return observation
  return {
    ...observation,
    deduplicationStatus: 'REQUIRES_REVIEW',
    conflicts: [{
      type: 'VALUE_CONFLICT',
      sourceIds: [candidate.sourceId, ...candidate.conflicts.map((item) => item.sourceId)],
      values: [candidate.normalizedValue, ...candidate.conflicts.map((item) => item.normalizedValue)],
    }],
  }
}

function sourceLineage(observation) {
  return {
    metric: observation.metric,
    sourceProvider: observation.sourceProvider,
    sourceId: observation.sourceId,
    sourceUrl: observation.sourceUrl,
    accession: observation.accession,
    filingDate: observation.filingDate,
    form: observation.form ?? null,
    concept: observation.concept ?? null,
    label: observation.label ?? null,
    rawValue: observation.rawValue,
    rawUnits: observation.rawUnits,
    normalizedValue: observation.normalizedValue,
    currency: observation.currency,
    normalizedUnits: observation.normalizedUnits,
    issuerId: observation.issuerId,
    scope: observation.scope,
    operationScope: observation.operationScope,
    deduplicationStatus: observation.deduplicationStatus ?? null,
    periodIdentity: observation.periodIdentity,
    reportedVsDerived: observation.reportedVsDerived,
    semanticDefinitionFingerprint: observation.semanticDefinitionFingerprint,
    sourceDefinitionFingerprint: observation.sourceDefinitionFingerprint,
  }
}

function exactCompatiblePeriod(left, right) {
  return left.issuerId === right.issuerId && left.scope === right.scope && left.currency === right.currency &&
    left.operationScope === right.operationScope &&
    left.normalizedUnits === right.normalizedUnits && left.periodIdentity.periodStart === right.periodIdentity.periodStart &&
    left.periodIdentity.periodEnd === right.periodIdentity.periodEnd &&
    left.periodIdentity.periodType === right.periodIdentity.periodType
}

function deriveGrossProfit(revenue, costs, direct) {
  const directPeriods = new Set(direct.map((item) => `${item.periodIdentity.periodStart}|${item.periodIdentity.periodEnd}|${item.currency}`))
  const observations = []
  const failures = []
  for (const revenueObservation of revenue) {
    const key = `${revenueObservation.periodIdentity.periodStart}|${revenueObservation.periodIdentity.periodEnd}|${revenueObservation.currency}`
    if (directPeriods.has(key)) continue
    const matches = costs.filter((cost) => exactCompatiblePeriod(revenueObservation, cost))
    if (matches.length !== 1) {
      if (matches.length > 1) failures.push({ status: 'REQUIRES_REVIEW', reason: 'AMBIGUOUS_COST_OF_REVENUE', sourceId: revenueObservation.sourceId })
      continue
    }
    const cost = matches[0]
    if (revenueObservation.deduplicationStatus === 'REQUIRES_REVIEW' || cost.deduplicationStatus === 'REQUIRES_REVIEW') {
      failures.push({ status: 'REQUIRES_REVIEW', reason: 'SOURCE_VALUE_CONFLICT', sourceIds: [revenueObservation.sourceId, cost.sourceId] })
      continue
    }
    const normalizedValue = revenueObservation.normalizedValue - Math.abs(cost.normalizedValue)
    observations.push(createCanonicalObservation({
      ticker: revenueObservation.ticker,
      issuerId: revenueObservation.issuerId,
      metric: 'grossProfit',
      rawValue: null,
      rawUnits: revenueObservation.normalizedUnits,
      normalizedValue,
      currency: revenueObservation.currency,
      normalizedUnits: revenueObservation.normalizedUnits,
      periodIdentity: revenueObservation.periodIdentity,
      sourceProvider: 'DERIVED',
      sourceId: `${revenueObservation.sourceId}|REVENUE_MINUS_COST_OF_REVENUE|${cost.sourceId}`,
      filingDate: [revenueObservation.filingDate, cost.filingDate].filter(Boolean).sort().at(-1) ?? null,
      sourceUrl: revenueObservation.sourceUrl,
      scope: 'CONSOLIDATED',
      operationScope: revenueObservation.operationScope,
      confidence: revenueObservation.confidence === 'HIGH' && cost.confidence === 'HIGH' ? 'HIGH' : 'MEDIUM',
      reportedVsDerived: OBSERVATION_BASIS.DERIVED,
      derivation: {
        method: 'REVENUE_MINUS_COST_OF_REVENUE',
        exactness: 'EXACT_ARITHMETIC',
        inputs: [sourceLineage(revenueObservation), sourceLineage(cost)],
      },
      semanticDefinitionFingerprint: SEMANTIC_DEFINITION.grossProfit,
      sourceDefinitionFingerprint: 'DERIVED:REVENUE_MINUS_COST_OF_REVENUE',
      retrievedAt: [revenueObservation.retrievedAt, cost.retrievedAt].filter(Boolean).sort().at(-1) ?? null,
      warnings: [],
    }))
  }
  return { observations, failures }
}

export function adaptSecCanonicalFinancials({
  company,
  facts,
  filings = null,
  supplementalFacts = [],
  metrics = ['revenue', 'grossProfit', 'ebit', 'operatingCashFlow', 'capitalExpenditures'],
  retrievedAt = null,
  asOfDate = '9999-12-31',
} = {}) {
  const requested = [...new Set(metrics.filter((metric) => metric !== 'freeCashFlow'))]
  const extractionMetrics = [...new Set([...requested, ...(requested.includes('grossProfit') ? ['revenue', 'costOfRevenue'] : [])])]
  const effectiveRetrievedAt = retrievedAt ?? new Date().toISOString()
  const candidates = [
    ...rawCompanyFactCandidates({ company, facts, filings, metrics: extractionMetrics, retrievedAt: effectiveRetrievedAt, asOfDate }),
    ...rawSupplementalCandidates({ company, filings, records: supplementalFacts, metrics: extractionMetrics, retrievedAt: effectiveRetrievedAt, asOfDate }),
  ]
  const preferredCurrency = reportingCurrency(candidates.filter((item) => item.metric === 'revenue'))
  const selected = Object.fromEntries(extractionMetrics.map((metric) => [metric,
    selectedCandidates(candidates, metric, preferredCurrency).map(canonicalSecObservation),
  ]))
  const failures = []
  if (requested.includes('grossProfit')) {
    const derived = deriveGrossProfit(selected.revenue ?? [], selected.costOfRevenue ?? [], selected.grossProfit ?? [])
    selected.grossProfit = deduplicateEconomicPeriods([...(selected.grossProfit ?? []), ...derived.observations])
    failures.push(...derived.failures)
  }
  const observations = requested.flatMap((metric) => selected[metric] ?? [])
  return { observations, byMetric: selected, candidates, failures }
}

function sameCanonicalQuarter(wise, sec, metric) {
  if (wise.metric !== metric || sec.metric !== metric || sec.periodIdentity.periodType !== PERIOD_TYPE.STANDALONE_QUARTER) return false
  const wiseCik = paddedCik(wise.issuerId)
  const secCik = paddedCik(sec.issuerId)
  if (wise.ticker !== sec.ticker || (wiseCik && secCik && wiseCik !== secCik)) return false
  const a = wise.periodIdentity
  const b = sec.periodIdentity
  const endDistance = Math.abs((epochDay(a.periodEnd) ?? -10_000) - (epochDay(b.periodEnd) ?? 10_000))
  if (endDistance > 7) return false
  if (a.fiscalYear != null && b.fiscalYear != null && a.fiscalYear !== b.fiscalYear) return false
  if (a.fiscalQuarter != null && b.fiscalQuarter != null && a.fiscalQuarter !== b.fiscalQuarter) return false
  return wise.scope === sec.scope && wise.currency === sec.currency && wise.normalizedUnits === sec.normalizedUnits
}

function enrichWiseWithSecPeriod(wise, sec) {
  const reconciles = valuesAgree(wise.normalizedValue, sec.normalizedValue)
  const periodEvidence = sourceLineage(sec)
  const enriched = {
    ...wise,
    issuerId: sec.issuerId,
    operationScope: sec.operationScope,
    periodIdentity: sec.periodIdentity,
    semanticDefinitionFingerprint: sec.semanticDefinitionFingerprint,
    derivation: {
      method: 'WISESHEETS_VALUE_WITH_SEC_PERIOD_EVIDENCE',
      valueSource: sourceLineage(wise),
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
    warnings: [...(wise.warnings ?? []), reconciles ? 'SEC_PERIOD_EVIDENCE_ATTACHED' : 'WISESHEETS_SEC_VALUE_MISMATCH'],
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

export function resolveWiseSheetsWithSecMetric(wiseObservations = [], secObservations = [], metric) {
  const metricSec = secObservations.filter((item) => item.metric === metric)
  const authoritativeSourcePeriods = metricSec.filter((item) => hasAuthoritativeBoundaries(item.periodIdentity))
  const normalizedAuthoritative = deriveStandaloneQuarters(authoritativeSourcePeriods)
  const authoritativeYtd = deduplicateEconomicPeriods(authoritativeSourcePeriods.filter((item) =>
    [PERIOD_TYPE.YTD_6M, PERIOD_TYPE.YTD_9M].includes(item.periodIdentity.periodType)))
  const explicitEndOnlyQuarters = metricSec.filter((item) => item.periodIdentity.periodType === PERIOD_TYPE.STANDALONE_QUARTER &&
    !hasAuthoritativeBoundaries(item.periodIdentity) && item.explicitPeriodMapping === true)
  const normalizedSec = [...normalizedAuthoritative, ...explicitEndOnlyQuarters]
  const normalizationFailures = normalizedAuthoritative.failures ?? []
  const secQuarters = deduplicateEconomicPeriods(preferOperationScopedPeriods(normalizedSec.filter((item) =>
    item.periodIdentity.periodType === PERIOD_TYPE.STANDALONE_QUARTER &&
    (hasAuthoritativeBoundaries(item.periodIdentity) || (item.explicitPeriodMapping === true &&
      item.periodIdentity.periodEnd && item.periodIdentity.fiscalYear != null && item.periodIdentity.fiscalQuarter != null)))))
  const secAnnuals = deduplicateEconomicPeriods(secObservations.filter((item) => item.metric === metric &&
    [PERIOD_TYPE.FISCAL_YEAR, PERIOD_TYPE.CALENDAR_YEAR].includes(item.periodIdentity.periodType)))
  const usedSec = new Set()
  const resolvedWise = wiseObservations.filter((item) => item.metric === metric).map((wise) => {
    const matches = secQuarters.filter((sec) => sameCanonicalQuarter(wise, sec, metric))
    if (matches.length !== 1) return wise
    usedSec.add(matches[0].sourceId)
    return enrichWiseWithSecPeriod(wise, matches[0])
  })
  const secValueFilled = secQuarters.filter((sec) => !usedSec.has(sec.sourceId))
  return {
    records: deduplicateEconomicPeriods([...resolvedWise, ...secValueFilled, ...authoritativeYtd, ...secAnnuals]),
    secValueFilled,
    failures: normalizationFailures,
  }
}

export function resolveLatestReportedFinancialPeriod(metric, observations = [], filings = null, asOfDate = '9999-12-31') {
  const asOf = normalizedAsOf(asOfDate)
  const filingPeriods = (filings?.filings ?? [])
    .filter((filing) => DIRECT_REPORT_FORMS.has(String(filing.form).toUpperCase()) && filing.reportDate &&
      availableByAsOf(filing.filingDate, filing.reportDate, asOf))
    .map((filing) => ({
      periodIdentity: { periodEnd: filing.reportDate },
      form: String(filing.form).toUpperCase(),
      filingDate: filing.filingDate,
      sourceId: `SEC:${paddedCik(filing.cik)}:${filing.accessionNumber}:FORM_REPORT_PERIOD`,
    }))
  const observationsWithExplicitPeriods = observations.filter((observation) => observation.metric === metric &&
    observation.periodIdentity.periodEnd && availableByAsOf(observation.filingDate, observation.periodIdentity.periodEnd, asOf) &&
    (!observation.filingDate || observation.periodIdentity.periodEnd <= String(observation.filingDate).slice(0, 10)) &&
    (DIRECT_REPORT_FORMS.has(observation.form) || EXHIBIT_PERIOD_FORMS.has(observation.form)))
  const eligible = [...observationsWithExplicitPeriods, ...filingPeriods]
    .sort((left, right) => right.periodIdentity.periodEnd.localeCompare(left.periodIdentity.periodEnd) ||
      String(right.filingDate ?? '').localeCompare(String(left.filingDate ?? '')))
  for (const observation of eligible) {
    const exhibit = EXHIBIT_PERIOD_FORMS.has(observation.form)
    if (exhibit && observation.explicitPeriodMapping !== true) continue
    const result = createLatestReportedPeriod({
      periodEnd: observation.periodIdentity.periodEnd,
      form: observation.form,
      evidenceType: exhibit ? 'EARNINGS_EXHIBIT_PERIOD' : 'FORM_REPORT_PERIOD',
      explicitPeriodMapping: exhibit,
      sourceId: observation.sourceId,
    })
    if (result.valid) return result
  }
  return createLatestReportedPeriod({})
}

function normalizedFiling(filing) {
  return {
    ...filing,
    filingUrl: filing.filingUrl ?? filing.secUrl,
    immutableSourceId: filing.immutableSourceId ?? `SEC:${paddedCik(filing.cik)}:${filing.accessionNumber}`,
  }
}

function latestExistingMetadata(candidates) {
  const periodEndByMetric = Object.fromEntries(
    [...new Set(candidates.map((item) => item.metric))].map((metric) => [metric,
      candidates.filter((item) => item.metric === metric).map((item) => item.periodEnd).filter(Boolean).sort().at(-1) ?? null,
    ]),
  )
  return {
    periodEnd: candidates.map((item) => item.periodEnd).filter(Boolean).sort().at(-1) ?? null,
    periodEndByMetric,
    filingDate: candidates.map((item) => item.filingDate).filter(Boolean).sort().at(-1) ?? null,
    accessions: new Set(candidates.map((item) => item.accession).filter(Boolean)),
  }
}

function nearRequiredPeriod(filing, requiredPeriods) {
  if (!requiredPeriods?.length) return false
  const reportDay = epochDay(filing.reportDate)
  const filedDay = epochDay(filing.filingDate)
  return requiredPeriods.some((period) => {
    const targetDay = epochDay(period.gapEnd ?? period.periodEnd)
    if (targetDay == null) return false
    const gapStart = epochDay(period.gapStart ?? period.periodStart ?? period.periodEnd)
    const gapEnd = epochDay(period.gapEnd ?? period.periodEnd)
    const reportOverlapsGap = reportDay != null && gapStart != null && gapEnd != null &&
      reportDay >= gapStart - 35 && reportDay <= gapEnd + 130
    const filingWindow = period.purpose === 'LTM' ? 280 : 190
    return reportOverlapsGap || (reportDay != null && Math.abs(reportDay - targetDay) <= 130) ||
      (filedDay != null && filedDay >= targetDay && filedDay - targetDay <= filingWindow)
  })
}

export function requiredPeriodKey(period) {
  return [period.metric ?? '', period.purpose ?? '', period.gapStart ?? period.periodStart ?? '',
    period.gapEnd ?? period.periodEnd ?? ''].join('|')
}

function filingPeriodScore(filing, period) {
  const targetDay = epochDay(period.gapEnd ?? period.periodEnd)
  const gapStart = epochDay(period.gapStart ?? period.periodStart ?? period.periodEnd)
  const reportDay = epochDay(filing.reportDate)
  const filedDay = epochDay(filing.filingDate)
  const form = String(filing.form ?? '').toUpperCase()
  const evidence = [filing.description, filing.primaryDocument, filing.items].filter(Boolean).join(' ')
  const earningsEvidence = /earnings|financial results|quarterly results|annual results|results of operations/i.test(evidence) ||
    /20\d{6}x(?:6k|8k)/i.test(String(filing.primaryDocument ?? '')) ||
    filing.earningsExhibitEvidence === true
  let score = 0
  if (reportDay != null && targetDay != null) score += Math.abs(reportDay - targetDay)
  else if (filedDay != null && targetDay != null) score += Math.abs(filedDay - targetDay) + 60
  else score += 10_000
  if (DIRECT_REPORT_FORMS.has(form)) score -= 80
  if (ANNUAL_REPORT_FORMS.has(form) && gapStart != null && targetDay != null && targetDay - gapStart > 180) score -= 35
  if (EXHIBIT_PERIOD_FORMS.has(form) && earningsEvidence) score -= 70
  if (/\/A$/.test(form)) score -= 5
  return score
}

async function selectTargetedFilings(filings, existing, metrics, asOfDate, requiredPeriods, perPeriodLimit, hydrateExhibits, signal) {
  const eligible = filings.map(normalizedFiling)
    .filter((filing) => targetedFilingEligible(filing, existing, metrics, asOfDate, requiredPeriods))
  if (!requiredPeriods.length) {
    return eligible.sort((left, right) => String(right.reportDate ?? '').localeCompare(String(left.reportDate ?? '')) ||
      String(right.filingDate ?? '').localeCompare(String(left.filingDate ?? ''))).slice(0, perPeriodLimit)
  }
  const uniquePeriods = [...new Map(requiredPeriods.map((period) => [requiredPeriodKey(period), period])).values()]
  const selected = new Map()
  const hydratedByAccession = new Map()
  for (const period of uniquePeriods) {
    signal?.throwIfAborted()
    const preliminary = eligible.filter((filing) => nearRequiredPeriod(filing, [period]))
      .sort((left, right) => filingPeriodScore(left, period) - filingPeriodScore(right, period) ||
        String(right.filingDate ?? '').localeCompare(String(left.filingDate ?? '')))
      .slice(0, Math.max(perPeriodLimit * 6, 24))
    const enriched = []
    for (const filing of preliminary) {
      if (!EXHIBIT_PERIOD_FORMS.has(filing.form)) {
        enriched.push(filing)
        continue
      }
      const cacheKey = filing.accessionNumber ?? filing.filingUrl
      if (!hydratedByAccession.has(cacheKey)) {
        try {
          hydratedByAccession.set(cacheKey, await hydrateExhibits(filing, { signal }))
        } catch {
          hydratedByAccession.set(cacheKey, filing)
        }
      }
      const hydrated = hydratedByAccession.get(cacheKey)
      enriched.push({
        ...filing,
        exhibits: hydrated.exhibits ?? [],
        earningsExhibitEvidence: (hydrated.exhibits ?? []).some((item) => item.isLikelyEarningsExhibit && item.url),
      })
    }
    const ranked = enriched
      .sort((left, right) => filingPeriodScore(left, period) - filingPeriodScore(right, period) ||
        String(right.filingDate ?? '').localeCompare(String(left.filingDate ?? '')))
    const periodCandidates = period.purpose === 'LTM'
      ? [...new Map([
        ...ranked.slice(0, perPeriodLimit),
        ...ranked.filter((filing) => filing.earningsExhibitEvidence === true),
      ].map((filing) => [filing.accessionNumber ?? filing.filingUrl, filing])).values()]
      : ranked.slice(0, perPeriodLimit)
    for (const filing of periodCandidates) selected.set(filing.accessionNumber ?? filing.filingUrl, filing)
  }
  return [...selected.values()]
}

export function targetedFilingEligible(filing, existing, metrics, asOfDate, requiredPeriods = []) {
  const form = String(filing.form ?? '').toUpperCase()
  if (!SUPPORTED_FORMS.has(form) || !(filing.secUrl ?? filing.filingUrl)) return false
  if (!availableByAsOf(filing.filingDate, null, asOfDate)) return false
  if (requiredPeriods.length) return nearRequiredPeriod(filing, requiredPeriods)
  if (DIRECT_REPORT_FORMS.has(form)) {
    if (!filing.reportDate) return false
    if (!existing.periodEnd) return true
    return metrics.some((metric) => {
      const latestMetricEnd = existing.periodEndByMetric[metric]
      return latestMetricEnd ? filing.reportDate > latestMetricEnd : filing.reportDate >= existing.periodEnd
    })
  }
  return !existing.filingDate || String(filing.filingDate) >= existing.filingDate
}

async function documentTargets(filing, hydrateExhibits, signal) {
  if (!EXHIBIT_PERIOD_FORMS.has(filing.form)) return [{ url: filing.filingUrl, filing }]
  let hydrated = filing.exhibits ? filing : null
  if (!hydrated) {
    try {
      hydrated = await hydrateExhibits(filing, { signal })
    } catch {
      return [{ url: filing.filingUrl, filing }]
    }
  }
  const likely = (hydrated.exhibits ?? []).filter((item) => item.isLikelyEarningsExhibit && item.url)
  const targets = [{ url: filing.filingUrl, filing }, ...likely.map((item) => ({
    url: item.url,
    filing: { ...filing, filingUrl: item.url },
  }))]
  return [...new Map(targets.filter((item) => item.url).map((item) => [item.url, item])).values()]
}

export async function loadTargetedSecFinancialCompletion({
  company,
  facts,
  filings,
  metrics = ['revenue', 'grossProfit', 'ebit', 'operatingCashFlow', 'capitalExpenditures'],
  retrievedAt = null,
  asOfDate = '9999-12-31',
  fetchText = fetchSecText,
  hydrateExhibits = (filing, options) => hydrateFilingExhibits(filing, options),
  maxFilings = MAX_TARGETED_FILINGS_PER_PERIOD,
  requiredPeriods = [],
  signal,
} = {}) {
  signal?.throwIfAborted()
  const effectiveRetrievedAt = retrievedAt ?? new Date().toISOString()
  const extractionMetrics = [...new Set([...metrics, ...(metrics.includes('grossProfit') ? ['costOfRevenue'] : [])])]
  const existingCandidates = rawCompanyFactCandidates({
    company, facts, filings, metrics: extractionMetrics, retrievedAt: effectiveRetrievedAt, asOfDate,
  })
  const existing = latestExistingMetadata(existingCandidates)
  const candidates = await selectTargetedFilings(
    filings?.filings ?? [], existing, extractionMetrics, asOfDate, requiredPeriods, maxFilings, hydrateExhibits, signal,
  )
  const records = []
  const failures = []
  for (const filing of candidates) {
    signal?.throwIfAborted()
    const targets = await documentTargets(filing, hydrateExhibits, signal)
    for (const target of targets) {
      signal?.throwIfAborted()
      try {
        const content = await fetchText(target.url, { signal })
        const extracted = /\.xml(?:\?|$)/i.test(target.url)
          ? extractXbrlInstanceFacts({ company, filing: target.filing, xml: content, sourceUrl: target.url, retrievedAt: effectiveRetrievedAt })
          : [
            ...extractInlineXbrlFacts({ company, filing: target.filing, html: content, retrievedAt: effectiveRetrievedAt }),
            ...extractStructuredFinancialTableFacts({
              company, filing: target.filing, html: content, sourceUrl: target.url, retrievedAt: effectiveRetrievedAt,
            }),
          ]
        records.push(...extracted.filter((record) => (record.startDate || record.explicitPeriodMapping) && record.endDate &&
          availableByAsOf(record.filingDate, record.endDate, asOfDate)))
      } catch (error) {
        if (signal?.aborted) throw error
        failures.push({
          reason: 'TARGETED_SEC_FILING_EXTRACTION_FAILED',
          accession: filing.accessionNumber,
          reportDate: filing.reportDate,
          documentUrl: target.url,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }
  return { records, failures, filings: candidates, latestExistingEnd: existing.periodEnd }
}

function normalizeMetricRecords(observations, metric) {
  const derived = deriveStandaloneQuarters(observations.filter((item) => item.metric === metric))
  return { records: deduplicateEconomicPeriods(derived), failures: [...(derived.failures ?? [])] }
}

function reviewResult(result, reason) {
  return {
    ...result,
    value: null,
    status: HISTORICAL_RESULT_STATUS.REQUIRES_REVIEW,
    reason,
    rejectedValue: result?.value ?? null,
  }
}

function applyResultSanity(calendarActuals, ltm, years) {
  for (const period of [...years, 'LTM']) {
    const metricResult = (metric) => period === 'LTM' ? ltm[metric] : calendarActuals[metric][period]
    const revenue = metricResult('revenue')
    const grossProfit = metricResult('grossProfit')
    if (finite(revenue?.value) && revenue.value < 0) {
      if (period === 'LTM') ltm.revenue = reviewResult(revenue, 'NEGATIVE_REVENUE')
      else calendarActuals.revenue[period] = reviewResult(revenue, 'NEGATIVE_REVENUE')
    }
    if (finite(revenue?.value) && finite(grossProfit?.value) && grossProfit.value > revenue.value * 1.01) {
      if (period === 'LTM') ltm.grossProfit = reviewResult(grossProfit, 'GROSS_PROFIT_EXCEEDS_REVENUE')
      else calendarActuals.grossProfit[period] = reviewResult(grossProfit, 'GROSS_PROFIT_EXCEEDS_REVENUE')
    }
  }
}

function resultFailure(status, reason, details = {}) {
  return { value: null, classification: null, status, reason, components: [], ...details }
}

function applyDerivationFailures(calendarActuals, ltm, failures, years) {
  const incompatible = failures.filter((item) => item.reason === 'OPERATION_SCOPE_INCOMPATIBLE')
  for (const failure of incompatible) {
    const period = failure.periodIdentity
    if (!period?.periodEnd) continue
    for (const year of years) {
      if (period.periodType === PERIOD_TYPE.CALENDAR_YEAR || period.periodType === PERIOD_TYPE.FISCAL_YEAR) {
        if (Number(period.periodEnd.slice(0, 4)) === Number(year)) {
          calendarActuals.freeCashFlow[year] = resultFailure(
            HISTORICAL_RESULT_STATUS.OPERATION_SCOPE_INCOMPATIBLE,
            failure.reason,
            { operationScopes: failure.operationScopes },
          )
        }
      }
    }
  }
  if (incompatible.some((item) => item.periodIdentity?.periodType === PERIOD_TYPE.STANDALONE_QUARTER) &&
      ltm.freeCashFlow?.value == null) {
    ltm.freeCashFlow = resultFailure(HISTORICAL_RESULT_STATUS.OPERATION_SCOPE_INCOMPATIBLE,
      'OPERATION_SCOPE_INCOMPATIBLE', { missingPeriods: ltm.freeCashFlow?.missingPeriods ?? [] })
  }
}

export function buildSecEnrichedFinancialsShadow({
  ticker,
  wiseSheetsRows,
  company,
  facts,
  filings,
  supplementalFacts = [],
  years,
  asOfDate = '9999-12-31',
  retrievedAt = null,
} = {}) {
  const wise = adaptWiseSheetsObservations(wiseSheetsRows, { providerFrequency: 'QUARTERLY', retrievedAt })
  const sec = adaptSecCanonicalFinancials({ company, facts, filings, supplementalFacts, retrievedAt, asOfDate })
  const records = {}
  const latestReportedPeriods = {}
  const secValueFilled = {}
  const failures = [...wise.failures, ...sec.failures]
  for (const metric of ['revenue', 'grossProfit', 'ebit', 'operatingCashFlow', 'capitalExpenditures']) {
    const resolved = resolveWiseSheetsWithSecMetric(wise.observations, sec.observations, metric)
    records[metric] = resolved.records
    secValueFilled[metric] = resolved.secValueFilled
    latestReportedPeriods[metric] = resolveLatestReportedFinancialPeriod(metric, sec.observations, filings, asOfDate)
    failures.push(...resolved.failures.map((failure) => ({ metric, ...failure })))
  }
  const providerFcf = normalizeMetricRecords(wise.observations, 'providerFreeCashFlow')
  records.providerFreeCashFlow = providerFcf.records
  failures.push(...providerFcf.failures.map((failure) => ({ metric: 'providerFreeCashFlow', ...failure })))
  const fcf = deriveCanonicalFreeCashFlow(
    records.operatingCashFlow,
    records.capitalExpenditures,
    records.providerFreeCashFlow,
  )
  records.freeCashFlow = fcf.observations
  failures.push(...fcf.failures.map((failure) => ({ metric: 'freeCashFlow', ...failure })))
  const cfoLatest = latestReportedPeriods.operatingCashFlow
  const capexLatest = latestReportedPeriods.capitalExpenditures
  latestReportedPeriods.freeCashFlow = [cfoLatest, capexLatest]
    .filter((item) => item?.valid)
    .sort((left, right) => left.periodEnd.localeCompare(right.periodEnd))[0] ?? createLatestReportedPeriod({})

  const calendarActuals = Object.fromEntries(SEC_CANONICAL_METRICS.map((metric) => [metric,
    Object.fromEntries(years.map((year) => [year, buildCalendarYear(records[metric], year)])),
  ]))
  const ltm = Object.fromEntries(SEC_CANONICAL_METRICS.map((metric) => [metric,
    buildLtm(records[metric], { asOfDate, latestReportedPeriod: latestReportedPeriods[metric] }),
  ]))
  applyDerivationFailures(calendarActuals, ltm, fcf.failures, years)
  applyResultSanity(calendarActuals, ltm, years)
  return {
    ticker: String(ticker).toUpperCase(),
    records,
    calendarActuals,
    ltm,
    latestReportedPeriods,
    secValueFilled,
    failures,
  }
}

function valueOf(entry) {
  return finite(entry?.value) ? Number(entry.value) : null
}

function latestCanonicalQuarter(result) {
  return result?.latestIngestedPeriod ?? (result?.components ?? [])
    .map((component) => component.periodEnd ?? component.sourceEnd)
    .filter(Boolean).sort().at(-1) ?? null
}

function lineageNodes(value) {
  if (!value || typeof value !== 'object') return []
  const inputs = Array.isArray(value.derivation?.inputs) ? value.derivation.inputs : []
  return [value, ...inputs.flatMap(lineageNodes)]
}

function componentSignals(component) {
  const nodes = lineageNodes(component)
  const periodEnriched = nodes.some((node) => node.sourceProvider === 'WiseSheets' &&
    node.derivation?.method === 'WISESHEETS_VALUE_WITH_SEC_PERIOD_EVIDENCE')
  const directAnnual = component.sourceProvider === 'SEC' &&
    component.reportedVsDerived === OBSERVATION_BASIS.REPORTED && component.totalDays >= 330
  const secValue = nodes.some((node) => node.sourceProvider === 'SEC')
  return { periodEnriched, directAnnual, secValueFilled: secValue && !directAnnual }
}

function resultSources(result) {
  const components = result?.components ?? []
  const signals = components.map(componentSignals)
  const valueSources = [...new Set(components.map((component) => component.sourceProvider).filter(Boolean))]
  const periodEvidence = components.flatMap(lineageNodes).map((component) =>
    component.derivation?.periodEvidence?.sourceUrl ?? component.periodEvidenceSource ??
    (component.sourceProvider === 'SEC' ? component.sourceUrl : null)).filter(Boolean)
  const operationScopes = [...new Set(components.flatMap(lineageNodes)
    .map((component) => component.operationScope).filter(Boolean))]
  return {
    valueSource: valueSources.join(' + ') || null,
    periodEvidenceSource: [...new Set(periodEvidence)].join(' ; ') || null,
    operationScope: operationScopes.join(' + ') || null,
    secPeriodEnriched: signals.some((item) => item.periodEnriched),
    secValueFilled: signals.some((item) => item.secValueFilled),
    secDirectAnnual: signals.some((item) => item.directAnnual),
  }
}

export function compareSecFinancialsShadow(ticker, legacy, canonical, years) {
  const comparisons = []
  for (const metric of SEC_CANONICAL_METRICS) {
    for (const period of [...years.map((year) => `${year}A`), 'LTM']) {
      const year = period === 'LTM' ? null : Number(period.slice(0, 4))
      const legacyResult = period === 'LTM' ? legacy?.ltm?.[metric] : legacy?.calendarActuals?.[metric]?.[year]
      const canonicalResult = period === 'LTM' ? canonical.ltm[metric] : canonical.calendarActuals[metric][year]
      const legacyValue = valueOf(legacyResult)
      const canonicalValue = valueOf(canonicalResult)
      const difference = legacyValue == null || canonicalValue == null ? null : canonicalValue - legacyValue
      const percentageDifference = difference == null || legacyValue === 0 ? null : difference / Math.abs(legacyValue)
      const different = canonicalValue != null && (legacyValue == null || Math.abs(percentageDifference ?? difference) > VALUE_TOLERANCE)
      const stale = canonicalResult?.status === HISTORICAL_RESULT_STATUS.STALE_SOURCE_COVERAGE
      const requiresReview = canonicalResult?.status === HISTORICAL_RESULT_STATUS.REQUIRES_REVIEW
      const unavailableStatus = [HISTORICAL_RESULT_STATUS.MISSING_SOURCE_DATA,
        HISTORICAL_RESULT_STATUS.INSUFFICIENT_PERIOD_COVERAGE, HISTORICAL_RESULT_STATUS.NOT_REPORTED,
        HISTORICAL_RESULT_STATUS.LEGITIMATE_NA, HISTORICAL_RESULT_STATUS.OUT_OF_SCOPE].includes(canonicalResult?.status)
      const sources = resultSources(canonicalResult)
      comparisons.push({
        ticker: String(ticker).toUpperCase(), metric, period,
        legacyValue, canonicalValue,
        classification: canonicalResult?.classification ?? null,
        status: canonicalResult?.status ?? null,
        ...sources,
        operationScope: sources.operationScope ?? canonicalResult?.operationScopes?.join(' + ') ?? null,
        latestReportedPeriod: canonical.latestReportedPeriods[metric]?.valid
          ? canonical.latestReportedPeriods[metric].periodEnd : null,
        latestCanonicalQuarter: latestCanonicalQuarter(canonicalResult),
        difference,
        percentageDifference,
        reason: canonicalResult?.reason ?? (different ? 'VALUE_DIFFERENCE' : null),
        missingPeriods: canonicalResult?.missingPeriods ?? canonicalResult?.coverage?.gaps ?? [],
        matching: canonicalValue != null && !different,
        different,
        unavailable: canonicalValue == null && unavailableStatus,
        stale,
        requiresReview,
      })
    }
  }
  return comparisons
}

function unavailableRows(ticker, years, reason) {
  return SEC_CANONICAL_METRICS.flatMap((metric) => [...years.map((year) => `${year}A`), 'LTM'].map((period) => ({
    ticker, metric, period, legacyValue: null, canonicalValue: null, classification: null,
    status: HISTORICAL_RESULT_STATUS.MISSING_SOURCE_DATA, valueSource: null, periodEvidenceSource: null,
    operationScope: null,
    latestReportedPeriod: null, latestCanonicalQuarter: null, difference: null, percentageDifference: null,
    reason, matching: false, different: false, unavailable: true, stale: false, requiresReview: false,
    secPeriodEnriched: false, secValueFilled: false, secDirectAnnual: false,
  })))
}

function summarize(comparisons) {
  return {
    matching: comparisons.filter((item) => item.matching).length,
    different: comparisons.filter((item) => item.different).length,
    unavailable: comparisons.filter((item) => item.unavailable).length,
    stale: comparisons.filter((item) => item.stale).length,
    requiresReview: comparisons.filter((item) => item.requiresReview).length,
    definitionIncompatible: comparisons.filter((item) => item.status === HISTORICAL_RESULT_STATUS.DEFINITION_INCOMPATIBLE).length,
    insufficientCoverage: comparisons.filter((item) => item.status === HISTORICAL_RESULT_STATUS.INSUFFICIENT_PERIOD_COVERAGE ||
      item.status === HISTORICAL_RESULT_STATUS.MISSING_SOURCE_DATA).length,
    operationScopeIncompatible: comparisons.filter((item) =>
      item.status === HISTORICAL_RESULT_STATUS.OPERATION_SCOPE_INCOMPATIBLE).length,
    secPeriodEnriched: comparisons.filter((item) => item.secPeriodEnriched).length,
    secValueFilled: comparisons.filter((item) => item.secValueFilled).length,
    secDirectAnnual: comparisons.filter((item) => item.secDirectAnnual).length,
  }
}

export function requiredSecCompletionPeriods(canonical, years) {
  const required = []
  for (const metric of ['revenue', 'grossProfit', 'ebit', 'operatingCashFlow', 'capitalExpenditures']) {
    for (const year of years) {
      const result = canonical.calendarActuals?.[metric]?.[year]
      if (result?.value == null) {
        const gaps = result?.coverage?.gaps ?? []
        if (gaps.length) {
          for (const gap of gaps) {
            required.push({
              metric,
              purpose: `${year}A`,
              periodStart: gap.start,
              periodEnd: gap.end,
              gapStart: gap.start,
              gapEnd: gap.end,
            })
          }
        } else {
          required.push({ metric, purpose: `${year}A`, periodStart: `${year}-01-01`, periodEnd: `${year}-12-31` })
        }
      }
    }
    if (canonical.ltm?.[metric]?.value == null) {
      for (const missing of canonical.ltm?.[metric]?.missingPeriods ?? []) {
        if (typeof missing === 'string' && epochDay(missing) != null) {
          required.push({ metric, purpose: 'LTM', periodEnd: missing })
        } else if (missing?.end ?? missing?.periodEnd) {
          required.push({
            metric,
            purpose: 'LTM',
            periodStart: missing.start ?? missing.periodStart ?? null,
            periodEnd: missing.end ?? missing.periodEnd,
            gapStart: missing.start ?? missing.periodStart ?? null,
            gapEnd: missing.end ?? missing.periodEnd,
          })
        }
      }
    }
  }
  return [...new Map(required.map((item) => [
    `${item.metric}|${item.purpose}|${item.gapStart ?? item.periodStart ?? ''}|${item.gapEnd ?? item.periodEnd}`,
    item,
  ])).values()]
}

const DEFAULT_TARGETED_SEC_TIMEOUT_MS = 30_000

function targetedCompletionFailure(reason) {
  return { records: [], filings: [], failures: [{ stage: 'TARGETED_SEC_COMPLETION', reason }] }
}

async function loadTargetedCompletionBounded(input, loader, timeoutMs) {
  const controller = new AbortController()
  const parentSignal = input.signal
  const relayAbort = () => controller.abort(parentSignal.reason ?? new DOMException('Aborted', 'AbortError'))
  parentSignal?.addEventListener('abort', relayAbort, { once: true })
  let timeout
  try {
    return await Promise.race([
      Promise.resolve(loader({ ...input, signal: controller.signal })),
      new Promise((resolve) => {
        timeout = setTimeout(() => {
          controller.abort(new Error('TARGETED_SEC_COMPLETION_TIMEOUT'))
          resolve(targetedCompletionFailure('TARGETED_SEC_COMPLETION_TIMEOUT'))
        }, timeoutMs)
      }),
    ])
  } catch (error) {
    if (controller.signal.aborted && !parentSignal?.aborted) {
      return targetedCompletionFailure('TARGETED_SEC_COMPLETION_TIMEOUT')
    }
    return targetedCompletionFailure(`TARGETED_SEC_COMPLETION_FAILED: ${error?.message ?? 'Unknown error'}`)
  } finally {
    clearTimeout(timeout)
    parentSignal?.removeEventListener('abort', relayAbort)
  }
}

// Production and shadow diagnostics share this builder. Comparison against the
// legacy pipeline is intentionally kept outside this function.
export async function buildCanonicalHistoricalFinancials({
  ticker,
  wiseSheetsRows = [],
  company,
  facts,
  filings,
  years,
  supplementalFacts,
  additionalSupplementalFacts = [],
  asOfDate = '9999-12-31',
  retrievedAt = new Date().toISOString(),
  fetchSecText,
  hydrateExhibits,
  targetedSecTimeoutMs = DEFAULT_TARGETED_SEC_TIMEOUT_MS,
  targetedCompletionLoader = loadTargetedSecFinancialCompletion,
  onTiming,
  signal,
}) {
  const initialCanonical = buildSecEnrichedFinancialsShadow({
    ticker, wiseSheetsRows, company, facts, filings, years,
    supplementalFacts: [], asOfDate, retrievedAt,
  })
  const requiredPeriods = requiredSecCompletionPeriods(initialCanonical, years)
  const loadTargeted = async (periods) => {
    const startedAt = performance.now()
    try {
      return await loadTargetedCompletionBounded({
        company, facts, filings, retrievedAt, asOfDate, fetchText: fetchSecText,
        hydrateExhibits, requiredPeriods: periods, signal,
      }, targetedCompletionLoader, targetedSecTimeoutMs)
    } finally {
      onTiming?.('targetedSecCompletion', performance.now() - startedAt, { requestedPeriods: periods.length })
    }
  }
  const targeted = supplementalFacts
    ? { records: supplementalFacts, failures: [], filings: [] }
    : await loadTargeted(requiredPeriods)
  let supplementalRecords = [...targeted.records, ...additionalSupplementalFacts]
  let canonical = buildSecEnrichedFinancialsShadow({
    ticker, wiseSheetsRows, company, facts, filings, years,
    supplementalFacts: supplementalRecords, asOfDate, retrievedAt,
  })
  canonical.failures.push(...targeted.failures)
  if (!supplementalFacts) {
    const remainingPeriods = requiredSecCompletionPeriods(canonical, years)
    const initialKeys = new Set(requiredPeriods.map((item) => requiredPeriodKey(item)))
    const newlyIdentifiedPeriods = remainingPeriods.filter((item) => !initialKeys.has(requiredPeriodKey(item)))
    if (newlyIdentifiedPeriods.length) {
      const followUp = await loadTargeted(newlyIdentifiedPeriods)
      supplementalRecords = [...new Map([...supplementalRecords, ...followUp.records]
        .map((record) => [record.id, record])).values()]
      canonical = buildSecEnrichedFinancialsShadow({
        ticker, wiseSheetsRows, company, facts, filings, years,
        supplementalFacts: supplementalRecords, asOfDate, retrievedAt,
      })
      canonical.failures.push(...targeted.failures, ...followUp.failures)
      targeted.filings = [...new Map([...targeted.filings, ...followUp.filings]
        .map((filing) => [filing.accessionNumber ?? filing.filingUrl, filing])).values()]
    }
  }
  return { canonical, requiredPeriods, targetedFilings: targeted.filings }
}

export async function runSecFinancialsShadowComparison(tickers, years, options = {}) {
  const normalizedTickers = [...new Set(tickers.map((ticker) => String(ticker).trim().toUpperCase()).filter(Boolean))]
  const retrievedAt = options.retrievedAt ?? new Date().toISOString()
  const wiseSheetsRows = options.wiseSheetsRows ?? await fetchWiseSheetsCanonicalRows(normalizedTickers, options)
  const comparisons = []
  const companies = {}
  for (const ticker of normalizedTickers) {
    const company = options.companies?.[ticker] ?? await resolveCompany(ticker, options)
    if (!company) {
      const rows = unavailableRows(ticker, years, 'SEC_ISSUER_NOT_RESOLVED')
      comparisons.push(...rows)
      companies[ticker] = { company: null, comparisons: rows }
      continue
    }
    const facts = options.companyFacts?.[ticker] ?? await getCompanyFacts(company.cik, options)
    const filings = options.companyFilings?.[ticker] ?? await getCompanyFilings(company.cik, options)
    const tickerRows = wiseSheetsRows.filter((row) => String(row.ticker).toUpperCase() === ticker)
    const legacy = buildWiseSheetsHistorical(ticker, tickerRows, years)
    const production = await buildCanonicalHistoricalFinancials({
      ticker, wiseSheetsRows: tickerRows, company, facts, filings, years,
      supplementalFacts: options.supplementalFacts?.[ticker],
      additionalSupplementalFacts: options.additionalSupplementalFacts?.[ticker],
      asOfDate: options.asOfDate ?? '9999-12-31', retrievedAt,
      fetchSecText: options.fetchSecText,
      hydrateExhibits: options.hydrateExhibits,
      targetedSecTimeoutMs: options.targetedSecTimeoutMs,
      targetedCompletionLoader: options.targetedCompletionLoader,
    })
    const { canonical } = production
    const rows = compareSecFinancialsShadow(ticker, legacy, canonical, years)
    comparisons.push(...rows)
    companies[ticker] = { company, legacy, canonical, comparisons: rows, targetedFilings: production.targetedFilings }
  }
  return { comparisons, companies, summary: summarize(comparisons) }
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

export function renderSecFinancialsShadowReport(result, options = {}) {
  const lines = [
    '# Valuation Financials Shadow: WiseSheets + SEC Authority',
    '',
    `Generated: ${options.generatedAt ?? new Date().toISOString()}`,
    '',
    'Production values were not changed. WiseSheets remains the value source when it reconciles; SEC supplies authoritative periods, direct annuals, and missing observations. Free cash flow is derived from canonical operating cash flow less canonical capital expenditures.',
    '',
    '## Summary',
    '',
    '| Outcome | Cells |',
    '| --- | ---: |',
    `| MATCHING | ${result.summary.matching} |`,
    `| DIFFERENT | ${result.summary.different} |`,
    `| UNAVAILABLE | ${result.summary.unavailable} |`,
    `| STALE | ${result.summary.stale} |`,
    `| SEC_PERIOD_ENRICHED | ${result.summary.secPeriodEnriched} |`,
    `| SEC_VALUE_FILLED | ${result.summary.secValueFilled} |`,
    `| SEC_DIRECT_ANNUAL | ${result.summary.secDirectAnnual} |`,
    `| REQUIRES_REVIEW | ${result.summary.requiresReview} |`,
    `| DEFINITION_INCOMPATIBLE | ${result.summary.definitionIncompatible ?? 0} |`,
    `| INSUFFICIENT_COVERAGE | ${result.summary.insufficientCoverage ?? 0} |`,
    `| OPERATION_SCOPE_INCOMPATIBLE | ${result.summary.operationScopeIncompatible ?? 0} |`,
    '',
    '## Required hardening checks',
    '',
    '| Check | Value | Status / scope |',
    '| --- | ---: | --- |',
  ]
  const lookup = (ticker, metric, period) => result.comparisons.find((item) =>
    item.ticker === ticker && item.metric === metric && item.period === period)
  const nbisRows = result.comparisons.filter((item) => item.ticker === 'NBIS')
  const nbisLatest = nbisRows.map((item) => item.latestReportedPeriod).filter(Boolean).sort().at(-1) ?? null
  lines.push(`| NBIS latest reported period | ${reportText(nbisLatest)} | explicit SEC financial period |`)
  for (const year of [2023, 2024, 2025]) {
    const row = lookup('NBIS', 'operatingCashFlow', `${year}A`)
    lines.push(`| NBIS ${year} CFO | ${reportValue(row?.canonicalValue)} | ${reportText(row?.operationScope ?? row?.status)} |`)
  }
  const nbisGp = lookup('NBIS', 'grossProfit', '2025A')
  const nbisLtmRevenue = lookup('NBIS', 'revenue', 'LTM')
  const crwvFcf = lookup('CRWV', 'freeCashFlow', '2023A')
  lines.push(
    `| NBIS 2025 Gross Profit | ${reportValue(nbisGp?.canonicalValue)} | ${reportText(nbisGp?.status)} |`,
    `| NBIS LTM Revenue | ${reportValue(nbisLtmRevenue?.canonicalValue)} | ${reportText(nbisLtmRevenue?.status)} |`,
    `| CRWV 2023 Free Cash Flow | ${reportValue(crwvFcf?.canonicalValue)} | ${reportText(crwvFcf?.status)} |`,
    '',
    '## Exceptions',
    '',
    '| Ticker | Metric | Period | Status | Reason |',
    '| --- | --- | --- | --- | --- |',
  )
  for (const item of result.comparisons.filter((row) => ![
    HISTORICAL_RESULT_STATUS.VERIFIED_REPORTED,
    HISTORICAL_RESULT_STATUS.VERIFIED_DERIVED,
  ].includes(row.status))) {
    const detail = item.missingPeriods?.length ? `${item.reason}: ${JSON.stringify(item.missingPeriods)}` : item.reason
    lines.push(`| ${reportText(item.ticker)} | ${reportText(item.metric)} | ${reportText(item.period)} | ${reportText(item.status)} | ${reportText(detail)} |`)
  }
  lines.push(
    '',
    '## Cell Comparison',
    '',
    '| Ticker | Metric | Period | Legacy value | Canonical value | Classification | Status | Operation scope | Value source | Period evidence source | Latest reported period | Latest canonical quarter | Difference | Reason |',
    '| --- | --- | --- | ---: | ---: | --- | --- | --- | --- | --- | --- | --- | ---: | --- |',
  )
  for (const item of result.comparisons) {
    lines.push(`| ${reportText(item.ticker)} | ${reportText(item.metric)} | ${reportText(item.period)} | ${reportValue(item.legacyValue)} | ${reportValue(item.canonicalValue)} | ${reportText(item.classification)} | ${reportText(item.status)} | ${reportText(item.operationScope)} | ${reportText(item.valueSource)} | ${reportText(item.periodEvidenceSource)} | ${reportText(item.latestReportedPeriod)} | ${reportText(item.latestCanonicalQuarter)} | ${reportValue(item.difference)} | ${reportText(item.reason ?? (item.matching ? 'MATCH' : null))} |`)
  }
  return `${lines.join('\n')}\n`
}
