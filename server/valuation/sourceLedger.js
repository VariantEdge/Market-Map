import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { HISTORICAL_VALIDATION_STATUS } from './issuerClassification.js'

const DAY_MS = 24 * 60 * 60 * 1000
const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000
const latestSnapshotCache = new Map()
export const SUPPLEMENTAL_SOURCE_SCHEMA_VERSION = 6
const SUPPORTED_FORMS = new Set([
  '10-K', '10-K/A', '10-Q', '10-Q/A', '8-K', '8-K/A',
  '20-F', '20-F/A', '40-F', '40-F/A', '6-K',
  'S-1', 'S-1/A', 'F-1', 'F-1/A', '10', '10/A', '10-12B', '10-12B/A',
])

export const ADJUSTED_EBITDA_METHOD = Object.freeze({
  COMPANY_REPORTED: 'COMPANY_REPORTED_ADJ_EBITDA',
  COMPANY_DEFINED_DERIVED: 'COMPANY_DEFINED_DERIVED_ADJ_EBITDA',
})

export const ADJUSTMENT_CATEGORY = Object.freeze({
  DEPRECIATION: 'DEPRECIATION',
  AMORTIZATION: 'AMORTIZATION',
  SBC: 'SBC',
  RESTRUCTURING: 'RESTRUCTURING',
  IMPAIRMENT: 'IMPAIRMENT',
  ACQUISITION_TRANSACTION_COST: 'ACQUISITION_TRANSACTION_COST',
  INTEGRATION_COST: 'INTEGRATION_COST',
  SEVERANCE: 'SEVERANCE',
  OTHER_APPROVED: 'OTHER_APPROVED',
  REJECTED: 'REJECTED',
})

export const STANDARDIZED_ADJUSTMENT_POLICY = Object.freeze({
  stockBasedCompensation: {
    category: ADJUSTMENT_CATEGORY.SBC,
    label: 'Stock-based compensation',
    concepts: ['ShareBasedCompensation', 'AllocatedShareBasedCompensationExpense', 'ShareBasedPaymentExpense'],
  },
  restructuring: {
    category: ADJUSTMENT_CATEGORY.RESTRUCTURING,
    label: 'Restructuring charges',
    concepts: ['RestructuringCharges', 'RestructuringCostsAndAssetImpairmentCharges', 'OtherRestructuringCosts'],
  },
  impairment: {
    category: ADJUSTMENT_CATEGORY.IMPAIRMENT,
    label: 'Impairment charges',
    concepts: ['AssetImpairmentCharges', 'GoodwillAndIntangibleAssetImpairment', 'GoodwillImpairmentLoss', 'ImpairmentOfIntangibleAssetsFinitelived'],
  },
  acquisitionTransaction: {
    category: ADJUSTMENT_CATEGORY.ACQUISITION_TRANSACTION_COST,
    label: 'Acquisition and transaction costs',
    concepts: ['BusinessCombinationTransactionCosts', 'AcquisitionRelatedCosts', 'AcquisitionAndIntegrationCosts'],
  },
  integration: {
    category: ADJUSTMENT_CATEGORY.INTEGRATION_COST,
    label: 'Integration costs',
    concepts: ['IntegrationCosts', 'BusinessIntegrationCosts'],
  },
  severance: {
    category: ADJUSTMENT_CATEGORY.SEVERANCE,
    label: 'Severance charges',
    concepts: ['SeveranceCosts1', 'SeveranceAndRelatedCosts'],
  },
})

export const METRIC_SOURCE_POLICY = Object.freeze({
  revenue: {
    concepts: [
      'Revenues', 'SalesRevenueNet',
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'RevenueFromContractWithCustomerIncludingAssessedTax',
      'RevenueFromContractsWithCustomers', 'Revenue',
    ],
    extensionLabel: /^(?:total |net )?revenues?$/i,
    exclude: /segment|product|service|related part|deferred|remaining performance|pro forma/i,
  },
  grossProfit: {
    concepts: ['GrossProfit'],
    extensionLabel: /^(?:total )?gross profit(?: \(loss\))?$/i,
    exclude: /segment|product|service|margin|percentage/i,
  },
  costOfRevenue: {
    concepts: ['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold', 'CostOfSales'],
    extensionLabel: /^(?:total )?cost of (?:revenue|revenues|sales|goods and services sold)$/i,
    exclude: /segment|product|service|percentage/i,
  },
  operatingIncome: {
    concepts: ['OperatingIncomeLoss', 'ProfitLossFromOperatingActivities'],
    extensionLabel: /^(?:(?:total )?operating (?:income|profit|loss)(?: \(loss\))?|(?:income|profit|loss) from operations)$/i,
    exclude: /segment|adjusted|margin|percentage/i,
  },
  ebit: {
    concepts: ['OperatingIncomeLoss', 'ProfitLossFromOperatingActivities'],
    extensionLabel: /^(?:(?:total )?operating (?:income|profit|loss)(?: \(loss\))?|(?:income|profit|loss) from operations)$/i,
    exclude: /segment|adjusted|margin|percentage/i,
  },
  depreciationAmortization: {
    concepts: [
      'DepreciationDepletionAndAmortization', 'DepreciationAndAmortization',
      'OtherDepreciationAndAmortization', 'DepreciationDepletionAndAmortizationPropertyPlantAndEquipment',
    ],
    extensionLabel: /^(?:total )?depreciation(?:, depletion)? and amortization(?: expense)?$/i,
    exclude: /accumulated|expected|right-of-use|debt|financing/i,
  },
  depreciation: {
    concepts: ['Depreciation', 'DepreciationExpense', 'AdjustmentForDepreciation'],
    extensionLabel: /^depreciation(?: expense)?$/i,
    exclude: /accumulated|expected|right-of-use/i,
  },
  amortization: {
    concepts: ['AmortizationOfIntangibleAssets', 'AdjustmentForAmortization'],
    extensionLabel: /^amortization of intangible assets$|^intangible amortization$/i,
    exclude: /debt|financing|expected|right-of-use/i,
  },
  operatingCashFlow: {
    concepts: ['NetCashProvidedByUsedInOperatingActivities', 'CashFlowsFromUsedInOperatingActivities', 'NetCashProvidedByUsedInContinuingOperations'],
    extensionLabel: /^net cash (?:provided by|used in|provided by\s*\/\s*\(used in\)|provided by \(used in\)) operating activities(?:(?:,? | from )continuing operations)?$/i,
    exclude: /discontinued/i,
  },
  capitalExpenditures: {
    concepts: [
      'PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets',
      'PurchaseOfPropertyPlantAndEquipment', 'PaymentsForAdditionsToPropertyPlantAndEquipment',
      'PaymentsToAcquireOtherPropertyPlantAndEquipment', 'PaymentsToAcquireOtherProductiveAssets',
      'PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities',
    ],
    extensionLabel: /^(?:payments|purchases|capital expenditures).*(?:property|plant|equipment|computer hardware)|^purchases of property and equipment$/i,
    exclude: /business|subsidiar|affiliate|investment|proceeds|unpaid|incurred but not/i,
  },
  adjustedEbitda: {
    concepts: ['AdjustedEBITDA', 'AdjustedEbitda', 'ConsolidatedAdjustedEBITDA', 'ConsolidatedAdjustedEbitda'],
    extensionLabel: /^(?:consolidated )?adjusted ebitda(?: attributable to .+)?$/i,
    exclude: /margin|percentage|guidance|forecast|reconciliation adjustment/i,
  },
})

function localDate(value) {
  if (!value) return null
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function daysInclusive(start, end) {
  return Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1
}

function finite(value) {
  return value != null && Number.isFinite(Number(value))
}

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex')
}

function isMonetaryUnit(unit) {
  return /^[A-Z]{3}$/.test(String(unit ?? ''))
}

export function metricCandidatesForConcept(namespace, concept, label) {
  const candidateMetrics = []
  const searchable = `${concept} ${label}`
  for (const [metric, policy] of Object.entries(METRIC_SOURCE_POLICY)) {
    const exact = policy.concepts.includes(concept)
    const extension = namespace !== 'us-gaap' && namespace !== 'ifrs-full' && policy.extensionLabel?.test(label || concept)
    if (exact || (extension && !policy.exclude?.test(searchable))) candidateMetrics.push(metric)
  }
  for (const [adjustment, policy] of Object.entries(STANDARDIZED_ADJUSTMENT_POLICY)) {
    if (policy.concepts.includes(concept)) candidateMetrics.push(`adjustment:${adjustment}`)
  }
  return candidateMetrics
}

function filingByAccession(filingIndex) {
  return new Map((filingIndex?.filings ?? []).map((filing) => [filing.accessionNumber, filing]))
}

export function createRawFinancialSourceLedger({ company, facts, filingIndex = null }) {
  const filings = filingByAccession(filingIndex)
  const records = []
  for (const [namespace, concepts] of Object.entries(facts?.facts ?? {})) {
    for (const [concept, definition] of Object.entries(concepts ?? {})) {
      const label = definition?.label ?? concept
      const candidateMetrics = metricCandidatesForConcept(namespace, concept, label)
      if (!candidateMetrics.length) continue
      for (const [unit, values] of Object.entries(definition?.units ?? {})) {
        if (!isMonetaryUnit(unit)) continue
        for (const item of values ?? []) {
          if (!item.start || !item.end || !finite(item.val) || !SUPPORTED_FORMS.has(String(item.form ?? '').toUpperCase())) continue
          const start = localDate(item.start)
          const end = localDate(item.end)
          if (!start || !end || start > end) continue
          const duration = daysInclusive(start, end)
          if (duration < 45 || duration > 400) continue
          const filing = filings.get(item.accn) ?? null
          records.push({
            id: sha256([company?.cik, namespace, concept, unit, item.start, item.end, item.accn, item.val, JSON.stringify(item.segment ?? null)].join(':')),
            issuer: company?.name ?? facts?.entityName ?? null,
            ticker: company?.ticker ?? null,
            cik: company?.cik ?? facts?.cik ?? null,
            metricCandidates: candidateMetrics,
            namespace,
            concept,
            label,
            description: definition?.description ?? null,
            value: Number(item.val),
            units: unit,
            currency: unit,
            startDate: item.start,
            endDate: item.end,
            durationDays: duration,
            fiscalYear: item.fy ?? null,
            fiscalPeriod: item.fp ?? null,
            frame: item.frame ?? null,
            segment: item.segment ?? null,
            filingForm: item.form ?? filing?.form ?? null,
            accessionNumber: item.accn ?? null,
            filingDate: item.filed ?? filing?.filingDate ?? null,
            reportDate: filing?.reportDate ?? null,
            filingUrl: filing?.filingUrl ?? null,
            rawSourceType: 'SEC_COMPANY_FACTS',
            tableContext: null,
            standardXbrl: namespace === 'us-gaap' || namespace === 'ifrs-full',
            companyExtension: namespace !== 'us-gaap' && namespace !== 'ifrs-full' && namespace !== 'dei',
            restatedOrRecast: false,
            provenance: {
              sourceId: filing?.immutableSourceId ?? `SEC_COMPANY_FACTS:${company?.cik}:${item.accn ?? 'NO_ACCESSION'}`,
              sourceHash: filing?.sourceHash ?? null,
              retrievedAt: filingIndex?.retrievedAt ?? new Date().toISOString(),
            },
          })
        }
      }
    }
  }
  return records
}

function conceptRank(record, metric) {
  const policy = METRIC_SOURCE_POLICY[metric]
  const index = policy?.concepts.indexOf(record.concept) ?? -1
  if (index >= 0) return index
  return record.companyExtension ? 100 : 500
}

function sourceQualityRank(record, metric) {
  if (metric !== 'adjustedEbitda') return 0
  if (record.rawSourceType === 'SEC_NON_GAAP_RECONCILIATION_TABLE') return 0
  if (record.rawSourceType === 'SEC_NON_GAAP_SUMMARY_TABLE') return 1
  if (record.rawSourceType === 'SEC_INLINE_XBRL') return 2
  if (record.rawSourceType === 'SEC_COMPANY_FACTS') return 3
  return 10
}

function formRank(form, durationDays) {
  const annual = durationDays >= 330
  const normalized = String(form ?? '').toUpperCase()
  const annualOrder = ['10-K/A', '10-K', '20-F/A', '20-F', '40-F/A', '40-F', 'S-1/A', 'S-1', 'F-1/A', 'F-1', '10/A', '10', '10-12B/A', '10-12B', '6-K', '10-Q/A', '10-Q', '8-K/A', '8-K']
  const quarterOrder = ['10-Q/A', '10-Q', '6-K', '10-K/A', '10-K', '20-F/A', '20-F', 'S-1/A', 'S-1', 'F-1/A', 'F-1', '8-K/A', '8-K']
  const index = (annual ? annualOrder : quarterOrder).indexOf(normalized)
  return index < 0 ? 999 : index
}

function sameValue(left, right) {
  const scale = Math.max(1, Math.abs(Number(left)), Math.abs(Number(right)))
  return Math.abs(Number(left) - Number(right)) <= scale * 0.000001
}

function compareCandidates(left, right, metric) {
  const consolidated = Number(Boolean(left.segment)) - Number(Boolean(right.segment))
  if (consolidated) return consolidated
  const sourceQuality = sourceQualityRank(left, metric) - sourceQualityRank(right, metric)
  if (sourceQuality) return sourceQuality
  const concept = conceptRank(left, metric) - conceptRank(right, metric)
  if (concept) return concept
  const form = formRank(left.filingForm, left.durationDays) - formRank(right.filingForm, right.durationDays)
  if (form) return form
  return String(right.filingDate ?? '').localeCompare(String(left.filingDate ?? '')) ||
    String(right.accessionNumber ?? '').localeCompare(String(left.accessionNumber ?? ''))
}

export function selectMetricSourceFacts(records, metric, { preferredCurrency = 'USD' } = {}) {
  // The valuation table is consolidated. Dimensional facts are retained in the
  // raw ledger for lineage, but must never stand in for a missing consolidated fact.
  const candidates = records.filter((record) =>
    record.metricCandidates.includes(metric) && !record.segment)
  const currencies = new Set(candidates.map((record) => record.currency))
  const currency = currencies.has(preferredCurrency) ? preferredCurrency : [...currencies][0]
  const filtered = candidates.filter((record) => record.currency === currency)
  const grouped = new Map()
  for (const record of filtered) {
    const key = `${record.startDate}:${record.endDate}`
    const list = grouped.get(key) ?? []
    list.push(record)
    grouped.set(key, list)
  }

  return [...grouped.values()].map((recordsForPeriod) => {
    const sorted = [...recordsForPeriod].sort((left, right) => compareCandidates(left, right, metric))
    const selected = { ...sorted[0] }
    const comparable = sorted.filter((record) =>
      record.concept === selected.concept && !record.segment && record.currency === selected.currency)
    const authoritative = [...comparable].sort((left, right) => compareCandidates(left, right, metric))[0]
    if (authoritative) Object.assign(selected, authoritative)
    const alternatives = sorted.filter((record) => record.id !== selected.id)
    const conflicting = comparable.filter((record) =>
      record.id !== selected.id && !sameValue(record.value, selected.value))
    const priorComparable = comparable.filter((record) => record.id !== selected.id && !sameValue(record.value, selected.value))
    selected.restatedOrRecast = priorComparable.length > 0
    selected.alternatives = alternatives
    selected.selectionDecision = selected.rawSourceType === 'SEC_NON_GAAP_RECONCILIATION_TABLE'
      ? 'DIRECT_COMPANY_REPORTED_RECONCILIATION'
      : selected.restatedOrRecast
      ? 'LATEST_AUTHORITATIVE_COMPARABLE_RECAST'
      : selected.companyExtension
        ? 'COMPANY_EXTENSION_ECONOMIC_CONCEPT'
        : 'HIGHEST_PRIORITY_STANDARD_CONCEPT'
    selected.validationStatus = conflicting.length && !selected.restatedOrRecast
      ? HISTORICAL_VALIDATION_STATUS.REQUIRES_REVIEW
      : HISTORICAL_VALIDATION_STATUS.VERIFIED_REPORTED
    return selected
  }).sort((left, right) => left.endDate.localeCompare(right.endDate))
}

export async function preserveRawSourceLedger(company, records, sourceMetadata = {}) {
  const versionedSourceMetadata = {
    ...sourceMetadata,
    supplementalSourceSchemaVersion: SUPPLEMENTAL_SOURCE_SCHEMA_VERSION,
  }
  const body = JSON.stringify({ company, sourceMetadata: versionedSourceMetadata, records })
  const documentHash = sha256(body)
  const directory = path.join(process.cwd(), '.cache', 'financial-source-ledger', String(company.cik))
  const filename = `${documentHash}.json`
  try {
    await mkdir(directory, { recursive: true })
    await writeFile(path.join(directory, filename), body, { flag: 'wx' }).catch((error) => {
      if (error.code !== 'EEXIST') throw error
    })
  } catch {
    // The response retains complete lineage when the deployment filesystem is read-only.
  }
  return {
    documentHash,
    snapshotPath: path.join('.cache', 'financial-source-ledger', String(company.cik), filename),
    retrievedAt: sourceMetadata.retrievedAt ?? new Date().toISOString(),
  }
}

export function isSupplementalSourceSnapshotCompatible(snapshot) {
  return snapshot?.sourceMetadata?.supplementalSourceSchemaVersion === SUPPLEMENTAL_SOURCE_SCHEMA_VERSION
}

export async function loadLatestSupplementalSourceFacts(company, options = {}) {
  const cik = String(company?.cik ?? '')
  if (!cik) return null

  const maxAgeMs = options.maxAgeMs ?? SNAPSHOT_MAX_AGE_MS
  const cached = latestSnapshotCache.get(cik)
  if (cached && Date.now() - cached.loadedAt < maxAgeMs) return cached.value

  const directory = path.join(process.cwd(), '.cache', 'financial-source-ledger', cik)
  try {
    const names = (await readdir(directory)).filter((name) => name.endsWith('.json'))
    const candidates = await Promise.all(names.map(async (name) => {
      const filePath = path.join(directory, name)
      const details = await stat(filePath)
      return { filePath, modifiedAt: details.mtimeMs }
    }))
    candidates.sort((left, right) => right.modifiedAt - left.modifiedAt)

    for (const candidate of candidates) {
      if (Date.now() - candidate.modifiedAt > maxAgeMs) break
      try {
        const snapshot = JSON.parse(await readFile(candidate.filePath, 'utf8'))
        if (!isSupplementalSourceSnapshotCompatible(snapshot)) continue
        const records = (snapshot.records ?? []).filter((record) =>
          record.rawSourceType && record.rawSourceType !== 'SEC_COMPANY_FACTS')
        if (!records.length) continue
        const value = {
          records,
          errors: [],
          filingsExamined: new Set(records.map((record) => record.accessionNumber).filter(Boolean)).size,
          snapshotPath: candidate.filePath,
        }
        latestSnapshotCache.set(cik, { value, loadedAt: Date.now() })
        return value
      } catch {
        // A partial snapshot is ignored; try the next newest complete file.
      }
    }
  } catch {
    // A cold deployment may not have a local audit snapshot yet.
  }

  latestSnapshotCache.set(cik, { value: null, loadedAt: Date.now() })
  return null
}
