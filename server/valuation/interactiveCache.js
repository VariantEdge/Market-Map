import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

function safeKey(value) {
  return String(value).replace(/[^A-Z0-9._-]/gi, '_')
}

export function runBoundedTask(stage, task, timeoutMs, fallback = null) {
  let timeout
  return Promise.race([
    Promise.resolve().then(task).then((value) => ({ value, diagnostic: null }))
      .catch((error) => ({
        value: fallback,
        diagnostic: { stage, reason: `${stage}_FAILED`, detail: error?.message ?? 'Unknown error' },
      })),
    new Promise((resolve) => {
      timeout = setTimeout(() => resolve({
        value: fallback,
        diagnostic: { stage, reason: `${stage}_TIMEOUT`, detail: `Exceeded ${timeoutMs}ms` },
      }), timeoutMs)
    }),
  ]).finally(() => clearTimeout(timeout))
}

export function runAbortableTask(stage, task, timeoutMs, fallback = null) {
  const controller = new AbortController()
  let timeout
  return Promise.race([
    Promise.resolve().then(() => task(controller.signal)).then((value) => ({ value, diagnostic: null }))
      .catch((error) => ({
        value: fallback,
        diagnostic: { stage, reason: `${stage}_FAILED`, detail: error?.message ?? 'Unknown error' },
      })),
    new Promise((resolve) => {
      timeout = setTimeout(() => {
        controller.abort(new Error(`${stage}_TIMEOUT`))
        resolve({
          value: fallback,
          diagnostic: { stage, reason: `${stage}_TIMEOUT`, detail: `Exceeded ${timeoutMs}ms` },
        })
      }, timeoutMs)
    }),
  ]).finally(() => clearTimeout(timeout))
}

export function createPerTickerCache({
  namespace,
  ttlMs,
  cacheDirectory = path.join(process.cwd(), '.cache', 'valuation-production'),
  persist = true,
  now = () => Date.now(),
} = {}) {
  const values = new Map()
  const inFlight = new Map()

  const filename = (key) => path.join(cacheDirectory, safeKey(namespace ?? 'cache'), `${safeKey(key)}.json`)

  async function hydrate(key) {
    if (values.has(key) || !persist) return values.get(key) ?? null
    const record = await readFile(filename(key), 'utf8').then(JSON.parse).catch(() => null)
    if (record?.value !== undefined && Number.isFinite(Number(record?.storedAt))) values.set(key, record)
    return record
  }

  async function store(key, value) {
    const record = { value, storedAt: now() }
    values.set(key, record)
    if (persist) {
      const target = filename(key)
      await mkdir(path.dirname(target), { recursive: true })
        .then(() => writeFile(target, JSON.stringify(record)))
        .catch(() => {})
    }
    return record
  }

  function start(key, loader) {
    if (inFlight.has(key)) return inFlight.get(key)
    const request = Promise.resolve().then(loader)
      .then((value) => store(key, value))
      .finally(() => inFlight.delete(key))
    inFlight.set(key, request)
    return request
  }

  return {
    async get(key, loader, { refresh = false, waitForInitial = true, waitForRefresh = false } = {}) {
      const existing = await hydrate(key)
      const ageMs = existing ? Math.max(0, now() - Number(existing.storedAt)) : null
      const fresh = existing && ageMs <= ttlMs
      const activeRequest = inFlight.get(key)
      if (existing && !refresh) {
        return {
          value: existing.value,
          cache: { state: fresh ? 'FRESH' : 'STALE', ageMs, refreshing: Boolean(activeRequest) },
        }
      }

      const request = start(key, loader)
      if (existing) {
        if (waitForRefresh) {
          const loaded = await request
          return { value: loaded.value, cache: { state: 'FRESH', ageMs: 0, refreshing: false } }
        }
        request.catch(() => {})
        return { value: existing.value, cache: { state: fresh ? 'FRESH' : 'STALE', ageMs, refreshing: true } }
      }
      if (!waitForInitial) {
        request.catch(() => {})
        return { value: null, cache: { state: 'MISS', ageMs: null, refreshing: true } }
      }

      const loaded = await request
      return { value: loaded.value, cache: { state: 'MISS', ageMs: 0, refreshing: false } }
    },
    async peek(key) {
      const existing = await hydrate(key)
      if (!existing) return { value: null, cache: { state: 'MISS', ageMs: null, refreshing: inFlight.has(key) } }
      const ageMs = Math.max(0, now() - Number(existing.storedAt))
      return {
        value: existing.value,
        cache: { state: ageMs <= ttlMs ? 'FRESH' : 'STALE', ageMs, refreshing: inFlight.has(key) },
      }
    },
    clear() {
      values.clear()
      inFlight.clear()
    },
    isRefreshing(key) {
      return inFlight.has(key)
    },
  }
}
