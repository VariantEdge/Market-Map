import { createClient } from '@supabase/supabase-js'
import { getValuationRows } from '../../api/valuationData.js'
import { classifyAdjustedEbitdaSnapshotHealth, VALUATION_FINANCIAL_SNAPSHOT_TABLE } from './financialSnapshot.js'
import { refreshAndVerifyAdjustedEbitdaSnapshot } from './adjustedEbitdaSnapshotBackfill.js'

const forceAll = process.argv.includes('--all')
const execute = process.argv.includes('--execute')
const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) throw new Error('SUPABASE_URL and server-only SUPABASE_SERVICE_ROLE_KEY are required')

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
const { data, error } = await supabase.from(VALUATION_FINANCIAL_SNAPSHOT_TABLE)
  .select('ticker, actual_years, snapshot')
if (error) throw new Error(`Financial snapshot read failed: ${error.message}`)

const selected = (data ?? []).filter((record) => forceAll ||
  classifyAdjustedEbitdaSnapshotHealth(record.snapshot, record.actual_years).state === 'REPAIR_REQUIRED')
let repaired = 0
let failed = 0
for (const record of selected) {
  if (!execute) continue
  try {
    await refreshAndVerifyAdjustedEbitdaSnapshot(supabase, record.ticker,
      (ticker) => getValuationRows(supabase, [ticker], { financialRefresh: true }))
    repaired += 1
  } catch (refreshError) {
    failed += 1
    process.stderr.write(`${record.ticker}: ${refreshError.message}\n`)
  }
}
process.stdout.write(`selected=${selected.length} repaired=${repaired} failed=${failed} mode=${execute ? 'execute' : 'dry-run'}\n`)
if (failed) process.exitCode = 1
