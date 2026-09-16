import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildYahooPerformanceSnapshot,
  YAHOO_PERFORMANCE_RANGES,
} from '../api/marketData.js'

test('Yahoo performance snapshot uses each range baseline and preserves IPO baselines', () => {
  const charts = Object.fromEntries(
    Object.entries(YAHOO_PERFORMANCE_RANGES).map(([key, range], index) => [
      key,
      {
        currency: 'USD',
        regularMarketPrice: 100,
        previousClose: index === 7 ? 40 : 50 + index,
        points: [
          { date: range === '2y' ? '2024-06-13T13:30:00.000Z' : '2026-01-02T14:30:00.000Z', close: 60 },
          { date: '2026-06-12T20:00:00.000Z', close: 100 },
        ],
      },
    ]),
  )

  const snapshot = buildYahooPerformanceSnapshot('TEST', charts)

  assert.equal(snapshot.currentPrice, 100)
  assert.equal(snapshot.currency, 'USD')
  assert.equal(snapshot.source, 'Yahoo Finance chart range baseline')
  assert.equal(snapshot.d1.price, 50)
  assert.equal(snapshot.m3.range, '3mo')
  assert.equal(snapshot.m18.range, '18mo')
  assert.equal(snapshot.y2.price, 40)
  assert.equal(snapshot.y2.range, '2y')
  assert.equal(snapshot.y2.firstPointDate, '2024-06-13')
  assert.equal(snapshot.y2.hasFullHistory, true)
})

test('Yahoo performance snapshot does not label partial IPO history as a full period', () => {
  const charts = Object.fromEntries(
    Object.entries(YAHOO_PERFORMANCE_RANGES).map(([key, range]) => [
      key,
      {
        currency: 'USD',
        regularMarketPrice: 100,
        previousClose: 40,
        points: [
          { date: range === '18mo' || range === '2y' ? '2025-03-28T13:30:00.000Z' : '2026-01-02T14:30:00.000Z', close: 40 },
          { date: '2026-06-12T20:00:00.000Z', close: 100 },
        ],
      },
    ]),
  )

  const snapshot = buildYahooPerformanceSnapshot('IPO', charts)

  assert.equal(snapshot.m18.price, null)
  assert.equal(snapshot.m18.hasFullHistory, false)
  assert.equal(snapshot.y2.price, null)
  assert.equal(snapshot.y2.hasFullHistory, false)
})
