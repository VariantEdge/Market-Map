import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createCanonicalObservation,
  createPeriodIdentity,
  DATE_AUTHORITY,
  hasAuthoritativeBoundaries,
  OBSERVATION_BASIS,
  OPERATION_SCOPE,
  PERIOD_TYPE,
  validateCanonicalObservation,
} from '../server/valuation/canonicalFinancialObservation.js'

test('CanonicalObservation preserves source, value, scope, and period lineage', () => {
  const periodIdentity = createPeriodIdentity({
    periodType: PERIOD_TYPE.STANDALONE_QUARTER,
    periodStart: '2024-01-01',
    periodEnd: '2024-03-31',
    dateAuthority: DATE_AUTHORITY.REPORTED,
    fiscalYear: 2024,
    fiscalQuarter: 1,
    fiscalCalendarId: 'DECEMBER_FYE',
    startEvidence: 'SEC context startDate',
    endEvidence: 'SEC context endDate',
  })
  const observation = createCanonicalObservation({
    ticker: 'new', issuerId: 'issuer-new', metric: 'revenue', rawValue: 10,
    normalizedValue: 10_000_000, rawUnits: 'USD millions', normalizedUnits: 'USD', currency: 'USD',
    periodIdentity, sourceProvider: 'WiseSheets', sourceId: 'wise:new:revenue:q1',
    filingDate: '2024-04-30', accession: '0000000000-24-000001', sourceUrl: 'https://example.test/source',
    scope: 'CONSOLIDATED', confidence: 'HIGH', reportedVsDerived: OBSERVATION_BASIS.REPORTED,
  })
  assert.equal(validateCanonicalObservation(observation).valid, true)
  assert.equal(observation.ticker, 'NEW')
  assert.equal(observation.periodIdentity.durationDays, 91)
  assert.equal(observation.periodIdentity.dateAuthority, DATE_AUTHORITY.REPORTED)
  assert.equal(observation.operationScope, OPERATION_SCOPE.UNSPECIFIED)
})

test('operation scope is explicit and limited to canonical semantic values', () => {
  const base = {
    ticker: 'NEW', metric: 'revenue', normalizedValue: 10, currency: 'USD', normalizedUnits: 'USD',
    sourceProvider: 'SEC', sourceId: 'source', scope: 'CONSOLIDATED',
    periodIdentity: createPeriodIdentity({
      periodType: PERIOD_TYPE.CALENDAR_YEAR, periodStart: '2024-01-01', periodEnd: '2024-12-31',
      dateAuthority: DATE_AUTHORITY.REPORTED,
    }),
  }
  for (const operationScope of Object.values(OPERATION_SCOPE)) {
    assert.equal(createCanonicalObservation({ ...base, operationScope }).operationScope, operationScope)
  }
  assert.throws(() => createCanonicalObservation({ ...base, operationScope: 'INVALID' }), /INVALID_OPERATION_SCOPE/)
})

test('date authority distinguishes reported, deterministically derived, inferred, and unknown dates', () => {
  for (const authority of Object.values(DATE_AUTHORITY)) {
    const period = createPeriodIdentity({
      periodType: PERIOD_TYPE.STANDALONE_QUARTER,
      periodStart: '2024-01-01', periodEnd: '2024-03-31', dateAuthority: authority,
    })
    assert.equal(period.dateAuthority, authority)
    assert.equal(hasAuthoritativeBoundaries(period), [DATE_AUTHORITY.REPORTED, DATE_AUTHORITY.DERIVED_FROM_REPORTED_BOUNDARIES].includes(authority))
  }
})

test('invalid canonical observations fail closed instead of filling required metadata', () => {
  assert.throws(() => createCanonicalObservation({
    ticker: 'NEW', metric: 'revenue', normalizedValue: 1,
    periodIdentity: createPeriodIdentity({ periodType: PERIOD_TYPE.UNKNOWN }),
  }), /MISSING_CURRENCY|MISSING_SOURCE_PROVENANCE/)
})

test('null numeric inputs never coerce to zero', () => {
  const period = createPeriodIdentity({ fiscalYear: null, sequenceIndex: null, fiscalQuarter: null })
  assert.equal(period.fiscalYear, null)
  assert.equal(period.sequenceIndex, null)
  assert.equal(period.fiscalQuarter, null)
  const omitted = createPeriodIdentity({})
  assert.equal(omitted.fiscalYear, null)
  assert.equal(omitted.sequenceIndex, null)
  assert.equal(omitted.fiscalQuarter, null)
  assert.throws(() => createCanonicalObservation({
    ticker: 'NEW', metric: 'revenue', normalizedValue: null, currency: 'USD', normalizedUnits: 'USD',
    sourceProvider: 'SEC', sourceId: 'source', scope: 'CONSOLIDATED', periodIdentity: period,
  }), /INVALID_NORMALIZED_VALUE/)
  assert.throws(() => createCanonicalObservation({
    ticker: 'NEW', metric: 'revenue', normalizedValue: undefined, currency: 'USD', normalizedUnits: 'USD',
    sourceProvider: 'SEC', sourceId: 'source', scope: 'CONSOLIDATED', periodIdentity: omitted,
  }), /INVALID_NORMALIZED_VALUE/)
})

test('authoritative economic dates reject a contradictory explicit period type', () => {
  assert.throws(() => createCanonicalObservation({
    ticker: 'NEW', metric: 'revenue', normalizedValue: 10, currency: 'USD', normalizedUnits: 'USD',
    sourceProvider: 'SEC', sourceId: 'source', scope: 'CONSOLIDATED',
    periodIdentity: createPeriodIdentity({
      periodType: PERIOD_TYPE.STANDALONE_QUARTER,
      periodStart: '2024-01-01', periodEnd: '2024-12-31', dateAuthority: DATE_AUTHORITY.REPORTED,
    }),
  }), /PERIOD_TYPE_DURATION_CONFLICT/)
})

test('end-only provider periods are retained only with unknown date authority', () => {
  const base = {
    ticker: 'NEW', metric: 'revenue', normalizedValue: 10, currency: 'USD', normalizedUnits: 'USD',
    sourceProvider: 'WiseSheets', sourceId: 'wise:end-only', scope: 'CONSOLIDATED',
  }
  const observation = createCanonicalObservation({
    ...base,
    periodIdentity: createPeriodIdentity({
      periodType: PERIOD_TYPE.STANDALONE_QUARTER,
      periodEnd: '2024-03-31',
      dateAuthority: DATE_AUTHORITY.UNKNOWN,
      fiscalYear: 2024,
      fiscalQuarter: 1,
    }),
  })
  assert.equal(observation.periodIdentity.periodStart, null)
  assert.equal(observation.periodIdentity.periodEnd, '2024-03-31')
  assert.throws(() => createCanonicalObservation({
    ...base,
    periodIdentity: createPeriodIdentity({
      periodType: PERIOD_TYPE.STANDALONE_QUARTER,
      periodEnd: '2024-03-31',
      dateAuthority: DATE_AUTHORITY.REPORTED,
      fiscalYear: 2024,
      fiscalQuarter: 1,
    }),
  }), /INCOMPLETE_AUTHORITATIVE_PERIOD_RANGE/)
})
