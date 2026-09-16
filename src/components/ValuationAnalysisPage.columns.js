const METRIC_INSERTIONS = Object.freeze([
  { metric: 'evEbit', after: 'evGrossProfit', before: 'evEbitda' },
  { metric: 'ebit', after: 'grossProfit', before: 'ebitda' },
])

export const VALUATION_LAYOUT_VERSION = 1

function insertionIndex(order, columnsById, afterMetric, beforeMetric) {
  const afterIndexes = order
    .map((id, index) => columnsById.get(id)?.metric === afterMetric ? index : -1)
    .filter((index) => index >= 0)
  const afterIndex = afterIndexes.length ? Math.max(...afterIndexes) : -1
  const beforeIndex = order.findIndex((id) => columnsById.get(id)?.metric === beforeMetric)
  if (beforeIndex >= 0 && afterIndex < beforeIndex) return beforeIndex
  if (afterIndex >= 0) return afterIndex + 1
  return beforeIndex >= 0 ? beforeIndex : order.length
}

function insertMetricColumns(order, columns, columnsById, insertion) {
  const desired = columns.filter((column) => column.metric === insertion.metric).map((column) => column.id)
  for (let index = 0; index < desired.length; index += 1) {
    const id = desired[index]
    if (order.includes(id)) continue
    const prior = [...desired.slice(0, index)].reverse().find((candidate) => order.includes(candidate))
    const next = desired.slice(index + 1).find((candidate) => order.includes(candidate))
    const target = prior ? order.indexOf(prior) + 1
      : next ? order.indexOf(next)
        : insertionIndex(order, columnsById, insertion.after, insertion.before)
    order.splice(target, 0, id)
  }
}

export function normalizeValuationColumnOrder(savedOrder = [], columns = []) {
  const columnsById = new Map(columns.map((column) => [column.id, column]))
  const validIds = new Set(columnsById.keys())
  const migratedMetrics = new Set(METRIC_INSERTIONS.map((item) => item.metric))
  const order = [...new Set(savedOrder.filter((id) => validIds.has(id)))]

  for (const column of columns) {
    if (order.includes(column.id) || migratedMetrics.has(column.metric)) continue
    if (column.period === 'NTM' && column.metric) {
      const ltmIndex = order.indexOf(`${column.metric}:LTM`)
      if (ltmIndex >= 0) {
        order.splice(ltmIndex + 1, 0, column.id)
        continue
      }
    }
    order.push(column.id)
  }

  for (const insertion of METRIC_INSERTIONS) {
    insertMetricColumns(order, columns, columnsById, insertion)
  }
  return order
}

export function migrateValuationLayoutState(savedState = {}, columns = []) {
  const priorVersion = Number(savedState.layoutVersion ?? 0)
  if (priorVersion >= VALUATION_LAYOUT_VERSION) {
    return {
      ...savedState,
      columnOrder: normalizeValuationColumnOrder(savedState.columnOrder, columns),
      layoutVersion: priorVersion,
    }
  }
  const columnsById = new Map(columns.map((column) => [column.id, column]))
  const legacyOrder = (savedState.columnOrder ?? []).filter((id) => {
    const metric = columnsById.get(id)?.metric
    return metric !== 'evEbit' && metric !== 'ebit'
  })
  return {
    ...savedState,
    columnOrder: normalizeValuationColumnOrder(legacyOrder, columns),
    layoutVersion: VALUATION_LAYOUT_VERSION,
  }
}

export function restoreValuationLayoutState(defaults = {}, savedState = {}, columns = []) {
  const merged = {
    ...defaults,
    ...savedState,
    layoutVersion: savedState.layoutVersion ?? 0,
  }
  return migrateValuationLayoutState(merged, columns)
}
