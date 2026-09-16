import { createClient } from '@supabase/supabase-js'
import { getValuationRows } from '../../api/valuationData.js'

const UNIVERSE = ['AMZN', 'BE', 'CRWV', 'FCEL', 'GEV', 'GOOGL', 'INTC', 'IREN', 'META', 'MU', 'MSFT', 'NBIS']
const scenario = process.argv[2]
const tickers = scenario === 'be' ? ['BE'] : scenario === 'universe' ? UNIVERSE : null
if (!tickers) throw new Error('Usage: node server/valuation/profileLatency.mjs be|universe')

const originalFetch = globalThis.fetch
const network = { sec: 0, wiseSheets: 0, yahoo: 0, other: 0 }
globalThis.fetch = async (input, init) => {
  const url = String(input?.url ?? input)
  if (/\.sec\.gov\//i.test(url)) network.sec += 1
  else if (/wisesheets/i.test(url)) network.wiseSheets += 1
  else if (/\.finance\.yahoo\.com\//i.test(url)) network.yahoo += 1
  else network.other += 1
  return originalFetch(input, init)
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
const cacheToken = `:latency-profile:${scenario}:${Date.now()}`

function summarizeProfiles(profiles) {
  const stageNames = [...new Set(profiles.flatMap((profile) => Object.keys(profile.stages)))]
  const stages = Object.fromEntries(stageNames.map((stage) => {
    const entries = profiles.map((profile) => profile.stages[stage]).filter(Boolean)
    return [stage, {
      wallMs: Math.round(Math.max(...entries.map((entry) => entry.elapsedMs))),
      totalWorkMs: Math.round(entries.reduce((sum, entry) => sum + entry.elapsedMs, 0)),
      calls: entries.reduce((sum, entry) => sum + entry.calls, 0),
    }]
  }))
  return {
    stages,
    caches: {
      aggregate: profiles.map((profile) => profile.caches.aggregate),
      wiseSheets: profiles.map((profile) => profile.caches.wiseSheets),
      canonicalHistory: profiles.map((profile) => profile.caches.canonicalHistory),
    },
    canonicalRebuilds: profiles.filter((profile) => profile.flags.canonicalHistoryRebuilt).length,
    adjustedEbitdaRuns: profiles.filter((profile) => profile.flags.adjustedEbitdaRan).length,
  }
}

async function run(label) {
  const before = { ...network }
  const profiles = tickers.map(() => ({ stages: {}, caches: {}, flags: {} }))
  const startedAt = performance.now()
  const responses = await Promise.all(tickers.map((ticker, index) => getValuationRows(supabase, [ticker], {
    providerTickers: tickers,
    latencyProfile: profiles[index],
    profileCacheKey: cacheToken,
  })))
  const requests = Object.fromEntries(Object.keys(network).map((key) => [key, network[key] - before[key]]))
  return {
    label,
    tickers: tickers.length,
    pageWallMs: Math.round(performance.now() - startedAt),
    requests,
    ...summarizeProfiles(profiles),
    errors: responses.flatMap((response) => response.rows.filter((row) => row.error).map((row) => `${row.ticker}:${row.error}`)),
  }
}

const cold = await run(`cold-${scenario}`)
const warm = await run(`warm-${scenario}`)
console.log(JSON.stringify({ cold, warm }, null, 2))
