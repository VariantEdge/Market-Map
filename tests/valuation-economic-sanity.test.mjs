import test from 'node:test'
import assert from 'node:assert/strict'
import { applyEconomicSanityChecks, ECONOMIC_SANITY_FLAG } from '../server/valuation/economicSanity.js'

test('flags implausible margins, growth, and FCF direction without changing values', () => {
  const actuals = {
    revenue: { 2024: { value: 100 }, 2025: { value: 500 } },
    grossProfit: { 2024: { value: 40 }, 2025: { value: -10 } },
    ebitda: { 2024: { value: 20 }, 2025: { value: 900 } },
    operatingCashFlow: { 2025: { value: 50 } },
    freeCashFlow: { 2025: { value: 60 } },
  }
  applyEconomicSanityChecks(actuals)
  assert.equal(actuals.revenue[2025].value, 500)
  assert.ok(actuals.revenue[2025].economicSanityFlags.some((item) => item.flag === ECONOMIC_SANITY_FLAG.LARGE_YOY_REVENUE_CHANGE))
  assert.ok(actuals.grossProfit[2025].economicSanityFlags.some((item) => item.flag === ECONOMIC_SANITY_FLAG.NEGATIVE_GROSS_PROFIT))
  assert.ok(actuals.ebitda[2025].economicSanityFlags.some((item) => item.flag === ECONOMIC_SANITY_FLAG.EXTREME_ADJ_EBITDA_MARGIN))
  assert.ok(actuals.freeCashFlow[2025].economicSanityFlags.some((item) => item.flag === ECONOMIC_SANITY_FLAG.FCF_DIRECTION_INCONSISTENT_WITH_CFO))
})
