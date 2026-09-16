export function financialSnapshotNeedsRefresh(row) {
  return Boolean(row?.loadingSections?.financialSnapshot) ||
    ['STALE', 'INCOMPATIBLE'].includes(row?.financialSnapshot?.state)
}

export function createBoundedFinancialRefreshQueue(maxConcurrent = 2) {
  const limit = Math.max(1, Number(maxConcurrent) || 1)
  const queued = []
  const inFlight = new Map()
  let active = 0

  const drain = () => {
    while (active < limit && queued.length) {
      const item = queued.shift()
      active += 1
      Promise.resolve()
        .then(item.task)
        .then(item.resolve, item.reject)
        .finally(() => {
          active -= 1
          inFlight.delete(item.key)
          drain()
        })
    }
  }

  return {
    run(key, task) {
      const normalizedKey = String(key ?? '')
      if (inFlight.has(normalizedKey)) return inFlight.get(normalizedKey)
      const promise = new Promise((resolve, reject) => {
        queued.push({ key: normalizedKey, task, resolve, reject })
        drain()
      })
      inFlight.set(normalizedKey, promise)
      return promise
    },
    state() {
      return { active, queued: queued.length, inFlight: inFlight.size, maxConcurrent: limit }
    },
  }
}

export async function runValuationRefreshSequence(row, handlers, completed = {}) {
  let current = row
  if (!completed.financial && financialSnapshotNeedsRefresh(current)) {
    current = await handlers.financial(current) ?? current
  }
  if (!completed.consensus && current?.consensusSnapshot?.state === 'STALE') {
    current = await handlers.consensus(current) ?? current
  }
  return current
}
