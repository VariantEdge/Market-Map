import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const TICKERS = ['AMZN', 'BE', 'CRWV', 'FCEL', 'GEV', 'GOOGL', 'INTC', 'IREN', 'META', 'MU', 'MSFT', 'NBIS']
const PERIOD_TYPES = ['Annual', 'Quarterly', 'Semi-Annual', 'YTD', 'LTM']
const PROVIDER_DIR = '.cache/fiscal-ai-mcp-2026-10-25'
const AS_REPORTED_DIR = '.cache/fiscal-ai-as-reported-2026-10-25'
const AUDIT_DIR = '.cache/financial-audits'
const AUDIT_FILES = [
  'financial-audit-2026-10-19T04-01-55Z.json',
  'financial-audit-2026-10-25T22-18-28Z.json',
  'financial-audit-2026-10-25T22-48-48Z.json',
  'financial-audit-2026-10-25T23-02-07Z.json',
  'financial-audit-2026-10-26T04-36-08Z.json',
  'financial-audit-2026-10-26T04-47-29Z.json',
]
const MANIFEST = 'docs/audits/fiscalai-preservation-manifest.json'
const command = process.argv[2]
const option = (name) => {
  const index = process.argv.indexOf(name)
  return index < 0 ? null : process.argv[index + 1] ?? null
}
const workspace = path.resolve(option('--workspace') ?? process.cwd())
const manifestPath = path.resolve(workspace, option('--manifest') ?? MANIFEST)

function safeRelative(name) {
  if (!name || path.isAbsolute(name) || name.split(/[\\/]/).includes('..')) {
    throw new Error(`Unsafe archive path: ${name}`)
  }
  return name
}

function filePlan() {
  return [
    ...TICKERS.map((ticker) => ({
      kind: 'fiscal_mcp_capture', ticker,
      sourceRelativePath: `${PROVIDER_DIR}/${ticker}.json`,
      archiveRelativePath: `provider/${ticker}.json`,
    })),
    { kind: 'targeted_as_reported_capture', ticker: 'AMZN',
      sourceRelativePath: `${AS_REPORTED_DIR}/AMZN-income-core.json`,
      archiveRelativePath: 'as-reported/AMZN-income-core.json' },
    ...AUDIT_FILES.map((name) => ({ kind: 'local_audit_fixture', ticker: null,
      sourceRelativePath: `${AUDIT_DIR}/${name}`,
      archiveRelativePath: `audit-fixtures/${name}` })),
  ]
}

function hash(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function summarizeEndpoint(payload) {
  const rows = Array.isArray(payload?.data) ? payload.data : []
  const periodTypes = Object.fromEntries(PERIOD_TYPES.map((periodType) => {
    const selected = rows.filter((row) => row.periodType === periodType)
    const metricIds = [...new Set(selected.flatMap((row) =>
      Object.keys(row.metricsValues ?? row.metricValues ?? {})))].sort()
    const nonNullByMetric = Object.fromEntries(metricIds.map((id) => [id,
      selected.filter((row) => (row.metricsValues ?? row.metricValues ?? {})[id]?.value != null).length]))
    return [periodType, {
      rows: selected.length,
      periodEnds: [...new Set(selected.map((row) => row.reportDate).filter(Boolean))].sort(),
      nonNullByMetric,
    }]
  }))
  return {
    rows: rows.length,
    periodTypes,
    missingPeriodTypes: PERIOD_TYPES.filter((type) => periodTypes[type].rows === 0),
    missingCalendarYearAnnualRows: [2023, 2024, 2025].filter((year) =>
      !rows.some((row) => row.periodType === 'Annual' && row.reportDate === `${year}-12-31`)),
  }
}

async function inventory() {
  const files = []
  for (const item of filePlan()) {
    const file = path.resolve(workspace, safeRelative(item.sourceRelativePath))
    const data = await readFile(file)
    const metadata = await stat(file)
    const value = JSON.parse(data.toString('utf8'))
    const retrievalDate = item.kind === 'targeted_as_reported_capture'
      ? value.retrievedAt ?? null : metadata.birthtime.toISOString()
    files.push({ ...item, bytes: data.length, sha256: hash(data),
      sourceRetrievalDateUtc: retrievalDate,
      retrievalDateBasis: item.kind === 'targeted_as_reported_capture'
        ? 'MCP capture timestamp' : 'local file creation timestamp; exact MCP retrieval time not recorded',
      sourceModifiedAtUtc: metadata.mtime.toISOString() })
  }
  const tickerCoverage = []
  for (const ticker of TICKERS) {
    const capture = JSON.parse(await readFile(path.resolve(workspace, `${PROVIDER_DIR}/${ticker}.json`), 'utf8'))
    if (capture.ticker !== ticker) throw new Error(`Ticker mismatch in ${ticker}.json`)
    const endpoints = {
      standardizedIncome: summarizeEndpoint(capture.standardizedIncome),
      standardizedCashFlow: summarizeEndpoint(capture.standardizedCashFlow),
      adjustedMetrics: summarizeEndpoint(capture.adjustedMetrics),
    }
    const missingPeriodEndsRelativeToIncome = Object.fromEntries(
      ['standardizedCashFlow', 'adjustedMetrics'].map((endpoint) => [endpoint,
        Object.fromEntries(PERIOD_TYPES.map((periodType) => [periodType,
          endpoints.standardizedIncome.periodTypes[periodType].periodEnds.filter((date) =>
            !endpoints[endpoint].periodTypes[periodType].periodEnds.includes(date))]))]))
    const asReportedIncome = ticker === 'AMZN'
      ? summarizeEndpoint({ data: JSON.parse(await readFile(path.resolve(workspace,
        `${AS_REPORTED_DIR}/AMZN-income-core.json`), 'utf8')).rows }) : null
    tickerCoverage.push({ ticker, companyKey: capture.companyKey, endpoints,
      targetedAsReportedIncome: asReportedIncome,
      missingPeriodEndsRelativeToIncome,
      missingEndpointCaptures: [
        ...(!asReportedIncome ? ['asReportedIncome'] : []),
        'asReportedCashFlow',
      ],
      captureIsCompleteAsReportedExport: false,
      companyDefinedAdjustedEbitdaReconciliationCaptured: false,
      note: 'MCP capture includes selected standardized financial metrics and Adjusted EBITDA; it is not a complete company statement export.',
    })
  }
  const manifest = {
    schemaVersion: 1,
    generatedAtUtc: new Date().toISOString(),
    repository: 'VariantEdge/Market-Map', branch: 'review/fiscalai-migration',
    scope: { tickers: TICKERS, auditPeriods: ['2023A', '2024A', '2025A', 'LTM'],
      periodTypesInspected: PERIOD_TYPES },
    archivePathHint: '%LOCALAPPDATA%/MarketMap/FiscalAiPreservation/2026-10-25',
    distribution: 'Internal licensed-use archive only. Raw provider files and audit fixtures must not be committed to public GitHub.',
    retentionCaveat: 'Fiscal.ai order-form retention rights were not available to inspect. Use only while authorized and delete if the applicable agreement requires it.',
    files, tickerCoverage,
  }
  await mkdir(path.dirname(manifestPath), { recursive: true })
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(JSON.stringify({ manifest: manifestPath, files: files.length,
    tickers: tickerCoverage.length, bytes: files.reduce((sum, item) => sum + item.bytes, 0) }))
}

async function verify(archive) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const failures = []
  try {
    const storedManifest = JSON.parse(await readFile(path.resolve(archive, 'manifest.json'), 'utf8'))
    if (JSON.stringify(storedManifest.files) !== JSON.stringify(manifest.files)) {
      failures.push('manifest.json')
    }
  } catch { failures.push('manifest.json') }
  for (const item of manifest.files) {
    const file = path.resolve(archive, safeRelative(item.archiveRelativePath))
    try {
      const data = await readFile(file)
      if (data.length !== item.bytes || hash(data) !== item.sha256) failures.push(item.archiveRelativePath)
    } catch { failures.push(item.archiveRelativePath) }
  }
  if (failures.length) throw new Error(`Archive verification failed: ${failures.join(', ')}`)
  console.log(JSON.stringify({ archive: path.resolve(archive), verifiedFiles: manifest.files.length,
    tickers: manifest.scope.tickers.length }))
}

async function backup(archive) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  for (const item of manifest.files) {
    const source = await readFile(path.resolve(workspace, safeRelative(item.sourceRelativePath)))
    if (source.length !== item.bytes || hash(source) !== item.sha256) {
      throw new Error(`Source differs from manifest; refusing backup: ${item.sourceRelativePath}`)
    }
  }
  await mkdir(path.resolve(archive), { recursive: true })
  await copyFile(manifestPath, path.resolve(archive, 'manifest.json'))
  for (const item of manifest.files) {
    const from = path.resolve(workspace, safeRelative(item.sourceRelativePath))
    const to = path.resolve(archive, safeRelative(item.archiveRelativePath))
    await mkdir(path.dirname(to), { recursive: true })
    await copyFile(from, to)
  }
  await verify(archive)
}

async function restore(archive, target) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  await verify(archive)
  for (const item of manifest.files) {
    const from = path.resolve(archive, safeRelative(item.archiveRelativePath))
    const to = path.resolve(target, safeRelative(item.sourceRelativePath))
    await mkdir(path.dirname(to), { recursive: true })
    try {
      const existing = await readFile(to)
      if (hash(existing) !== item.sha256) throw new Error(`Refusing to replace differing file: ${to}`)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      await copyFile(from, to)
    }
    const restored = await readFile(to)
    if (restored.length !== item.bytes || hash(restored) !== item.sha256) {
      throw new Error(`Restored file failed integrity check: ${to}`)
    }
  }
  console.log(JSON.stringify({ restoredTo: path.resolve(target), files: manifest.files.length }))
}

if (command === 'inventory') await inventory()
else if (command === 'verify') {
  const archive = option('--archive')
  if (!archive) throw new Error('verify requires --archive DIRECTORY')
  await verify(archive)
} else if (command === 'backup') {
  const archive = option('--archive')
  if (!archive) throw new Error('backup requires --archive DIRECTORY')
  await backup(archive)
} else if (command === 'restore') {
  const archive = option('--archive')
  const target = option('--target')
  if (!archive || !target) throw new Error('restore requires --archive DIRECTORY --target DIRECTORY')
  await restore(archive, target)
} else throw new Error('Use inventory, backup, verify, or restore')
