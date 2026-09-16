import {
  normalizeSubmissions,
  padCik,
} from './filings.js'

const SEC_TICKER_URL = 'https://www.sec.gov/files/company_tickers_exchange.json'
const SEC_SUBMISSIONS_URL = 'https://data.sec.gov/submissions'
const SEC_COMPANYFACTS_URL = 'https://data.sec.gov/api/xbrl/companyfacts'
const SEC_ARCHIVES_URL = 'https://www.sec.gov/Archives/edgar/data'
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const DEFAULT_TIMEOUT_MS = 12_000
const DEFAULT_MAX_RETRIES = 2
const DEFAULT_REQUESTS_PER_SECOND = 6

const cache = new Map()
const inFlight = new Map()
const queue = []
let activeRequests = 0
let nextStartAt = 0

function now() {
  return Date.now()
}

function cacheGet(key) {
  const entry = cache.get(key)
  if (!entry || entry.expiresAt <= now()) {
    cache.delete(key)
    return null
  }
  return entry.value
}

function cacheSet(key, value, ttlMs = DEFAULT_CACHE_TTL_MS) {
  cache.set(key, { value, expiresAt: now() + ttlMs })
  return value
}

function cacheTtlMs(options = {}) {
  const configured = Number(process.env.SEC_CACHE_TTL_SECONDS)
  const fromEnv = Number.isFinite(configured) && configured > 0 ? configured * 1000 : null
  return options.ttlMs ?? fromEnv ?? DEFAULT_CACHE_TTL_MS
}

async function dedupe(key, loader, ttlMs) {
  const cached = cacheGet(key)
  if (cached) return cached
  if (inFlight.has(key)) return inFlight.get(key)

  const promise = loader()
    .then((value) => cacheSet(key, value, ttlMs))
    .finally(() => inFlight.delete(key))

  inFlight.set(key, promise)
  return promise
}

function secUserAgent() {
  return process.env.SEC_USER_AGENT ||
    'VariantEdge Market Map SEC Research contact@example.com'
}

function secRateGapMs() {
  const rps = Number(process.env.SEC_MAX_REQUESTS_PER_SECOND || DEFAULT_REQUESTS_PER_SECOND)
  return Math.ceil(1000 / Math.max(1, Math.min(10, rps)))
}

function runNextRequest() {
  if (activeRequests >= 1 || queue.length === 0) return
  const task = queue.shift()
  if (task.signal?.aborted) {
    task.reject(task.signal.reason ?? new DOMException('Aborted', 'AbortError'))
    runNextRequest()
    return
  }
  const startAt = Math.max(now(), nextStartAt)
  const waitMs = Math.max(0, startAt - now())
  nextStartAt = startAt + secRateGapMs()
  activeRequests += 1
  setTimeout(() => {
    if (task.signal?.aborted) {
      activeRequests -= 1
      task.reject(task.signal.reason ?? new DOMException('Aborted', 'AbortError'))
      runNextRequest()
      return
    }
    task.start()
  }, waitMs)
}

function queuedFetch(url, options) {
  return new Promise((resolve, reject) => {
    const signal = options?.signal
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
      return
    }
    const task = {
      signal,
      reject,
      start: () => {
        signal?.removeEventListener('abort', abortQueued)
        fetch(url, options)
          .then(resolve, reject)
          .finally(() => {
            activeRequests -= 1
            runNextRequest()
          })
      },
    }
    const abortQueued = () => {
      const index = queue.indexOf(task)
      if (index < 0) return
      queue.splice(index, 1)
      signal.removeEventListener('abort', abortQueued)
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', abortQueued, { once: true })
    queue.push(task)
    runNextRequest()
  })
}

function abortError(error, signal) {
  return signal?.aborted || error?.name === 'AbortError'
}

function linkedRequestController(signal, timeoutMs, message) {
  const controller = new AbortController()
  const relayAbort = () => controller.abort(signal.reason ?? new DOMException('Aborted', 'AbortError'))
  signal?.addEventListener('abort', relayAbort, { once: true })
  const timeout = setTimeout(() => controller.abort(new Error(message)), timeoutMs)
  return {
    controller,
    cleanup() {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', relayAbort)
    },
  }
}

function abortableDelay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
      return
    }
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }, milliseconds)
    const abort = () => {
      clearTimeout(timeout)
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', abort, { once: true })
  })
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get('retry-after'))
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000
  return 650 * Math.pow(2, attempt)
}

async function secFetchJson(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
  let lastError = null

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (options.signal?.aborted) throw options.signal.reason ?? new DOMException('Aborted', 'AbortError')
    const request = linkedRequestController(options.signal, timeoutMs, 'SEC request timed out.')
    try {
      const response = await queuedFetch(url, {
        headers: {
          'User-Agent': secUserAgent(),
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate, br',
        },
        signal: request.controller.signal,
      })
      request.cleanup()

      if ((response.status === 429 || response.status === 503) && attempt < maxRetries) {
        await abortableDelay(retryDelay(response, attempt), options.signal)
        continue
      }
      if (!response.ok) {
        throw new Error(`SEC returned HTTP ${response.status} for ${url}`)
      }
      return response.json()
    } catch (error) {
      request.cleanup()
      if (abortError(error, options.signal)) throw error
      lastError = error
      if (attempt < maxRetries) {
        await abortableDelay(500 * Math.pow(2, attempt), options.signal)
        continue
      }
    }
  }

  throw lastError ?? new Error('SEC request failed.')
}

function normalizeTickerRows(payload) {
  const fields = payload?.fields ?? []
  const data = payload?.data ?? []
  const fieldIndex = Object.fromEntries(fields.map((field, index) => [field, index]))
  return data
    .map((row) => ({
      cik: padCik(row[fieldIndex.cik]),
      name: String(row[fieldIndex.name] ?? '').trim(),
      ticker: String(row[fieldIndex.ticker] ?? '').trim().toUpperCase(),
      exchange: String(row[fieldIndex.exchange] ?? '').trim(),
    }))
    .filter((company) => company.cik && company.name && company.ticker)
}

export async function loadCompanyIndex(options = {}) {
  return dedupe('sec:company-index', async () => {
    const payload = await secFetchJson(SEC_TICKER_URL, options)
    return normalizeTickerRows(payload)
  }, cacheTtlMs(options))
}

function searchScore(company, query) {
  const q = query.toLowerCase()
  const ticker = company.ticker.toLowerCase()
  const name = company.name.toLowerCase()
  if (ticker === q) return 1000
  if (ticker.startsWith(q)) return 800 - ticker.length
  if (name === q) return 700
  if (name.startsWith(q)) return 600 - name.length / 100
  if (name.includes(q)) return 400 - name.indexOf(q)
  return 0
}

export async function searchCompanies(query, options = {}) {
  const q = String(query ?? '').trim()
  if (!q) return []
  const companies = await loadCompanyIndex(options)
  return companies
    .map((company) => ({ company, score: searchScore(company, q) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.company.name.localeCompare(b.company.name))
    .slice(0, options.limit ?? 12)
    .map((item) => item.company)
}

export async function resolveCompany(value, options = {}) {
  const q = String(value ?? '').trim()
  if (!q) return null
  const companies = await loadCompanyIndex(options)
  const padded = /^\d+$/.test(q) ? padCik(q) : null
  return companies.find((company) =>
    company.ticker.toLowerCase() === q.toLowerCase() ||
    (padded && company.cik === padded)
  ) ?? (await searchCompanies(q, { ...options, limit: 1 }))[0] ?? null
}

export async function getCompanySubmissions(cik, options = {}) {
  const padded = padCik(cik)
  return dedupe(`sec:submissions:${padded}`, () =>
    secFetchJson(`${SEC_SUBMISSIONS_URL}/CIK${padded}.json`, options),
  cacheTtlMs(options))
}

export async function getCompanySubmissionsFile(filename, options = {}) {
  const safeFilename = String(filename ?? '').trim()
  if (!/^CIK\d{10}-submissions-\d{3}\.json$/i.test(safeFilename)) {
    throw new Error('Invalid SEC submissions filename.')
  }
  return dedupe(`sec:submissions-file:${safeFilename}`, () =>
    secFetchJson(`${SEC_SUBMISSIONS_URL}/${safeFilename}`, options),
  cacheTtlMs(options))
}

export async function getFilingDirectory(cik, accessionNumber, options = {}) {
  const compactCik = String(Number(String(cik ?? '').replace(/\D/g, '') || '0'))
  const compactAccession = String(accessionNumber ?? '').replace(/-/g, '')
  if (!/^\d+$/.test(compactCik) || !/^\d{18}$/.test(compactAccession)) {
    throw new Error('Invalid SEC filing directory identity.')
  }
  const url = `${SEC_ARCHIVES_URL}/${compactCik}/${compactAccession}/index.json`
  return dedupe(`sec:filing-directory:${compactCik}:${compactAccession}`, () =>
    secFetchJson(url, options),
  cacheTtlMs(options))
}

export async function getCompanyFacts(cik, options = {}) {
  const padded = padCik(cik)
  return dedupe(`sec:companyfacts:${padded}`, () =>
    secFetchJson(`${SEC_COMPANYFACTS_URL}/CIK${padded}.json`, options),
  cacheTtlMs(options))
}

export async function getCompanyFilings(value, options = {}) {
  const company = await resolveCompany(value, options)
  if (!company) return null
  const submissions = await getCompanySubmissions(company.cik, options)
  return normalizeSubmissions(company, submissions)
}

export async function fetchSecText(url, options = {}) {
  const requestUrl = String(url ?? '').trim()
  if (!requestUrl) throw new Error('SEC filing URL is required.')
  const ttlMs = cacheTtlMs(options)
  return dedupe(`sec:document:${requestUrl}`, async () => {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
    let lastError = null

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (options.signal?.aborted) throw options.signal.reason ?? new DOMException('Aborted', 'AbortError')
      const request = linkedRequestController(options.signal, timeoutMs, 'SEC filing request timed out.')
      try {
        const response = await queuedFetch(requestUrl, {
          headers: {
            'User-Agent': secUserAgent(),
            Accept: 'text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
          },
          signal: request.controller.signal,
        })
        request.cleanup()

        if ((response.status === 429 || response.status === 503) && attempt < maxRetries) {
          await abortableDelay(retryDelay(response, attempt), options.signal)
          continue
        }
        if (!response.ok) {
          throw new Error(`SEC returned HTTP ${response.status} for filing document.`)
        }
        return response.text()
      } catch (error) {
        request.cleanup()
        if (abortError(error, options.signal)) throw error
        lastError = error
        if (attempt < maxRetries) {
          await abortableDelay(500 * Math.pow(2, attempt), options.signal)
          continue
        }
      }
    }

    throw lastError ?? new Error('SEC filing request failed.')
  }, ttlMs)
}

export function clearSecCachesForTests() {
  cache.clear()
  inFlight.clear()
  queue.length = 0
  activeRequests = 0
  nextStartAt = 0
}

export function getSecRequestStateForTests() {
  return { queued: queue.length, active: activeRequests, inFlight: inFlight.size }
}
