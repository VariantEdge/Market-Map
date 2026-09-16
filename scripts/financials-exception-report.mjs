import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

function option(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] ?? null : null
}

function key(record) {
  return [record.ticker, record.metric, record.calendarYear].join(':')
}

function verified(record) {
  return ['VERIFIED_REPORTED', 'VERIFIED_DERIVED'].includes(record?.validationStatus)
}

function exception(record) {
  return !verified(record) && !['ETF_NOT_APPLICABLE', 'OUT_OF_SEC_SCOPE'].includes(record?.validationStatus)
}

function compactCell(record) {
  return {
    ticker: record.ticker,
    company: record.company,
    metric: record.metric,
    calendarYear: record.calendarYear,
    value: record.displayedValue,
    status: record.validationStatus,
    method: record.formula,
    reason: record.failureReason || record.warning || null,
    sourceUrl: record.primarySourceUrl,
  }
}

function reviewEvidence(record) {
  return {
    ...compactCell(record),
    components: (record.quarterlyComponents ?? []).map((component) => ({
      selected: {
        value: component.sourceValue,
        start: component.sourceStart,
        end: component.sourceEnd,
        tag: component.tag,
        filingForm: component.filingForm,
        filed: component.filed,
        accessionNumber: component.accn,
        sourceUrl: component.sourceUrl,
        selectionDecision: component.selectionDecision,
      },
      candidates: component.candidateFacts ?? [],
      annualReconciliation: component.reconciliation ?? null,
    })),
  }
}

const beforeFile = option('--before')
const afterFile = option('--after') ?? path.join('.cache', 'financial-audits', 'latest.json')
if (!beforeFile) throw new Error('Use --before <baseline-audit.json> [--after <final-audit.json>]')

const [before, after] = await Promise.all([
  readFile(beforeFile, 'utf8').then(JSON.parse),
  readFile(afterFile, 'utf8').then(JSON.parse),
])
const beforeByKey = new Map(before.records.map((record) => [key(record), record]))
const afterByKey = new Map(after.records.map((record) => [key(record), record]))
const recovered = after.records.filter((record) => verified(record) && !verified(beforeByKey.get(key(record))))
const regressed = after.records.filter((record) => !verified(record) && verified(beforeByKey.get(key(record))))
const remaining = after.records.filter(exception)
const reviews = remaining.filter((record) => record.validationStatus === 'REQUIRES_REVIEW')
const bridgeTickers = new Set(['MU', 'MSFT', 'FCEL'])

const report = {
  generatedAt: new Date().toISOString(),
  baseline: { file: beforeFile, summary: before.summary },
  final: { file: afterFile, summary: after.summary },
  recoveredCells: recovered.map(compactCell),
  regressedCells: regressed.map(compactCell),
  remainingExceptions: remaining.map(compactCell),
  reviewEvidence: reviews.map(reviewEvidence),
  sanityFlags: after.sanityFlags ?? [],
  nebiusReview: {
    cells: after.records.filter((record) => record.ticker === 'NBIS').map(compactCell),
    flags: (after.sanityFlags ?? []).filter((flag) => flag.ticker === 'NBIS'),
    conclusion: 'Metrics remain source-lineaged; economic flags require a same-entity review before unqualified use across the pre/post separation period.',
  },
  companyDefinedAdjustedEbitda: after.records.filter((record) => record.metric === 'ebitda').map((record) => ({
    ...compactCell(record), adjustedEbitdaMethod: record.adjustedEbitdaMethod ?? null,
  })),
  nonCalendarQuarterBridges: after.records
    .filter((record) => bridgeTickers.has(record.ticker))
    .map((record) => ({ ...compactCell(record), quarterlyComponents: record.quarterlyComponents ?? [] })),
  multipleNumeratorPolicy: 'Current quote * SEC common shares + SEC debt - SEC cash; no provider enterprise-value fallback.',
}

const directory = path.join(process.cwd(), '.cache', 'financial-audits')
const stamp = report.generatedAt.replaceAll(':', '-').replace(/\.\d+Z$/, 'Z')
const jsonFile = path.join(directory, `exception-resolution-${stamp}.json`)
const mdFile = path.join(directory, `exception-resolution-${stamp}.md`)
const lines = [
  '# Historical Financial Exception Resolution',
  '',
  `Generated: ${report.generatedAt}`,
  `Recovered cells: ${recovered.length}`,
  `Regressed cells: ${regressed.length}`,
  `Remaining exceptions: ${remaining.length}`,
  `Review cells: ${reviews.length}`,
  `Economic sanity flags: ${report.sanityFlags.length}`,
  '',
  '## Remaining Exceptions',
  '',
  ...report.remainingExceptions.map((item) => `- ${item.ticker} ${item.metric} ${item.calendarYear}: ${item.status} — ${item.method} — ${item.reason ?? 'No compatible source.'}`),
  '',
  '## Review Evidence',
  '',
  ...report.reviewEvidence.map((item) => `- ${item.ticker} ${item.metric} ${item.calendarYear}: ${item.reason}`),
  '',
  '## Multiple Numerator Policy',
  '',
  report.multipleNumeratorPolicy,
]
await mkdir(directory, { recursive: true })
await Promise.all([writeFile(jsonFile, JSON.stringify(report, null, 2)), writeFile(mdFile, lines.join('\n'))])
console.log(JSON.stringify({ jsonFile, mdFile, recovered: recovered.length, regressed: regressed.length, remaining: remaining.length, reviews: reviews.length, sanityFlags: report.sanityFlags.length }, null, 2))
