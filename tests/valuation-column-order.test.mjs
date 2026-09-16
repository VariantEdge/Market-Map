import test from 'node:test'
import assert from 'node:assert/strict'
import {
  migrateValuationLayoutState,
  restoreValuationLayoutState,
  VALUATION_LAYOUT_VERSION,
} from '../src/components/ValuationAnalysisPage.columns.js'

const periods = ['2023A', '2024A', '2025A', 'LTM', 'NTM', '2026E', '2027E']
const metricColumns = (metric) => periods.map((period) => ({ id: `${metric}:${period}`, metric, period }))

const columns = [
  { id: 'ticker' },
  ...metricColumns('evRevenue'),
  ...metricColumns('evGrossProfit'),
  ...metricColumns('evEbit'),
  ...metricColumns('evEbitda'),
  ...metricColumns('evFreeCashFlow'),
  { id: 'operating-ticker' },
  ...metricColumns('revenue'),
  ...metricColumns('grossProfit'),
  ...metricColumns('ebit'),
  ...metricColumns('ebitda'),
  ...metricColumns('freeCashFlow'),
]
const preEbitOrder = columns
  .filter((column) => !['evEbit', 'ebit'].includes(column.metric))
  .map((column) => column.id)

function savedState(columnOrder, layoutVersion) {
  return {
    columnOrder,
    ...(layoutVersion == null ? {} : { layoutVersion }),
    hiddenColumns: ['evRevenue:2023A', 'grossProfit:2024A'],
    columnWidths: { 'evRevenue:2023A': 123, 'grossProfit:2024A': 144 },
    items: [{ ticker: 'BE', name: 'Bloom Energy' }],
  }
}

function assertCanonicalEbitPlacement(migrated) {
  const lastEvGrossProfit = migrated.columnOrder.indexOf('evGrossProfit:2027E')
  const firstEvEbit = migrated.columnOrder.indexOf('evEbit:2023A')
  const lastEvEbit = migrated.columnOrder.indexOf('evEbit:2027E')
  const firstEvEbitda = migrated.columnOrder.indexOf('evEbitda:2023A')
  const lastGrossProfit = migrated.columnOrder.indexOf('grossProfit:2027E')
  const firstEbit = migrated.columnOrder.indexOf('ebit:2023A')
  const lastEbit = migrated.columnOrder.indexOf('ebit:2027E')
  const firstEbitda = migrated.columnOrder.indexOf('ebitda:2023A')

  assert.ok(lastEvGrossProfit < firstEvEbit && lastEvEbit < firstEvEbitda)
  assert.ok(lastGrossProfit < firstEbit && lastEbit < firstEbitda)
}

test('truly pre-EBIT saved layout receives both EBIT groups and preserves all other settings', () => {
  const saved = savedState(preEbitOrder)
  const migrated = migrateValuationLayoutState(saved, columns)
  assertCanonicalEbitPlacement(migrated)
  assert.deepEqual(migrated.columnOrder.filter((id) => !id.startsWith('evEbit:') && !id.startsWith('ebit:')), preEbitOrder)
  assert.deepEqual(migrated.hiddenColumns, saved.hiddenColumns)
  assert.deepEqual(migrated.columnWidths, saved.columnWidths)
  assert.deepEqual(migrated.items, saved.items)
  assert.equal(migrated.layoutVersion, VALUATION_LAYOUT_VERSION)
})

test('a018 appended EBIT layout is repositioned by the one-time migration', () => {
  const appended = [
    ...preEbitOrder,
    ...metricColumns('evEbit').map((column) => column.id),
    ...metricColumns('ebit').map((column) => column.id),
  ]
  const migrated = migrateValuationLayoutState(savedState(appended), columns)
  assertCanonicalEbitPlacement(migrated)
  assert.deepEqual(migrated.columnOrder.filter((id) => !id.startsWith('evEbit:') && !id.startsWith('ebit:')), preEbitOrder)
  assert.equal(migrated.layoutVersion, VALUATION_LAYOUT_VERSION)
})

test('current layout version preserves user-customized EBIT placement', () => {
  const custom = [
    ...metricColumns('ebit').map((column) => column.id),
    ...preEbitOrder,
    ...metricColumns('evEbit').map((column) => column.id),
  ]
  const saved = savedState(custom, VALUATION_LAYOUT_VERSION)
  const migrated = migrateValuationLayoutState(saved, columns)
  assert.deepEqual(migrated.columnOrder, custom)
  assert.deepEqual(migrated.hiddenColumns, saved.hiddenColumns)
  assert.deepEqual(migrated.columnWidths, saved.columnWidths)
  assert.deepEqual(migrated.items, saved.items)
})

test('load-state merge preserves missing legacy version so appended EBIT columns migrate', () => {
  const defaults = {
    ...savedState(columns.map((column) => column.id), VALUATION_LAYOUT_VERSION),
    strictHistorical: true,
    density: 'comfortable',
  }
  const appended = [
    ...preEbitOrder,
    ...metricColumns('evEbit').map((column) => column.id),
    ...metricColumns('ebit').map((column) => column.id),
  ]
  const saved = {
    ...savedState(appended),
    strictHistorical: false,
    density: 'compact',
  }

  const migrated = restoreValuationLayoutState(defaults, saved, columns)

  assertCanonicalEbitPlacement(migrated)
  assert.deepEqual(migrated.columnOrder.filter((id) => !id.startsWith('evEbit:') && !id.startsWith('ebit:')), preEbitOrder)
  assert.equal(migrated.layoutVersion, VALUATION_LAYOUT_VERSION)
  assert.deepEqual(migrated.hiddenColumns, saved.hiddenColumns)
  assert.deepEqual(migrated.columnWidths, saved.columnWidths)
  assert.deepEqual(migrated.items, saved.items)
  assert.equal(migrated.strictHistorical, saved.strictHistorical)
  assert.equal(migrated.density, saved.density)
})
