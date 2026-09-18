import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getCompanyFacts, resolveCompany } from '../server/sec/edgar.js'
import { buildCanonicalQuarterlyLedger, HISTORICAL_STATUS, METRIC_DEFINITIONS } from '../server/valuation/financialLedger.js'
import { buildFilingIndex } from '../server/valuation/filingIndex.js'
import { loadSupplementalFilingFacts } from '../server/valuation/filingFactExtractor.js'
import { enforceLtmFreshness } from '../server/valuation/calendarization.js'
import { HISTORICAL_VALIDATION_STATUS, classifyIssuer, isOperatingCompanyClassification } from '../server/valuation/issuerClassification.js'
import { MARKET_MAPS } from '../src/data.js'
import { assertCanonicalAdjustedEbitdaEntry, ADJUSTED_EBITDA_PERIOD } from '../server/valuation/adjustedEbitdaEngine.js'
import { buildCanonicalHistoricalFinancials } from '../server/valuation/secCanonicalFinancials.js'
import { fetchWiseSheetsCanonicalRows } from '../server/valuation/wiseSheetsCanonicalShadow.js'
import { validateHistoricalAuditRecords } from '../server/valuation/historicalAuditValidation.js'

const DEFAULT_TICKERS = ['BE', 'GEV', 'FCEL', 'INTC', 'MU', 'NBIS', 'CRWV', 'IREN', 'GOOGL', 'AMZN', 'META', 'MSFT']
const VALID_METRICS = [
  'revenue', 'grossProfit', 'ebit', 'operatingCashFlow',
  'capitalExpenditures', 'freeCashFlow', 'adjustedEbitda',
]
const AUDIT_METRIC_DEFINITIONS = Object.freeze({
  ...METRIC_DEFINITIONS,
  ebit: { definition: 'Consolidated GAAP or IFRS operating income or loss' },
  adjustedEbitda: METRIC_DEFINITIONS.ebitda,
})

function option(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] ?? null : null
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function rootCause(entry) {
  const text = `${entry.reason ?? ''} ${entry.method ?? ''} ${(entry.warnings ?? []).join(' ')}`.toLowerCase()
  if (/annual-reconciliation/.test(text)) return 'Annual reconciliation failure'
  if (/incomplete-quarter/.test(text)) return 'Incomplete quarter coverage'
  if (/conflict/.test(text)) return 'Restated or conflicting SEC fact'
  if (/depreciation|amortization/.test(text)) return 'Missing D&A component'
  if (/capital/.test(text)) return 'Missing capex component'
  if (/incomplete[_-]cfo[_-]or[_-]capex/.test(text)) return 'Missing compatible CFO or capex component'
  if (/four[_-]exact[_-]calendar[_-]quarters/.test(text)) return 'Four exact company-defined quarters are unavailable'
  if (/definition[_-]incompatible/.test(text)) return 'Company Adjusted EBITDA definition changed'
  if (/no[_-]compatible[_-]consolidated/.test(text)) return 'No compatible consolidated SEC fact'
  if (/partial[_-]standalone/.test(text)) return 'Partial standalone-quarter coverage'
  return 'Unavailable source coverage'
}

function collectTickers(value, output = new Set()) {
  if (Array.isArray(value)) for (const item of value) collectTickers(item, output)
  else if (value && typeof value === 'object') {
    if (typeof value.ticker === 'string' && value.ticker.trim()) output.add(value.ticker.trim().toUpperCase())
    for (const nested of Object.values(value)) collectTickers(nested, output)
  }
  return output
}

async function readJson(filename, fallback) {
  try { return JSON.parse(await readFile(filename, 'utf8')) } catch { return fallback }
}

const tickerOption = option('--ticker')
const metricOption = option('--metric')
const rawStatusOption = option('--status')
const statusOption = rawStatusOption ? ({
  exact: HISTORICAL_STATUS.EXACT,
  reconstructed: HISTORICAL_STATUS.RECONSTRUCTED,
  derived: HISTORICAL_STATUS.DERIVED,
  warning: HISTORICAL_STATUS.WARNING,
  failed: HISTORICAL_STATUS.FAILED,
  unavailable: HISTORICAL_STATUS.UNAVAILABLE,
  override: HISTORICAL_STATUS.MANUAL,
}[rawStatusOption.toLowerCase()] ?? rawStatusOption) : null
const changedOnly = process.argv.includes('--changed-only')
const requestedTickers = tickerOption
  ? tickerOption.split(',').map((ticker) => ticker.trim().toUpperCase()).filter(Boolean)
  : process.argv.includes('--all') ? [...collectTickers(MARKET_MAPS)].sort() : DEFAULT_TICKERS
const metrics = metricOption ? metricOption.split(',').map((metric) => metric.trim()).filter((metric) => VALID_METRICS.includes(metric)) : VALID_METRICS
if (metricOption && !metrics.length) throw new Error(`Unknown metric. Use one of: ${VALID_METRICS.join(', ')}`)

const currentYear = new Date().getFullYear()
const years = [currentYear - 3, currentYear - 2, currentYear - 1]
const outputDirectory = path.join(process.cwd(), '.cache', 'financial-audits')
const manifestFilename = path.join(outputDirectory, 'manifest.json')
const previousManifest = await readJson(manifestFilename, {})
const records = []
const companyResults = []
const wiseSheetsRows = await fetchWiseSheetsCanonicalRows(requestedTickers)

function failClosedAdjustedEbitda(entry, requestedPeriodType) {
  if (entry?.value == null) return entry
  try {
    assertCanonicalAdjustedEbitdaEntry(entry, requestedPeriodType)
    return entry
  } catch (error) {
    return {
      ...entry,
      value: null,
      validationStatus: HISTORICAL_VALIDATION_STATUS.MISMATCH,
      method: 'CANONICAL_ADJUSTED_EBITDA_INVARIANT_FAILED',
      warnings: [...(entry.warnings ?? []), error.message],
    }
  }
}

function compactAuditComponents(components = []) {
  return components.map((component) => ({
    sourceProvider: component.sourceProvider ?? component.provider ??
      (String(component.sourceType ?? '').startsWith('SEC') ? 'SEC' : null),
    sourceStart: component.sourceStart ?? component.quarterStart ?? component.start ??
      component.periodIdentity?.periodStart ?? null,
    sourceEnd: component.sourceEnd ?? component.quarterEnd ?? component.end ??
      component.periodIdentity?.periodEnd ?? null,
    fiscalYear: component.fiscalYear ?? component.periodIdentity?.fiscalYear ?? null,
    fiscalQuarter: component.fiscalQuarter ?? component.periodIdentity?.fiscalQuarter ?? null,
    fiscalCalendarId: component.fiscalCalendarId ?? component.periodIdentity?.fiscalCalendarId ?? null,
    dateAuthority: component.dateAuthority ?? component.periodIdentity?.dateAuthority ?? null,
    economicPeriodKey: component.economicPeriodKey ?? null,
    sourcePeriodType: component.sourcePeriodType ?? component.periodIdentity?.periodType ?? null,
    sourcePeriodBasis: component.sourcePeriodBasis ?? null,
    sourceValue: component.sourceValue ?? null,
    sourceUrl: component.sourceUrl ?? null,
    sourceId: component.sourceId ?? null,
    documentHash: component.documentHash ?? null,
    tag: component.tag ?? null,
    exactCompanyMetricLabel: component.exactCompanyMetricLabel ?? null,
    filed: component.filed ?? null,
    accn: component.accn ?? null,
    filingForm: component.filingForm ?? null,
    document: component.document ?? null,
    sourceType: component.sourceType ?? null,
    role: component.role ?? component.inputRole ?? null,
    sign: component.sign ?? null,
    tableTitle: component.tableTitle ?? null,
    tableIndex: component.tableIndex ?? null,
    rowIndex: component.rowIndex ?? null,
    columnIndex: component.columnIndex ?? null,
    rowLabel: component.rowLabel ?? null,
    columnLabel: component.columnLabel ?? null,
    rawCellValue: component.rawCellValue ?? null,
    rawReportedValue: component.rawReportedValue ?? null,
    reportedScale: component.reportedScale ?? null,
    reportedUnits: component.reportedUnits ?? null,
    normalizedValue: component.normalizedValue ?? component.value ?? null,
    definitionFingerprint: component.definitionFingerprint ?? null,
    semanticDefinitionFingerprint: component.semanticDefinitionFingerprint ?? null,
    sourceDefinitionFingerprint: component.sourceDefinitionFingerprint ?? null,
    operationScope: component.operationScope ?? null,
    adjustedEbitdaMethod: component.adjustedEbitdaMethod ?? null,
    formula: component.formula ?? null,
    selectionDecision: component.selectionDecision ?? null,
    reconciliation: component.reconciliation ?? null,
  }))
}

function latestReportedQuarterEnd(filingIndex, rawLedger) {
  const periodicFilingEnd = (filingIndex?.filings ?? [])
    .filter((filing) => ['10-Q', '10-Q/A'].includes(filing.form))
    .map((filing) => filing.reportDate)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null
  const reportedRevenueEnd = (rawLedger ?? [])
    .filter((record) => record.metricCandidates?.includes('revenue'))
    .filter((record) => !record.segment && record.durationDays >= 50 && record.durationDays <= 120)
    .map((record) => record.endDate)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null
  return [periodicFilingEnd, reportedRevenueEnd].filter(Boolean).sort().at(-1) ?? null
}

function auditRecord({ company, ticker, cik, metric, period, entry, snapshot, classification }) {
  const component = entry?.components?.[0] ?? null
  return {
    company, ticker, cik, metric,
    metricDefinition: AUDIT_METRIC_DEFINITIONS[metric].definition,
    calendarYear: period,
    displayedValue: entry?.value ?? null,
    exactness: entry?.classification ?? entry?.exactness ?? null,
    validationStatus: entry?.status ?? entry?.validationStatus ?? HISTORICAL_STATUS.UNAVAILABLE,
    primarySource: component?.sourceProvider ?? entry?.sourceType ?? 'Unavailable',
    primarySourceUrl: entry?.sourceUrl ?? snapshot.documentUrl,
    secondarySource: null,
    primarySourceValue: entry?.value ?? null,
    secondarySourceValue: null,
    sourceDifference: null,
    quarterlyComponents: compactAuditComponents(entry?.components),
    formula: entry?.derivation ?? entry?.method ?? 'unavailable',
    derivation: entry?.derivation ?? null,
    reconciliationResults: entry?.components?.map((item) => item.formula ?? 'SEC filed component') ?? [],
    warning: [entry?.reason, ...(entry?.warnings ?? [])].filter(Boolean).join(' | '),
    failureReason: entry?.value == null ? rootCause(entry ?? {}) : null,
    documentHash: entry?.documentHash ?? snapshot.documentHash,
    lastValidatedAt: snapshot.retrievedAt,
    issuerClassification: classification.classification,
    adjustedEbitdaMethod: entry?.adjustedEbitdaMethod ?? null,
    denominatorIdentity: entry?.denominatorIdentity ?? null,
    verificationBasis: entry?.verificationBasis ?? null,
    sourceAccession: component?.accn ?? null,
    sourceDocument: component?.document ?? null,
    sourceTable: component?.tableTitle ?? null,
    sourceRow: component?.rowLabel ?? null,
    sourceColumn: component?.columnLabel ?? null,
    rawReportedValue: component?.rawReportedValue ?? null,
    reportedUnits: component?.reportedUnits ?? null,
    definitionFingerprint: entry?.definitionFingerprint ?? component?.definitionFingerprint ?? null,
    compatibleDefinitionFingerprints: entry?.compatibleDefinitionFingerprints ?? null,
    economicSanityFlags: entry?.economicSanityFlags ?? [],
    negativeSearchEvidence: entry?.negativeSearchEvidence ?? null,
  }
}

for (const [tickerIndex, ticker] of requestedTickers.entries()) {
  console.error(`[financials-audit] ${tickerIndex + 1}/${requestedTickers.length} ${ticker}`)
  try {
    const company = await resolveCompany(ticker)
    const preliminaryClassification = classifyIssuer({ ticker, company })
    if (!company || !isOperatingCompanyClassification(preliminaryClassification.classification)) {
      companyResults.push({ ticker, company: company?.name ?? ticker, changed: false, classification: preliminaryClassification })
      for (const metric of metrics) for (const year of years) records.push({
        company: company?.name ?? ticker, ticker, cik: company?.cik ?? null, metric,
        metricDefinition: AUDIT_METRIC_DEFINITIONS[metric].definition, calendarYear: `${year}A`,
        displayedValue: null, exactness: null, validationStatus: preliminaryClassification.financialStatus,
        primarySource: 'Not applicable', primarySourceUrl: null, secondarySource: null,
        primarySourceValue: null, secondarySourceValue: null, sourceDifference: null,
        quarterlyComponents: [], formula: preliminaryClassification.financialStatus,
        reconciliationResults: [], warning: preliminaryClassification.reason,
        failureReason: preliminaryClassification.reason, documentHash: null,
        lastValidatedAt: new Date().toISOString(), issuerClassification: preliminaryClassification.classification,
      })
      for (const metric of metrics) records.push({
        company: company?.name ?? ticker, ticker, cik: company?.cik ?? null, metric,
        metricDefinition: AUDIT_METRIC_DEFINITIONS[metric].definition, calendarYear: 'LTM',
        displayedValue: null, exactness: null, validationStatus: preliminaryClassification.financialStatus,
        primarySource: 'Not applicable', primarySourceUrl: null, secondarySource: null,
        primarySourceValue: null, secondarySourceValue: null, sourceDifference: null,
        quarterlyComponents: [], formula: preliminaryClassification.financialStatus,
        reconciliationResults: [], warning: preliminaryClassification.reason,
        failureReason: preliminaryClassification.reason, documentHash: null,
        lastValidatedAt: new Date().toISOString(), issuerClassification: preliminaryClassification.classification,
      })
      continue
    }
    const filingIndex = await buildFilingIndex(company)
    const classification = classifyIssuer({ ticker, company, filings: filingIndex.filings })
    const facts = await getCompanyFacts(company.cik).catch(() => null)
    const supplemental = await loadSupplementalFilingFacts({ company, filingIndex, years })
    const ledger = await buildCanonicalQuarterlyLedger({
      company, facts, years, filingIndex, supplementalRawFacts: supplemental.records,
      negativeSearchEvidence: supplemental.negativeSearchEvidence ?? null,
    })
    const production = await buildCanonicalHistoricalFinancials({
      ticker,
      wiseSheetsRows: wiseSheetsRows.filter((row) => String(row.ticker).toUpperCase() === ticker),
      company,
      facts,
      filings: filingIndex,
      years,
      additionalSupplementalFacts: supplemental.records,
    })
    const canonical = production.canonical
    const expectedLtmEnd = latestReportedQuarterEnd(filingIndex, ledger.rawLedger)
    const changed = previousManifest[ticker] !== ledger.snapshot.documentHash
    companyResults.push({
      ticker, company: company.name, changed,
      snapshot: {
        documentHash: ledger.snapshot.documentHash,
        retrievedAt: ledger.snapshot.retrievedAt,
        documentUrl: ledger.snapshot.documentUrl,
        recordCount: ledger.snapshot.records?.length ?? null,
      },
      filingExtraction: { filingsExamined: supplemental.filingsExamined, recordsExtracted: supplemental.records.length, errors: supplemental.errors },
    })
    if (changedOnly && !changed) continue
    for (const metric of metrics) {
      for (const year of years) {
        const rawEntry = metric === 'adjustedEbitda'
          ? ledger.calendarActuals.ebitda?.[year]
          : canonical.calendarActuals[metric]?.[year]
        const entry = metric === 'adjustedEbitda'
          ? failClosedAdjustedEbitda(rawEntry, ADJUSTED_EBITDA_PERIOD.CALENDAR_YEAR)
          : rawEntry
        records.push(auditRecord({ company: company.name, ticker, cik: company.cik, metric, period: `${year}A`, entry, snapshot: ledger.snapshot, classification }))
      }
      const ltmCandidate = metric === 'adjustedEbitda'
        ? failClosedAdjustedEbitda(ledger.adjustedEbitda.ltm, ADJUSTED_EBITDA_PERIOD.LTM)
        : canonical.ltm[metric]
      const ltm = metric === 'adjustedEbitda' ? enforceLtmFreshness(ltmCandidate, expectedLtmEnd) : ltmCandidate
      records.push(auditRecord({ company: company.name, ticker, cik: company.cik, metric, period: 'LTM', entry: ltm, snapshot: ledger.snapshot, classification }))
    }
  } catch (error) {
    companyResults.push({ ticker, company: ticker, changed: true, error: error.message })
    for (const metric of metrics) for (const period of [...years.map((year) => `${year}A`), 'LTM']) records.push({
      company: ticker, ticker, cik: null, metric, metricDefinition: AUDIT_METRIC_DEFINITIONS[metric].definition,
      calendarYear: period, displayedValue: null, exactness: null, validationStatus: HISTORICAL_VALIDATION_STATUS.REQUIRES_REVIEW,
      primarySource: 'Unavailable', primarySourceUrl: null, secondarySource: null, primarySourceValue: null,
      secondarySourceValue: null, sourceDifference: null, quarterlyComponents: [], formula: 'ingestion-failed',
      reconciliationResults: [], warning: error.message, failureReason: 'Source ingestion failure', documentHash: null,
      lastValidatedAt: new Date().toISOString(),
    })
  }
}

const filteredRecords = statusOption ? records.filter((record) => record.validationStatus === statusOption) : records
const statuses = [...new Set(Object.values(HISTORICAL_VALIDATION_STATUS))]
const counts = Object.fromEntries(statuses.map((status) => [status, filteredRecords.filter((record) => record.validationStatus === status).length]))
const failuresByRootCause = Object.entries(filteredRecords.filter((record) => ![HISTORICAL_VALIDATION_STATUS.VERIFIED_REPORTED, HISTORICAL_VALIDATION_STATUS.VERIFIED_DERIVED].includes(record.validationStatus)).reduce((groups, record) => {
  const cause = record.failureReason ?? rootCause(record)
  groups[cause] = (groups[cause] ?? 0) + 1
  return groups
}, {})).sort((left, right) => right[1] - left[1])
const sanityFlags = filteredRecords.flatMap((record) => (record.economicSanityFlags ?? []).map((flag) => ({
  ticker: record.ticker, metric: record.metric, calendarYear: record.calendarYear, ...flag,
})))
const auditIssues = changedOnly || statusOption ? [] : validateHistoricalAuditRecords(records, {
  tickers: requestedTickers, metrics, periods: [...years.map((year) => `${year}A`), 'LTM'],
})
const auditIssueCells = new Set(auditIssues.map((issue) => `${issue.ticker}|${issue.metric}|${issue.period}`))
const acceptedNaCellsWithEvidence = changedOnly || statusOption ? 0 : records.filter((record) =>
  record.displayedValue == null && !auditIssueCells.has(`${record.ticker}|${record.metric}|${record.calendarYear}`)).length
const report = { generatedAt: new Date().toISOString(), tickers: requestedTickers, years, metrics, changedOnly, companyResults, summary: { totalCompanies: companyResults.length, totalHistoricalNumbers: filteredRecords.length, ...counts, unresolvedCellCount: auditIssueCells.size, acceptedNaCellsWithEvidence, failuresByRootCause, economicSanityFlagCount: sanityFlags.length, auditIssueCount: auditIssues.length }, sanityFlags, auditIssues, records: filteredRecords }

await mkdir(outputDirectory, { recursive: true })
const perTickerDirectory = path.join(outputDirectory, 'by-ticker')
await mkdir(perTickerDirectory, { recursive: true })
const stamp = report.generatedAt.replaceAll(':', '-').replace(/\.\d+Z$/, 'Z')
const jsonFilename = path.join(outputDirectory, `financial-audit-${stamp}.json`)
const csvFilename = path.join(outputDirectory, `financial-audit-${stamp}.csv`)
const headers = ['Company', 'Ticker', 'CIK', 'Issuer classification', 'Metric', 'Metric definition', 'Calendar year', 'Displayed value', 'Exactness', 'Validation status', 'Adjusted EBITDA method', 'Denominator identity', 'Verification basis', 'Primary source', 'Primary source URL', 'Accession', 'Document', 'Table', 'Row', 'Column', 'Raw value', 'Reported units', 'Definition fingerprint', 'Secondary source', 'Primary source value', 'Secondary source value', 'Source difference', 'Quarterly components', 'Formula', 'Reconciliation results', 'Warning', 'Failure reason', 'Document hash', 'Last validated timestamp']
const csvRows = filteredRecords.map((record) => [record.company, record.ticker, record.cik, record.issuerClassification, record.metric, record.metricDefinition, record.calendarYear, record.displayedValue, record.exactness, record.validationStatus, record.adjustedEbitdaMethod, record.denominatorIdentity, record.verificationBasis, record.primarySource, record.primarySourceUrl, record.sourceAccession, record.sourceDocument, record.sourceTable, record.sourceRow, record.sourceColumn, record.rawReportedValue, record.reportedUnits, record.definitionFingerprint, record.secondarySource, record.primarySourceValue, record.secondarySourceValue, record.sourceDifference, JSON.stringify(record.quarterlyComponents), record.formula, record.reconciliationResults.join(' | '), record.warning, record.failureReason, record.documentHash, record.lastValidatedAt])
await Promise.all([
  writeFile(jsonFilename, JSON.stringify(report, null, 2)),
  writeFile(csvFilename, [headers, ...csvRows].map((row) => row.map(csvCell).join(',')).join('\n')),
  writeFile(path.join(outputDirectory, 'latest.json'), JSON.stringify(report, null, 2)),
  writeFile(manifestFilename, JSON.stringify(Object.fromEntries(companyResults.filter((item) => item.snapshot).map((item) => [item.ticker, item.snapshot.documentHash])), null, 2)),
  ...requestedTickers.map(async (ticker) => {
    const companyResult = companyResults.find((item) => item.ticker === ticker)
    if (companyResult?.error) return
    const tickerRecords = filteredRecords.filter((record) => record.ticker === ticker)
    if (!tickerRecords.length) return
    const tickerFile = path.join(perTickerDirectory, `${ticker.replace(/[^A-Z0-9._-]/gi, '_')}.json`)
    const existing = await readJson(tickerFile, { records: [] })
    const merged = new Map((existing.records ?? []).map((record) => [`${record.metric}:${record.calendarYear}`, record]))
    tickerRecords.forEach((record) => merged.set(`${record.metric}:${record.calendarYear}`, record))
    return writeFile(tickerFile, JSON.stringify({
      generatedAt: report.generatedAt,
      ticker,
      records: [...merged.values()],
    }, null, 2))
  }),
])

console.log(JSON.stringify({ ...report.summary, jsonFilename, csvFilename }, null, 2))
if (counts[HISTORICAL_VALIDATION_STATUS.MISMATCH] > 0 || auditIssues.length > 0) process.exitCode = 1
