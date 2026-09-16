import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'

const files = [
  ['src/App.jsx', 'jsx'],
  ['src/main.jsx', 'jsx'],
  ['src/components/CompanyChatCard.jsx', 'jsx'],
  ['src/components/WatchlistPage.jsx', 'jsx'],
  ['src/components/ValuationAnalysisPage.jsx', 'jsx'],
  ['src/components/ValuationAnalysisPage.columns.js', 'js'],
  ['src/components/valuationRefreshSequence.js', 'js'],
  ['src/data.js', 'js'],
  ['src/companyChatConfig.js', 'js'],
  ['api/marketData.js', 'js'],
  ['api/valuationData.js', 'js'],
  ['api/watchlist.js', 'js'],
  ['api/valuation.js', 'js'],
  ['api/earningsCommentaryCore.js', 'js'],
  ['server/companyChat.ts', 'ts'],
  ['server/http/companyChatHandlers.ts', 'ts'],
  ['server/retrieval/companyContext.ts', 'ts'],
  ['server/retrieval/webContext.ts', 'ts'],
  ['server/search/index.ts', 'ts'],
  ['server/search/searxng.ts', 'ts'],
  ['server/web/fetchPage.ts', 'ts'],
  ['server/sec/edgar.js', 'js'],
  ['server/sec/filings.js', 'js'],
  ['server/valuation/adjustedEbitdaEngine.js', 'js'],
  ['server/valuation/adjustedEbitdaSnapshotBackfill.js', 'js'],
  ['server/valuation/auditSnapshot.js', 'js'],
  ['server/valuation/calendarization.js', 'js'],
  ['server/valuation/canonicalFinancialObservation.js', 'js'],
  ['server/valuation/economicSanity.js', 'js'],
  ['server/valuation/filingFactExtractor.js', 'js'],
  ['server/valuation/filingIndex.js', 'js'],
  ['server/valuation/financialLedger.js', 'js'],
  ['server/valuation/financialSnapshot.js', 'js'],
  ['server/valuation/historicalPeriodEngine.js', 'js'],
  ['server/valuation/interactiveCache.js', 'js'],
  ['server/valuation/issuerClassification.js', 'js'],
  ['server/valuation/periodNormalization.js', 'js'],
  ['server/valuation/secCanonicalFinancials.js', 'js'],
  ['server/valuation/secCanonicalRevenue.js', 'js'],
  ['server/valuation/sourceLedger.js', 'js'],
  ['server/valuation/validation.js', 'js'],
  ['server/valuation/wiseSheetsCanonicalShadow.js', 'js'],
  ['server/valuation/wiseSheetsFinancials.js', 'js'],
]

for (const [file, loader] of files) {
  const source = await readFile(file, 'utf8')
  await transform(source, {
    loader,
    jsx: 'automatic',
    format: 'esm',
    target: 'es2022',
    sourcefile: file,
  })
}

console.log(`Market Map, Watchlist, and Valuation typecheck passed for ${files.length} modules.`)
