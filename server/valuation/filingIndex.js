import { createHash } from 'node:crypto'
import {
  getCompanySubmissions,
  getCompanySubmissionsFile,
  getFilingDirectory,
} from '../sec/edgar.js'
import { buildSecFilingUrl, padCik } from '../sec/filings.js'

export const FINANCIAL_FILING_FORMS = new Set([
  '10-K', '10-K/A', '10-Q', '10-Q/A', '8-K', '8-K/A',
  '20-F', '20-F/A', '40-F', '40-F/A', '6-K',
  'S-1', 'S-1/A', 'F-1', 'F-1/A', '10', '10/A', '10-12B', '10-12B/A',
])

const PERIOD_REPORT_FORMS = new Set(['10-K', '10-K/A', '10-Q', '10-Q/A',
  '20-F', '20-F/A', '40-F', '40-F/A'])

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex')
}

function compactCik(cik) {
  return String(Number(String(cik ?? '').replace(/\D/g, '') || '0'))
}

function normalizeRows(company, recent = {}) {
  const forms = recent.form ?? []
  const rows = []
  for (let index = 0; index < forms.length; index += 1) {
    const form = String(forms[index] ?? '').toUpperCase()
    const accessionNumber = recent.accessionNumber?.[index]
    if (!FINANCIAL_FILING_FORMS.has(form) || !accessionNumber) continue
    const primaryDocument = recent.primaryDocument?.[index] ?? ''
    const filingUrl = buildSecFilingUrl({ cik: company.cik, accessionNumber, primaryDocument })
    rows.push({
      id: `${padCik(company.cik)}:${accessionNumber}`,
      ticker: company.ticker,
      issuer: company.name,
      cik: padCik(company.cik),
      form,
      accessionNumber,
      filingDate: recent.filingDate?.[index] ?? null,
      reportDate: recent.reportDate?.[index] ?? null,
      periodCovered: recent.reportDate?.[index] ?? null,
      acceptanceDateTime: recent.acceptanceDateTime?.[index] ?? null,
      primaryDocument,
      filingUrl,
      amendment: /\/A$/.test(form),
      exhibits: [],
      exhibitsStatus: 'NOT_LOADED',
      sourceHash: hash(`${padCik(company.cik)}:${accessionNumber}:${primaryDocument}`),
      immutableSourceId: `SEC:${padCik(company.cik)}:${accessionNumber}`,
    })
  }
  return rows
}

function dedupeAndSort(rows) {
  const byAccession = new Map()
  for (const row of rows) if (!byAccession.has(row.accessionNumber)) byAccession.set(row.accessionNumber, row)
  return [...byAccession.values()].sort((left, right) =>
    String(right.filingDate ?? '').localeCompare(String(left.filingDate ?? '')) ||
    String(right.accessionNumber).localeCompare(String(left.accessionNumber)))
}

function hasCompleteSubmissionRows(rows) {
  const forms = rows?.form
  const accessions = rows?.accessionNumber
  const reportDates = rows?.reportDate
  return Array.isArray(forms) && Array.isArray(accessions) && Array.isArray(reportDates) &&
    forms.length === accessions.length && forms.length === reportDates.length &&
    forms.every((form, index) => Boolean(form && accessions[index] &&
      (!PERIOD_REPORT_FORMS.has(String(form).toUpperCase()) || reportDates[index])))
}

export async function buildFilingIndex(company, options = {}) {
  if (!company?.cik) return { company, filings: [], sourceHash: null, retrievedAt: new Date().toISOString() }
  const submissions = options.submissions ?? await getCompanySubmissions(company.cik, options)
  const recentInventoryPresent = hasCompleteSubmissionRows(submissions?.filings?.recent)
  const rows = normalizeRows(company, submissions?.filings?.recent)
  const archivedFiles = submissions?.filings?.files ?? []
  let archivedFilesLoaded = 0
  for (const archive of archivedFiles) {
    if (!archive?.name) continue
    const payload = await getCompanySubmissionsFile(archive.name, options)
    if (!hasCompleteSubmissionRows(payload)) continue
    archivedFilesLoaded += 1
    rows.push(...normalizeRows(company, payload))
  }
  const filings = dedupeAndSort(rows)
  return {
    company: {
      ...company,
      cik: padCik(company.cik),
      entityType: submissions?.entityType ?? null,
      fiscalYearEnd: submissions?.fiscalYearEnd ?? null,
    },
    filings,
    inventoryEvidence: {
      source: 'SEC_COMPANY_SUBMISSIONS',
      complete: recentInventoryPresent && archivedFilesLoaded === archivedFiles.filter((item) => item?.name).length,
      recentInventoryPresent,
      archivedFilesListed: archivedFiles.filter((item) => item?.name).length,
      archivedFilesLoaded,
      financialFilingCount: filings.length,
    },
    sourceHash: hash(JSON.stringify(filings.map((filing) => [filing.accessionNumber, filing.primaryDocument]))),
    retrievedAt: new Date().toISOString(),
  }
}

function archiveItemUrl(filing, name) {
  const safeName = String(name ?? '').split('/').filter((part) => part && part !== '.' && part !== '..')
    .map((part) => encodeURIComponent(part)).join('/')
  if (!safeName) return null
  return `https://www.sec.gov/Archives/edgar/data/${compactCik(filing.cik)}/${filing.accessionNumber.replace(/-/g, '')}/${safeName}`
}

export async function hydrateFilingExhibits(filing, options = {}) {
  const directory = await getFilingDirectory(filing.cik, filing.accessionNumber, options)
  const items = directory?.directory?.item ?? []
  const exhibits = items
    .filter((item) => item?.name && /\.(?:htm|html|txt|xml)$/i.test(item.name))
    .map((item) => ({
      name: item.name,
      size: Number(item.size) || null,
      lastModified: item.lastModified ?? null,
      url: archiveItemUrl(filing, item.name),
      isPrimaryDocument: item.name === filing.primaryDocument,
      isLikelyEarningsExhibit: /(?:ex(?:hibit)?[-_]?99|earnings|release|results)/i.test(item.name),
    }))
  return { ...filing, exhibits, exhibitsStatus: 'LOADED' }
}

export function filingsForHistoricalFinancials(index, { startYear = null } = {}) {
  return (index?.filings ?? []).filter((filing) => {
    if (!FINANCIAL_FILING_FORMS.has(filing.form)) return false
    if (!startYear) return true
    const year = Number(String(filing.reportDate || filing.filingDate).slice(0, 4))
    return !Number.isFinite(year) || year >= startYear
  })
}
