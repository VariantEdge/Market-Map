export const FILING_GROUPS = [
  { id: '10-K', label: '10-K', forms: ['10-K', '10-K/A', '10-KT', '10-KT/A'] },
  { id: '10-Q', label: '10-Q', forms: ['10-Q', '10-Q/A', '10-QT', '10-QT/A'] },
  { id: '8-K', label: '8-K', forms: ['8-K', '8-K/A'] },
  { id: 'DEF 14A', label: 'DEF 14A', forms: ['DEF 14A', 'DEFA14A', 'DEFM14A', 'PRE 14A'] },
  { id: 'Ownership', label: 'Ownership', forms: ['3', '3/A', '4', '4/A', '5', '5/A', 'SC 13D', 'SC 13D/A', 'SC 13G', 'SC 13G/A'] },
  { id: 'Other', label: 'Other', forms: [] },
]

export const FILING_GROUP_ORDER = FILING_GROUPS.map((group) => group.id)

const FORM_TO_GROUP = new Map(
  FILING_GROUPS.flatMap((group) => group.forms.map((form) => [form, group.id])),
)

export function padCik(cik) {
  return String(cik ?? '').replace(/\D/g, '').padStart(10, '0')
}

export function compactCik(cik) {
  return String(Number(String(cik ?? '').replace(/\D/g, '') || '0'))
}

export function categorizeFiling(form) {
  return FORM_TO_GROUP.get(String(form ?? '').trim().toUpperCase()) ?? 'Other'
}

export function buildSecFilingUrl({ cik, accessionNumber, primaryDocument }) {
  const rawCik = String(cik ?? '').trim()
  const compact = /^\d{1,10}$/.test(rawCik) ? String(Number(rawCik)) : ''
  const accession = String(accessionNumber ?? '').trim()
  const rawDocument = String(primaryDocument ?? '').trim().replace(/\\/g, '/')
  const documentParts = rawDocument.split('/').filter(Boolean)
  const document = documentParts.length && documentParts.every((part) => part !== '.' && part !== '..')
    ? documentParts.map((part) => encodeURIComponent(part)).join('/')
    : ''
  if (!compact || !/^\d{10}-\d{2}-\d{6}$/.test(accession) || !document || rawDocument.startsWith('/')) return null
  return `https://www.sec.gov/Archives/edgar/data/${compact}/${accession.replace(/-/g, '')}/${document}`
}

export function buildSecCompanyUrl(cik) {
  return `https://www.sec.gov/edgar/browse/?CIK=${padCik(cik)}&owner=exclude`
}

function filingIdentity(filing) {
  return [
    padCik(filing.cik),
    filing.accessionNumber,
    filing.primaryDocument,
  ].join(':')
}

function normalizeFilingFromRecent(company, recent, index) {
  const accessionNumber = recent.accessionNumber?.[index]
  const primaryDocument = recent.primaryDocument?.[index]
  const form = recent.form?.[index]
  if (!accessionNumber || !form) return null

  const filing = {
    id: `${padCik(company.cik)}:${accessionNumber}`,
    cik: padCik(company.cik),
    ticker: company.ticker,
    companyName: company.name,
    form,
    category: categorizeFiling(form),
    filingDate: recent.filingDate?.[index] ?? '',
    reportDate: recent.reportDate?.[index] ?? '',
    acceptanceDateTime: recent.acceptanceDateTime?.[index] ?? '',
    accessionNumber,
    primaryDocument,
    primaryDocDescription: recent.primaryDocDescription?.[index] || form,
    fileNumber: recent.fileNumber?.[index] ?? '',
    filmNumber: recent.filmNumber?.[index] ?? '',
    isXbrl: Number(recent.isXBRL?.[index] ?? 0) === 1,
    isInlineXbrl: Number(recent.isInlineXBRL?.[index] ?? 0) === 1,
    processingStatus: primaryDocument ? 'metadata-ready' : 'document-missing',
    secUrl: buildSecFilingUrl({
      cik: company.cik,
      accessionNumber,
      primaryDocument,
    }),
  }

  return filing
}

export function normalizeSubmissions(company, submissions) {
  const recent = submissions?.filings?.recent
  const forms = recent?.form ?? []
  const seen = new Set()
  const filings = []

  for (let index = 0; index < forms.length; index += 1) {
    const filing = normalizeFilingFromRecent(company, recent, index)
    if (!filing) continue
    const identity = filingIdentity(filing)
    if (seen.has(identity)) continue
    seen.add(identity)
    filings.push(filing)
  }

  filings.sort(compareFilings)

  const counts = Object.fromEntries(FILING_GROUP_ORDER.map((group) => [group, 0]))
  for (const filing of filings) counts[filing.category] = (counts[filing.category] ?? 0) + 1

  return {
    company: {
      ...company,
      cik: padCik(company.cik),
      sic: submissions?.sic ?? null,
      sicDescription: submissions?.sicDescription ?? null,
      fiscalYearEnd: submissions?.fiscalYearEnd ?? null,
      entityType: submissions?.entityType ?? null,
      exchanges: submissions?.exchanges ?? [],
      tickers: submissions?.tickers ?? (company.ticker ? [company.ticker] : []),
      secUrl: buildSecCompanyUrl(company.cik),
      mostRecentFilingDate: filings[0]?.filingDate ?? null,
    },
    filings,
    counts,
    fetchedAt: new Date().toISOString(),
  }
}

export function compareFilings(a, b) {
  const groupDelta = FILING_GROUP_ORDER.indexOf(a.category) - FILING_GROUP_ORDER.indexOf(b.category)
  if (groupDelta !== 0) return groupDelta
  return String(b.filingDate ?? '').localeCompare(String(a.filingDate ?? ''))
}

export function filterFilings(filings, filters = {}) {
  const query = String(filters.query ?? '').trim().toLowerCase()
  const selectedCategories = new Set(filters.categories ?? [])
  const startDate = filters.startDate || ''
  const endDate = filters.endDate || ''

  return filings.filter((filing) => {
    if (selectedCategories.size && !selectedCategories.has(filing.category)) return false
    if (startDate && filing.filingDate < startDate) return false
    if (endDate && filing.filingDate > endDate) return false
    if (!query) return true
    return [
      filing.form,
      filing.filingDate,
      filing.reportDate,
      filing.primaryDocDescription,
      filing.accessionNumber,
      filing.title,
      filing.quarter,
      filing.provider,
    ].some((value) => String(value ?? '').toLowerCase().includes(query))
  })
}

export function latestByCategory(filings, category) {
  return filings
    .filter((filing) => filing.category === category)
    .sort((a, b) => String(b.filingDate ?? '').localeCompare(String(a.filingDate ?? '')))[0] ?? null
}

export function latestAnnualAndSubsequentQuarters(filings) {
  const annual = latestByCategory(filings, '10-K')
  if (!annual) return []
  const quarters = filings.filter((filing) =>
    filing.category === '10-Q' && filing.filingDate >= annual.filingDate
  )
  return [annual, ...quarters].sort((a, b) =>
    String(b.filingDate ?? '').localeCompare(String(a.filingDate ?? '')),
  )
}
