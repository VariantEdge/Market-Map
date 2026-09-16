export const ECONOMIC_SANITY_FLAG = Object.freeze({
  EXTREME_GROSS_MARGIN: 'EXTREME_GROSS_MARGIN',
  EXTREME_ADJ_EBITDA_MARGIN: 'EXTREME_ADJ_EBITDA_MARGIN',
  EXTREME_FCF_MARGIN: 'EXTREME_FCF_MARGIN',
  LARGE_YOY_REVENUE_CHANGE: 'LARGE_YOY_REVENUE_CHANGE',
  LARGE_YOY_MARGIN_CHANGE: 'LARGE_YOY_MARGIN_CHANGE',
  NEGATIVE_GROSS_PROFIT: 'NEGATIVE_GROSS_PROFIT',
  FCF_DIRECTION_INCONSISTENT_WITH_CFO: 'FCF_DIRECTION_INCONSISTENT_WITH_CFO',
  POSSIBLE_SCOPE_MISMATCH: 'POSSIBLE_SCOPE_MISMATCH',
  POSSIBLE_DOUBLE_COUNTED_ADJUSTMENT: 'POSSIBLE_DOUBLE_COUNTED_ADJUSTMENT',
})

function finite(value) {
  return value != null && Number.isFinite(Number(value))
}

function addFlag(entry, flag, details) {
  if (!entry) return
  entry.economicSanityFlags ??= []
  if (!entry.economicSanityFlags.some((item) => item.flag === flag)) {
    entry.economicSanityFlags.push({ flag, ...details })
  }
}

export function applyEconomicSanityChecks(calendarActuals = {}) {
  const years = [...new Set(Object.values(calendarActuals)
    .flatMap((metric) => Object.keys(metric ?? {}).map(Number)))].sort((a, b) => a - b)

  for (const year of years) {
    const revenue = calendarActuals.revenue?.[year]
    const grossProfit = calendarActuals.grossProfit?.[year]
    const ebitda = calendarActuals.ebitda?.[year]
    const freeCashFlow = calendarActuals.freeCashFlow?.[year]
    const operatingCashFlow = calendarActuals.operatingCashFlow?.[year]
    const priorRevenue = calendarActuals.revenue?.[year - 1]
    const priorGrossProfit = calendarActuals.grossProfit?.[year - 1]
    const priorEbitda = calendarActuals.ebitda?.[year - 1]

    if (finite(grossProfit?.value) && Number(grossProfit.value) < 0) {
      addFlag(grossProfit, ECONOMIC_SANITY_FLAG.NEGATIVE_GROSS_PROFIT, { year, value: Number(grossProfit.value) })
    }
    if (finite(revenue?.value) && Number(revenue.value) !== 0) {
      const checks = [
        [grossProfit, Number(grossProfit?.value) / Number(revenue.value), ECONOMIC_SANITY_FLAG.EXTREME_GROSS_MARGIN, -0.25, 1.1],
        [ebitda, Number(ebitda?.value) / Number(revenue.value), ECONOMIC_SANITY_FLAG.EXTREME_ADJ_EBITDA_MARGIN, -2, 1.5],
        [freeCashFlow, Number(freeCashFlow?.value) / Number(revenue.value), ECONOMIC_SANITY_FLAG.EXTREME_FCF_MARGIN, -2, 2],
      ]
      for (const [entry, margin, flag, low, high] of checks) {
        if (finite(entry?.value) && (margin < low || margin > high)) addFlag(entry, flag, { year, margin })
      }
    }
    if (finite(revenue?.value) && finite(priorRevenue?.value) && Number(priorRevenue.value) !== 0) {
      const change = Number(revenue.value) / Number(priorRevenue.value) - 1
      if (change < -0.75 || change > 3) addFlag(revenue, ECONOMIC_SANITY_FLAG.LARGE_YOY_REVENUE_CHANGE, { year, priorYear: year - 1, change })
    }
    if (finite(revenue?.value) && finite(priorRevenue?.value) && Number(revenue.value) !== 0 && Number(priorRevenue.value) !== 0) {
      for (const [entry, priorEntry] of [[grossProfit, priorGrossProfit], [ebitda, priorEbitda]]) {
        if (!finite(entry?.value) || !finite(priorEntry?.value)) continue
        const margin = Number(entry.value) / Number(revenue.value)
        const priorMargin = Number(priorEntry.value) / Number(priorRevenue.value)
        if (Math.abs(margin - priorMargin) > 0.75) addFlag(entry, ECONOMIC_SANITY_FLAG.LARGE_YOY_MARGIN_CHANGE, { year, priorYear: year - 1, margin, priorMargin })
      }
    }
    if (finite(freeCashFlow?.value) && finite(operatingCashFlow?.value)) {
      const tolerance = Math.max(1, Math.abs(Number(operatingCashFlow.value))) * 0.001
      if (Number(freeCashFlow.value) > Number(operatingCashFlow.value) + tolerance) {
        addFlag(freeCashFlow, ECONOMIC_SANITY_FLAG.FCF_DIRECTION_INCONSISTENT_WITH_CFO, {
          year, freeCashFlow: Number(freeCashFlow.value), operatingCashFlow: Number(operatingCashFlow.value),
        })
      }
    }

    for (const entry of [revenue, grossProfit, ebitda, freeCashFlow]) {
      if ((entry?.warnings ?? []).some((warning) => /reconcil|scope|discontinued|predecessor/i.test(warning))) {
        addFlag(entry, ECONOMIC_SANITY_FLAG.POSSIBLE_SCOPE_MISMATCH, { year })
      }
      if ((entry?.components ?? []).some((component) =>
        (component.rejectedAdjustments ?? []).some((item) => item.reason === ECONOMIC_SANITY_FLAG.POSSIBLE_DOUBLE_COUNTED_ADJUSTMENT))) {
        addFlag(entry, ECONOMIC_SANITY_FLAG.POSSIBLE_DOUBLE_COUNTED_ADJUSTMENT, { year })
      }
    }
  }
  return calendarActuals
}
