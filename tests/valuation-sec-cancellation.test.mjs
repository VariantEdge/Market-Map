import test from 'node:test'
import assert from 'node:assert/strict'
import { clearSecCachesForTests, fetchSecText, getSecRequestStateForTests } from '../server/sec/edgar.js'
import { buildCanonicalHistoricalFinancials } from '../server/valuation/secCanonicalFinancials.js'

test('aborting a targeted SEC task stops its underlying work', async () => {
  let ticks = 0
  let stoppedAt = null
  const result = await buildCanonicalHistoricalFinancials({
    ticker: 'SYNTH', company: { ticker: 'SYNTH', cik: '1' }, facts: { facts: {} },
    filings: { filings: [] }, wiseSheetsRows: [], years: [2024], targetedSecTimeoutMs: 15,
    targetedCompletionLoader: ({ signal }) => new Promise((resolve, reject) => {
      const timer = setInterval(() => { ticks += 1 }, 2)
      signal.addEventListener('abort', () => {
        clearInterval(timer)
        stoppedAt = ticks
        reject(signal.reason)
      }, { once: true })
    }),
  })
  assert.ok(result.canonical.failures.some((failure) => failure.reason === 'TARGETED_SEC_COMPLETION_TIMEOUT'))
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(ticks, stoppedAt)
})

test('one abort clears queued and in-flight SEC document requests', async () => {
  clearSecCachesForTests()
  const originalFetch = globalThis.fetch
  globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
  try {
    const controller = new AbortController()
    const requests = [1, 2, 3].map((id) => fetchSecText(`https://www.sec.gov/test-${id}.htm`, {
      signal: controller.signal, maxRetries: 0,
    }))
    await new Promise((resolve) => setTimeout(resolve, 5))
    controller.abort(new DOMException('Stopped', 'AbortError'))
    await Promise.allSettled(requests)
    await new Promise((resolve) => setTimeout(resolve, 200))
    assert.deepEqual(getSecRequestStateForTests(), { queued: 0, active: 0, inFlight: 0 })
  } finally {
    globalThis.fetch = originalFetch
    clearSecCachesForTests()
  }
})
