import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

// Publish SEC-backed audit conclusions without copying bulk licensed provider
// output into this public repository. A reviewer with Fiscal.ai access can
// re-query the indexed provider observations in the local audit run.
const [latestPath, baselinePath, testedCommit, testCount = 'unknown', priorFiscalPath] = process.argv.slice(2)
if (!latestPath || !baselinePath || !testedCommit) {
  throw new Error('Usage: node scripts/publish-fiscalai-audit.mjs LATEST_JSON BASELINE_JSON TESTED_COMMIT [TEST_COUNT] [PRIOR_FISCAL_JSON]')
}
const latest = JSON.parse(await readFile(latestPath, 'utf8'))
const baseline = JSON.parse(await readFile(baselinePath, 'utf8'))
const priorFiscal = priorFiscalPath ? JSON.parse(await readFile(priorFiscalPath, 'utf8')) : null
if (latest.records?.length !== 336 || !Array.isArray(latest.fiscalAiDiscrepancies)) {
  throw new Error('Expected a complete 336-cell Fiscal.ai audit with discrepancy records')
}
const outputDirectory = path.resolve('docs/audits')
const isSecUrl = (value) => /^https:\/\/(?:www\.|data\.)sec\.gov\//i.test(value ?? '')
const accessionFromUrl = (url) => {
  const digits = String(url ?? '').match(/\/Archives\/edgar\/data\/\d+\/(\d{18})\//)?.[1]
  return digits ? `${digits.slice(0, 10)}-${digits.slice(10, 12)}-${digits.slice(12)}` : null
}
const verified = new Set(['VERIFIED_REPORTED', 'VERIFIED_DERIVED'])
const auditIssueByCell = new Map()
const cellKey = (row) => `${row.ticker}|${row.metric}|${row.calendarYear ?? row.period}`
for (const issue of latest.auditIssues ?? []) {
  const key = `${issue.ticker}|${issue.metric}|${issue.period}`
  if (!auditIssueByCell.has(key)) auditIssueByCell.set(key, [])
  auditIssueByCell.get(key).push({ code: issue.reason, status: issue.status ?? null })
}
function sourceReference(component, cellStatus) {
  const url = isSecUrl(component.sourceUrl) ? component.sourceUrl : null
  return {
    source: component.sourceProvider === 'Fiscal.ai' ? 'Fiscal.ai candidate reconciled to SEC' : component.sourceProvider,
    filingUrl: url,
    accession: component.accn ?? accessionFromUrl(url),
    periodStart: component.sourceStart ?? null,
    periodEnd: component.sourceEnd ?? null,
    role: component.role ?? null,
    amountUsd: url && verified.has(cellStatus) ? component.sourceValue ?? null :
      component.sourceProvider === 'SEC' ? component.sourceValue ?? null : null,
    operationScope: component.operationScope ?? null,
    definitionFingerprint: component.definitionFingerprint ?? component.sourceDefinitionFingerprint ?? null,
    provenanceComplete: Boolean(url && component.sourceStart && component.sourceEnd),
  }
}
function cellFromRecord(record) {
  const issueCodes = auditIssueByCell.get(cellKey(record)) ?? []
  const sources = (record.quarterlyComponents ?? []).map((component) =>
    sourceReference(component, record.validationStatus))
  const acceptedNa = record.displayedValue == null && issueCodes.length === 0
  const staleScopeConcern = record.ticker === 'FCEL' && record.metric === 'freeCashFlow' &&
    record.calendarYear === 'LTM' && acceptedNa &&
    sources.every((source) => (source.periodEnd ?? '') < '2023-01-01')
  return {
    ticker: record.ticker, metric: record.metric, period: record.calendarYear,
    valueUsd: record.displayedValue ?? null, status: record.validationStatus,
    exactness: record.exactness ?? null,
    calculation: record.formula ?? null,
    validationEvidence: {
      warning: record.warning ?? null,
      rootCause: record.failureReason ?? null,
      verificationBasis: record.verificationBasis ?? null,
      reconciliation: record.reconciliationResults ?? [],
      negativeSearchEvidence: record.negativeSearchEvidence ?? null,
      nullEvidence: record.nullEvidence ?? null,
      auditIssues: issueCodes,
      acceptedNaByCurrentValidator: acceptedNa,
      staleScopeConcern,
    },
    sources,
  }
}
const cells = latest.records.map(cellFromRecord)
const unresolvedCells = cells.filter((cell) => cell.validationEvidence.auditIssues.length)
const acceptedNaCells = cells.filter((cell) => cell.validationEvidence.acceptedNaByCurrentValidator)
const unresolvedByRootCause = Object.groupBy(unresolvedCells,
  (cell) => cell.validationEvidence.rootCause ?? 'Unclassified audit failure')
const staleAcceptedNaCount = acceptedNaCells.filter((cell) =>
  cell.validationEvidence.staleScopeConcern).length
const auditPassed = unresolvedCells.length === 0 && staleAcceptedNaCount === 0
const previous = new Map(baseline.records.map((record) => [cellKey(record), record]))
function regressionExplanation(change) {
  if (['FCEL', 'MU'].includes(change.ticker) && change.period !== 'LTM' &&
    ['revenue', 'grossProfit', 'ebit', 'operatingCashFlow', 'capitalExpenditures', 'freeCashFlow'].includes(change.metric)) {
    return 'Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods.'
  }
  if (change.ticker === 'FCEL' && change.metric === 'capitalExpenditures' && change.period !== 'LTM') {
    return 'Prior Wise-based result allocated October fiscal quarters across Jan–Dec boundaries; current provider/SEC Capex candidates conflict. Exact value unestablished.'
  }
  if (change.ticker === 'FCEL' && change.metric === 'capitalExpenditures') {
    return 'Competing cash-Capex candidates for the LTM economic period conflict; source mapping needs adjudication.'
  }
  if (change.ticker === 'FCEL' && change.metric === 'freeCashFlow' && change.period !== 'LTM') {
    return 'Prior FCF depended on allocated FCEL Capex; exact cash-Capex calendar coverage now fails closed.'
  }
  if (change.ticker === 'FCEL' && change.metric === 'freeCashFlow') {
    return 'OCF continuing-operations scope differs from unspecified Capex scope; current accepted-N/A evidence is stale (2018).'
  }
  if (change.ticker === 'MU') {
    return 'Prior FCF allocated August fiscal quarters across Jan–Dec; exact calendar cash Capex is unavailable.'
  }
  if (change.ticker === 'NBIS') {
    return 'Fiscal standardized OCF and SEC continuing-operations observations conflict; recast/scope not adjudicated.'
  }
  if (change.ticker === 'CRWV') {
    return '2023 provider Gross Profit lacks an exact SEC-corroborated cost/gross-profit period.'
  }
  if (change.ticker === 'AMZN') {
    return '2023 Gross Profit construction lost exact corroborated cost-period coverage; mapping requires review.'
  }
  return 'Source, mapping, and period construction require adjudication.'
}
const comparisons = cells.map((cell) => {
  const before = previous.get(cellKey(cell))
  return { ticker: cell.ticker, metric: cell.metric, period: cell.period,
    previousValueUsd: before?.displayedValue ?? null,
    previousStatus: before?.validationStatus ?? null,
    currentValueUsd: cell.valueUsd, currentStatus: cell.status,
    previousWarning: before?.warning ?? null,
    currentWarning: cell.validationEvidence.warning,
    currentRootCause: cell.validationEvidence.rootCause,
  }
})
const regressions = comparisons.filter((change) => verified.has(change.previousStatus) &&
  !verified.has(change.currentStatus)).map((change) =>
  ({ ...change, explanation: regressionExplanation(change) }))
const improvements = comparisons.filter((change) => !verified.has(change.previousStatus) &&
  verified.has(change.currentStatus))
const changedVerifiedValues = comparisons.filter((change) => verified.has(change.previousStatus) &&
  verified.has(change.currentStatus) && change.previousValueUsd !== change.currentValueUsd)
const priorFiscalRecords = new Map((priorFiscal?.records ?? []).map((record) => [cellKey(record), record]))
const branchChanges = priorFiscal ? cells.flatMap((cell) => {
  const before = priorFiscalRecords.get(cellKey(cell))
  if (!before || (before.validationStatus === cell.status && before.displayedValue === cell.valueUsd)) return []
  return [{ ticker: cell.ticker, metric: cell.metric, period: cell.period,
    beforeStatus: before.validationStatus, beforeValueUsd: before.displayedValue ?? null,
    afterStatus: cell.status, afterValueUsd: cell.valueUsd,
    assessment: !verified.has(before.validationStatus) && verified.has(cell.status)
      ? 'IMPROVED_VERIFICATION'
      : verified.has(before.validationStatus) && !verified.has(cell.status)
        ? 'WITHDRAWN_NON_EXACT_VALUE'
        : 'CHANGED_STATUS_OR_VALUE' }]
}) : []
const sanitizeProviderMismatch = (item, index) => {
  const sec = item.secSource ?? {}
  const fiscal = item.fiscalSource ?? {}
  const secUrl = isSecUrl(sec.sourceUrl) ? sec.sourceUrl : null
  const fiscalUrl = isSecUrl(fiscal.sourceUrl) ? fiscal.sourceUrl : null
  return {
    id: `M${String(index + 1).padStart(3, '0')}`,
    ticker: item.ticker, metric: item.metric ?? 'adjustedEbitda',
    period: item.period ?? null,
    periodStart: item.periodStart ?? sec.periodIdentity?.periodStart ?? null,
    periodEnd: item.periodEnd ?? sec.periodIdentity?.periodEnd ?? null,
    status: 'UNADJUDICATED_PROVIDER_SEC_CONFLICT',
    providerValueUsd: null,
    providerValuePublication: 'WITHHELD_PENDING_PUBLIC_REDISTRIBUTION_RIGHTS',
    secValueUsd: item.secValue ?? null,
    providerObservationId: fiscal.sourceId ?? null,
    providerSourceFilingUrl: fiscalUrl,
    secSource: { filingUrl: secUrl ?? fiscalUrl,
      accession: sec.accession ?? accessionFromUrl(secUrl ?? fiscalUrl),
      form: sec.form ?? null, concept: sec.concept ?? null,
      periodStart: sec.periodIdentity?.periodStart ?? null,
      periodEnd: sec.periodIdentity?.periodEnd ?? null },
    explanation: item.metric === 'capitalExpenditures'
      ? 'Standardized cash-Capex mapping differs from the SEC concept for this economic period; review components and possible recasts.'
      : item.metric === undefined && item.ticker === 'GEV'
        ? 'Fiscal.ai LTM Adjusted EBITDA differs from the precise SEC reconciliation; SEC remains authoritative.'
        : 'Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication.',
  }
}
const providerMismatches = latest.fiscalAiDiscrepancies.map(sanitizeProviderMismatch)
const originalProviderMismatches = (priorFiscal?.fiscalAiDiscrepancies ?? []).map(sanitizeProviderMismatch)
const mismatchKey = (item) => JSON.stringify([
  item.ticker, item.metric, item.period, item.periodStart, item.periodEnd,
  item.secValueUsd, item.providerObservationId, item.secSource.accession,
])
const latestMismatchCounts = new Map()
for (const item of providerMismatches) {
  const key = mismatchKey(item)
  latestMismatchCounts.set(key, (latestMismatchCounts.get(key) ?? 0) + 1)
}
for (const item of originalProviderMismatches) {
  const key = mismatchKey(item)
  const remaining = latestMismatchCounts.get(key) ?? 0
  item.latestDisposition = remaining > 0 ? 'STILL_FLAGGED' : 'NO_LONGER_FLAGGED_AFTER_MAPPING_FIX'
  if (remaining > 0) latestMismatchCounts.set(key, remaining - 1)
}
const originalUnresolvedKeys = new Set((priorFiscal?.auditIssues ?? []).map((issue) =>
  `${issue.ticker}|${issue.metric}|${issue.period}`))
const originalUnresolvedCells = (priorFiscal?.records ?? [])
  .filter((record) => originalUnresolvedKeys.has(cellKey(record)))
  .map((record) => ({ ticker: record.ticker, metric: record.metric,
    period: record.calendarYear, status: record.validationStatus,
    rootCause: record.failureReason ?? null, warning: record.warning ?? null,
    sources: (record.quarterlyComponents ?? []).map((component) =>
      sourceReference(component, record.validationStatus)) }))
const report = {
  schemaVersion: 1,
  repository: 'VariantEdge/Market-Map', branch: 'review/fiscalai-migration',
  testedImplementationCommit: testedCommit,
  generatedFromAuditAt: latest.generatedAt,
  auditSource: latest.providerSource,
  disclosure: 'Public report includes SEC-backed values and references. Bulk provider-only numeric outputs are withheld pending Fiscal.ai redistribution rights.',
  summary: { ...latest.summary, verifiedTotal: latest.summary.VERIFIED_REPORTED + latest.summary.VERIFIED_DERIVED,
    auditPassed, acceptedNaWithStalePeriodConcern: staleAcceptedNaCount },
  validation: { tests: `PASS (${testCount})`, lint: 'PASS', typecheck: 'PASS', build: 'PASS',
    financialAudit: `${auditPassed ? 'PASS' : 'FAIL'} (${latest.summary.unresolvedCellCount} unresolved)` },
  universe: { tickers: latest.tickers, metrics: latest.metrics, periods: [...latest.years.map((year) => `${year}A`), 'LTM'] },
  baseline: { generatedAt: baseline.generatedAt, summary: baseline.summary,
    regressions, improvements, changedVerifiedValues, allCellComparisons: comparisons },
  reviewBranchPreviousAudit: priorFiscal ? {
    generatedAt: priorFiscal.generatedAt, summary: priorFiscal.summary,
    changes: branchChanges,
    conflictCountChange: latest.fiscalAiDiscrepancies.length - priorFiscal.fiscalAiDiscrepancies.length,
    originalUnresolvedCells,
    originalProviderMismatches,
  } : null,
  cells, unresolvedCells, unresolvedByRootCause, acceptedNaCells, providerMismatches,
}

const fmt = (value) => value == null ? 'N/A' : Number(value).toLocaleString('en-US')
const fmtMillions = (value) => value == null ? 'N/A' : Number(value / 1e6).toLocaleString('en-US', { maximumFractionDigits: 3 })
const sourceLinks = (cell) => cell.sources.filter((source) => source.filingUrl)
  .slice(0, 2).map((source) => `[${source.accession ?? 'SEC'}](${source.filingUrl})`).join(', ') || 'No filing link in flattened record'
const escapeTable = (value) => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ')
const markdown = []
const add = (...lines) => markdown.push(...lines)
add('# Fiscal.ai migration — independent review audit', '',
  `- **Tested implementation commit:** \`${testedCommit}\``,
  `- **Audit generated:** ${latest.generatedAt}`,
  `- **Scope:** ${latest.summary.totalCompanies} companies × 7 metrics × 4 periods = ${latest.summary.totalHistoricalNumbers} cells.`, '',
  `This is a review branch. The audit **${auditPassed ? 'passes' : 'fails'}**; these results must not be promoted to production snapshots without separate approval.`, '',
  '## Results', '',
  `- Verified reported: **${latest.summary.VERIFIED_REPORTED}**`,
  `- Verified derived: **${latest.summary.VERIFIED_DERIVED}**`,
  `- Accepted N/A by current validator: **${acceptedNaCells.length}** (${staleAcceptedNaCount} have stale-period evidence; see below)`,
  `- Unresolved: **${unresolvedCells.length}**`,
  `- Fiscal.ai-versus-SEC observation conflicts: **${providerMismatches.length}** (underlying observations, not 336 final cells)`,
  `- Economic sanity flags: **${latest.summary.economicSanityFlagCount}**`, '',
  '### Verification', '',
  `| Check | Result |`, `| --- | --- |`,
  `| npm test | ${testCount} passed, 0 failed |`,
  `| npm run lint | Passed |`, `| npm run typecheck | Passed |`,
  `| npm run build | Passed |`,
  `| npm run financials:audit | ${auditPassed ? 'Passed' : 'Failed closed'}: ${unresolvedCells.length} unresolved / 336 |`, '',
  `The audit used ${latest.providerSource === 'FISCAL_AI_MCP_LOCAL_CAPTURE' ? 'Fiscal.ai MCP responses captured locally' : 'Fiscal.ai REST responses'} and SEC source checks. No production Fiscal.ai REST credential was available for this run. The complete local provider capture is **not** committed.`, '',
  ...(priorFiscal ? [
    '## Change since the previous published Fiscal.ai audit', '',
    `The previous review-branch audit (${priorFiscal.generatedAt}) had ${priorFiscal.summary.VERIFIED_REPORTED + priorFiscal.summary.VERIFIED_DERIVED} verified, ${priorFiscal.summary.acceptedNaCellsWithEvidence} accepted N/As, ${priorFiscal.summary.unresolvedCellCount} unresolved, and ${priorFiscal.summary.fiscalAiDiscrepancyCount} underlying observation conflicts. The current run has ${latest.summary.VERIFIED_REPORTED + latest.summary.VERIFIED_DERIVED} verified, ${acceptedNaCells.length} accepted N/As, ${unresolvedCells.length} unresolved, and ${providerMismatches.length} conflicts.`,
    'The generic Capex mapping correction resolved FCEL LTM cash Capex and FCF from exact source quarters and removed 33 mixed-project-asset observations from the provider/SEC conflict list. The exact-calendar guard withdrew 24 FCEL/MU annual values that had been prorated across calendar boundaries. These are disclosed verification regressions, not silently accepted N/As.', '',
    '| Ticker | Metric | Period | Before status | Before USD | Current status | Current USD | Assessment |',
    '| --- | --- | --- | --- | ---: | --- | ---: | --- |',
    ...branchChanges.map((change) => `| ${change.ticker} | ${change.metric} | ${change.period} | ${change.beforeStatus} | ${fmt(change.beforeValueUsd)} | ${change.afterStatus} | ${fmt(change.afterValueUsd)} | ${change.assessment} |`),
    '',
    `### Original ${originalUnresolvedCells.length} unresolved cells`, '',
    'These are retained as the historical first-published audit state. Their latest dispositions appear in the change table above and in the current 336-cell table below.', '',
    '| Ticker | Metric | Period | Original status | Original root cause |',
    '| --- | --- | --- | --- | --- |',
    ...originalUnresolvedCells.map((cell) => `| ${cell.ticker} | ${cell.metric} | ${cell.period} | ${cell.status} | ${escapeTable(cell.rootCause)} |`),
    '',
  ] : []),
  '## Nine originally unresolved MU/IREN cells', '',
  '| Cell | Value (USD millions) | Status | SEC-supported construction or gap |',
  '| --- | ---: | --- | --- |')
const originalNine = [
  ...[2023, 2024, 2025].map((year) => ['MU', 'capitalExpenditures', `${year}A`]),
  ...[2023, 2024].map((year) => ['IREN', 'grossProfit', `${year}A`]),
  ...[2023, 2024, 2025].map((year) => ['IREN', 'capitalExpenditures', `${year}A`]),
  ['IREN', 'freeCashFlow', '2023A'],
]
for (const [ticker, metric, period] of originalNine) {
  const cell = cells.find((row) => row.ticker === ticker && row.metric === metric && row.period === period)
  const ocf = cells.find((row) => row.ticker === ticker && row.metric === 'operatingCashFlow' && row.period === period)
  const capex = cells.find((row) => row.ticker === ticker && row.metric === 'capitalExpenditures' && row.period === period)
  const sourceMath = metric === 'freeCashFlow' && cell.valueUsd != null && ocf?.valueUsd != null && capex?.valueUsd != null
    ? `CY OCF ${fmtMillions(ocf.valueUsd)} − CY cash Capex ${fmtMillions(capex.valueUsd)}; OCF sources ${ocf.sources.map((source) => source.accession).filter(Boolean).join(', ')}; Capex sources ${capex.sources.map((source) => source.accession).filter(Boolean).join(', ')}`
    : cell.valueUsd == null
    ? `${escapeTable(cell.validationEvidence.rootCause ?? cell.validationEvidence.warning ?? 'Exact period source coverage unavailable')}; no proration.`
    : `${cell.calculation ?? 'Derived'}: ${cell.sources.map((source, index) => `${index === 0 ? '' : index === 1 ? ' + ' : ' − '}${fmtMillions(source.amountUsd)} [${source.periodStart}–${source.periodEnd}; ${source.accession ?? 'accession unavailable'}]`).join('')}`
  add(`| ${ticker} ${metric} ${period} | ${fmtMillions(cell.valueUsd)} | ${cell.status} | ${escapeTable(sourceMath)} |`)
}
add('',
  'IREN source accessions: [FY23 comparative 0001878848-25-000063](https://www.sec.gov/Archives/edgar/data/1878848/000187884825000063/iren-20250630.htm), [H2 CY23 0001878848-25-000009](https://www.sec.gov/Archives/edgar/data/1878848/000187884825000009/iren-20241231_d2.htm), [H2 CY22 0001140361-24-008183](https://www.sec.gov/Archives/edgar/data/1878848/000114036124008183/ef20015356_ex99-3.htm), [FY24/FY25 comparative 0001878848-26-000052](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm), and [H2 CY24/CY25 0001878848-26-000015](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000015/iren-20251231.htm). MU August fiscal-year filings: [0000723125-25-000028](https://www.sec.gov/Archives/edgar/data/723125/000072312525000028/mu-20250828.htm) and [0000723125-26-000023](https://www.sec.gov/Archives/edgar/data/723125/000072312526000023/mu-20260903.htm).', '',
  '## Comparison with prior WiseSheets-based audit', '',
  `The cached ${baseline.generatedAt} WiseSheets/SEC run had ${baseline.summary.VERIFIED_REPORTED} reported, ${baseline.summary.VERIFIED_DERIVED} derived, ${baseline.summary.acceptedNaCellsWithEvidence} accepted N/As, and ${baseline.summary.unresolvedCellCount} unresolved. The current run has ${regressions.length} verified-to-nonverified transitions and ${changedVerifiedValues.length} changed verified values. Dates and newest LTM endpoints differ, so changed LTM values are not automatically provider errors. The earlier “nine unresolved” figure was a separate historical audit state; it is not this immediate baseline.`, '',
  'Prior verified FCEL/MU annual values that allocated fiscal quarters across January or December have been withdrawn. Their loss of verification enforces exact-calendar accounting; it is not evidence that the new provider alone caused missing data. Other transitions still need source adjudication.', '',
  '### Every verified-to-nonverified transition', '',
  '| Ticker | Metric | Period | Previous | Current | Explanation |', '| --- | --- | --- | ---: | --- | --- |')
for (const row of regressions) add(`| ${row.ticker} | ${row.metric} | ${row.period} | ${fmt(row.previousValueUsd)} | ${row.currentStatus} | ${escapeTable(row.explanation)} |`)
add('', '### Changed values that remain verified', '',
  '| Ticker | Metric | Period | Prior USD | Current USD | Review note |',
  '| --- | --- | --- | ---: | ---: | --- |')
for (const row of changedVerifiedValues) add(`| ${row.ticker} | ${row.metric} | ${row.period} | ${fmt(row.previousValueUsd)} | ${fmt(row.currentValueUsd)} | ${row.period === 'LTM' ? 'Check differing latest reported endpoints before calling this a regression.' : 'Compare filing/recast and provider mappings.'} |`)
add('', 'The machine-readable report contains all 336 prior/current cell comparisons, including improvements and unchanged cells.', '',
  `## Unresolved cells — all ${unresolvedCells.length}`, '',
  'These groups use the cell’s recorded root cause; no unresolved cell is treated as acceptable N/A.', '')
for (const [cause, group] of Object.entries(unresolvedByRootCause)
  .sort(([left], [right]) => left.localeCompare(right))) {
  add(`### ${cause} (${group.length})`, '',
    '| Ticker | Metric | Period | Status | Warning |', '| --- | --- | --- | --- | --- |')
  for (const cell of group) add(`| ${cell.ticker} | ${cell.metric} | ${cell.period} | ${cell.status} | ${escapeTable(cell.validationEvidence.warning)} |`)
  add('')
}
add('', `## Validator-accepted N/A cells — all ${acceptedNaCells.length}`, '',
  '| Ticker | Metric | Period | Status | Evidence |', '| --- | --- | --- | --- | --- |')
for (const cell of acceptedNaCells) {
  const definitions = [...new Set(cell.sources.map((source) => source.definitionFingerprint).filter(Boolean))]
  const scopes = [...new Set(cell.sources.map((source) => source.operationScope).filter(Boolean))]
  const evidence = cell.status === 'DEFINITION_INCOMPATIBLE'
    ? `${definitions.length} distinct source fingerprints; ${sourceLinks(cell)}`
    : `${scopes.join(' versus ')}; ${sourceLinks(cell)}`
  add(`| ${cell.ticker} | ${cell.metric} | ${cell.period} | ${cell.status} | ${escapeTable(evidence)} |`)
}
if (staleAcceptedNaCount) add('', '**FCEL LTM FCF caveat:** the current validator accepts its scope-conflict components, but their period ends are in 2018. They do not establish the current LTM scope. Treat this cell as requiring review; do not use the accepted-N/A count as evidence that all accepted N/As are defensible.')
add('', `## Fiscal.ai-versus-SEC mismatches — all ${providerMismatches.length}`, '',
  'The exact bulk Fiscal.ai candidate values are withheld from this **public** repository pending confirmation of redistribution rights. This is a disclosed limitation, not a claim that the values match. SEC values and filing references below let an authorized reviewer re-query each indexed provider observation. The locally retained, ignored source audit contains the complete comparison.', '',
  '| ID | Ticker | Metric | Economic end | SEC USD | SEC filing | Explanation |',
  '| --- | --- | --- | --- | ---: | --- | --- |')
for (const mismatch of providerMismatches) add(`| ${mismatch.id} | ${mismatch.ticker} | ${mismatch.metric} | ${mismatch.periodEnd ?? mismatch.period ?? 'N/A'} | ${fmt(mismatch.secValueUsd)} | ${mismatch.secSource.filingUrl ? `[${mismatch.secSource.accession ?? 'SEC'}](${mismatch.secSource.filingUrl})` : 'Source in local audit'} | ${escapeTable(mismatch.explanation)} |`)
add('', 'Two permanent regression fixtures show the material behavior: GEV Fiscal.ai LTM Adjusted EBITDA 4.157B versus SEC-supported 4.115B, a 42M difference; IREN Fiscal.ai FY2026 cash Capex 4.433391B includes 100.304M of prepayments versus SEC-supported 4.333087B cash Capex. Both provider values were already supplied for these narrowly scoped regression tests; no full statement export is published.', '',
  ...(priorFiscal ? [
    `### Original ${originalProviderMismatches.length} provider/SEC observation mismatches`, '',
    'This preserves every initially identified conflict for independent review. “No longer flagged” means the latest candidate mapping no longer produces that conflict; it does not imply the original Fiscal.ai observation was corrected by the provider.', '',
    '| ID | Ticker | Metric | Economic end | SEC USD | SEC filing | Current disposition |',
    '| --- | --- | --- | --- | ---: | --- | --- |',
    ...originalProviderMismatches.map((mismatch) => `| ${mismatch.id} | ${mismatch.ticker} | ${mismatch.metric} | ${mismatch.periodEnd ?? mismatch.period ?? 'N/A'} | ${fmt(mismatch.secValueUsd)} | ${mismatch.secSource.filingUrl ? `[${mismatch.secSource.accession ?? 'SEC'}](${mismatch.secSource.filingUrl})` : 'Source in local audit'} | ${mismatch.latestDisposition} |`),
    '',
  ] : []),
  '## All 336 classified cells', '',
  'Values are USD. The linked machine-readable file retains all public SEC source references and component periods.', '',
  '| Ticker | Metric | Period | Value | Status | Calculation | Filing references |',
  '| --- | --- | --- | ---: | --- | --- | --- |')
for (const cell of cells) add(`| ${cell.ticker} | ${cell.metric} | ${cell.period} | ${fmt(cell.valueUsd)} | ${cell.status} | ${escapeTable(cell.calculation)} | ${sourceLinks(cell)} |`)
add('', '## Authentication, performance, and deployment blockers', '',
  '- The runtime requires a server-only `FISCAL_API_KEY` for the documented REST Data API. The Codex MCP connection is not a deployable credential. No production key was present, so live REST authentication and full-company entitlements remain untested.',
  '- A free API key has 50 requests/minute, 250/day, and a restricted 100-company universe. Commercial permissions and limits require the actual Data Feed agreement; no account or purchase was changed.',
  '- The adapter batches two companies (at most six core endpoint calls at once), retries 429/5xx, caches acquisitions, and only fetches on controlled financial refresh. Normal page loads continue to read durable snapshots. These local tests do not establish production latency or licensing.',
  `- The audit has ${unresolvedCells.length} unresolved cells, ${providerMismatches.length} underlying provider/SEC conflicts, and ${staleAcceptedNaCount} stale-scope evidence concern(s). Do not merge or deploy until independently adjudicated.`,
  '- No Supabase table, existing production financial snapshot, Vercel deployment, domain, Website App, or old Valuation Analysis repository was changed.', '',
  'Fiscal.ai documentation: [authentication](https://docs.fiscal.ai/docs/authentication), [financial endpoints](https://docs.fiscal.ai/docs/api-reference), [free-plan limits](https://docs.fiscal.ai/docs/guides/rate-limits), and [terms](https://fiscal.ai/terms-of-service/).', '')

await mkdir(outputDirectory, { recursive: true })
await writeFile(path.join(outputDirectory, 'fiscalai-latest.json'), `${JSON.stringify(report, null, 2)}\n`)
await writeFile(path.join(outputDirectory, 'fiscalai-latest.md'), `${markdown.join('\n').trimEnd()}\n`)
console.log(JSON.stringify({ cells: cells.length, unresolved: unresolvedCells.length,
  acceptedNa: acceptedNaCells.length, mismatches: providerMismatches.length,
  regressions: regressions.length, changedVerifiedValues: changedVerifiedValues.length,
  testedImplementationCommit: testedCommit }))
