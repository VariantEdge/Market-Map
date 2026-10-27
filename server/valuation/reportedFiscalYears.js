import { DATE_AUTHORITY, PERIOD_TYPE, OBSERVATION_BASIS, inclusiveDays } from './canonicalFinancialObservation.js'

export const REPORTED_FISCAL_METRICS = Object.freeze([
  'revenue', 'grossProfit', 'ebit', 'operatingCashFlow',
  'capitalExpenditures', 'freeCashFlow', 'adjustedEbitda',
])

const secureSecUrl = (url) => /^https:\/\/(?:www\.|data\.)sec\.gov\/Archives\/edgar\/data\//i.test(url ?? '')
const finite = (value) => value != null && Number.isFinite(Number(value))
const annualPeriod = (period, year) => period?.periodStart && period?.periodEnd &&
  Number(period.periodEnd.slice(0, 4)) === Number(year) &&
  [PERIOD_TYPE.FISCAL_YEAR, PERIOD_TYPE.CALENDAR_YEAR].includes(period.periodType) &&
  [DATE_AUTHORITY.REPORTED, DATE_AUTHORITY.DERIVED_FROM_REPORTED_BOUNDARIES].includes(period.dateAuthority) &&
  inclusiveDays(period.periodStart, period.periodEnd) >= 330 &&
  inclusiveDays(period.periodStart, period.periodEnd) <= 380

function secLineage(observation) {
  const exactInputs = observation.derivation?.inputs ?? []
  if (observation.reportedVsDerived === OBSERVATION_BASIS.DERIVED &&
      observation.derivation?.exactness === 'EXACT_ARITHMETIC' && exactInputs.length >= 2 &&
      exactInputs.every((input) => input.sourceProvider === 'SEC' && secureSecUrl(input.sourceUrl))) {
    return exactInputs
  }
  if (observation.sourceProvider === 'SEC' &&
      (secureSecUrl(observation.sourceUrl) ||
        (observation.derivation?.inputs?.length > 0 && observation.derivation.inputs
          .every((input) => input.sourceProvider === 'SEC' && secureSecUrl(input.sourceUrl))))) {
    if (observation.reportedVsDerived === OBSERVATION_BASIS.DERIVED &&
        observation.derivation?.exactness !== 'EXACT_ARITHMETIC') return null
    return secureSecUrl(observation.sourceUrl) ? [observation] : observation.derivation.inputs
  }
  const evidence = observation.derivation?.periodEvidence
  if (observation.derivation?.method !== 'FISCAL_AI_VALUE_WITH_SEC_PERIOD_EVIDENCE' ||
      observation.derivation?.reconciliation?.matches !== true ||
      evidence?.sourceProvider !== 'SEC' || !secureSecUrl(evidence.sourceUrl)) return null
  return [evidence]
}

function sourceRef(source) {
  return {
    sourceProvider: 'SEC', sourceId: source.sourceId ?? source.provenance?.sourceId ?? null,
    sourceUrl: source.sourceUrl ?? source.filingUrl ?? null,
    accession: source.accession ?? source.accessionNumber ?? null,
    periodStart: source.periodIdentity?.periodStart ?? source.startDate ?? null,
    periodEnd: source.periodIdentity?.periodEnd ?? source.endDate ?? null,
    value: source.normalizedValue ?? source.value ?? null,
    concept: source.concept ?? source.label ?? null,
  }
}

function fiscalCandidates(records, metric, year) {
  return (records?.[metric] ?? []).flatMap((observation) => {
    if (!annualPeriod(observation.periodIdentity, year) || !finite(observation.normalizedValue) ||
        observation.deduplicationStatus === 'REQUIRES_REVIEW' ||
        observation.currency !== 'USD' || !observation.scope) return []
    if (metric === 'freeCashFlow') {
      const inputs = observation.derivation?.inputs ?? []
      if (observation.reportedVsDerived !== OBSERVATION_BASIS.DERIVED ||
          observation.derivation?.method !== 'CFO_MINUS_CAPEX' || inputs.length !== 2 ||
          inputs.some((input) => input.periodIdentity?.periodStart !== observation.periodIdentity.periodStart ||
            input.periodIdentity?.periodEnd !== observation.periodIdentity.periodEnd ||
            input.operationScope !== observation.operationScope) ||
          (observation.operationScope === 'UNSPECIFIED' &&
            (!inputs[0].accession || inputs[0].accession !== inputs[1].accession))) return []
    }
    const evidence = secLineage(observation)
    if (!evidence) return []
    return [{ ticker: observation.ticker, fiscalYear: year, metric,
      periodStart: observation.periodIdentity.periodStart,
      periodEnd: observation.periodIdentity.periodEnd,
      value: Number(observation.normalizedValue), currency: observation.currency,
      operationScope: observation.operationScope ?? null,
      status: observation.reportedVsDerived === OBSERVATION_BASIS.DERIVED
        ? 'VERIFIED_DERIVED' : 'VERIFIED_REPORTED',
      calculation: observation.derivation?.method ?? 'DIRECT_SEC_REPORTED_FISCAL_PERIOD',
      sourceRefs: evidence.map(sourceRef),
      calculationInputs: (observation.derivation?.inputs ?? []).map(sourceRef),
      filingDate: observation.filingDate ?? null,
    }]
  })
}

function selectFiscalCandidate(candidates) {
  if (!candidates.length) return null
  const groups = new Map()
  for (const candidate of candidates) {
    const key = `${candidate.periodStart}|${candidate.periodEnd}|${candidate.operationScope}`
    groups.set(key, [...(groups.get(key) ?? []), candidate])
  }
  if (groups.size !== 1) return null
  const group = [...groups.values()][0]
  const values = group.map((candidate) => candidate.value)
  const scale = Math.max(1, ...values.map(Math.abs))
  if (Math.max(...values) - Math.min(...values) > scale * 0.001) return null
  return group.sort((left, right) => Number(right.status === 'VERIFIED_REPORTED') -
    Number(left.status === 'VERIFIED_REPORTED') ||
    String(right.filingDate).localeCompare(String(left.filingDate)))[0]
}

function deriveFiscalFcf(ticker, year, operatingCashFlow, capitalExpenditures) {
  if (!operatingCashFlow || !capitalExpenditures ||
      operatingCashFlow.periodStart !== capitalExpenditures.periodStart ||
      operatingCashFlow.periodEnd !== capitalExpenditures.periodEnd ||
      operatingCashFlow.currency !== capitalExpenditures.currency ||
      !operatingCashFlow.operationScope ||
      operatingCashFlow.operationScope !== capitalExpenditures.operationScope ||
      (operatingCashFlow.operationScope === 'UNSPECIFIED' &&
        (!operatingCashFlow.sourceRefs[0]?.accession ||
          operatingCashFlow.sourceRefs[0].accession !== capitalExpenditures.sourceRefs[0]?.accession))) return null
  return { ticker, fiscalYear: year, metric: 'freeCashFlow',
    periodStart: operatingCashFlow.periodStart, periodEnd: operatingCashFlow.periodEnd,
    value: operatingCashFlow.value - capitalExpenditures.value,
    currency: operatingCashFlow.currency, operationScope: operatingCashFlow.operationScope,
    status: 'VERIFIED_DERIVED', calculation: 'EXACT_FISCAL_OCF_MINUS_CASH_CAPEX',
    sourceRefs: [...operatingCashFlow.sourceRefs, ...capitalExpenditures.sourceRefs],
    calculationInputs: [operatingCashFlow, capitalExpenditures].map((cell) => ({
      metric: cell.metric, value: cell.value, periodStart: cell.periodStart, periodEnd: cell.periodEnd,
      sourceRefs: cell.sourceRefs,
    })),
  }
}

function adjustedFiscalCandidate(adjustedEbitda, year, ticker) {
  const facts = (adjustedEbitda?.selectedFacts ?? []).filter((fact) =>
    ['FISCAL_YEAR', 'CALENDAR_YEAR'].includes(fact.periodType) &&
    Number(fact.endDate?.slice(0, 4)) === Number(year) &&
    inclusiveDays(fact.startDate, fact.endDate) >= 330 &&
    inclusiveDays(fact.startDate, fact.endDate) <= 380 && finite(fact.value) &&
    fact.currency === 'USD' && fact.definitionFingerprint &&
    fact.provenance?.sourceId && secureSecUrl(fact.filingUrl))
  const candidates = facts.map((fact) => ({
    ticker, fiscalYear: year, metric: 'adjustedEbitda',
    periodStart: fact.startDate, periodEnd: fact.endDate,
    value: Number(fact.value), currency: fact.currency, operationScope: null,
    status: 'VERIFIED_REPORTED', calculation: 'COMPANY_DEFINED_SEC_FILED_RECONCILIATION',
    sourceRefs: [sourceRef(fact)], calculationInputs: [], filingDate: fact.filingDate ?? null,
    definitionFingerprint: fact.definitionFingerprint,
  }))
  return selectFiscalCandidate(candidates)
}

export function buildReportedFiscalYears({ ticker, canonical, adjustedEbitda, years }) {
  const cells = []
  for (const year of years) {
    const chosen = Object.fromEntries(REPORTED_FISCAL_METRICS.map((metric) => [metric,
      metric === 'adjustedEbitda'
        ? adjustedFiscalCandidate(adjustedEbitda, year, ticker)
        : selectFiscalCandidate(fiscalCandidates(canonical?.records, metric, year)),
    ]))
    if (!chosen.freeCashFlow) chosen.freeCashFlow = deriveFiscalFcf(ticker, year,
      chosen.operatingCashFlow, chosen.capitalExpenditures)
    for (const metric of REPORTED_FISCAL_METRICS) {
      const candidate = chosen[metric]
      cells.push(candidate ?? { ticker, fiscalYear: year, metric, periodStart: null, periodEnd: null,
        value: null, currency: 'USD', status: 'UNRESOLVED',
        calculation: 'NO_UNCONFLICTED_EXACT_SEC_BACKED_REPORTED_FISCAL_YEAR', sourceRefs: [], calculationInputs: [] })
    }
  }
  return cells
}
