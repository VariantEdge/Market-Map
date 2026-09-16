import { classifyAdjustedEbitdaSnapshotHealth, VALUATION_FINANCIAL_SNAPSHOT_TABLE } from './financialSnapshot.js'

export async function refreshAndVerifyAdjustedEbitdaSnapshot(supabase, ticker, refresh) {
  const response = await refresh(ticker)
  const row = response.rows?.find((item) => item.ticker === ticker)
  if (!row) throw new Error('No refreshed valuation row')
  const { data, error } = await supabase.from(VALUATION_FINANCIAL_SNAPSHOT_TABLE)
    .select('ticker, actual_years, snapshot').eq('ticker', ticker).single()
  if (error || !data?.snapshot) throw new Error(`Refreshed snapshot read failed: ${error?.message ?? 'missing record'}`)
  const returnedHealth = classifyAdjustedEbitdaSnapshotHealth(row, data.actual_years)
  const persistedHealth = classifyAdjustedEbitdaSnapshotHealth(data.snapshot, data.actual_years)
  if (returnedHealth.state !== 'HEALTHY' || persistedHealth.state !== 'HEALTHY') {
    throw new Error(returnedHealth.reason ?? persistedHealth.reason ?? 'ADJUSTED_EBITDA_REPAIR_REQUIRED')
  }
  return { row, snapshot: data.snapshot }
}
