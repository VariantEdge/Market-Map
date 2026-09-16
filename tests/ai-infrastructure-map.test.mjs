import test from 'node:test'
import assert from 'node:assert/strict'
import { AI_INFRASTRUCTURE_LAYERS, AI_INFRASTRUCTURE_VERTICALS, BI_ANALYTICS_LAYERS, BTM_ENERGY_LAYERS, DATA_MANAGEMENT_LAYERS, DEVOPS_LAYERS, ETF_LAYERS, HYPERSCALER_LAYERS, MARKET_MAPS, SEMICONDUCTOR_PROCESS_CONTROL_LAYERS } from '../src/data.js'

test('AI infrastructure map contains the supplied public-company verticals', () => {
  assert.equal(AI_INFRASTRUCTURE_LAYERS.length, 12)
  assert.equal(AI_INFRASTRUCTURE_VERTICALS.length, 12)
  assert.equal(MARKET_MAPS['gpu-asic'].layers[0], AI_INFRASTRUCTURE_LAYERS[0])
  assert.equal(MARKET_MAPS.foundry.layers[0], AI_INFRASTRUCTURE_LAYERS[11])

  const companies = AI_INFRASTRUCTURE_LAYERS.flatMap((layer) => layer.companies)
  assert.deepEqual(
    companies.find((company) => company.name === 'Nvidia'),
    {
      name: 'Nvidia',
      ticker: 'NVDA',
      marketCap: null,
      revenueGrowth: null,
      grossMargin: null,
      country: 'USA',
      type: 'Public',
      description: 'Placeholder - company description to be written.',
    },
  )
  assert.equal(companies.find((company) => company.name === 'TSMC')?.ticker, 'TSM')
  assert.equal(companies.find((company) => company.name === 'Foxconn Industrial Internet')?.ticker, '601138.SS')
})

test('ETF market map contains the supplied six ETF symbols', () => {
  assert.equal(MARKET_MAPS.etfs.layers, ETF_LAYERS)
  assert.deepEqual(
    ETF_LAYERS[0].companies.map((company) => company.ticker),
    ['IGV', 'QQQ', 'SOXX', 'SPY', 'DRAM', 'AIS'],
  )
})

test('BTM Energy market map contains the supplied four ticker symbols', () => {
  assert.equal(MARKET_MAPS['btm-energy'].layers, BTM_ENERGY_LAYERS)
  assert.deepEqual(
    BTM_ENERGY_LAYERS[0].companies.map((company) => company.ticker),
    ['BE', 'GEV', 'FCEL', 'CGEH'],
  )
})

test('Hyperscalers market map contains the supplied companies', () => {
  assert.equal(MARKET_MAPS.hyperscalers.layers, HYPERSCALER_LAYERS)
  assert.deepEqual(
    HYPERSCALER_LAYERS[0].companies.map((company) => [company.name, company.ticker]),
    [['Google', 'GOOGL'], ['Amazon', 'AMZN'], ['Meta', 'META'], ['Microsoft', 'MSFT']],
  )
})

test('Semiconductor Process Control market map contains the supplied companies', () => {
  assert.equal(MARKET_MAPS['semiconductor-process-control'].layers, SEMICONDUCTOR_PROCESS_CONTROL_LAYERS)
  assert.deepEqual(
    SEMICONDUCTOR_PROCESS_CONTROL_LAYERS[0].companies.map((company) => company.ticker),
    ['268A.T', 'KLAC', 'ONTO', 'CAMT', 'BRKR', 'TMO', 'LRCX', 'AMAT'],
  )
})

test('software categories are separate grids and delisted companies are not tradable', () => {
  assert.equal(MARKET_MAPS['data-management'].layers[0], DATA_MANAGEMENT_LAYERS[0])
  assert.equal(MARKET_MAPS.devops.layers[0], DEVOPS_LAYERS[0])
  assert.equal(MARKET_MAPS['bi-analytics'].layers[0], BI_ANALYTICS_LAYERS[0])
  assert.deepEqual(
    DATA_MANAGEMENT_LAYERS[0].companies.map((company) => [company.name, company.ticker, company.type]),
    [
      ['Snowflake', 'SNOW', 'Public'],
      ['Couchbase', null, 'Private'],
      ['Elastic', 'ESTC', 'Public'],
      ['MongoDB', 'MDB', 'Public'],
      ['Informatica', null, 'Private'],
      ['Confluent', null, 'Private'],
    ],
  )
  assert.deepEqual(
    BI_ANALYTICS_LAYERS[0].companies.map((company) => company.ticker),
    ['PLTR', 'TDC', 'ESTC', 'DOMO', 'AMPL', 'RAMP', 'KARO', 'MSTR', 'TUYA', 'PATH', 'FICO', 'AI'],
  )
  assert.equal(DEVOPS_LAYERS[0].companies.find((company) => company.name === 'SolarWinds')?.ticker, null)
})
