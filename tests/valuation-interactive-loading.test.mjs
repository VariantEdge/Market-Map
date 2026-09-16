import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createBoundedFinancialRefreshQueue, runValuationRefreshSequence } from '../src/components/valuationRefreshSequence.js'
import { createPerTickerCache, runAbortableTask, runBoundedTask } from '../server/valuation/interactiveCache.js'
import { createWiseSheetsBatchLoader, failClosedForwardBasis } from '../api/valuationData.js'

const delay = (milliseconds, value) => new Promise((resolve) => setTimeout(() => resolve(value), milliseconds))

test('external valuation stages fail closed with a specific timeout diagnostic', async () => {
  const result = await runBoundedTask('SEC_FILING_INDEX', () => new Promise(() => {}), 5)
  assert.equal(result.value, null)
  assert.equal(result.diagnostic.reason, 'SEC_FILING_INDEX_TIMEOUT')
})

test('abortable external stage cancels its underlying request on timeout', async () => {
  let aborted = false
  const result = await runAbortableTask('SEC_COMPANY_FACTS', (signal) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      aborted = true
      reject(signal.reason)
    }, { once: true })
  }), 5)
  assert.equal(result.diagnostic.reason, 'SEC_COMPANY_FACTS_TIMEOUT')
  assert.equal(aborted, true)
})

test('a slow issuer does not prevent a fast issuer cache result from completing', async () => {
  const cache = createPerTickerCache({ namespace: 'test-isolation', ttlMs: 1_000, persist: false })
  const slow = cache.get('SLOW', () => delay(80, { ticker: 'SLOW' }))
  const fast = cache.get('FAST', () => delay(2, { ticker: 'FAST' }))
  const first = await Promise.race([slow, fast])
  assert.equal(first.value.ticker, 'FAST')
  await slow
})

test('financial refresh queue never runs more than two rebuilds concurrently', async () => {
  const queue = createBoundedFinancialRefreshQueue(2)
  const tickers = ['A', 'B', 'C', 'D', 'E', 'F']
  let active = 0
  let maximum = 0
  const completed = []
  await Promise.all(tickers.map((ticker) => queue.run(ticker, async () => {
    active += 1
    maximum = Math.max(maximum, active)
    await delay(10)
    completed.push(ticker)
    active -= 1
  })))
  assert.equal(maximum, 2)
  assert.equal(completed.length, 6)
  assert.deepEqual(queue.state(), { active: 0, queued: 0, inFlight: 0, maxConcurrent: 2 })
})

test('financial refresh queue deduplicates the same ticker', async () => {
  const queue = createBoundedFinancialRefreshQueue(2)
  let calls = 0
  const task = () => delay(10).then(() => ++calls)
  const [first, second] = await Promise.all([queue.run('BE', task), queue.run('BE', task)])
  assert.equal(first, 1)
  assert.equal(second, 1)
  assert.equal(calls, 1)
})

test('warm per-ticker canonical cache avoids recomputation', async () => {
  const cache = createPerTickerCache({ namespace: 'test-warm', ttlMs: 1_000, persist: false })
  let loads = 0
  const loader = async () => ({ version: ++loads })
  assert.equal((await cache.get('MSFT', loader)).value.version, 1)
  assert.equal((await cache.get('MSFT', loader)).value.version, 1)
  assert.equal(loads, 1)
})

test('manual refresh serves prior canonical values while refresh runs', async () => {
  const cache = createPerTickerCache({ namespace: 'test-refresh', ttlMs: 1_000, persist: false })
  await cache.get('BE', async () => ({ revenueLtm: 3_113_150_000 }))
  const refreshing = await cache.get('BE', () => delay(30, { revenueLtm: 4 }), { refresh: true })
  assert.equal(refreshing.value.revenueLtm, 3_113_150_000)
  assert.equal(refreshing.cache.refreshing, true)
  await delay(40)
  assert.equal((await cache.get('BE', async () => null)).value.revenueLtm, 4)
})

test('polling reports an active refresh even while the cached value is fresh', async () => {
  const cache = createPerTickerCache({ namespace: 'test-refresh-poll', ttlMs: 1_000, persist: false })
  await cache.get('BE', async () => ({ version: 1 }))
  const refresh = await cache.get('BE', () => delay(30, { version: 2 }), { refresh: true })
  assert.deepEqual([refresh.value.version, refresh.cache.refreshing], [1, true])
  const poll = await cache.get('BE', async () => ({ version: 99 }))
  assert.deepEqual([poll.value.version, poll.cache.refreshing], [1, true])
  await delay(40)
  const completed = await cache.get('BE', async () => ({ version: 99 }))
  assert.deepEqual([completed.value.version, completed.cache.refreshing], [2, false])
})

test('explicit refresh awaits its bounded loader before returning replacement data', async () => {
  const cache = createPerTickerCache({ namespace: 'test-awaited-refresh', ttlMs: 1_000, persist: false })
  await cache.get('MSFT', async () => ({ version: 1 }))
  const pending = cache.get('MSFT', () => delay(20, { version: 2 }), { refresh: true, waitForRefresh: true })
  assert.equal((await cache.get('MSFT', async () => null)).value.version, 1)
  assert.equal((await pending).value.version, 2)
})

test('12 concurrent ticker bootstraps share one WiseSheets universe request', async () => {
  const cache = createPerTickerCache({ namespace: 'test-provider-batch', ttlMs: 1_000, persist: false })
  const tickers = ['AMZN', 'BE', 'CRWV', 'FCEL', 'GEV', 'GOOGL', 'INTC', 'IREN', 'META', 'MU', 'MSFT', 'NBIS']
  let calls = 0
  const load = createWiseSheetsBatchLoader({
    cacheStore: cache,
    fetchRows: async (requested) => { calls += 1; return delay(10, requested.map((ticker) => ({ ticker }))) },
  })
  const responses = await Promise.all(tickers.map(() => load(tickers)))
  assert.equal(calls, 1)
  assert.equal(responses.every((response) => response.value.length === 12), true)
})

test('forward GP and FCF remain unavailable while the exact legacy basis is pending', () => {
  const grossProfit = { NTM: { value: 123 }, '2026E': { value: 456 }, '2027E': { value: 789 } }
  const freeCashFlow = { NTM: { value: 12 }, '2026E': { value: 45 }, '2027E': { value: 78 } }
  failClosedForwardBasis([grossProfit, freeCashFlow], [2026, 2027], 'FORWARD_BASIS_LOADING')
  for (const metric of [grossProfit, freeCashFlow]) {
    for (const period of ['NTM', '2026E', '2027E']) {
      assert.equal(metric[period].value, null)
      assert.equal(metric[period].method, 'FORWARD_BASIS_LOADING')
    }
  }
})

test('cache can represent an explicitly separate Adjusted EBITDA request', async () => {
  const cache = createPerTickerCache({ namespace: 'test-ebitda', ttlMs: 1_000, persist: false })
  const canonicalGaap = { revenueLtm: 1_355_100_000 }
  const adjustedRequest = cache.get('NBIS', () => delay(25, { failure: 'ADJUSTED_EBITDA_EXTRACTION_TIMEOUT' }))
  assert.equal(canonicalGaap.revenueLtm, 1_355_100_000)
  const completed = await adjustedRequest
  assert.equal(completed.value.failure, 'ADJUSTED_EBITDA_EXTRACTION_TIMEOUT')
})

test('cold-load financial cells use a skeleton rather than formatted N/A', async () => {
  const source = await readFile(new URL('../src/components/ValuationAnalysisPage.jsx', import.meta.url), 'utf8')
  assert.match(source, /cellLoading \? <span className="valuation-cell-skeleton" aria-label="Loading" \/>/)
  assert.match(source, /if \(row\.loadingSections\?\.financialSnapshot\)/)
  assert.match(source, /params\.set\('financialRefresh', '1'\)/)
  assert.doesNotMatch(source, /refreshProvider/)
  assert.match(source, /Refresh financials/)
  assert.match(source, /Refresh consensus/)
  assert.match(source, /runValuationRefreshSequence/)
  assert.match(source, /financialSnapshotNeedsRefresh/)
  assert.match(source, /activeDomainRefreshes\.current\.has/)
})

test('valuation tables place EBIT and EV EBIT in the approved column order', async () => {
  const source = await readFile(new URL('../src/components/ValuationAnalysisPage.jsx', import.meta.url), 'utf8')
  assert.ok(source.indexOf("'EV / Gross Profit'") < source.indexOf("'EV / EBIT'"))
  assert.ok(source.indexOf("'EV / EBIT'") < source.indexOf("'EV / Adjusted EBITDA'"))
  assert.ok(source.indexOf("'Gross Profit', 'grossProfit'") < source.indexOf("'EBIT', 'ebit'"))
  assert.ok(source.indexOf("'EBIT', 'ebit'") < source.indexOf("'Adjusted EBITDA', 'ebitda'"))
})

test('stale financial and consensus snapshots refresh serially without stale overwrite', async () => {
  let stored = {
    ticker: 'SYNTH',
    metrics: { revenue: { LTM: 1 }, consensusRevenue: { NTM: 10 } },
    financialSnapshot: { state: 'STALE' },
    consensusSnapshot: { state: 'STALE' },
  }
  let releaseFinancial
  const financialGate = new Promise((resolve) => { releaseFinancial = resolve })
  let financialCalls = 0
  let consensusCalls = 0
  let financialCompleted = false
  const repository = {
    async load() { return structuredClone(stored) },
    async save(snapshot) {
      stored = structuredClone(snapshot)
      return structuredClone(stored)
    },
  }

  const refresh = runValuationRefreshSequence(stored, {
    financial: async () => {
      financialCalls += 1
      const requestSnapshot = await repository.load()
      await financialGate
      const refreshed = {
        ...requestSnapshot,
        metrics: { ...requestSnapshot.metrics, revenue: { LTM: 2 } },
        financialSnapshot: { state: 'READY' },
      }
      financialCompleted = true
      return repository.save(refreshed)
    },
    consensus: async () => {
      consensusCalls += 1
      assert.equal(financialCompleted, true)
      const requestSnapshot = await repository.load()
      const refreshed = {
        ...requestSnapshot,
        metrics: { ...requestSnapshot.metrics, consensusRevenue: { NTM: 20 } },
        consensusSnapshot: { state: 'READY' },
      }
      return repository.save(refreshed)
    },
  })

  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(financialCalls, 1)
  assert.equal(consensusCalls, 0)
  releaseFinancial()
  await refresh

  assert.equal(financialCalls, 1)
  assert.equal(consensusCalls, 1)
  assert.equal(stored.metrics.revenue.LTM, 2)
  assert.equal(stored.metrics.consensusRevenue.NTM, 20)
  assert.equal(stored.financialSnapshot.state, 'READY')
  assert.equal(stored.consensusSnapshot.state, 'READY')
})
