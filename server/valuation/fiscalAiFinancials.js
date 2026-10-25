import {
  createCanonicalObservation, createPeriodIdentity, DATE_AUTHORITY,
  OBSERVATION_BASIS, PERIOD_TYPE, SEMANTIC_DEFINITION,
} from './canonicalFinancialObservation.js'

export const FISCAL_AI_COMPANY_KEYS = Object.freeze({
  AMZN: 'NASDAQ_AMZN', BE: 'NYSE_BE', CRWV: 'NASDAQ_CRWV', FCEL: 'NASDAQ_FCEL',
  GEV: 'NYSE_GEV', GOOGL: 'NASDAQ_GOOG', INTC: 'NASDAQ_INTC', IREN: 'NASDAQ_IREN',
  META: 'NASDAQ_META', MU: 'NASDAQ_MU', MSFT: 'NASDAQ_MSFT', NBIS: 'NASDAQ_NBIS',
})

export const FISCAL_AI_METRICS = Object.freeze({
  income_statement_total_revenues: 'revenue',
  income_statement_gross_profit: 'grossProfit',
  income_statement_operating_profit: 'ebit',
  cash_flow_statement_cash_from_operating_activities: 'operatingCashFlow',
  cash_flow_statement_purchases_of_property_plant_and_equipment: 'capitalExpenditures',
})

const SOURCE_ENDPOINTS = Object.freeze([
  ['asReportedIncome', '/v1/company/financials/income-statement/as-reported'],
  ['asReportedCashFlow', '/v1/company/financials/cash-flow-statement/as-reported'],
])
const CORE_ENDPOINTS = Object.freeze([
  ['standardizedIncome', '/v1/company/financials/income-statement/standardized'],
  ['standardizedCashFlow', '/v1/company/financials/cash-flow-statement/standardized'],
  ['adjustedMetrics', '/v1/company/adjusted-metrics'],
])
const PERIOD_FILTER = 'annual,quarterly,semi-annual,ytd,ltm'
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function accessionFromUrl(url) {
  const value = String(url ?? '').match(/\/Archives\/edgar\/data\/\d+\/(\d{18})\//)?.[1]
  return value ? `${value.slice(0, 10)}-${value.slice(10, 12)}-${value.slice(12)}` : null
}

function sourceDetails(sources = []) {
  const source = sources.find((item) => item.originalSourceUrl || item.secUrl || item.sourceUrl) ?? sources[0] ?? {}
  const sourceUrl = source.originalSourceUrl ?? source.secUrl ?? source.sourceUrl ?? null
  return {
    accession: source.accession ?? accessionFromUrl(sourceUrl), sourceUrl,
    pageNumber: source.pageNumber ?? source.page ?? null,
    auditUrl: source.auditUrl ?? null,
  }
}

async function apiGet(path, { ticker, companyKey }, { apiKey, fetchImpl, signal, retryDelay }) {
  const url = new URL(path, 'https://api.fiscal.ai')
  // Fiscal.ai documents ticker-only lookups for US listings. Keep known keys
  // for the audited universe, but allow the rest of Market Map's US coverage.
  url.searchParams.set(companyKey ? 'companyKey' : 'ticker', companyKey ?? ticker)
  url.searchParams.set('periodType', PERIOD_FILTER)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetchImpl(url, {
      headers: { 'X-Api-Key': apiKey, Accept: 'application/json' }, signal,
    })
    if (response.ok) {
      const payload = await response.json()
      if (!Array.isArray(payload?.data)) {
        throw new Error(`FISCAL_AI_INVALID_PAYLOAD:${companyKey ?? ticker}:${path}`)
      }
      return payload
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      const seconds = Number(response.headers?.get?.('retry-after'))
      await retryDelay(Number.isFinite(seconds) && seconds > 0
        ? Math.min(seconds * 1000, 60_000)
        : response.status === 429 ? 60_000 : 1_000 * 2 ** attempt)
      continue
    }
    throw new Error(`FISCAL_AI_HTTP_${response.status}:${companyKey ?? ticker}:${path}`)
  }
  throw new Error(`FISCAL_AI_RETRY_EXHAUSTED:${companyKey ?? ticker}`)
}

// The documented Data API is the only runtime connection. Codex MCP credentials
// are never available to a deployed application.
export async function fetchFiscalAiHistorical(tickers, options = {}) {
  const apiKey = options.apiKey ?? process.env.FISCAL_API_KEY
  if (!apiKey) throw new Error('FISCAL_API_KEY is not configured for the server Data API')
  const names = [...new Set(tickers.map((value) => String(value).trim().toUpperCase()))]
  const output = new Array(names.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(2, names.length) }, async () => {
    while (next < names.length) {
      const index = next++
      const ticker = names[index]
      const companyKey = FISCAL_AI_COMPANY_KEYS[ticker]
      const endpoints = options.includeAsReported
        ? [...CORE_ENDPOINTS, ...SOURCE_ENDPOINTS] : CORE_ENDPOINTS
      const fields = await Promise.all(endpoints.map(async ([field, path]) => [field,
        await apiGet(path, { ticker, companyKey }, {
          apiKey, fetchImpl: options.fetchImpl ?? fetch, signal: options.signal,
          retryDelay: options.retryDelay ?? pause,
        })]))
      const responses = Object.fromEntries(fields)
      output[index] = { ticker,
        companyKey: companyKey ?? responses.standardizedIncome?.company?.companyKey ??
          responses.standardizedCashFlow?.company?.companyKey ?? `US_TICKER:${ticker}`,
        ...responses }
    }
  }))
  return output
}

function fiscalPeriodType(period) {
  if (period.periodType === 'Quarterly') return PERIOD_TYPE.STANDALONE_QUARTER
  if (period.periodType === 'Semi-Annual') return PERIOD_TYPE.YTD_6M
  if (period.periodType === 'YTD' && period.periodDuration === '6 Months') return PERIOD_TYPE.YTD_6M
  if (period.periodType === 'YTD' && period.periodDuration === '9 Months') return PERIOD_TYPE.YTD_9M
  if (period.periodType === 'Annual') return PERIOD_TYPE.FISCAL_YEAR
  return PERIOD_TYPE.UNKNOWN
}

function fiscalPeriodIdentity(period) {
  const start = period.periodStart ?? period.startDate ?? null
  return createPeriodIdentity({
    periodType: fiscalPeriodType(period), periodStart: start, periodEnd: period.reportDate,
    dateAuthority: start ? DATE_AUTHORITY.REPORTED : DATE_AUTHORITY.UNKNOWN,
    fiscalYear: period.fiscalYear, fiscalQuarter: period.fiscalQuarter,
    startEvidence: start ? 'FISCAL_AI_EXPLICIT_PERIOD_START' : null,
    endEvidence: 'FISCAL_AI_REPORT_DATE',
  })
}

function componentDetails(value) {
  return (value.asReportedValues ?? []).map((component) => ({
    metricId: component.asReportedMetricId, metricName: component.metricName,
    operation: component.operation, value: component.value, unit: component.unit,
    currency: component.currency, isCalculated: component.isCalculated === true,
    sources: (component.sources ?? []).map((source) => sourceDetails([source])),
  }))
}

export function adaptFiscalAiObservations(payload, { retrievedAt = new Date().toISOString() } = {}) {
  const observations = []
  const failures = []
  for (const response of [payload?.standardizedIncome, payload?.standardizedCashFlow]) {
    for (const period of response?.data ?? []) {
      // Independently validated SEC periods, rather than provider LTM labels,
      // supply the economic start and end boundaries used by Market Map.
      if (period.periodType === 'LTM' || period.isStubPeriod || period.annualOnOtherBasis) continue
      for (const [id, value] of Object.entries(period.metricsValues ?? {})) {
        const metric = FISCAL_AI_METRICS[id]
        if (!metric || value?.value == null || !Number.isFinite(Number(value.value))) continue
        const components = componentDetails(value)
        if (metric === 'grossProfit' && value.calcType !== 'reported' &&
            !components.some((item) => item.operation === '-' || Number(item.value) < 0)) {
          failures.push({ ticker: payload.ticker, metric, periodEnd: period.reportDate,
            reason: 'FISCAL_AI_GROSS_PROFIT_REQUIRES_COST_COMPONENT', components })
          continue
        }
        if (metric === 'capitalExpenditures' && components.some((item) => /prepayment/i.test(item.metricName ?? ''))) {
          failures.push({ ticker: payload.ticker, metric, periodEnd: period.reportDate,
            reason: 'FISCAL_AI_CAPEX_PREPAYMENT_OVERLAP_REQUIRES_SEC_RECONCILIATION', components })
          continue
        }
        if (metric === 'capitalExpenditures' && components.some((item) =>
          /project asset expenditures?/i.test(item.metricName ?? ''))) {
          failures.push({ ticker: payload.ticker, metric, periodEnd: period.reportDate,
            reason: 'FISCAL_AI_CAPEX_PROJECT_ASSET_SCOPE_REQUIRES_SEC_RECONCILIATION', components })
          continue
        }
        const source = sourceDetails(components.flatMap((item) => item.sources))
        const currency = String(value.currency ?? components[0]?.currency ?? '').toUpperCase()
        if (!currency) {
          failures.push({ ticker: payload.ticker, metric, periodEnd: period.reportDate,
            reason: 'FISCAL_AI_MISSING_CURRENCY' })
          continue
        }
        const reported = value.calcType === 'reported' && components.length === 1 && !components[0].isCalculated
        try {
          observations.push(createCanonicalObservation({
            ticker: payload.ticker, issuerId: payload.ticker, metric,
            rawValue: value.value,
            rawUnits: `${currency} normalized (filing unit ${value.unit ?? 'unknown'})`,
            normalizedValue: metric === 'capitalExpenditures' ? Math.abs(Number(value.value)) : Number(value.value),
            currency, normalizedUnits: currency,
            periodIdentity: fiscalPeriodIdentity(period),
            sourceProvider: 'Fiscal.ai',
            sourceId: `Fiscal.ai:${payload.companyKey}:${id}:${period.periodId ?? period.reportDate}`,
            filingDate: period.lastSourceFilingDate ?? period.earningsDate ?? null,
            accession: source.accession, sourceUrl: source.sourceUrl, scope: 'CONSOLIDATED',
            confidence: source.sourceUrl ? 'HIGH' : 'MEDIUM',
            reportedVsDerived: reported ? OBSERVATION_BASIS.REPORTED : OBSERVATION_BASIS.DERIVED,
            derivation: reported ? null : {
              method: 'FISCAL_AI_STANDARDIZED_MAPPING', calcType: value.calcType ?? null,
              mappingType: value.mappingType ?? null, components,
            },
            semanticDefinitionFingerprint: SEMANTIC_DEFINITION[metric],
            sourceDefinitionFingerprint: `FISCAL_AI:${id}`,
            retrievedAt, restatedOrRecast: period.isRestated === true,
            warnings: [...(!source.sourceUrl ? ['FISCAL_AI_NO_DIRECT_SOURCE_URL'] : []),
              ...(!period.periodStart && !period.startDate ? ['PERIOD_START_REQUIRES_SEC_EVIDENCE'] : [])],
          }))
        } catch (error) {
          failures.push({ ticker: payload.ticker, metric, periodEnd: period.reportDate,
            reason: 'FISCAL_AI_CANONICAL_ADAPTER_REJECTION', message: error.message })
        }
      }
    }
  }
  return { observations, failures }
}

export function fiscalAdjustedEbitdaCandidates(payload) {
  return (payload?.adjustedMetrics?.data ?? [])
    .filter((period) => ['Annual', 'LTM'].includes(period.periodType))
    .flatMap((period) => {
      const value = period.metricValues?.adjusted_ebitda
      if (value?.adjusted !== true || value.value == null || !Number.isFinite(Number(value.value))) return []
      return [{ ticker: payload.ticker, periodType: period.periodType, periodEnd: period.reportDate,
        fiscalYear: period.fiscalYear ?? null, value: Number(value.value), currency: value.currency,
        source: sourceDetails(value.sources),
        sourceId: `Fiscal.ai:${payload.companyKey}:adjusted_ebitda:${period.periodId ?? period.reportDate}` }]
    })
}

export function compareFiscalAdjustedEbitda(entry, candidates, periodEnd, periodType = 'LTM') {
  const candidate = candidates.find((item) => item.periodEnd === periodEnd && item.periodType === periodType)
  if (!candidate || entry?.value == null || !Number.isFinite(Number(entry.value))) return null
  const difference = candidate.value - Number(entry.value)
  if (Math.abs(difference) / Math.max(Math.abs(Number(entry.value)), 1) <= 0.001) return null
  return { stage: 'FISCAL_AI_ADJUSTED_EBITDA', reason: 'FISCAL_AI_SEC_VALUE_MISMATCH',
    fiscalValue: candidate.value, secValue: Number(entry.value), difference,
    periodEnd, fiscalSource: candidate.source }
}
