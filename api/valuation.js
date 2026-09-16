import { createSupabaseClient, parseTickers } from './marketData.js'
import { getValuationRows } from './valuationData.js'

const SNAPSHOT_STORE_MISSING = 'FINANCIAL_SNAPSHOT_STORE_NOT_CONFIGURED'
const SNAPSHOT_STORE_STAGES = new Set([
  'FINANCIAL_SNAPSHOT_READ',
  'FINANCIAL_SNAPSHOT_MIGRATION',
])

function snapshotStoreFailure(payload) {
  const diagnostics = payload?.diagnostics ?? []
  return diagnostics.find((diagnostic) =>
    diagnostic?.reason === SNAPSHOT_STORE_MISSING || SNAPSHOT_STORE_STAGES.has(diagnostic?.stage)) ??
    payload?.rows?.find((row) => row?.error === SNAPSHOT_STORE_MISSING)?.canonicalHistorical?.failures?.[0] ??
    null
}

export default async function handler(req, res) {
  const tickers = parseTickers(req.query.tickers)
  const providerTickers = parseTickers(req.query.universe)
  if (!tickers.length) {
    res.status(400).json({ error: 'Missing ?tickers= parameter' })
    return
  }

  try {
    // Valuation historicals depend on the durable financial snapshot store.
    // Never silently fall back to the anon key or to a live SEC rebuild when
    // that store is unavailable: both behaviors turn a configuration problem
    // into a page-load rebuild storm and can time out serverless requests.
    const supabase = createSupabaseClient({ serviceRole: true })
    const payload = await getValuationRows(supabase, tickers, {
      refresh: req.query.refresh === '1',
      financialRefresh: req.query.financialRefresh === '1',
      consensusRefresh: req.query.consensusRefresh === '1',
      providerTickers,
    })

    const snapshotFailure = snapshotStoreFailure(payload)
    if (snapshotFailure) {
      console.error('Valuation financial snapshot store unavailable', snapshotFailure)
      res.status(503).json({
        error: SNAPSHOT_STORE_MISSING,
        reason: snapshotFailure.reason ?? 'FINANCIAL_SNAPSHOT_READ_FAILED',
        stage: snapshotFailure.stage ?? 'FINANCIAL_SNAPSHOT_READ',
      })
      return
    }

    res.status(200).json(payload)
  } catch (error) {
    const snapshotStoreMissing = /SUPABASE_SERVICE_ROLE_KEY|FINANCIAL_SNAPSHOT_(?:STORE_NOT_CONFIGURED|READ_FAILED|WRITE_FAILED|MIGRATION_FAILED)|relation .* does not exist|schema cache|permission denied/i
      .test(error.message ?? '')
    console.error('Valuation API request failed', error)
    res.status(snapshotStoreMissing ? 503 : 500).json({
      error: snapshotStoreMissing ? SNAPSHOT_STORE_MISSING : 'VALUATION_REQUEST_FAILED',
    })
  }
}
