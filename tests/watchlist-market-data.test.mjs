import test from 'node:test'
import assert from 'node:assert/strict'
import { buildWatchlistSnapshot } from '../api/marketData.js'

function dateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

test('watchlist snapshot uses adjusted history for references and ranges', () => {
  const today = new Date()
  const twoYearsAgo = new Date(today.getFullYear() - 2, today.getMonth(), today.getDate() - 2)
  const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate() - 2)
  const oneMonthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate() - 2)
  const recent = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2)
  const quote = { price: 120, currency: 'USD', fetchedAt: Date.now() }
  const history = {
    previousClose: 100,
    points: [
      { date: dateKey(twoYearsAgo), close: 20, adjustedClose: 20 },
      { date: dateKey(oneYearAgo), close: 40, adjustedClose: 50 },
      { date: dateKey(oneMonthAgo), close: 80, adjustedClose: 90 },
      { date: dateKey(recent), close: 100, adjustedClose: 110 },
    ],
    allTimePoints: [
      { date: dateKey(twoYearsAgo), close: 20, adjustedClose: 20 },
      { date: dateKey(recent), close: 100, adjustedClose: 110 },
    ],
  }

  const snapshot = buildWatchlistSnapshot('TEST', quote, history, dateKey(oneYearAgo))

  assert.equal(snapshot.references.year.price, 50)
  assert.equal(snapshot.references.custom.price, 50)
  assert.equal(snapshot.references.day.price, 80)
  assert.equal(snapshot.performance.year, 140)
  assert.ok(Math.abs(snapshot.performance.day - 50) < 0.000001)
  assert.equal(snapshot.ranges.allTimeHigh, 110)
  assert.ok(Math.abs(snapshot.ranges.belowAllTimeHigh - ((120 / 110 - 1) * 100)) < 0.000001)
})
