import { ADJUSTED_EBITDA_METHOD } from './sourceLedger.js'
import { HISTORICAL_VALIDATION_STATUS } from './issuerClassification.js'
import { createHash } from 'node:crypto'

const DAY_MS = 24 * 60 * 60 * 1000
const ALLOWED_FORMS = new Set([
  '10-K', '10-K/A', '10-Q', '10-Q/A', '8-K', '8-K/A',
  '20-F', '20-F/A', '40-F', '40-F/A', '6-K',
  'S-1', 'S-1/A', 'F-1', 'F-1/A', '10', '10/A', '10-12B', '10-12B/A',
])

export const ADJUSTED_EBITDA_PERIOD = Object.freeze({
  QUARTER: 'QUARTER',
  FISCAL_YEAR: 'FISCAL_YEAR',
  CALENDAR_YEAR: 'CALENDAR_YEAR',
  YTD_6M: 'YTD_6M',
  YTD_9M: 'YTD_9M',
  LTM: 'LTM',
})

function finite(value) {
  return value != null && Number.isFinite(Number(value))
}

function dateMs(value) {
  const time = new Date(`${value}T12:00:00`).getTime()
  return Number.isFinite(time) ? time : null
}

function daysInclusive(start, end) {
  return Math.round((dateMs(end) - dateMs(start)) / DAY_MS) + 1
}

function isContiguous(records) {
  return records.every((record, index) => !index ||
    dateMs(record.startDate) - dateMs(records[index - 1].endDate) === DAY_MS)
}

function eligibleFact(record) {
  return record?.metricCandidates?.includes('adjustedEbitda') &&
    record.rawSourceType === 'SEC_NON_GAAP_RECONCILIATION_TABLE' &&
    record.structuralIntegrity?.valid === true &&
    record.structuralIntegrity?.mapping === 'EXPLICIT_TABLE_GRID' &&
    record.tableContext?.tableTitle && record.tableContext?.rowLabel && record.tableContext?.columnLabel &&
    record.tableContext?.rawCellValue != null &&
    record.provenance?.sourceId && record.provenance?.sourceHash &&
    record.filingUrl && record.accessionNumber && ALLOWED_FORMS.has(String(record.filingForm ?? '').toUpperCase()) &&
    record.periodType && record.startDate && record.endDate &&
    record.reportedUnits && finite(record.reportedScale) && finite(record.rawReportedValue) &&
    /^[A-Z]{3}$/.test(String(record.currency ?? '')) &&
    finite(record.value) && !record.segment
}

function factPeriodKey(record) {
  return `${record.periodType}:${record.startDate}:${record.endDate}`
}

function normalizedDefinitionTerms(fact) {
  const ignored = /^(?:adjusted ebitda|adjusted net profit|revenue|net (?:income|loss|profit)|q[1-4]'?\d{2}|three months ended)/i
  return new Set((fact.tableContext?.rowLabels ?? [])
    .map((label) => String(label).toLowerCase()
      .replace(/\b(?:add back|add|less|deduct)\s*:?/g, '')
      .replace(/\b(?:expense|expenses|income|loss|gain|provision|benefit|net)\b/g, '')
      .replace(/[^a-z]+/g, ' ').trim())
    .filter((label) => label && !ignored.test(label)))
}

function definitionsCompatible(facts) {
  if (facts.length < 2) return true
  if (new Set(facts.map((fact) => fact.definitionFingerprint)).size === 1) return true
  const sets = facts.map(normalizedDefinitionTerms)
  return sets.every((right, index) => {
    if (!index) return true
    const left = sets[index - 1]
    if (left.size < 12 || right.size < 12) return false
    const intersection = [...left].filter((term) => right.has(term)).length
    return intersection / Math.min(left.size, right.size) >= 0.85
  })
}

function combinedDefinitionFingerprint(facts) {
  const fingerprints = [...new Set(facts.map((fact) => fact.definitionFingerprint))].sort()
  return fingerprints.length === 1
    ? fingerprints[0]
    : createHash('sha256').update(fingerprints.join(':')).digest('hex')
}

function selectAuthoritativeFacts(rawLedger) {
  const grouped = new Map()
  for (const record of rawLedger.filter(eligibleFact)) {
    const key = factPeriodKey(record)
    const candidates = grouped.get(key) ?? []
    candidates.push(record)
    grouped.set(key, candidates)
  }

  const selected = []
  const rejected = []
  for (const [periodKey, candidates] of grouped) {
    const isAnnual = candidates[0]?.periodType === ADJUSTED_EBITDA_PERIOD.CALENDAR_YEAR ||
      candidates[0]?.periodType === ADJUSTED_EBITDA_PERIOD.FISCAL_YEAR
    const isConsolidatedSegmentTotal = candidates.some((candidate) =>
      /^total segment adjusted ebitda (?:loss|profit)$/i.test(String(candidate.tableContext?.rowLabel ?? '').trim()))
    candidates.sort((left, right) => {
      if (isAnnual) {
        if (isConsolidatedSegmentTotal) {
          return String(right.filingDate ?? '').localeCompare(String(left.filingDate ?? '')) ||
            String(right.accessionNumber ?? '').localeCompare(String(left.accessionNumber ?? ''))
        }
        return Number(left.reportedScale) - Number(right.reportedScale) ||
          String(left.filingDate ?? '').localeCompare(String(right.filingDate ?? '')) ||
          String(left.accessionNumber ?? '').localeCompare(String(right.accessionNumber ?? ''))
      }
      return String(right.filingDate ?? '').localeCompare(String(left.filingDate ?? '')) ||
        String(right.accessionNumber ?? '').localeCompare(String(left.accessionNumber ?? ''))
    })
    selected.push({
      ...candidates[0],
      alternativeCandidates: candidates.slice(1),
      selectionDecision: candidates.length > 1
        ? isAnnual ? 'MOST_PRECISE_CONTEMPORANEOUS_SEC_DISCLOSURE' : 'LATEST_SEC_FILED_QUARTERLY_DISCLOSURE'
        : 'ONLY_ELIGIBLE_SEC_RECONCILIATION_VALUE',
    })
  }
  return { selected, rejected }
}

function component(fact) {
  return {
    sourceStart: fact.startDate,
    sourceEnd: fact.endDate,
    sourcePeriodType: fact.periodType,
    sourcePeriodBasis: fact.periodBasis,
    sourceValue: Number(fact.value),
    sourceUrl: fact.filingUrl,
    sourceId: fact.provenance.sourceId,
    documentHash: fact.provenance.sourceHash,
    tag: fact.label,
    exactCompanyMetricLabel: fact.tableContext.rowLabel,
    filed: fact.filingDate,
    accn: fact.accessionNumber,
    filingForm: fact.filingForm,
    document: fact.filingUrl.split('/').at(-1),
    sourceType: 'SEC-filed company non-GAAP reconciliation',
    tableTitle: fact.tableContext.tableTitle,
    tableIndex: fact.tableContext.tableIndex,
    rowIndex: fact.tableContext.rowIndex,
    columnIndex: fact.tableContext.columnIndex,
    rowLabel: fact.tableContext.rowLabel,
    columnLabel: fact.tableContext.columnLabel,
    tableContext: fact.tableContext,
    rawCellValue: fact.tableContext.rawCellValue,
    rawReportedValue: fact.rawReportedValue,
    reportedScale: fact.reportedScale,
    reportedUnits: fact.reportedUnits,
    normalizedValue: Number(fact.value),
    definitionFingerprint: fact.definitionFingerprint,
    adjustedEbitdaMethod: ADJUSTED_EBITDA_METHOD.COMPANY_REPORTED,
    selectionDecision: fact.selectionDecision,
  }
}

function identityPayload(entry) {
  return {
    metric: 'COMPANY_DEFINED_ADJUSTED_EBITDA',
    value: Number(entry.value),
    requestedPeriodType: entry.requestedPeriodType,
    method: entry.adjustedEbitdaMethod,
    definitionFingerprint: entry.definitionFingerprint,
    components: (entry.components ?? []).map((item) => ({
      sourceId: item.sourceId,
      accession: item.accn,
      documentHash: item.documentHash,
      sourceStart: item.sourceStart,
      sourceEnd: item.sourceEnd,
      sourcePeriodType: item.sourcePeriodType,
      rawReportedValue: item.rawReportedValue,
      reportedUnits: item.reportedUnits,
      normalizedValue: item.normalizedValue,
      rowLabel: item.rowLabel,
      columnLabel: item.columnLabel,
    })),
  }
}

export function adjustedEbitdaDenominatorIdentity(entry) {
  if (entry?.value == null) return null
  return createHash('sha256').update(JSON.stringify(identityPayload(entry))).digest('hex')
}

function withDenominatorIdentity(entry) {
  return { ...entry, denominatorIdentity: adjustedEbitdaDenominatorIdentity(entry) }
}

function quarterRecord(company, fact) {
  const sourceComponent = component(fact)
  return {
    company: company.name,
    ticker: company.ticker,
    cik: company.cik,
    metric: 'ebitda',
    metricDefinition: 'Company-defined Adjusted EBITDA',
    periodType: ADJUSTED_EBITDA_PERIOD.QUARTER,
    periodBasis: fact.periodBasis,
    quarterStart: fact.startDate,
    quarterEnd: fact.endDate,
    days: daysInclusive(fact.startDate, fact.endDate),
    fiscalYear: fact.fiscalYear,
    fiscalQuarter: fact.fiscalPeriod,
    calendarYear: Number(fact.endDate.slice(0, 4)),
    originalReportedValue: Number(fact.value),
    normalizedValue: Number(fact.value),
    currency: fact.currency,
    units: fact.units,
    rawMetricLabel: fact.tableContext.rowLabel,
    source: {
      provider: 'SEC',
      sourceType: 'SEC-filed company non-GAAP reconciliation',
      sourceUrl: fact.filingUrl,
      documentUrl: fact.filingUrl,
      documentHash: fact.provenance.sourceHash,
      retrievalDate: fact.provenance.retrievedAt,
      accessionNumber: fact.accessionNumber,
      filingForm: fact.filingForm,
      filingDate: fact.filingDate,
      sourceId: fact.provenance.sourceId,
      tableContext: fact.tableContext,
    },
    exactness: 'REPORTED',
    validationStatus: HISTORICAL_VALIDATION_STATUS.VERIFIED_REPORTED,
    adjustedEbitdaMethod: ADJUSTED_EBITDA_METHOD.COMPANY_REPORTED,
    definitionFingerprint: fact.definitionFingerprint,
    calculationLineage: {
      method: ADJUSTED_EBITDA_METHOD.COMPANY_REPORTED,
      inputs: [sourceComponent],
    },
    rawFacts: [fact],
    warnings: [],
    selectionDecision: fact.selectionDecision,
  }
}

function unavailableStatus(reason, components, evidenceExists) {
  if (reason === 'DEFINITION_INCOMPATIBLE') return 'DEFINITION_INCOMPATIBLE'
  if (reason === 'CURRENCY_INCOMPATIBLE') return HISTORICAL_VALIDATION_STATUS.REQUIRES_REVIEW
  if (/UNAVAILABLE|NOT_CONTIGUOUS/.test(reason)) {
    return evidenceExists || components.length
      ? 'INSUFFICIENT_PERIOD_COVERAGE'
      : 'NOT_REPORTED'
  }
  return 'MISSING_SOURCE_DATA'
}

function unavailable(reason, components = [], evidenceExists = components.length > 0) {
  return {
    value: null,
    components,
    sourceType: 'Unavailable',
    provider: 'SEC',
    confidence: null,
    definition: 'Company-defined Adjusted EBITDA',
    exactness: null,
    validationStatus: unavailableStatus(reason, components, evidenceExists),
    method: reason,
    adjustedEbitdaMethod: null,
    warnings: [reason],
  }
}

function directCalendarYearEntry(fact) {
  const sourceComponent = component(fact)
  return withDenominatorIdentity({
    value: Number(fact.value),
    components: [sourceComponent],
    sourceType: 'SEC-filed company non-GAAP reconciliation',
    provider: 'SEC',
    confidence: 'High',
    definition: 'Company-defined Adjusted EBITDA',
    exactness: 'REPORTED',
    validationStatus: HISTORICAL_VALIDATION_STATUS.VERIFIED_REPORTED,
    method: ADJUSTED_EBITDA_METHOD.COMPANY_REPORTED,
    adjustedEbitdaMethod: ADJUSTED_EBITDA_METHOD.COMPANY_REPORTED,
    definitionFingerprint: fact.definitionFingerprint,
    sourceUrl: fact.filingUrl,
    documentHash: fact.provenance.sourceHash,
    retrievedAt: fact.provenance.retrievedAt,
    requestedPeriodType: ADJUSTED_EBITDA_PERIOD.CALENDAR_YEAR,
    sourcePeriodType: fact.periodType,
    verificationBasis: 'STRUCTURAL_SEC_TABLE_CELL_PROVENANCE',
    warnings: [],
  })
}

function expectedCalendarQuarterRange(year, quarter) {
  const starts = [`${year}-01-01`, `${year}-04-01`, `${year}-07-01`, `${year}-10-01`]
  const ends = [`${year}-03-31`, `${year}-06-30`, `${year}-09-30`, `${year}-12-31`]
  return { startDate: starts[quarter - 1], endDate: ends[quarter - 1] }
}

function derivedCalendarYearEntry(year, facts) {
  const quarters = []
  for (let quarter = 1; quarter <= 4; quarter += 1) {
    const expected = expectedCalendarQuarterRange(year, quarter)
    const matches = facts.filter((fact) => fact.periodType === ADJUSTED_EBITDA_PERIOD.QUARTER &&
      fact.startDate === expected.startDate && fact.endDate === expected.endDate)
    if (matches.length !== 1) {
      return unavailable('FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE', matches.map(component), facts.length > 0)
    }
    quarters.push(matches[0])
  }
  const currencies = new Set(quarters.map((fact) => fact.currency))
  if (!definitionsCompatible(quarters)) return unavailable('DEFINITION_INCOMPATIBLE', quarters.map(component))
  if (currencies.size !== 1) return unavailable('CURRENCY_INCOMPATIBLE', quarters.map(component))
  return withDenominatorIdentity({
    value: quarters.reduce((sum, fact) => sum + Number(fact.value), 0),
    components: quarters.map(component),
    sourceType: 'Derived from four validated SEC-filed company-defined quarters',
    provider: 'SEC',
    confidence: 'High',
    definition: 'Company-defined Adjusted EBITDA',
    exactness: 'DERIVED',
    validationStatus: HISTORICAL_VALIDATION_STATUS.VERIFIED_DERIVED,
    method: ADJUSTED_EBITDA_METHOD.COMPANY_DEFINED_DERIVED,
    adjustedEbitdaMethod: ADJUSTED_EBITDA_METHOD.COMPANY_DEFINED_DERIVED,
    definitionFingerprint: combinedDefinitionFingerprint(quarters),
    compatibleDefinitionFingerprints: [...new Set(quarters.map((fact) => fact.definitionFingerprint))],
    sourceUrl: quarters.at(-1).filingUrl,
    documentHash: quarters.at(-1).provenance.sourceHash,
    retrievedAt: quarters.at(-1).provenance.retrievedAt,
    requestedPeriodType: ADJUSTED_EBITDA_PERIOD.CALENDAR_YEAR,
    sourcePeriodType: ADJUSTED_EBITDA_PERIOD.QUARTER,
    derivation: 'SUM_OF_FOUR_EXACT_CALENDAR_QUARTERS',
    verificationBasis: 'STRUCTURAL_SEC_TABLE_CELL_PROVENANCE',
    warnings: [],
  })
}

function ltmEntry(facts) {
  const quarters = facts.filter((fact) => fact.periodType === ADJUSTED_EBITDA_PERIOD.QUARTER)
    .sort((left, right) => left.endDate.localeCompare(right.endDate))
    .slice(-4)
  if (quarters.length !== 4) {
    return unavailable('FOUR_STANDALONE_QUARTERS_UNAVAILABLE', quarters.map(component), facts.length > 0)
  }
  if (!isContiguous(quarters)) return unavailable('LTM_QUARTERS_NOT_CONTIGUOUS', quarters.map(component))
  if (!definitionsCompatible(quarters)) {
    return unavailable('DEFINITION_INCOMPATIBLE', quarters.map(component))
  }
  if (new Set(quarters.map((fact) => fact.currency)).size !== 1) {
    return unavailable('CURRENCY_INCOMPATIBLE', quarters.map(component))
  }
  return withDenominatorIdentity({
    value: quarters.reduce((sum, fact) => sum + Number(fact.value), 0),
    components: quarters.map(component),
    sourceType: 'Derived from four validated SEC-filed company-defined quarters',
    provider: 'SEC',
    confidence: 'High',
    definition: 'Company-defined Adjusted EBITDA',
    exactness: 'DERIVED',
    validationStatus: HISTORICAL_VALIDATION_STATUS.VERIFIED_DERIVED,
    method: ADJUSTED_EBITDA_METHOD.COMPANY_DEFINED_DERIVED,
    adjustedEbitdaMethod: ADJUSTED_EBITDA_METHOD.COMPANY_DEFINED_DERIVED,
    definitionFingerprint: combinedDefinitionFingerprint(quarters),
    compatibleDefinitionFingerprints: [...new Set(quarters.map((fact) => fact.definitionFingerprint))],
    sourceUrl: quarters.at(-1).filingUrl,
    documentHash: quarters.at(-1).provenance.sourceHash,
    retrievedAt: quarters.at(-1).provenance.retrievedAt,
    requestedPeriodType: ADJUSTED_EBITDA_PERIOD.LTM,
    sourcePeriodType: ADJUSTED_EBITDA_PERIOD.QUARTER,
    derivation: 'SUM_OF_LATEST_FOUR_COMPATIBLE_STANDALONE_QUARTERS',
    verificationBasis: 'STRUCTURAL_SEC_TABLE_CELL_PROVENANCE',
    warnings: [],
  })
}

export function buildCanonicalAdjustedEbitda({ company, rawLedger, years }) {
  const { selected, rejected } = selectAuthoritativeFacts(rawLedger)
  const quarters = selected
    .filter((fact) => fact.periodType === ADJUSTED_EBITDA_PERIOD.QUARTER)
    .map((fact) => quarterRecord(company, fact))
  const calendarActuals = Object.fromEntries(years.map((year) => {
    const direct = selected.find((fact) => fact.periodType === ADJUSTED_EBITDA_PERIOD.CALENDAR_YEAR &&
      fact.startDate === `${year}-01-01` && fact.endDate === `${year}-12-31`)
    return [year, direct ? directCalendarYearEntry(direct) : derivedCalendarYearEntry(year, selected)]
  }))
  return {
    quarters,
    calendarActuals,
    ltm: ltmEntry(selected),
    selectedFacts: selected,
    rejectedFacts: rejected,
  }
}

export function assertCanonicalAdjustedEbitdaEntry(entry, requestedPeriodType) {
  if (entry?.value == null) return true
  if (![ADJUSTED_EBITDA_METHOD.COMPANY_REPORTED, ADJUSTED_EBITDA_METHOD.COMPANY_DEFINED_DERIVED]
    .includes(entry.adjustedEbitdaMethod)) throw new Error('Displayed Adjusted EBITDA uses a forbidden method.')
  if (entry.requestedPeriodType && entry.requestedPeriodType !== requestedPeriodType) {
    throw new Error(`Adjusted EBITDA requested period ${requestedPeriodType} received ${entry.requestedPeriodType}.`)
  }
  if (!entry.components?.length || entry.components.some((item) =>
    !item.sourceUrl || !item.sourceId || !item.documentHash || !item.accn || !item.document ||
    !item.filingForm || !item.tableTitle || item.tableIndex == null || item.rowIndex == null ||
    item.columnIndex == null || !item.rowLabel || !item.columnLabel || item.rawCellValue == null ||
    !finite(item.rawReportedValue) || !finite(item.reportedScale) || !item.reportedUnits ||
    !finite(item.normalizedValue) || !item.definitionFingerprint ||
    item.sourceType !== 'SEC-filed company non-GAAP reconciliation')) {
    throw new Error('Displayed Adjusted EBITDA lacks SEC row/column provenance.')
  }
  if (entry.components.some((item) => item.adjustedEbitdaMethod !== ADJUSTED_EBITDA_METHOD.COMPANY_REPORTED)) {
    throw new Error('Adjusted EBITDA component is not company-reported.')
  }
  const compatibleFingerprints = new Set(entry.compatibleDefinitionFingerprints ?? [entry.definitionFingerprint])
  if (entry.components.some((item) => !compatibleFingerprints.has(item.definitionFingerprint))) {
    throw new Error('Adjusted EBITDA component definition does not match the displayed metric definition.')
  }
  if (requestedPeriodType === ADJUSTED_EBITDA_PERIOD.CALENDAR_YEAR) {
    if (entry.adjustedEbitdaMethod === ADJUSTED_EBITDA_METHOD.COMPANY_REPORTED &&
        (entry.components.length !== 1 || entry.components[0].sourcePeriodType !== ADJUSTED_EBITDA_PERIOD.CALENDAR_YEAR)) {
      throw new Error('Direct calendar-year Adjusted EBITDA must come from one exact calendar-year source cell.')
    }
    if (entry.adjustedEbitdaMethod === ADJUSTED_EBITDA_METHOD.COMPANY_DEFINED_DERIVED &&
        (entry.derivation !== 'SUM_OF_FOUR_EXACT_CALENDAR_QUARTERS' || entry.components.length !== 4 ||
         entry.components.some((item) => item.sourcePeriodType !== ADJUSTED_EBITDA_PERIOD.QUARTER))) {
      throw new Error('Derived calendar-year Adjusted EBITDA must use four exact calendar quarters.')
    }
  }
  if (requestedPeriodType === ADJUSTED_EBITDA_PERIOD.LTM &&
      (entry.adjustedEbitdaMethod !== ADJUSTED_EBITDA_METHOD.COMPANY_DEFINED_DERIVED ||
       entry.derivation !== 'SUM_OF_LATEST_FOUR_COMPATIBLE_STANDALONE_QUARTERS' ||
       entry.components.length !== 4 ||
       entry.components.some((item) => item.sourcePeriodType !== ADJUSTED_EBITDA_PERIOD.QUARTER))) {
    throw new Error('LTM Adjusted EBITDA must use exactly four standalone quarters.')
  }
  const expectedIdentity = adjustedEbitdaDenominatorIdentity(entry)
  if (!entry.denominatorIdentity || entry.denominatorIdentity !== expectedIdentity) {
    throw new Error('Adjusted EBITDA denominator identity does not match its source lineage.')
  }
  return true
}
