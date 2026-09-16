import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateLtm,
  enforceLtmFreshness,
  calendarizeAnnualEstimate,
  calendarizeAnnualEstimateWithReportedQuarters,
  calculateNtmFromAnnualConsensus,
  calendarizePeriods,
  calendarizeReportedQuartersByEndDate,
  enterpriseValue,
  normalizeCumulativeQuarterlyFacts,
  valuationMultiple,
} from '../server/valuation/calendarization.js'

test('calendarizes a December fiscal-year company into its matching calendar year', () => {
  const result = calendarizePeriods([{ start: '2025-01-01', end: '2025-12-31', value: 365 }], [2025])
  assert.equal(result[2025].value, 365)
  assert.equal(result[2025].derived, false)
})

test('calendarizes a June fiscal-year period by exact day overlap', () => {
  const result = calendarizePeriods([{ start: '2025-07-01', end: '2026-06-30', value: 366 }], [2025, 2026])
  assert.equal(Math.round(result[2025].value), 185)
  assert.equal(Math.round(result[2026].value), 181)
})

test('handles January fiscal-year periods using start and end dates instead of labels', () => {
  const result = calendarizePeriods([{ start: '2025-02-01', end: '2026-01-31', value: 365 }], [2025, 2026])
  assert.equal(Math.round(result[2025].value), 334)
  assert.equal(Math.round(result[2026].value), 31)
})

test('calendarizes historical actuals using whole quarters that end in the calendar year', () => {
  const result = calendarizeReportedQuartersByEndDate([
    { start: '2024-11-01', end: '2025-01-31', value: 18.997 },
    { start: '2025-02-01', end: '2025-04-30', value: 37.406 },
    { start: '2025-05-01', end: '2025-07-31', value: 46.743 },
    { start: '2025-08-01', end: '2025-10-31', value: 55.016 },
  ], [2025])
  assert.equal(result[2025].value, 158.162)
  assert.equal(result[2025].components.length, 4)
  assert.equal(result[2025].method, 'four-reported-standalone-quarters-ended-in-calendar-year')
})

test('preserves a 53-week period using its actual duration', () => {
  const result = calendarizePeriods([{ start: '2024-12-29', end: '2026-01-03', value: 371 }], [2025, 2026])
  assert.equal(Math.round(result[2025].value), 365)
  assert.equal(Math.round(result[2026].value), 3)
})

test('normalizes cumulative YTD filing facts into standalone quarters', () => {
  const quarters = normalizeCumulativeQuarterlyFacts([
    { start: '2025-01-01', end: '2025-03-31', value: 10, fiscalYear: 2025 },
    { start: '2025-01-01', end: '2025-06-30', value: 25, fiscalYear: 2025 },
    { start: '2025-01-01', end: '2025-09-30', value: 45, fiscalYear: 2025 },
    { start: '2025-01-01', end: '2025-12-31', value: 70, fiscalYear: 2025 },
  ])
  assert.deepEqual(quarters.map((quarter) => quarter.value), [10, 15, 20, 25])
  assert.equal(quarters[1].method, 'normalized-cumulative-ytd')
})

test('calculates LTM from the latest four normalized quarters', () => {
  const ltm = calculateLtm([
    { start: '2025-01-01', end: '2025-03-31', value: 10 }, { start: '2025-04-01', end: '2025-06-30', value: 11 },
    { start: '2025-07-01', end: '2025-09-30', value: 12 }, { start: '2025-10-01', end: '2025-12-31', value: 13 },
  ])
  assert.equal(ltm.value, 46)
})

test('fails closed when the latest four LTM periods are not contiguous quarters', () => {
  const ltm = calculateLtm([
    { start: '2025-01-01', end: '2025-03-31', value: 10 }, { start: '2025-04-01', end: '2025-06-30', value: 11 },
    { start: '2025-10-01', end: '2025-12-31', value: 13 }, { start: '2026-01-01', end: '2026-03-31', value: 14 },
  ])
  assert.equal(ltm.value, null)
  assert.equal(ltm.validationStatus, 'MISSING_BUT_AVAILABLE')
})

test('fails closed when LTM omits the issuer latest reported quarter', () => {
  const entry = calculateLtm([
    { start: '2025-04-01', end: '2025-06-30', value: 1 },
    { start: '2025-07-01', end: '2025-09-30', value: 2 },
    { start: '2025-10-01', end: '2025-12-31', value: 3 },
    { start: '2026-01-01', end: '2026-03-31', value: 4 },
  ])
  const stale = enforceLtmFreshness(entry, '2026-06-30')
  assert.equal(stale.value, null)
  assert.equal(stale.validationStatus, 'REQUIRES_REVIEW')
  assert.match(stale.warnings.join(' '), /latest reported quarter ends 2026-06-30/)
})

test('allocates annual consensus estimates using supplied quarterly seasonality', () => {
  const result = calendarizeAnnualEstimate({ value: 100, endDate: '2026-12-31', sourceType: 'Street Consensus' }, [2026], [.1, .2, .3, .4])
  assert.equal(Math.round(result[2026].value), 100)
  assert.equal(result[2026].method, 'annual-consensus-allocated-by-historical-quarterly-seasonality')
})

test('uses three-month synthetic quarters when allocating a calendar-year estimate', () => {
  const result = calendarizeAnnualEstimate({ value: 100, endDate: '2026-12-31', sourceType: 'Street Consensus' }, [2026], [.25, .25, .25, .25])
  assert.deepEqual(result[2026].components.map((component) => component.sourceEnd), ['2026-03-31', '2026-06-30', '2026-09-30', '2026-12-31'])
  assert.equal(Math.round(result[2026].value), 100)
})

test('replaces filed quarters before allocating the annual consensus remainder', () => {
  const result = calendarizeAnnualEstimateWithReportedQuarters(
    { value: 100, endDate: '2026-12-31', sourceType: 'Street Consensus' },
    [2026], [.25, .25, .25, .25],
    [{ start: '2026-01-01', end: '2026-03-31', value: 20, sourceType: 'SEC filed actual' }],
    '2026-08-06',
  )
  assert.equal(Math.round(result[2026].value), 100)
  assert.equal(result[2026].components.filter((component) => component.sourceType === 'SEC filed actual').length, 1)
  assert.equal(result[2026].method, 'reported-standalone-quarters-plus-consensus-remainder')
})

test('calculates NTM from fiscal consensus quarters instead of blending annual totals', () => {
  const result = calculateNtmFromAnnualConsensus([
    { value: 100, endDate: '2026-12-31', sourceType: 'Street Consensus' },
    { value: 140, endDate: '2027-12-31', sourceType: 'Street Consensus' },
  ], [.25, .25, .25, .25], [], '2026-06-30')
  assert.equal(Math.round(result.value), 120)
  assert.equal(result.method, 'next-twelve-month-fiscal-consensus-with-reported-quarter-replacement')
})

test('calculates enterprise value and marks non-positive multiple denominators as N/M', () => {
  assert.deepEqual(enterpriseValue({ price: 10, dilutedShares: 100, debt: 50, cash: 20 }), { equityValue: 1000, enterpriseValue: 1030 })
  assert.equal(valuationMultiple(1030, 100), 10.3)
  assert.equal(valuationMultiple(1030, -1), null)
  assert.equal(valuationMultiple(null, 100), null)
  assert.equal(valuationMultiple(1030, null), null)
})

test('fails closed for enterprise value when a required SEC capital input is unavailable', () => {
  assert.deepEqual(enterpriseValue({ price: null, dilutedShares: 100, debt: 50, cash: 20 }), { equityValue: null, enterpriseValue: null })
  assert.deepEqual(enterpriseValue({ price: 10, dilutedShares: 100, debt: null, cash: 20 }), { equityValue: 1000, enterpriseValue: null })
  assert.deepEqual(enterpriseValue({ price: 10, dilutedShares: 100, debt: 50, cash: null }), { equityValue: 1000, enterpriseValue: null })
})
