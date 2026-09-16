import { readFile } from 'node:fs/promises'
import path from 'node:path'

const auditCache = new Map()

export function hasUsableAuditRecords(records, ticker) {
  const matching = (records ?? []).filter((record) => record.ticker === ticker)
  return matching.some((record) => record.formula !== 'ingestion-failed' &&
    record.failureReason !== 'Source ingestion failure')
}

function snapshotPath() {
  return path.join(process.cwd(), '.cache', 'financial-audits', 'latest.json')
}

function tickerSnapshotPath(ticker) {
  const filename = String(ticker).replace(/[^A-Z0-9._-]/gi, '_')
  return path.join(process.cwd(), '.cache', 'financial-audits', 'by-ticker', `${filename}.json`)
}

async function loadLatestAudit() {
  const filename = snapshotPath()
  if (auditCache.has(filename)) return auditCache.get(filename)
  const request = readFile(filename, 'utf8')
    .then((body) => JSON.parse(body))
    .catch(() => null)
  auditCache.set(filename, request)
  return request
}

async function loadTickerAudit(ticker) {
  const filename = tickerSnapshotPath(ticker)
  if (auditCache.has(filename)) return auditCache.get(filename)
  const request = readFile(filename, 'utf8')
    .then((body) => JSON.parse(body))
    .catch(() => null)
  auditCache.set(filename, request)
  return request
}

function componentFromAudit(component) {
  return {
    ...component,
    start: component.sourceStart ?? null,
    end: component.sourceEnd ?? null,
    accn: component.accn ?? null,
    filed: component.filed ?? null,
  }
}

function entryFromAudit(record, period) {
  const components = (record.quarterlyComponents ?? []).map(componentFromAudit)
  return {
    value: record.displayedValue ?? null,
    components,
    sourceType: record.primarySource ?? 'Unavailable',
    sourceUrl: record.primarySourceUrl ?? components[0]?.sourceUrl ?? null,
    validationStatus: record.validationStatus,
    exactness: record.exactness ?? null,
    method: record.formula ?? record.validationStatus,
    warnings: [record.warning, record.failureReason].filter(Boolean),
    documentHash: record.documentHash ?? components[0]?.documentHash ?? null,
    retrievedAt: record.lastValidatedAt ?? null,
    adjustedEbitdaMethod: record.adjustedEbitdaMethod ?? null,
    denominatorIdentity: record.denominatorIdentity ?? null,
    verificationBasis: record.verificationBasis ?? null,
    requestedPeriodType: period === 'LTM' ? 'LTM' : 'CALENDAR_YEAR',
    definitionFingerprint: record.definitionFingerprint ?? components[0]?.definitionFingerprint ?? null,
    compatibleDefinitionFingerprints: record.compatibleDefinitionFingerprints ??
      [...new Set(components.map((item) => item.definitionFingerprint).filter(Boolean))],
    derivation: record.derivation ?? (period === 'LTM' && components.length === 4
      ? 'SUM_OF_LATEST_FOUR_COMPATIBLE_STANDALONE_QUARTERS'
      : record.formula ?? null),
  }
}

export async function loadAuditedFinancials(ticker, years) {
  const tickerAudit = await loadTickerAudit(ticker)
  const audit = hasUsableAuditRecords(tickerAudit?.records, ticker)
    ? tickerAudit
    : await loadLatestAudit()
  if (!audit?.records?.length || !hasUsableAuditRecords(audit.records, ticker)) return null
  const tickerRecords = audit.records.filter((record) => record.ticker === ticker)
  if (!tickerRecords.length) return null

  const actuals = Object.fromEntries(['revenue', 'grossProfit', 'ebit', 'ebitda', 'freeCashFlow'].map((metric) => [
    metric,
    Object.fromEntries(years.map((year) => {
      const record = tickerRecords.find((item) => item.metric === metric && Number(item.calendarYear) === year)
      return [year, record ? entryFromAudit(record, year) : null]
    })),
  ]))
  const ltm = Object.fromEntries(['revenue', 'grossProfit', 'ebit', 'ebitda', 'freeCashFlow'].map((metric) => {
    const record = tickerRecords.find((item) => item.metric === metric && item.calendarYear === 'LTM')
    return [metric, record ? entryFromAudit(record, 'LTM') : null]
  }))

  return {
    actuals,
    ltm,
    generatedAt: audit.generatedAt ?? null,
  }
}
