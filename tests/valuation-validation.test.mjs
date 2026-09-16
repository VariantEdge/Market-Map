import test from 'node:test'
import assert from 'node:assert/strict'
import { VALIDATION_STATUS, createAuditRecord } from '../server/valuation/validation.js'

test('marks a complete SEC direct value as verified', () => {
  const record = createAuditRecord({
    ticker: 'TEST', metric: 'Revenue', period: '2025A', value: 100,
    source: { sourceType: 'SEC filed actual', tag: 'Revenues', filed: '2026-02-01' },
  })
  assert.equal(record.status, VALIDATION_STATUS.VERIFIED)
  assert.equal(record.displayable, true)
})

test('keeps a single-provider market quote out of the verified display set', () => {
  const record = createAuditRecord({
    ticker: 'TEST', metric: 'Price', value: 10,
    source: { sourceType: 'Yahoo Finance market quote' },
  })
  assert.equal(record.status, VALIDATION_STATUS.WARNING)
  assert.equal(record.displayable, false)
  assert.match(record.warnings[0], /Single market-data provider/)
})

test('keeps Yahoo trailing fundamentals out of verified historical actuals', () => {
  const record = createAuditRecord({
    ticker: 'TEST', metric: 'EBITDA', period: 'LTM', value: 125,
    source: { sourceType: 'Yahoo Finance trailing fundamentals' },
  })
  assert.equal(record.status, VALIDATION_STATUS.WARNING)
  assert.equal(record.displayable, false)
  assert.match(record.warnings[0], /trailing-fundamentals provider/)
})

test('preserves a ledger-provided reconstructed status for historical actuals', () => {
  const record = createAuditRecord({
    ticker: 'TEST', metric: 'Revenue', period: '2025A', value: 100,
    source: { sourceType: 'SEC filed actual', validationStatus: 'VERIFIED_RECONSTRUCTED', exactness: 'RECONSTRUCTED' },
  })
  assert.equal(record.status, VALIDATION_STATUS.RECONSTRUCTED)
  assert.equal(record.displayable, true)
  assert.equal(record.source.exactness, 'RECONSTRUCTED')
})

test('preserves a ledger-provided warning status and fails closed', () => {
  const record = createAuditRecord({
    ticker: 'TEST', metric: 'Revenue', period: '2025A', value: 100,
    source: { sourceType: 'SEC filed actual', validationStatus: 'VERIFIED_WITH_WARNING', exactness: 'RECONSTRUCTED' },
  })
  assert.equal(record.status, VALIDATION_STATUS.WARNING)
  assert.equal(record.displayable, false)
})

test('preserves an unavailable ledger status and fails closed', () => {
  const record = createAuditRecord({
    ticker: 'TEST', metric: 'Revenue', period: '2025A', value: null,
    source: { sourceType: 'Unavailable', validationStatus: 'UNAVAILABLE' },
  })
  assert.equal(record.status, VALIDATION_STATUS.UNAVAILABLE)
  assert.equal(record.displayable, false)
})

test('fails closed when an independent recomputation differs', () => {
  const record = createAuditRecord({
    ticker: 'TEST', metric: 'EV / Revenue', value: 8,
    source: { sourceType: 'Derived Calculation' }, formula: 'enterprise-value / revenue',
    inputs: { enterpriseValue: 900, revenue: 100 }, recomputed: 9,
  })
  assert.equal(record.status, VALIDATION_STATUS.FAILED)
  assert.equal(record.displayable, false)
})

test('does not display a missing value as verified data', () => {
  const record = createAuditRecord({ ticker: 'TEST', metric: 'EBITDA', value: null })
  assert.equal(record.status, VALIDATION_STATUS.UNVERIFIED)
  assert.equal(record.displayable, false)
})
