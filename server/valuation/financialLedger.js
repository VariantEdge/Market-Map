import { normalizeCumulativeQuarterlyFacts } from './calendarization.js'
import {
  METRIC_SOURCE_POLICY,
  createRawFinancialSourceLedger,
  preserveRawSourceLedger,
  selectMetricSourceFacts,
} from './sourceLedger.js'
import { HISTORICAL_VALIDATION_STATUS } from './issuerClassification.js'
import { applyEconomicSanityChecks } from './economicSanity.js'
import { buildCanonicalAdjustedEbitda } from './adjustedEbitdaEngine.js'

const DAY_MS = 24 * 60 * 60 * 1000
const RECONCILIATION_TOLERANCE = 0.001

export const HISTORICAL_STATUS = Object.freeze({
  EXACT: HISTORICAL_VALIDATION_STATUS.VERIFIED_REPORTED,
  RECONSTRUCTED: HISTORICAL_VALIDATION_STATUS.VERIFIED_DERIVED,
  DERIVED: HISTORICAL_VALIDATION_STATUS.VERIFIED_DERIVED,
  WARNING: HISTORICAL_VALIDATION_STATUS.REQUIRES_REVIEW,
  FAILED: HISTORICAL_VALIDATION_STATUS.MISMATCH,
  UNAVAILABLE: HISTORICAL_VALIDATION_STATUS.MISSING_BUT_AVAILABLE,
  MANUAL: HISTORICAL_VALIDATION_STATUS.VERIFIED_DERIVED,
  LEGITIMATE_NA: HISTORICAL_VALIDATION_STATUS.LEGITIMATE_NA,
  ETF_NOT_APPLICABLE: HISTORICAL_VALIDATION_STATUS.ETF_NOT_APPLICABLE,
  OUT_OF_SEC_SCOPE: HISTORICAL_VALIDATION_STATUS.OUT_OF_SEC_SCOPE,
})

export const METRIC_DEFINITIONS = Object.freeze({
  revenue: {
    label: 'Revenue',
    definition: 'Consolidated GAAP or IFRS revenue from continuing operations',
    tags: METRIC_SOURCE_POLICY.revenue.concepts,
  },
  grossProfit: {
    label: 'Gross Profit',
    definition: 'Reported gross profit; otherwise revenue less cost of revenue',
    tags: METRIC_SOURCE_POLICY.grossProfit.concepts,
    calculation: 'revenue - cost-of-revenue',
  },
  costOfRevenue: {
    label: 'Cost of Revenue',
    definition: 'Consolidated cost of revenue or cost of sales',
    tags: METRIC_SOURCE_POLICY.costOfRevenue.concepts,
  },
  operatingIncome: {
    label: 'Operating Income',
    definition: 'GAAP or IFRS operating income or loss',
    tags: METRIC_SOURCE_POLICY.operatingIncome.concepts,
  },
  depreciationAmortization: {
    label: 'Depreciation and Amortization',
    definition: 'Reported depreciation and amortization',
    tags: METRIC_SOURCE_POLICY.depreciationAmortization.concepts,
  },
  operatingCashFlow: {
    label: 'Cash Flow From Operations',
    definition: 'Net cash provided by or used in operating activities',
    tags: METRIC_SOURCE_POLICY.operatingCashFlow.concepts,
  },
  capitalExpenditures: {
    label: 'Capital Expenditures',
    definition: 'Cash purchases of property, plant and equipment under the standardized FCF policy',
    tags: METRIC_SOURCE_POLICY.capitalExpenditures.concepts,
  },
  freeCashFlow: {
    label: 'Free Cash Flow',
    definition: 'Cash flow from operations less cash capital expenditures',
    calculation: 'cash-flow-from-operations - capital-expenditures',
  },
  ebitda: {
    label: 'Adjusted EBITDA',
    definition: 'Company-defined Adjusted EBITDA from an SEC-filed non-GAAP reconciliation',
    calculation: 'company-reported-or-four-compatible-company-defined-quarters',
  },
})

function finite(value) {
  return value != null && Number.isFinite(Number(value))
}

function localDate(value) {
  if (!value) return null
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function daysInclusive(start, end) {
  return Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1
}

function closeEnough(left, right, tolerance = RECONCILIATION_TOLERANCE) {
  if (!finite(left) || !finite(right)) return false
  return Math.abs(Number(left) - Number(right)) <= Math.max(1, Math.abs(Number(left)), Math.abs(Number(right))) * tolerance
}

function selectedFactShape(record) {
  return {
    value: record.value,
    start: record.startDate,
    end: record.endDate,
    duration: record.durationDays,
    fiscalYear: record.fiscalYear,
    fiscalQuarter: record.fiscalPeriod,
    form: record.filingForm,
    filed: record.filingDate,
    accn: record.accessionNumber,
    frame: record.frame,
    tag: record.concept,
    namespace: record.namespace,
    unit: record.units,
    sourceUrl: record.filingUrl,
    validationStatus: record.validationStatus,
    selectionDecision: record.selectionDecision,
    restatedOrRecast: record.restatedOrRecast,
    alternatives: record.alternatives ?? [],
    sourceRecord: record,
  }
}

function sourceFromFact(fact, snapshot) {
  const raw = fact.sourceRecord ?? fact
  const sourceType = raw.rawSourceType === 'SEC_NON_GAAP_RECONCILIATION_TABLE'
    ? 'SEC-filed company non-GAAP reconciliation'
    : raw.rawSourceType === 'SEC_NON_GAAP_SUMMARY_TABLE'
      ? 'SEC-filed company non-GAAP summary'
      : raw.rawSourceType === 'SEC_INLINE_XBRL'
        ? 'SEC filed inline XBRL actual'
        : 'SEC filed actual'
  return {
    provider: 'SEC',
    sourceType,
    sourceUrl: raw.filingUrl ?? fact.sourceUrl ?? snapshot.companyFactsUrl,
    documentUrl: raw.filingUrl ?? fact.sourceUrl ?? snapshot.companyFactsUrl,
    documentHash: raw.provenance?.sourceHash ?? snapshot.documentHash,
    retrievalDate: raw.provenance?.retrievedAt ?? snapshot.retrievedAt,
    accessionNumber: raw.accessionNumber ?? fact.accn ?? null,
    filingForm: raw.filingForm ?? fact.form ?? null,
    filingDate: raw.filingDate ?? fact.filed ?? null,
    xbrlTag: raw.concept ?? fact.tag ?? null,
    namespace: raw.namespace ?? fact.namespace ?? null,
    sourceId: raw.provenance?.sourceId ?? null,
    dimensions: raw.segment ?? null,
    consolidated: !raw.segment,
    tableContext: raw.tableContext ?? null,
  }
}

function normalizeMetric(company, rawLedger, metric, snapshot) {
  const selected = selectMetricSourceFacts(rawLedger, metric)
  const normalized = normalizeCumulativeQuarterlyFacts(selected.map(selectedFactShape))
  const quarters = normalized.map((quarter) => {
    const exact = quarter.method === 'reported-quarter'
    const source = sourceFromFact(quarter, snapshot)
    const raw = quarter.sourceRecord ?? null
    const cumulativeInputs = quarter.cumulativeInputs ?? []
    const lineageFacts = cumulativeInputs.length ? cumulativeInputs : [quarter]
    return {
      company: company.name,
      ticker: company.ticker,
      cik: company.cik,
      metric,
      metricDefinition: METRIC_DEFINITIONS[metric]?.definition ?? metric,
      quarterStart: quarter.start,
      quarterEnd: quarter.end,
      days: quarter.duration ?? daysInclusive(localDate(quarter.start), localDate(quarter.end)),
      fiscalYear: quarter.fiscalYear,
      fiscalQuarter: quarter.fiscalQuarter,
      calendarYear: Number(quarter.end.slice(0, 4)),
      originalReportedValue: raw?.value ?? quarter.value,
      normalizedValue: Number(quarter.value),
      currency: quarter.unit ?? raw?.currency ?? 'USD',
      units: quarter.unit ?? raw?.units ?? 'USD',
      rawMetricLabel: quarter.tag ?? raw?.concept ?? null,
      source,
      exactness: exact ? 'REPORTED' : 'DERIVED',
      validationStatus: quarter.validationStatus === HISTORICAL_STATUS.WARNING
        ? HISTORICAL_STATUS.WARNING
        : exact ? HISTORICAL_STATUS.EXACT : HISTORICAL_STATUS.DERIVED,
      calculationLineage: {
        method: exact ? 'REPORTED_STANDALONE_QUARTER' : 'CUMULATIVE_YTD_SUBTRACTION',
        inputs: lineageFacts.map((input) => {
          const sourceRecord = input.sourceRecord ?? input
          return {
            sourceId: sourceRecord.provenance?.sourceId ?? source.sourceId,
            value: sourceRecord.value ?? input.value,
            start: sourceRecord.startDate ?? input.start,
            end: sourceRecord.endDate ?? input.end,
            accessionNumber: sourceRecord.accessionNumber ?? input.accn ?? source.accessionNumber,
          }
        }),
      },
      rawFacts: [...new Map(lineageFacts.flatMap((input) => {
        const sourceRecord = input.sourceRecord ?? input
        return [sourceRecord, ...(sourceRecord.alternatives ?? [])]
      }).filter(Boolean).map((item) => [item.id ?? `${item.startDate}:${item.endDate}:${item.value}`, item])).values()],
      warnings: raw?.restatedOrRecast
        ? [`Selected ${raw.accessionNumber} as the latest authoritative comparable/recast fact.`,
          ...(quarter.conceptBridge ? [`Equivalent standardized concept bridge: ${quarter.conceptBridge.from} to ${quarter.conceptBridge.to}.`] : [])]
        : quarter.conceptBridge
          ? [`Equivalent standardized concept bridge: ${quarter.conceptBridge.from} to ${quarter.conceptBridge.to}.`]
          : [],
      selectionDecision: raw?.selectionDecision ?? quarter.selectionDecision ?? null,
    }
  })
  const annual = selected.filter((fact) => fact.durationDays >= 330).map(selectedFactShape)
  return { quarters, annual, selected }
}

function byPeriod(records = []) {
  return new Map(records.map((record) => [`${record.quarterStart}:${record.quarterEnd}`, record]))
}

function derivedRecord(company, metric, definition, inputs, value, method, snapshot, extra = {}) {
  const first = inputs[0]
  const sourceIds = inputs.flatMap((input) => input.calculationLineage?.inputs?.map((item) => item.sourceId).filter(Boolean) ?? [])
  return {
    company: company.name,
    ticker: company.ticker,
    cik: company.cik,
    metric,
    metricDefinition: definition,
    quarterStart: first.quarterStart,
    quarterEnd: first.quarterEnd,
    days: first.days,
    fiscalYear: first.fiscalYear,
    fiscalQuarter: first.fiscalQuarter,
    calendarYear: first.calendarYear,
    originalReportedValue: null,
    normalizedValue: Number(value),
    currency: first.currency,
    units: first.units,
    rawMetricLabel: null,
    source: {
      provider: 'Derived from SEC filed actuals',
      sourceType: 'Derived SEC metric',
      sourceUrl: first.source.sourceUrl,
      documentUrl: first.source.documentUrl,
      documentHash: snapshot.documentHash,
      retrievalDate: snapshot.retrievedAt,
      sourceId: sourceIds.join('|') || null,
    },
    exactness: 'DERIVED',
    validationStatus: inputs.some((input) => input.validationStatus === HISTORICAL_STATUS.WARNING)
      ? HISTORICAL_STATUS.WARNING
      : HISTORICAL_STATUS.DERIVED,
    calculationLineage: {
      method,
      inputs: inputs.map((input) => ({
        metric: input.metric,
        value: input.normalizedValue,
        transformation: input.calculationLineage?.transformation ?? null,
        start: input.quarterStart,
        end: input.quarterEnd,
        accessionNumber: input.source.accessionNumber ?? null,
        sourceId: input.source.sourceId ?? null,
      })),
    },
    rawFacts: inputs.flatMap((input) => input.rawFacts ?? []),
    warnings: [...new Set(inputs.flatMap((input) => input.warnings ?? []))],
    ...extra,
  }
}

function derivePairedMetric(company, metric, left = [], right = [], operation, method, snapshot) {
  const rightByPeriod = byPeriod(right)
  return left.flatMap((leftRecord) => {
    const rightRecord = rightByPeriod.get(`${leftRecord.quarterStart}:${leftRecord.quarterEnd}`)
    if (!rightRecord) return []
    const value = operation(leftRecord.normalizedValue, rightRecord.normalizedValue)
    if (!finite(value)) return []
    return [derivedRecord(company, metric, METRIC_DEFINITIONS[metric]?.definition ?? metric,
      [leftRecord, rightRecord], value, method, snapshot)]
  })
}

function preferRecords(preferred = [], fallback = []) {
  const records = new Map(fallback.map((record) => [`${record.quarterStart}:${record.quarterEnd}`, record]))
  for (const record of preferred) records.set(`${record.quarterStart}:${record.quarterEnd}`, record)
  return [...records.values()].sort((left, right) => left.quarterEnd.localeCompare(right.quarterEnd))
}

function buildDepreciationAmortization(company, rawLedger, snapshot) {
  const combined = normalizeMetric(company, rawLedger, 'depreciationAmortization', snapshot)
  const depreciation = normalizeMetric(company, rawLedger, 'depreciation', snapshot)
  const amortization = normalizeMetric(company, rawLedger, 'amortization', snapshot)
  const summed = derivePairedMetric(company, 'depreciationAmortization', depreciation.quarters, amortization.quarters,
    (left, right) => Math.abs(left) + Math.abs(right), 'DEPRECIATION_PLUS_AMORTIZATION', snapshot)
  const depreciationOnly = depreciation.quarters.map((record) => derivedRecord(
    company,
    'depreciationAmortization',
    METRIC_DEFINITIONS.depreciationAmortization.definition,
    [record],
    Math.abs(record.normalizedValue),
    'DEPRECIATION_ONLY_NO_SEPARATE_AMORTIZATION_DISCLOSED',
    snapshot,
  ))
  return {
    quarters: preferRecords(combined.quarters, preferRecords(summed, depreciationOnly)),
    annual: combined.annual,
  }
}

function deriveAnnual(left = [], right = [], operation) {
  const rightByPeriod = new Map(right.map((record) => [`${record.start}:${record.end}`, record]))
  return left.flatMap((record) => {
    const other = rightByPeriod.get(`${record.start}:${record.end}`)
    return other && finite(record.value) && finite(other.value)
      ? [{ start: record.start, end: record.end, value: operation(record.value, other.value) }]
      : []
  })
}

function applyAnnualReconciliation(quarters, annual = []) {
  for (const annualRecord of annual) {
    const list = quarters
      .filter((quarter) => quarter.quarterStart >= annualRecord.start && quarter.quarterEnd <= annualRecord.end)
      .sort((left, right) => left.quarterEnd.localeCompare(right.quarterEnd))
    const contiguous = list.length === 4 && list[0].quarterStart === annualRecord.start && list.at(-1).quarterEnd === annualRecord.end &&
      list.every((quarter, index) => !index || localDate(quarter.quarterStart).getTime() - localDate(list[index - 1].quarterEnd).getTime() === DAY_MS)
    if (!contiguous) continue
    const sum = list.reduce((total, quarter) => total + quarter.normalizedValue, 0)
    const reconciles = closeEnough(sum, annualRecord.value)
    for (const quarter of list) {
      quarter.reconciliation = {
        annualValue: annualRecord.value,
        annualStart: annualRecord.start,
        annualEnd: annualRecord.end,
        annualTag: annualRecord.tag ?? null,
        annualAccessionNumber: annualRecord.accn ?? null,
        quarterSum: sum,
        reconciles,
        tolerance: RECONCILIATION_TOLERANCE,
        reason: reconciles ? null : 'POSSIBLE_SCOPE_MISMATCH',
      }
      if (!reconciles) {
        quarter.validationStatus = HISTORICAL_STATUS.FAILED
        quarter.warnings.push(`Quarter sum ${sum} does not reconcile to filed annual value ${annualRecord.value}.`)
      }
    }
  }
  return quarters
}

function componentProvenance(component) {
  return {
    sourceStart: component.quarterStart,
    sourceEnd: component.quarterEnd,
    sourceValue: component.normalizedValue,
    sourceUrl: component.source.sourceUrl,
    sourceId: component.source.sourceId,
    tag: component.rawMetricLabel,
    filed: component.source.filingDate,
    accn: component.source.accessionNumber,
    filingForm: component.source.filingForm,
    sourceType: component.source.sourceType,
    formula: component.calculationLineage.method,
    inputs: component.calculationLineage.inputs ?? [],
    adjustedEbitdaMethod: component.adjustedEbitdaMethod ?? null,
    adjustmentComponents: component.adjustmentComponents ?? [],
    rejectedAdjustments: component.rejectedAdjustments ?? [],
    reconciliation: component.reconciliation ?? null,
    candidateFacts: (component.rawFacts ?? []).map((fact) => ({
      value: fact.value,
      start: fact.startDate,
      end: fact.endDate,
      tag: fact.concept,
      namespace: fact.namespace,
      filingForm: fact.filingForm,
      filed: fact.filingDate,
      accn: fact.accessionNumber,
      sourceUrl: fact.filingUrl,
      selectionDecision: fact.selectionDecision ?? null,
    })),
    selectionDecision: component.selectionDecision ?? null,
  }
}

function isExactCalendarYearFact(fact, year) {
  return fact?.startDate === `${year}-01-01` && fact?.endDate === `${year}-12-31`
}

function rawFactComponent(fact, snapshot, metric = null, formula = 'SEC_REPORTED_CALENDAR_YEAR') {
  const source = sourceFromFact({ sourceRecord: fact }, snapshot)
  return {
    metric,
    sourceStart: fact.startDate,
    sourceEnd: fact.endDate,
    sourceValue: fact.value,
    sourceUrl: source.sourceUrl,
    sourceId: source.sourceId,
    tag: fact.concept,
    filed: source.filingDate,
    accn: source.accessionNumber,
    filingForm: source.filingForm,
    sourceType: source.sourceType,
    tableContext: source.tableContext,
    formula,
    selectionDecision: fact.selectionDecision ?? null,
  }
}

function shiftYear(value, years) {
  const [year, month, day] = String(value).split('-').map(Number)
  const shifted = new Date(year + years, month - 1, day, 12)
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}-${String(shifted.getDate()).padStart(2, '0')}`
}

function nextDay(value) {
  const date = localDate(value)
  date.setDate(date.getDate() + 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function calculateLtmFromAnnualAndYtd(metric, selectedFacts, snapshot) {
  const facts = [...(selectedFacts ?? [])]
    .filter((fact) => !fact.segment && finite(fact.value) && fact.startDate && fact.endDate)
  const annuals = facts
    .filter((fact) => fact.durationDays >= 330 && fact.durationDays <= 400)
    .sort((left, right) => right.endDate.localeCompare(left.endDate))

  for (const annual of annuals) {
    const currentPeriods = facts
      .filter((fact) => fact.startDate === nextDay(annual.endDate) && fact.durationDays >= 45 && fact.durationDays < 330)
      .sort((left, right) => right.endDate.localeCompare(left.endDate))
    for (const current of currentPeriods) {
      const priorStart = shiftYear(current.startDate, -1)
      const priorEnd = shiftYear(current.endDate, -1)
      const prior = facts.find((fact) => fact.startDate === priorStart && fact.endDate === priorEnd)
      if (!prior) continue
      const value = Number(annual.value) + Number(current.value) - Number(prior.value)
      if (!finite(value)) continue
      return {
        value,
        components: [
          rawFactComponent(annual, snapshot, metric, 'LTM_BASE_ANNUAL'),
          rawFactComponent(current, snapshot, metric, 'ADD_CURRENT_YTD'),
          rawFactComponent(prior, snapshot, metric, 'SUBTRACT_PRIOR_YTD'),
        ],
        sourceType: 'Derived from validated SEC-filed periods',
        sourceUrl: current.filingUrl ?? annual.filingUrl ?? snapshot.companyFactsUrl,
        validationStatus: HISTORICAL_VALIDATION_STATUS.VERIFIED_DERIVED,
        exactness: 'DERIVED',
        method: 'latest-sec-annual-plus-current-ytd-minus-prior-ytd',
        warnings: [],
      }
    }
  }
  return null
}

function selectedCalendarFact(rawLedger, metric, year) {
  return selectMetricSourceFacts(rawLedger, metric).find((fact) => isExactCalendarYearFact(fact, year)) ?? null
}

function exactAnnualActual(metric, value, facts, snapshot, method, {
  adjustedEbitdaMethod = null,
  adjustmentComponents = [],
  reported = false,
} = {}) {
  if (!finite(value) || !facts.length) return null
  const unresolved = facts.some((fact) => fact.validationStatus !== HISTORICAL_STATUS.EXACT)
  const firstSource = sourceFromFact({ sourceRecord: facts[0] }, snapshot)
  return {
    value: unresolved ? null : Number(value),
    components: facts.map((fact) => rawFactComponent(fact, snapshot, metric)),
    sourceType: unresolved ? 'SEC source requires review' : 'SEC-filed exact calendar-year actual',
    provider: 'SEC',
    confidence: unresolved ? null : 'High',
    definition: METRIC_DEFINITIONS[metric]?.definition ?? metric,
    exactness: unresolved ? null : reported ? 'REPORTED' : 'DERIVED',
    validationStatus: unresolved ? HISTORICAL_STATUS.WARNING : reported ? HISTORICAL_STATUS.EXACT : HISTORICAL_STATUS.DERIVED,
    method: unresolved ? 'SOURCE_REQUIRES_REVIEW' : method,
    adjustedEbitdaMethod,
    adjustmentComponents,
    sourceUrl: firstSource.sourceUrl,
    documentHash: firstSource.documentHash,
    retrievedAt: firstSource.retrievalDate,
    warnings: unresolved ? ['The exact calendar-year SEC facts require source review.'] : [],
  }
}

function buildExactCalendarAnnualFallbacks(rawLedger, years, snapshot) {
  const output = Object.fromEntries([
    'revenue', 'grossProfit', 'operatingCashFlow', 'capitalExpenditures', 'ebitda', 'freeCashFlow',
  ].map((metric) => [metric, {}]))

  for (const year of years) {
    const revenue = selectedCalendarFact(rawLedger, 'revenue', year)
    const grossProfit = selectedCalendarFact(rawLedger, 'grossProfit', year)
    const costOfRevenue = selectedCalendarFact(rawLedger, 'costOfRevenue', year)
    const operatingCashFlow = selectedCalendarFact(rawLedger, 'operatingCashFlow', year)
    const capitalExpenditures = selectedCalendarFact(rawLedger, 'capitalExpenditures', year)

    if (revenue) output.revenue[year] = exactAnnualActual(
      'revenue', revenue.value, [revenue], snapshot, 'CALENDAR_YEAR_REPORTED', { reported: true })
    const directGrossProfit = grossProfit
      ? exactAnnualActual('grossProfit', grossProfit.value, [grossProfit], snapshot, 'CALENDAR_YEAR_REPORTED', { reported: true })
      : null
    if (directGrossProfit?.validationStatus === HISTORICAL_STATUS.EXACT) {
      output.grossProfit[year] = directGrossProfit
    } else if (revenue && costOfRevenue) {
      output.grossProfit[year] = exactAnnualActual(
        'grossProfit', revenue.value - Math.abs(costOfRevenue.value), [revenue, costOfRevenue], snapshot,
        'CALENDAR_YEAR_REVENUE_MINUS_COST_OF_REVENUE')
    } else if (directGrossProfit) {
      output.grossProfit[year] = directGrossProfit
    }
    if (operatingCashFlow) output.operatingCashFlow[year] = exactAnnualActual(
      'operatingCashFlow', operatingCashFlow.value, [operatingCashFlow], snapshot, 'CALENDAR_YEAR_REPORTED', { reported: true })
    if (capitalExpenditures) output.capitalExpenditures[year] = exactAnnualActual(
      'capitalExpenditures', Math.abs(capitalExpenditures.value), [capitalExpenditures], snapshot,
      'CALENDAR_YEAR_REPORTED', { reported: true })
    if (operatingCashFlow && capitalExpenditures) output.freeCashFlow[year] = exactAnnualActual(
      'freeCashFlow', operatingCashFlow.value - Math.abs(capitalExpenditures.value),
      [operatingCashFlow, capitalExpenditures], snapshot, 'CALENDAR_YEAR_CFO_MINUS_CAPEX')

  }
  return output
}

function calendarizeMetric(metric, records, years, fallbackStatus = HISTORICAL_STATUS.UNAVAILABLE, exactAnnuals = {}) {
  return Object.fromEntries(years.map((year) => {
    const components = records.filter((record) => record.calendarYear === year)
    const invalid = components.some((record) => record.validationStatus === HISTORICAL_STATUS.FAILED || record.validationStatus === HISTORICAL_STATUS.WARNING)
    const hasCoverage = components.length === 4 && new Set(components.map((record) => record.quarterEnd)).size === 4
    if (!hasCoverage || invalid) {
      if (exactAnnuals[year] && [HISTORICAL_STATUS.EXACT, HISTORICAL_STATUS.DERIVED].includes(exactAnnuals[year].validationStatus)) {
        return [year, exactAnnuals[year]]
      }
      return [year, {
        value: null,
        components: components.map(componentProvenance),
        sourceType: components.length ? 'SEC source requires review' : 'Unavailable',
        confidence: null,
        definition: METRIC_DEFINITIONS[metric]?.definition ?? metric,
        exactness: null,
        validationStatus: invalid ? HISTORICAL_STATUS.WARNING : fallbackStatus,
        method: invalid
          ? 'SOURCE_OR_RECONCILIATION_REQUIRES_REVIEW'
          : components.length
            ? 'PARTIAL_STANDALONE_QUARTER_COVERAGE'
            : metric === 'freeCashFlow'
                ? 'INCOMPLETE_CFO_OR_CAPEX_COMPONENTS'
                : 'NO_COMPATIBLE_CONSOLIDATED_SEC_FACTS',
        warnings: invalid
          ? [...new Set(components.flatMap((record) => record.warnings))]
          : ['Four validated standalone quarters ending in this calendar year are unavailable.'],
      }]
    }
    const first = components[0]
    return [year, {
      value: components.reduce((total, component) => total + component.normalizedValue, 0),
      components: components.map(componentProvenance),
      sourceType: 'Derived from validated SEC-filed quarters',
      provider: 'SEC',
      confidence: 'High',
      definition: METRIC_DEFINITIONS[metric]?.definition ?? metric,
      exactness: 'DERIVED',
      validationStatus: HISTORICAL_STATUS.DERIVED,
      method: 'CALENDAR_YEAR_DERIVED',
      adjustedEbitdaMethod: null,
      sourceUrl: first.source.sourceUrl,
      documentHash: first.source.documentHash,
      retrievedAt: first.source.retrievalDate,
      warnings: [...new Set(components.flatMap((record) => record.warnings))],
    }]
  }))
}

export async function buildCanonicalQuarterlyLedger({
  company,
  facts,
  years,
  filingIndex = null,
  supplementalRawFacts = [],
  fallbackStatus = HISTORICAL_STATUS.UNAVAILABLE,
  includeAdjustedEbitda = true,
}) {
  const companyFactsRecords = createRawFinancialSourceLedger({ company, facts, filingIndex })
  const rawLedger = [...companyFactsRecords, ...supplementalRawFacts]
  const snapshot = await preserveRawSourceLedger(company, rawLedger, {
    retrievedAt: filingIndex?.retrievedAt ?? new Date().toISOString(),
    filingIndexHash: filingIndex?.sourceHash ?? null,
  })
  snapshot.companyFactsUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(company.cik).padStart(10, '0')}.json`

  const revenue = normalizeMetric(company, rawLedger, 'revenue', snapshot)
  const grossProfitDirect = normalizeMetric(company, rawLedger, 'grossProfit', snapshot)
  const costOfRevenue = normalizeMetric(company, rawLedger, 'costOfRevenue', snapshot)
  const operatingCashFlow = normalizeMetric(company, rawLedger, 'operatingCashFlow', snapshot)
  const capitalExpenditures = normalizeMetric(company, rawLedger, 'capitalExpenditures', snapshot)

  const grossProfitDerived = derivePairedMetric(company, 'grossProfit', revenue.quarters, costOfRevenue.quarters,
    (left, right) => left - Math.abs(right), 'REVENUE_MINUS_COST_OF_REVENUE', snapshot)
  const grossProfit = preferRecords(grossProfitDirect.quarters, grossProfitDerived)
  const freeCashFlow = derivePairedMetric(company, 'freeCashFlow', operatingCashFlow.quarters, capitalExpenditures.quarters,
    (left, right) => left - Math.abs(right), 'CFO_MINUS_CAPEX', snapshot)

  const adjustedEbitda = includeAdjustedEbitda
    ? buildCanonicalAdjustedEbitda({ company, rawLedger, years })
    : {
        quarters: [],
        calendarActuals: Object.fromEntries(years.map((year) => [year, {
          value: null,
          components: [],
          sourceType: 'Unavailable',
          validationStatus: fallbackStatus,
          method: 'ADJUSTED_EBITDA_EXCLUDED_FROM_FORWARD_BASIS_BUILD',
          warnings: [],
        }])),
        ltm: null,
      }

  const grossProfitAnnual = grossProfitDirect.annual.length
    ? grossProfitDirect.annual
    : deriveAnnual(revenue.annual, costOfRevenue.annual, (left, right) => left - Math.abs(right))
  const freeCashFlowAnnual = deriveAnnual(operatingCashFlow.annual, capitalExpenditures.annual,
    (left, right) => left - Math.abs(right))

  const ledger = {
    revenue: applyAnnualReconciliation(revenue.quarters, revenue.annual),
    grossProfit: applyAnnualReconciliation(grossProfit, grossProfitAnnual),
    operatingCashFlow: applyAnnualReconciliation(operatingCashFlow.quarters, operatingCashFlow.annual),
    capitalExpenditures: applyAnnualReconciliation(capitalExpenditures.quarters, capitalExpenditures.annual),
    ebitda: adjustedEbitda.quarters,
    freeCashFlow: applyAnnualReconciliation(freeCashFlow, freeCashFlowAnnual),
  }
  const exactCalendarAnnuals = buildExactCalendarAnnualFallbacks(rawLedger, years, snapshot)
  const ltmFallbacks = {
    revenue: calculateLtmFromAnnualAndYtd('revenue', revenue.selected, snapshot),
    grossProfit: calculateLtmFromAnnualAndYtd('grossProfit', grossProfitDirect.selected, snapshot),
  }
  const calendarActuals = Object.fromEntries(Object.entries(ledger)
    .filter(([metric]) => metric !== 'ebitda')
    .map(([metric, records]) =>
    [metric, calendarizeMetric(metric, records, years, fallbackStatus, exactCalendarAnnuals[metric])]))
  calendarActuals.ebitda = adjustedEbitda.calendarActuals
  applyEconomicSanityChecks(calendarActuals)
  const values = Object.values(calendarActuals).flatMap((byYear) => Object.values(byYear))
  const summary = Object.fromEntries(Object.values(HISTORICAL_VALIDATION_STATUS)
    .map((status) => [status, values.filter((entry) => entry.validationStatus === status).length]))
  return { snapshot, rawLedger, ledger, calendarActuals, adjustedEbitda, ltmFallbacks, summary }
}
