import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createCanonicalObservation,
  createPeriodIdentity,
  DATE_AUTHORITY,
  OBSERVATION_BASIS,
  PERIOD_TYPE,
} from '../server/valuation/canonicalFinancialObservation.js'
import {
  classifyPeriod,
  deduplicateEconomicPeriods,
  deriveStandaloneQuarters,
  economicPeriodIdentity,
} from '../server/valuation/periodNormalization.js'

function observation({ type, start, end, value, quarter, provider = 'WiseSheets', filed = '2025-01-01', sourceId, ...overrides }) {
  return createCanonicalObservation({
    ticker: 'SYNTH', issuerId: 'SYNTH-ISSUER', metric: 'revenue', rawValue: value,
    normalizedValue: value, rawUnits: 'USD', normalizedUnits: 'USD', currency: 'USD',
    sourceProvider: provider, sourceId: sourceId ?? `${provider}:${type}:${end}:${filed}`,
    filingDate: filed, scope: 'CONSOLIDATED', reportedVsDerived: OBSERVATION_BASIS.REPORTED,
    periodIdentity: createPeriodIdentity({
      periodType: type, periodStart: start, periodEnd: end, dateAuthority: DATE_AUTHORITY.REPORTED,
      fiscalYear: 2024, fiscalQuarter: quarter, fiscalCalendarId: 'SYNTH-CALENDAR',
    }),
    ...overrides,
  })
}

test('generic period classification uses explicit type or reported duration, never ticker rules', () => {
  assert.equal(classifyPeriod({ periodStart: '2024-01-01', periodEnd: '2024-03-31' }), PERIOD_TYPE.STANDALONE_QUARTER)
  assert.equal(classifyPeriod({ periodStart: '2024-01-01', periodEnd: '2024-06-30' }), PERIOD_TYPE.YTD_6M)
  assert.equal(classifyPeriod({ periodStart: '2024-01-01', periodEnd: '2024-09-30' }), PERIOD_TYPE.YTD_9M)
  assert.equal(classifyPeriod({ periodStart: '2024-01-01', periodEnd: '2024-12-31' }), PERIOD_TYPE.FISCAL_YEAR)
  assert.equal(classifyPeriod({ fiscalQuarter: 1 }), PERIOD_TYPE.UNKNOWN)
  assert.equal(classifyPeriod({
    periodType: PERIOD_TYPE.STANDALONE_QUARTER,
    periodStart: '2024-01-01', periodEnd: '2024-12-31', dateAuthority: DATE_AUTHORITY.REPORTED,
  }), PERIOD_TYPE.UNKNOWN)
})

test('materially conflicting authoritative dates are retained as an identity conflict', () => {
  const first = observation({ type: PERIOD_TYPE.STANDALONE_QUARTER, start: '2024-04-01', end: '2024-06-30', value: 20, quarter: 2 })
  const conflicting = observation({ type: PERIOD_TYPE.STANDALONE_QUARTER, start: '2024-07-01', end: '2024-09-30', value: 20, quarter: 2, provider: 'SEC' })
  const result = deduplicateEconomicPeriods([first, conflicting])
  assert.equal(result.length, 2)
  assert.ok(result.every((item) => item.deduplicationStatus === 'REQUIRES_REVIEW'))
  assert.ok(result.every((item) => item.conflicts[0].type === 'PERIOD_IDENTITY_CONFLICT'))
})

test('agreeing WiseSheets and SEC values use provider priority and retain the alternative', () => {
  const wise = observation({ type: PERIOD_TYPE.STANDALONE_QUARTER, start: '2024-04-01', end: '2024-06-30', value: 20, quarter: 2 })
  const sec = observation({ type: PERIOD_TYPE.STANDALONE_QUARTER, start: '2024-04-01', end: '2024-06-30', value: 20.01, quarter: 2, provider: 'SEC' })
  const result = deduplicateEconomicPeriods([sec, wise])
  assert.equal(result.length, 1)
  assert.equal(result[0].sourceProvider, 'WiseSheets')
  assert.equal(result[0].alternatives.length, 1)
})

test('materially conflicting WiseSheets and SEC values remain visible for review', () => {
  const wise = observation({ type: PERIOD_TYPE.STANDALONE_QUARTER, start: '2024-04-01', end: '2024-06-30', value: 20, quarter: 2 })
  const sec = observation({ type: PERIOD_TYPE.STANDALONE_QUARTER, start: '2024-04-01', end: '2024-06-30', value: 25, quarter: 2, provider: 'SEC' })
  const result = deduplicateEconomicPeriods([sec, wise])
  assert.equal(result.length, 2)
  assert.deepEqual(new Set(result.map((item) => item.normalizedValue)), new Set([20, 25]))
  assert.ok(result.every((item) => item.conflicts[0].type === 'VALUE_CONFLICT'))
})

test('reported period boundaries beat conflicting inferred table rows for the same economic period', () => {
  const reported = observation({ type: PERIOD_TYPE.FISCAL_YEAR, start: '2024-12-29', end: '2025-12-27',
    value: 52_853, quarter: null, provider: 'SEC', sourceId: 'reported-xbrl' })
  const inferred = createCanonicalObservation({
    ...reported,
    rawValue: 17_826,
    normalizedValue: 17_826,
    sourceId: 'inferred-segment-table',
    periodIdentity: createPeriodIdentity({
      periodType: PERIOD_TYPE.FISCAL_YEAR, periodStart: '2024-12-28', periodEnd: '2025-12-27',
      dateAuthority: DATE_AUTHORITY.INFERRED, fiscalYear: 2025, fiscalCalendarId: 'SYNTH-CALENDAR',
    }),
  })
  const result = deduplicateEconomicPeriods([inferred, reported])
  assert.equal(result.length, 1)
  assert.equal(result[0].normalizedValue, 52_853)
  assert.equal(result[0].periodIdentity.dateAuthority, DATE_AUTHORITY.REPORTED)
  assert.equal(result[0].selectionReason, 'AUTHORITATIVE_PERIOD_BOUNDARIES')
  assert.equal(result[0].alternatives[0].sourceId, 'inferred-segment-table')
})

test('a later authoritative restatement overrides static provider priority', () => {
  const wise = observation({ type: PERIOD_TYPE.STANDALONE_QUARTER, start: '2024-04-01', end: '2024-06-30', value: 20, quarter: 2, filed: '2024-07-20' })
  const restated = observation({ type: PERIOD_TYPE.STANDALONE_QUARTER, start: '2024-04-01', end: '2024-06-30', value: 25, quarter: 2,
    provider: 'SEC', filed: '2025-07-20', restatedOrRecast: true })
  const result = deduplicateEconomicPeriods([wise, restated])
  assert.equal(result.length, 1)
  assert.equal(result[0].sourceProvider, 'SEC')
  assert.equal(result[0].normalizedValue, 25)
  assert.equal(result[0].selectionReason, 'LATEST_AUTHORITATIVE_RESTATEMENT')
})

test('economic identity and deduplication merge WiseSheets/SEC copies only within a compatible series', () => {
  const wise = observation({ type: PERIOD_TYPE.STANDALONE_QUARTER, start: '2024-04-01', end: '2024-06-29', value: 20, quarter: 2 })
  const sec = observation({ type: PERIOD_TYPE.STANDALONE_QUARTER, start: '2024-04-01', end: '2024-06-30', value: 20.01, quarter: 2, provider: 'SEC' })
  const result = deduplicateEconomicPeriods([sec, wise])
  assert.equal(result.length, 1)
  assert.equal(result[0].sourceProvider, 'WiseSheets')
  assert.equal(result[0].alternatives.length, 1)
  assert.match(economicPeriodIdentity(wise), /SYNTH-ISSUER/)
})

test('a later comparative filing replaces an older duplicate and retains the alternative', () => {
  const older = observation({ type: PERIOD_TYPE.STANDALONE_QUARTER, start: '2024-01-01', end: '2024-03-31', value: 10, quarter: 1, filed: '2024-04-20' })
  const restated = observation({ type: PERIOD_TYPE.STANDALONE_QUARTER, start: '2024-01-01', end: '2024-03-31', value: 11, quarter: 1, filed: '2025-04-20' })
  const result = deduplicateEconomicPeriods([older, restated])
  assert.equal(result[0].normalizedValue, 11)
  assert.equal(result[0].alternatives[0].normalizedValue, 10)
})

test('6M, 9M, and FY cumulative facts derive Q2, Q3, and Q4 with authoritative boundaries', () => {
  const records = [
    observation({ type: PERIOD_TYPE.STANDALONE_QUARTER, start: '2024-01-01', end: '2024-03-31', value: 10, quarter: 1 }),
    observation({ type: PERIOD_TYPE.YTD_6M, start: '2024-01-01', end: '2024-06-30', value: 30, quarter: 2 }),
    observation({ type: PERIOD_TYPE.YTD_9M, start: '2024-01-01', end: '2024-09-30', value: 60, quarter: 3 }),
    observation({ type: PERIOD_TYPE.FISCAL_YEAR, start: '2024-01-01', end: '2024-12-31', value: 100, quarter: 4 }),
  ]
  const quarters = deriveStandaloneQuarters(records)
  assert.deepEqual(quarters.map((item) => item.normalizedValue), [10, 20, 30, 40])
  assert.deepEqual(quarters.map((item) => item.periodIdentity.periodStart), ['2024-01-01', '2024-04-01', '2024-07-01', '2024-10-01'])
  for (const item of quarters.slice(1)) {
    assert.equal(item.periodIdentity.dateAuthority, DATE_AUTHORITY.DERIVED_FROM_REPORTED_BOUNDARIES)
    assert.equal(item.reportedVsDerived, OBSERVATION_BASIS.DERIVED)
    assert.equal(item.derivation.inputs.length, 2)
  }
})

test('authoritative matching boundaries override stale fiscal labels during cumulative subtraction', () => {
  const six = observation({ type: PERIOD_TYPE.YTD_6M, start: '2024-07-01', end: '2024-12-31',
    value: 30, quarter: 2, fiscalYear: 2024 })
  const nine = observation({ type: PERIOD_TYPE.YTD_9M, start: '2024-07-01', end: '2025-03-31',
    value: 50, quarter: 3, fiscalYear: 2026 })
  const derived = deriveStandaloneQuarters([six, nine])
  assert.equal(derived.at(-1).normalizedValue, 20)
  assert.equal(derived.at(-1).periodIdentity.periodStart, '2025-01-01')
  assert.equal(derived.at(-1).periodIdentity.periodEnd, '2025-03-31')
})

test('incompatible cumulative scope cannot be subtracted into a quarter', () => {
  const q1 = observation({ type: PERIOD_TYPE.STANDALONE_QUARTER, start: '2024-01-01', end: '2024-03-31', value: 10, quarter: 1 })
  const six = observation({ type: PERIOD_TYPE.YTD_6M, start: '2024-01-01', end: '2024-06-30', value: 30, quarter: 2, scope: 'SEGMENT' })
  assert.deepEqual(deriveStandaloneQuarters([q1, six]).map((item) => item.normalizedValue), [10])
})

test('restated Q1 is resolved before deriving Q2', () => {
  const olderQ1 = observation({ type: PERIOD_TYPE.STANDALONE_QUARTER, start: '2024-01-01', end: '2024-03-31',
    value: 100, quarter: 1, filed: '2024-04-20' })
  const restatedQ1 = observation({ type: PERIOD_TYPE.STANDALONE_QUARTER, start: '2024-01-01', end: '2024-03-31',
    value: 110, quarter: 1, filed: '2025-04-20', restatedOrRecast: true })
  const six = observation({ type: PERIOD_TYPE.YTD_6M, start: '2024-01-01', end: '2024-06-30',
    value: 250, quarter: 2 })
  const result = deriveStandaloneQuarters([olderQ1, restatedQ1, six])
  assert.deepEqual(result.map((item) => item.normalizedValue), [110, 140])
  assert.equal(result[1].derivation.inputs.includes(restatedQ1.sourceId), true)
  assert.deepEqual(result.failures, [])
})

test('an unresolved Q1 value conflict prevents Q2 derivation', () => {
  const wiseQ1 = observation({ type: PERIOD_TYPE.STANDALONE_QUARTER, start: '2024-01-01', end: '2024-03-31',
    value: 100, quarter: 1 })
  const secQ1 = observation({ type: PERIOD_TYPE.STANDALONE_QUARTER, start: '2024-01-01', end: '2024-03-31',
    value: 110, quarter: 1, provider: 'SEC' })
  const six = observation({ type: PERIOD_TYPE.YTD_6M, start: '2024-01-01', end: '2024-06-30',
    value: 250, quarter: 2 })
  const result = deriveStandaloneQuarters([wiseQ1, secQ1, six])
  assert.equal(result.some((item) => item.periodIdentity.fiscalQuarter === 2), false)
  assert.ok(result.failures.some((failure) => failure.method === 'YTD_6M_MINUS_Q1' && failure.reason === 'VALUE_CONFLICT'))
})

test('an unresolved 6M value conflict prevents dependent Q2 and Q3 derivations', () => {
  const q1 = observation({ type: PERIOD_TYPE.STANDALONE_QUARTER, start: '2024-01-01', end: '2024-03-31',
    value: 100, quarter: 1 })
  const wiseSix = observation({ type: PERIOD_TYPE.YTD_6M, start: '2024-01-01', end: '2024-06-30',
    value: 250, quarter: 2 })
  const secSix = observation({ type: PERIOD_TYPE.YTD_6M, start: '2024-01-01', end: '2024-06-30',
    value: 275, quarter: 2, provider: 'SEC' })
  const nine = observation({ type: PERIOD_TYPE.YTD_9M, start: '2024-01-01', end: '2024-09-30',
    value: 430, quarter: 3 })
  const result = deriveStandaloneQuarters([q1, wiseSix, secSix, nine])
  assert.deepEqual(result.map((item) => item.periodIdentity.fiscalQuarter), [1])
  for (const method of ['YTD_6M_MINUS_Q1', 'YTD_9M_MINUS_YTD_6M']) {
    assert.ok(result.failures.some((failure) => failure.method === method && failure.reason === 'VALUE_CONFLICT'))
  }
})

test('an unresolved cumulative period-identity conflict prevents dependent derivations', () => {
  const q1 = observation({ type: PERIOD_TYPE.STANDALONE_QUARTER, start: '2024-01-01', end: '2024-03-31',
    value: 100, quarter: 1 })
  const firstSix = observation({ type: PERIOD_TYPE.YTD_6M, start: '2024-01-01', end: '2024-06-30',
    value: 250, quarter: 2 })
  const conflictingSix = observation({ type: PERIOD_TYPE.YTD_6M, start: '2024-01-15', end: '2024-07-15',
    value: 250, quarter: 2, provider: 'SEC' })
  const nine = observation({ type: PERIOD_TYPE.YTD_9M, start: '2024-01-01', end: '2024-09-30',
    value: 430, quarter: 3 })
  const result = deriveStandaloneQuarters([q1, firstSix, conflictingSix, nine])
  assert.deepEqual(result.map((item) => item.periodIdentity.fiscalQuarter), [1])
  assert.ok(result.failures.some((failure) => failure.reason === 'PERIOD_IDENTITY_CONFLICT'))
})

test('invalid derived quarter duration fails closed without throwing', () => {
  const shortQ1 = observation({ type: PERIOD_TYPE.STANDALONE_QUARTER, start: '2024-01-01', end: '2024-02-15',
    value: 100, quarter: 1 })
  const six = observation({ type: PERIOD_TYPE.YTD_6M, start: '2024-01-01', end: '2024-06-30',
    value: 250, quarter: 2 })
  let result
  assert.doesNotThrow(() => { result = deriveStandaloneQuarters([shortQ1, six]) })
  assert.deepEqual(result.map((item) => item.normalizedValue), [100])
  assert.ok(result.failures.some((failure) => failure.reason === 'INVALID_DERIVED_QUARTER_DURATION'))
})

test('restated cumulative periods are resolved before every downstream subtraction', () => {
  const records = [
    observation({ type: PERIOD_TYPE.STANDALONE_QUARTER, start: '2024-01-01', end: '2024-03-31', value: 100, quarter: 1 }),
    observation({ type: PERIOD_TYPE.YTD_6M, start: '2024-01-01', end: '2024-06-30', value: 250, quarter: 2, filed: '2024-07-20' }),
    observation({ type: PERIOD_TYPE.YTD_6M, start: '2024-01-01', end: '2024-06-30', value: 260, quarter: 2, filed: '2025-07-20', restatedOrRecast: true }),
    observation({ type: PERIOD_TYPE.YTD_9M, start: '2024-01-01', end: '2024-09-30', value: 400, quarter: 3, filed: '2024-10-20' }),
    observation({ type: PERIOD_TYPE.YTD_9M, start: '2024-01-01', end: '2024-09-30', value: 430, quarter: 3, filed: '2025-10-20', restatedOrRecast: true }),
    observation({ type: PERIOD_TYPE.FISCAL_YEAR, start: '2024-01-01', end: '2024-12-31', value: 600, quarter: 4, filed: '2025-02-20' }),
    observation({ type: PERIOD_TYPE.FISCAL_YEAR, start: '2024-01-01', end: '2024-12-31', value: 650, quarter: 4, filed: '2026-02-20', restatedOrRecast: true }),
  ]
  const result = deriveStandaloneQuarters(records)
  assert.deepEqual(result.map((item) => item.normalizedValue), [100, 160, 170, 220])
  assert.deepEqual(result.failures, [])
})

test('a later audited annual remainder supersedes an older directly reported fourth quarter', () => {
  const directQ4 = observation({ type: PERIOD_TYPE.STANDALONE_QUARTER, start: '2025-10-01', end: '2025-12-31',
    value: -234.5, quarter: 4, provider: 'SEC', filed: '2026-02-10', sourceId: 'older-earnings-q4' })
  const nineMonths = observation({ type: PERIOD_TYPE.YTD_9M, start: '2025-01-01', end: '2025-09-30',
    value: -361.7, quarter: 3, provider: 'SEC', filed: '2025-11-10', sourceId: 'nine-months' })
  const annual = observation({ type: PERIOD_TYPE.FISCAL_YEAR, start: '2025-01-01', end: '2025-12-31',
    value: -611.7, quarter: null, provider: 'SEC', filed: '2026-04-30', sourceId: 'audited-annual' })
  const quarters = deriveStandaloneQuarters([directQ4, nineMonths, annual])
  const q4 = quarters.find((item) => item.periodIdentity.periodEnd === '2025-12-31')
  assert.ok(Math.abs(q4.normalizedValue + 250) < 1e-9)
  assert.equal(q4.selectionReason, 'LATEST_AUTHORITATIVE_RESTATEMENT')
  assert.ok(q4.alternatives.some((item) => item.sourceId === 'older-earnings-q4'))
})

test('Q4 derivation binds a current annual to matching boundaries when comparative annuals share its fiscal label', () => {
  const directQ4 = observation({ type: PERIOD_TYPE.STANDALONE_QUARTER, start: '2025-10-01', end: '2025-12-31',
    value: -234.5, quarter: 4, provider: 'SEC', filed: '2026-02-10', sourceId: 'older-earnings-q4' })
  const nineMonths = observation({ type: PERIOD_TYPE.YTD_9M, start: '2025-01-01', end: '2025-09-30',
    value: -361.7, quarter: 3, provider: 'SEC', filed: '2025-11-10', sourceId: 'nine-months' })
  const comparative2023 = observation({ type: PERIOD_TYPE.FISCAL_YEAR, start: '2023-01-01', end: '2023-12-31',
    value: -300, quarter: null, provider: 'SEC', filed: '2026-04-30', sourceId: 'comparative-2023' })
  const comparative2024 = observation({ type: PERIOD_TYPE.FISCAL_YEAR, start: '2024-01-01', end: '2024-12-31',
    value: -400, quarter: null, provider: 'SEC', filed: '2026-04-30', sourceId: 'comparative-2024' })
  const annual = observation({ type: PERIOD_TYPE.FISCAL_YEAR, start: '2025-01-01', end: '2025-12-31',
    value: -611.7, quarter: null, provider: 'SEC', filed: '2026-04-30', sourceId: 'audited-annual' })
  const quarters = deriveStandaloneQuarters([directQ4, nineMonths, comparative2023, comparative2024, annual])
  const q4 = quarters.find((item) => item.periodIdentity.periodEnd === '2025-12-31')
  assert.ok(Math.abs(q4.normalizedValue + 250) < 1e-9)
  assert.equal(q4.selectionReason, 'LATEST_AUTHORITATIVE_RESTATEMENT')
  assert.equal(quarters.failures.some((failure) => failure.reason === 'AMBIGUOUS_CUMULATIVE_SOURCE_PERIOD'), false)
})
