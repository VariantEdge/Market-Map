import { createClient } from '@supabase/supabase-js'

const CACHE_TTL_MS = 15 * 60 * 1000
const CHART_CACHE_TTL_MS = 5 * 60 * 1000
const FUNDAMENTALS_CACHE_TTL_MS = 30 * 60 * 1000
// Historical anchors change only once per trading day. Keep them separate from
// the short-lived quote cache so refreshes do not repeatedly download history.
const HISTORY_CACHE_TTL_MS = 6 * 60 * 60 * 1000
const EXTERNAL_MAX_CONCURRENCY = 2
const EXTERNAL_REQUEST_GAP_MS = 300
const EXTERNAL_MAX_RETRIES = 2
const EXTERNAL_RETRY_BASE_MS = 800

const yahooHeaders = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
}

const COHR_NON_GAAP_FINANCIALS = {
  ebit: {
    2024: 618_000_000,
    2025: 1_037_000_000,
  },
  eps: {
    2024: 1.21,
    2025: 3.53,
  },
  // Q3 FY2026 YTD non-GAAP operating income of $1,011.1mm plus Q4 FY2026
  // management guidance midpoint: revenue $1.98bn * 40.0% non-GAAP GM - $370mm non-GAAP opex.
  fy2026GuidedAdjustedEbit: 1_433_100_000,
}

let yahooCrumbCache = null
let externalActiveRequests = 0
let externalNextStartAt = 0

const externalQueue = []
const memoryCache = new Map()
const inFlight = new Map()

function getCachedValue(key) {
  const cached = memoryCache.get(key)
  if (!cached || cached.expiresAt <= Date.now()) {
    memoryCache.delete(key)
    return null
  }
  return cached.value
}

function setCachedValue(key, value, ttlMs) {
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlMs })
  return value
}

async function dedupe(key, loader, ttlMs) {
  const cached = getCachedValue(key)
  if (cached) return cached
  if (inFlight.has(key)) return inFlight.get(key)

  const promise = loader()
    .then((value) => setCachedValue(key, value, ttlMs))
    .finally(() => inFlight.delete(key))

  inFlight.set(key, promise)
  return promise
}

function runNextExternalRequest() {
  if (externalActiveRequests >= EXTERNAL_MAX_CONCURRENCY || externalQueue.length === 0) return

  const now = Date.now()
  const startAt = Math.max(now, externalNextStartAt)
  const wait = startAt - now
  const task = externalQueue.shift()
  externalNextStartAt = startAt + EXTERNAL_REQUEST_GAP_MS
  externalActiveRequests += 1

  setTimeout(() => {
    task.start()
  }, wait)
}

function retryDelayMs(response, attempt) {
  const retryAfter = Number(response?.headers?.get('retry-after'))
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000
  return EXTERNAL_RETRY_BASE_MS * Math.pow(2, attempt)
}

function queuedFetch(url, options) {
  return new Promise((resolve, reject) => {
    externalQueue.push({
      start: () => {
        fetch(url, options)
          .then(resolve, reject)
          .finally(() => {
            externalActiveRequests -= 1
            runNextExternalRequest()
          })
      },
    })
    runNextExternalRequest()
  })
}

async function limitedFetch(url, options, attempt = 0) {
  const response = await queuedFetch(url, options)
  if ((response.status === 429 || response.status === 503) && attempt < EXTERNAL_MAX_RETRIES) {
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs(response, attempt)))
    return limitedFetch(url, options, attempt + 1)
  }
  return response
}

export function createSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY')
  }

  return createClient(supabaseUrl, supabaseKey)
}

export function parseTickers(value) {
  return String(value ?? '')
    .split(',')
    .map((ticker) => ticker.trim())
    .filter(Boolean)
}

export async function fetchYahooPrice(ticker) {
  return dedupe(`price:${ticker}`, () => fetchYahooPriceFresh(ticker), CACHE_TTL_MS)
}

async function fetchYahooPriceFresh(ticker) {
  const url =
    `https://query2.finance.yahoo.com/v8/finance/chart/` +
    `${encodeURIComponent(ticker)}?interval=1d&range=1d`

  const res = await limitedFetch(url, { headers: yahooHeaders })

  if (!res.ok) {
    throw new Error(`Yahoo Finance returned HTTP ${res.status} for ${ticker}`)
  }

  const json = await res.json()
  const meta = json?.chart?.result?.[0]?.meta

  if (!meta || meta.regularMarketPrice == null) {
    throw new Error(`No price data in Yahoo Finance response for ${ticker}`)
  }

  return {
    ticker: meta.symbol ?? ticker,
    price: meta.regularMarketPrice,
    previousClose: meta.previousClose ?? meta.chartPreviousClose ?? null,
    currency: meta.currency ?? 'N/A',
    fetched_at: new Date().toISOString(),
  }
}

export async function fetchYahooChart(ticker, range = '1y') {
  return dedupe(`chart:${ticker}:${range}`, () => fetchYahooChartFresh(ticker, range), CHART_CACHE_TTL_MS)
}

// Research views need corporate-action-adjusted anchors for historical return
// calculations. Keep this separate from fetchYahooChart(), whose current UI
// contract is raw close values.
export async function fetchYahooAdjustedDaily(ticker, range = '2y') {
  return dedupe(`adjusted-chart:${ticker}:${range}`, async () => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${encodeURIComponent(range)}&events=div%2Csplits`
    const response = await limitedFetch(url, { headers: yahooHeaders })
    if (!response.ok) throw new Error(`Yahoo adjusted chart HTTP ${response.status} for ${ticker}`)
    const result = (await response.json())?.chart?.result?.[0]
    if (!result) throw new Error(`No adjusted chart result for ${ticker}`)
    const timestamps = result.timestamp ?? []
    const closes = result.indicators?.quote?.[0]?.close ?? []
    const adjusted = result.indicators?.adjclose?.[0]?.adjclose ?? []
    const volume = result.indicators?.quote?.[0]?.volume ?? []
    return {
      ticker: result.meta?.symbol ?? ticker,
      currency: result.meta?.currency ?? 'N/A',
      source: 'Yahoo Finance-compatible chart endpoint',
      adjustment: adjusted.length ? 'split-and-dividend-adjusted close' : 'raw close fallback',
      fetchedAt: new Date().toISOString(),
      points: timestamps.map((timestamp, index) => ({
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        adjustedClose: adjusted[index] ?? closes[index] ?? null,
        close: closes[index] ?? null,
        volume: volume[index] ?? null,
      })).filter((point) => Number.isFinite(point.adjustedClose)),
    }
  }, HISTORY_CACHE_TTL_MS)
}

async function fetchYahooChartFresh(ticker, range = '1y') {
  const chartRanges = {
    '1d': { range: '1d', interval: '5m' },
    '5d': { range: '5d', interval: '15m' },
    '1mo': { range: '1mo', interval: '1d' },
    '3mo': { range: '3mo', interval: '1d' },
    '6mo': { range: '6mo', interval: '1d' },
    ytd: { range: 'ytd', interval: '1d' },
    '1y': { range: '1y', interval: '1d' },
    '18mo': { range: '18mo', interval: '1d' },
    '2y': { range: '2y', interval: '1d' },
    '5y': { range: '5y', interval: '1wk' },
    max: { range: 'max', interval: '1mo' },
  }
  const selected = chartRanges[range] ?? chartRanges['1y']
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/` +
    `${encodeURIComponent(ticker)}?interval=${selected.interval}&range=${selected.range}`

  const res = await limitedFetch(url, { headers: yahooHeaders })
  if (!res.ok) throw new Error(`Yahoo chart HTTP ${res.status} for ${ticker}`)

  const json = await res.json()
  const result = json?.chart?.result?.[0]
  if (!result) throw new Error(`No chart result for ${ticker}`)

  const timestamps = result.timestamp ?? []
  const closes = result.indicators?.quote?.[0]?.close ?? []
  const volumes = result.indicators?.quote?.[0]?.volume ?? []
  const points = timestamps
    .map((ts, i) => ({
      date: new Date(ts * 1000).toISOString(),
      close: closes[i],
      volume: volumes[i] ?? null,
    }))
    .filter((point) => point.close != null && Number.isFinite(point.close))

  return {
    ticker,
    range: selected.range,
    interval: selected.interval,
    currency: result.meta?.currency ?? 'N/A',
    regularMarketPrice: result.meta?.regularMarketPrice ?? null,
    previousClose: result.meta?.chartPreviousClose ?? null,
    points,
  }
}

function latestValue(series = []) {
  return series[series.length - 1] ?? null
}

function annualValueByYear(series = [], year) {
  return series.find((item) => item.asOfDate?.startsWith(String(year))) ?? null
}

function rawValue(item) {
  return item?.reportedValue?.raw ?? null
}

function calcGrowth(current, previous) {
  if (current == null || previous == null || previous === 0) return null
  return (current - previous) / Math.abs(previous)
}

function normalizeFundamentalCurrency(currency) {
  return currency === 'GBp' ? 'GBP' : currency
}

async function fetchYahooCrumb() {
  if (yahooCrumbCache && Date.now() - yahooCrumbCache.fetchedAt < 60 * 60 * 1000) {
    return yahooCrumbCache
  }

  const cookieRes = await limitedFetch('https://fc.yahoo.com', { headers: yahooHeaders })
  const cookie = cookieRes.headers.get('set-cookie')?.split(';')[0] ?? ''
  const crumbRes = await limitedFetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { ...yahooHeaders, Cookie: cookie },
  })

  if (!crumbRes.ok) throw new Error(`Yahoo crumb HTTP ${crumbRes.status}`)

  yahooCrumbCache = {
    crumb: await crumbRes.text(),
    cookie,
    fetchedAt: Date.now(),
  }
  return yahooCrumbCache
}

async function fetchYahooQuoteSummary(ticker, retry = true) {
  const { crumb, cookie } = await fetchYahooCrumb()
  const modules = 'defaultKeyStatistics,financialData,earningsTrend,price,calendarEvents,assetProfile'
  const url =
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/` +
    `${encodeURIComponent(ticker)}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`

  const res = await limitedFetch(url, { headers: { ...yahooHeaders, Cookie: cookie } })
  if (res.status === 401 && retry) {
    yahooCrumbCache = null
    return fetchYahooQuoteSummary(ticker, false)
  }
  if (!res.ok) return null

  const json = await res.json()
  return json?.quoteSummary?.result?.[0] ?? null
}

function selectYahooRevenueEstimate(summary, ticker) {
  const trends = summary?.earningsTrend?.trend ?? []
  const currentAnnual = trends.find((item) =>
    item.period === '0y' &&
    item.endDate &&
    item.revenueEstimate?.avg?.raw > 0
  )
  const nextAnnual = trends.find((item) =>
    item.period === '+1y' &&
    item.endDate &&
    item.revenueEstimate?.avg?.raw > 0
  )

  if (currentAnnual && nextAnnual) {
    const fiscalYearEnd = new Date(`${currentAnnual.endDate}T00:00:00Z`)
    const daysRemaining = (fiscalYearEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    if (Number.isFinite(daysRemaining) && daysRemaining >= 0 && daysRemaining <= 365) {
      const currentWeight = daysRemaining / 365
      const nextWeight = 1 - currentWeight
      return {
        value:
          currentAnnual.revenueEstimate.avg.raw * currentWeight +
          nextAnnual.revenueEstimate.avg.raw * nextWeight,
        growth: null,
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        fiscalYearEnd: currentAnnual.endDate,
        period: 'ntm-blend',
        label: 'NTM',
        source: 'Yahoo Finance earningsTrend blended NTM proxy',
        sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/analysis`,
      }
    }
  }

  const annualTrend = currentAnnual ?? nextAnnual
  if (!annualTrend) return null

  return {
    value: annualTrend.revenueEstimate.avg.raw,
    growth: annualTrend.revenueEstimate.growth?.raw ?? null,
    endDate: annualTrend.endDate,
    period: annualTrend.period,
    label: `FY${new Date(annualTrend.endDate).getUTCFullYear()}E`,
    source: 'Yahoo Finance earningsTrend',
    sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/analysis`,
  }
}

function selectYahooAnnualEstimate(summary, ticker, metric) {
  const trends = summary?.earningsTrend?.trend ?? []
  const annualTrend = trends.find((item) =>
    item.period === '0y' &&
    item.endDate &&
    item[metric]?.avg?.raw != null
  )
  if (!annualTrend) return null

  return {
    value: annualTrend[metric].avg.raw,
    growth: annualTrend[metric].growth?.raw ?? null,
    endDate: annualTrend.endDate,
    period: annualTrend.period,
    label: `FY${new Date(`${annualTrend.endDate}T00:00:00Z`).getUTCFullYear()}E`,
    source: metric === 'revenueEstimate'
      ? 'Yahoo Finance earningsTrend revenue consensus'
      : 'Yahoo Finance earningsTrend EPS consensus',
    sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/analysis`,
    basis: 'consensus',
  }
}

function attachRevenueConsensusCrossCheck(estimates = [], stockAnalysisEstimate = null) {
  return estimates.map((estimate) => {
    const comparable = estimate.period === '0y' && stockAnalysisEstimate?.value != null && Number.isFinite(Number(stockAnalysisEstimate.value))
    if (!comparable) return { ...estimate, alternativeSources: [], warnings: ['Single public consensus source; an independent comparable estimate is unavailable.'] }
    const difference = Math.abs(Number(estimate.value) - Number(stockAnalysisEstimate.value)) / Math.max(Math.abs(Number(estimate.value)), Math.abs(Number(stockAnalysisEstimate.value)), 1)
    const alternative = {
      provider: stockAnalysisEstimate.source,
      sourceUrl: stockAnalysisEstimate.sourceUrl,
      value: Number(stockAnalysisEstimate.value),
      currency: 'USD',
      difference,
    }
    return {
      ...estimate,
      alternativeSources: [alternative],
      warnings: difference > 0.02
        ? [`Consensus-source difference ${(difference * 100).toFixed(1)}% exceeds the 2.0% tolerance. Yahoo Finance remains selected; the alternative value is retained in the audit trail.`]
        : [],
    }
  })
}

function yahooRaw(value) {
  return value?.raw ?? null
}

function selectYahooNextEarningsDate(summary) {
  const earningsDates = summary?.calendarEvents?.earnings?.earningsDate ?? []
  const rawDate =
    earningsDates.find((item) => item?.raw && item.raw * 1000 >= Date.now())?.raw ??
    earningsDates[0]?.raw ??
    summary?.calendarEvents?.earnings?.earningsDate?.raw

  return rawDate ? new Date(rawDate * 1000).toISOString() : null
}

function parseEstimateNumber(value) {
  const match = String(value ?? '').trim().match(/^(-?[\d,.]+)\s*([KMBT])?$/i)
  if (!match) return null
  const base = Number(match[1].replace(/,/g, ''))
  if (!Number.isFinite(base)) return null
  const multipliers = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }
  return base * (multipliers[match[2]?.toUpperCase()] ?? 1)
}

function compactNumberRegex(label) {
  return new RegExp(`${label}[\\s\\S]*?((?:-?\\d+(?:\\.\\d+)?\\s?[KMBT])|(?:-?\\d+(?:\\.\\d+)?))`, 'i')
}

function stripEstimateHtml(html = '') {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(tr|td|th|div|p|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
}

function parseStockAnalysisForecastRow(text = '', rowLabel = '', targetYear = new Date().getFullYear()) {
  const yearBlock = text.match(/Fiscal Year\s+([\s\S]*?)Period Ending/i)?.[1] ?? ''
  const years = [...yearBlock.matchAll(/FY\s*(\d{4})/gi)].map((match) => Number(match[1]))
  const targetIndex = years.indexOf(targetYear)
  const rowStops = [
    'Revenue Growth',
    'Gross Profit',
    'Gross Margin',
    'Operating Income',
    'Net Income',
    'EPS',
    'Forward PE',
    'Free Cash Flow',
    'No\\. Analysts',
    'Revenue Forecast',
    'Sources:',
  ].filter((label) => label !== rowLabel)
  const rowMatch = text.match(new RegExp(`${rowLabel}\\s+([\\s\\S]*?)(?:\\n(?:${rowStops.join('|')})\\b)`, 'i'))
  const rowText = rowMatch?.[1] ?? ''
  const values = [...rowText.matchAll(/-?\d+(?:\.\d+)?\s?[KMBT]?/gi)]
    .map((match) => parseEstimateNumber(match[0]))
    .filter((value) => value != null)
  return targetIndex >= 0 ? values[targetIndex] ?? null : values[0] ?? null
}

function stockAnalysisEstimate(value, ticker, label, sourceMetric = label) {
  if (value == null) return null
  return {
    value,
    growth: null,
    endDate: null,
    period: '0y',
    label: `FY${new Date().getFullYear()}E`,
    source: `StockAnalysis forecast ${sourceMetric}`,
    sourceUrl: `https://stockanalysis.com/stocks/${ticker.toLowerCase()}/forecast/`,
    basis: 'consensus',
  }
}

function cohrGuidedAdjustedEbitEstimate() {
  return {
    value: COHR_NON_GAAP_FINANCIALS.fy2026GuidedAdjustedEbit,
    growth: calcGrowth(COHR_NON_GAAP_FINANCIALS.fy2026GuidedAdjustedEbit, COHR_NON_GAAP_FINANCIALS.ebit[2025]),
    endDate: '2026-06-30',
    period: '0y',
    label: 'FY2026E',
    source: 'Coherent Q3 FY2026 press release non-GAAP YTD operating income plus Q4 guidance midpoint',
    sourceUrl: 'https://www.coherent.com/content/dam/coherent/site/en/documents/investors/financial-releases/2026/may-6/earnings-release-fy26-q3.pdf',
    basis: 'management-guided non-GAAP operating income estimate',
  }
}

async function fetchStockAnalysisStats(ticker) {
  if (!/^[A-Z]+$/.test(ticker)) return {}
  try {
    const baseUrl = `https://stockanalysis.com/stocks/${ticker.toLowerCase()}`
    const res = await limitedFetch(`${baseUrl}/statistics/`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html',
      },
    })
    if (!res.ok) return {}
    const html = await res.text()
    const forwardPeMatch = html.match(/Forward PE[\s\S]*?<td[^>]*title="([^"]+)"/i)
    const forwardPe = Number(forwardPeMatch?.[1]?.replace(/,/g, ''))

    const forecastRes = await limitedFetch(`${baseUrl}/forecast/`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html',
      },
    })
    const forecastHtml = forecastRes.ok ? await forecastRes.text() : ''
    const forecastText = stripEstimateHtml(forecastHtml)
    const revenueMatch =
      forecastHtml.match(/Revenue This Year<\/div>[\s\S]*?<div class="flex items-baseline text-2xl[^"]*">([^<]+)/i) ??
      forecastText.match(compactNumberRegex('Revenue This Year'))
    const epsMatch =
      forecastHtml.match(/EPS This Year<\/div>[\s\S]*?<div class="flex items-baseline text-2xl[^"]*">([^<]+)/i) ??
      forecastText.match(compactNumberRegex('EPS This Year'))
    const revenueEstimate = parseEstimateNumber(revenueMatch?.[1])
    const epsEstimate = parseEstimateNumber(epsMatch?.[1])
    const currentYear = new Date().getFullYear()
    const operatingIncomeByYear = Object.fromEntries(
      [currentYear - 2, currentYear - 1, currentYear]
        .map((yr) => [yr, parseStockAnalysisForecastRow(forecastText, 'Operating Income', yr)])
        .filter(([, value]) => value != null),
    )
    const operatingIncomeEstimate = operatingIncomeByYear[currentYear] ?? null

    return {
      forwardPe: Number.isFinite(forwardPe) ? forwardPe : null,
      revenueEstimate: stockAnalysisEstimate(revenueEstimate, ticker, 'Revenue'),
      epsEstimate: stockAnalysisEstimate(epsEstimate, ticker, 'EPS'),
      ebitEstimate: stockAnalysisEstimate(operatingIncomeEstimate, ticker, 'Operating Income', 'Operating Income / EBIT-style estimate'),
      operatingIncomeByYear,
    }
  } catch {
    return {}
  }
}

async function fetchYahooTimeseries(ticker, types, yearsBack = 6) {
  const now = Math.floor(Date.now() / 1000)
  const period1 = now - yearsBack * 365 * 24 * 60 * 60
  const url =
    `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/` +
    `${encodeURIComponent(ticker)}?symbol=${encodeURIComponent(ticker)}` +
    `&type=${types.join(',')}&period1=${period1}&period2=${now}`

  const res = await limitedFetch(url, { headers: yahooHeaders })
  if (!res.ok) throw new Error(`Yahoo fundamentals HTTP ${res.status} for ${ticker}`)

  const json = await res.json()
  const result = json?.timeseries?.result ?? []
  return Object.fromEntries(
    result.map((entry) => {
      const type = entry.meta?.type?.[0]
      return [type, entry[type] ?? []]
    }).filter(([type]) => Boolean(type)),
  )
}

export async function fetchYahooFundamentals(ticker, quoteCurrency = 'USD') {
  return dedupe(
    `fundamentals:${ticker}:${quoteCurrency}`,
    () => fetchYahooFundamentalsFresh(ticker, quoteCurrency),
    FUNDAMENTALS_CACHE_TTL_MS,
  )
}

async function fetchYahooFundamentalsFresh(ticker, quoteCurrency = 'USD') {
  const types = [
    'quarterlyMarketCap',
    'quarterlyEnterpriseValue',
    'trailingMarketCap',
    'trailingEnterpriseValue',
    'annualTotalRevenue',
    'annualGrossProfit',
    'annualEbit',
    'annualFreeCashFlow',
    'annualDilutedEPS',
  ]
  const series = await fetchYahooTimeseries(ticker, types)
  const [stats, quoteSummary] = await Promise.all([
    fetchStockAnalysisStats(ticker),
    fetchYahooQuoteSummary(ticker).catch(() => null),
  ])
  const year = new Date().getFullYear() - 1
  const years = [year - 1, year]
  const ntmRevenueEstimate = selectYahooRevenueEstimate(quoteSummary, ticker) ?? stats.revenueEstimate ?? null
  const revenueEstimate = selectYahooAnnualEstimate(quoteSummary, ticker, 'revenueEstimate') ?? stats.revenueEstimate ?? null
  const epsEstimate = selectYahooAnnualEstimate(quoteSummary, ticker, 'earningsEstimate') ?? stats.epsEstimate ?? null
  const ebitEstimate = ticker === 'COHR'
    ? cohrGuidedAdjustedEbitEstimate()
    : stats.ebitEstimate ?? null
  const marketCap =
    quoteSummary?.price?.marketCap?.raw ??
    rawValue(latestValue(series.trailingMarketCap)) ??
    rawValue(latestValue(series.quarterlyMarketCap))
  const enterpriseValue =
    quoteSummary?.defaultKeyStatistics?.enterpriseValue?.raw ??
    rawValue(latestValue(series.trailingEnterpriseValue)) ??
    rawValue(latestValue(series.quarterlyEnterpriseValue))
  const financialCurrency = normalizeFundamentalCurrency(
    quoteSummary?.price?.currency ?? quoteCurrency,
  )
  const yahooRevenueConsensus = (quoteSummary?.earningsTrend?.trend ?? [])
    .filter((trend) => ['0y', '+1y', '+2y'].includes(trend.period) && trend.endDate && trend.revenueEstimate?.avg?.raw != null)
    .map((trend) => ({
      period: trend.period,
      endDate: trend.endDate,
      value: trend.revenueEstimate.avg.raw,
      sourceType: 'Street Consensus',
      source: 'Yahoo Finance earningsTrend revenue consensus',
      sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/analysis`,
      retrievedAt: new Date().toISOString(),
    }))
  const revenueConsensus = attachRevenueConsensusCrossCheck(yahooRevenueConsensus, stats.revenueEstimate)

  const revenue = years.map((yr) => rawValue(annualValueByYear(series.annualTotalRevenue, yr)))
  const ebit = years.map((yr) =>
    ticker === 'COHR'
      ? COHR_NON_GAAP_FINANCIALS.ebit[yr] ?? null
      : rawValue(annualValueByYear(series.annualEbit, yr)) ??
        stats.operatingIncomeByYear?.[yr] ??
        null
  )
  const eps = years.map((yr) =>
    ticker === 'COHR'
      ? COHR_NON_GAAP_FINANCIALS.eps[yr] ?? null
      : rawValue(annualValueByYear(series.annualDilutedEPS, yr))
  )

  return {
    ticker,
    currency: financialCurrency,
    columns: [`FY${years[0]}`, `FY${years[1]}`, revenueEstimate?.label ?? `FY${year + 1}E`],
    capitalStructure: {
      enterpriseValue,
      marketCap,
      cash: yahooRaw(quoteSummary?.financialData?.totalCash),
      debt: yahooRaw(quoteSummary?.financialData?.totalDebt),
      sharesOutstanding: yahooRaw(quoteSummary?.defaultKeyStatistics?.sharesOutstanding),
    },
    ratios: {
      evNtmRevenue: enterpriseValue != null && ntmRevenueEstimate?.value
        ? enterpriseValue / ntmRevenueEstimate.value
        : null,
      evAdjEbitda: null,
      peNtm: stats.forwardPe ?? null,
    },
    marketData: {
      beta5yMonthly: yahooRaw(quoteSummary?.defaultKeyStatistics?.beta),
      nextEarningsDate: selectYahooNextEarningsDate(quoteSummary),
      nextEarningsDateSource: 'Yahoo Finance calendarEvents',
    },
    profile: {
      summary: quoteSummary?.assetProfile?.longBusinessSummary ?? null,
      employees: quoteSummary?.assetProfile?.fullTimeEmployees ?? null,
      headquarters: [
        quoteSummary?.assetProfile?.city,
        quoteSummary?.assetProfile?.state,
        quoteSummary?.assetProfile?.country,
      ].filter(Boolean).join(', ') || null,
      website: quoteSummary?.assetProfile?.website ?? null,
      sector: quoteSummary?.assetProfile?.sector ?? null,
      industry: quoteSummary?.assetProfile?.industry ?? null,
    },
    estimates: {
      revenue: revenueEstimate,
      revenueConsensus,
      ntmRevenue: ntmRevenueEstimate,
      eps: epsEstimate,
      ebit: ebitEstimate,
    },
    // Used only when a company does not report enough quarterly XBRL detail to
    // construct a trailing-twelve-month metric from SEC filings.
    trailing: {
      revenue: yahooRaw(quoteSummary?.financialData?.totalRevenue),
      grossProfit: yahooRaw(quoteSummary?.financialData?.grossProfits),
      ebitda: null,
      freeCashFlow: yahooRaw(quoteSummary?.financialData?.freeCashflow),
    },
    metricSources: {
      revenue: {
        historical: 'Yahoo Finance fundamentals-timeseries annualTotalRevenue',
        estimate: revenueEstimate?.source ?? 'n/a',
        sourceUrl: revenueEstimate?.sourceUrl ?? null,
        basis: revenueEstimate?.basis ?? null,
      },
      ebit: ebitEstimate
        ? {
            historical: ticker === 'COHR'
              ? 'Coherent FY2025 release recast non-GAAP operating income'
              : 'Yahoo Finance fundamentals-timeseries annualEbit; StockAnalysis operating income fallback',
            estimate: ebitEstimate.source,
            sourceUrl: ebitEstimate.sourceUrl,
            basis: ticker === 'COHR'
              ? 'management-guided non-GAAP operating income estimate'
              : 'consensus operating income / EBIT-style estimate',
          }
        : {
            historical: ticker === 'COHR'
              ? 'Coherent FY2025 release recast non-GAAP operating income'
              : 'Yahoo Finance fundamentals-timeseries annualEbit; StockAnalysis operating income fallback',
            estimate: 'n/a',
            sourceUrl: null,
            basis: 'No free EBIT/EBITDA consensus source found',
          },
      eps: {
        historical: ticker === 'COHR'
          ? 'Coherent FY2025 release recast non-GAAP diluted EPS'
          : 'Yahoo Finance fundamentals-timeseries annualDilutedEPS',
        estimate: epsEstimate?.source ?? 'n/a',
        sourceUrl: epsEstimate?.sourceUrl ?? null,
        basis: epsEstimate?.basis ?? null,
      },
    },
    financials: {
      revenue: [revenue[0], revenue[1], revenueEstimate?.value ?? null],
      revenueGrowth: [null, calcGrowth(revenue[1], revenue[0]), revenueEstimate?.growth ?? calcGrowth(revenueEstimate?.value, revenue[1])],
      ebit: [ebit[0], ebit[1], ebitEstimate?.value ?? null],
      ebitMargin: [
        revenue[0] && ebit[0] != null ? ebit[0] / revenue[0] : null,
        revenue[1] && ebit[1] != null ? ebit[1] / revenue[1] : null,
        revenueEstimate?.value && ebitEstimate?.value != null ? ebitEstimate.value / revenueEstimate.value : null,
      ],
      ebitGrowth: [null, calcGrowth(ebit[1], ebit[0]), calcGrowth(ebitEstimate?.value, ebit[1])],
      ebitda: [null, null, null],
      ebitdaMargin: [null, null, null],
      ebitdaGrowth: [null, null, null],
      eps: [eps[0], eps[1], epsEstimate?.value ?? null],
      epsGrowth: [null, calcGrowth(eps[1], eps[0]), epsEstimate?.growth ?? calcGrowth(epsEstimate?.value, eps[1])],
    },
    rawAnnual: {
      revenue: (series.annualTotalRevenue ?? []).map((item) => ({ endDate: item.asOfDate, value: rawValue(item) })).filter((item) => item.value != null),
      grossProfit: (series.annualGrossProfit ?? []).map((item) => ({ endDate: item.asOfDate, value: rawValue(item) })).filter((item) => item.value != null),
      ebitda: [],
      freeCashFlow: (series.annualFreeCashFlow ?? []).map((item) => ({ endDate: item.asOfDate, value: rawValue(item) })).filter((item) => item.value != null),
    },
  }
}

export async function getPrice(supabase, ticker) {
  const { data } = await supabase
    .from('prices')
    .select('ticker, price, currency, fetched_at')
    .eq('ticker', ticker)
    .single()

  if (data && Date.now() - new Date(data.fetched_at).getTime() < CACHE_TTL_MS) {
    return {
      ticker: data.ticker,
      price: data.price,
      currency: data.currency,
      fetchedAt: new Date(data.fetched_at).getTime(),
    }
  }

  const fresh = await fetchYahooPrice(ticker)

  await supabase.from('prices').upsert(
    {
      ticker: fresh.ticker,
      price: fresh.price,
      currency: fresh.currency,
      fetched_at: fresh.fetched_at,
    },
    { onConflict: 'ticker' },
  )

  return {
    ticker: fresh.ticker,
    price: fresh.price,
    currency: fresh.currency,
    fetchedAt: Date.now(),
  }
}

export const YAHOO_PERFORMANCE_RANGES = {
  d1: '1d',
  m1: '1mo',
  m3: '3mo',
  ytd: 'ytd',
  m6: '6mo',
  y1: '1y',
  m18: '18mo',
  y2: '2y',
}

function expectedRangeStart(range, endDate) {
  const start = new Date(endDate)
  if (range === 'ytd') {
    return new Date(Date.UTC(start.getUTCFullYear(), 0, 1))
  }

  const monthsByRange = {
    '1mo': 1,
    '3mo': 3,
    '6mo': 6,
    '1y': 12,
    '18mo': 18,
    '2y': 24,
  }
  const months = monthsByRange[range]
  if (months) start.setUTCMonth(start.getUTCMonth() - months)
  else start.setUTCDate(start.getUTCDate() - 1)
  return start
}

function hasFullYahooRange(chart, range) {
  const firstDate = chart.points[0]?.date
  const lastDate = chart.points.at(-1)?.date
  if (!firstDate || !lastDate) return false
  const expectedStart = expectedRangeStart(range, lastDate)
  const firstTradingDate = new Date(firstDate)
  const toleranceMs = 7 * 24 * 60 * 60 * 1000
  return firstTradingDate.getTime() - expectedStart.getTime() <= toleranceMs
}

function yahooPerformanceAnchor(chart, range) {
  if (!chart) {
    return {
      price: null,
      date: null,
      range,
      firstPointDate: null,
      hasFullHistory: false,
    }
  }
  const hasFullHistory = hasFullYahooRange(chart, range)
  return {
    price: hasFullHistory ? chart.previousClose : null,
    date: null,
    range,
    firstPointDate: chart.points[0]?.date?.slice(0, 10) ?? null,
    hasFullHistory,
  }
}

export function buildYahooPerformanceSnapshot(ticker, charts) {
  const referenceChart = charts.d1 ?? Object.values(charts).find(Boolean)
  const asOf = referenceChart?.points.at(-1)?.date ?? null
  return {
    ticker,
    currentPrice: referenceChart?.regularMarketPrice ?? null,
    currency: referenceChart?.currency ?? null,
    asOf,
    source: 'Yahoo Finance chart range baseline',
    ...Object.fromEntries(
      Object.entries(YAHOO_PERFORMANCE_RANGES).map(([key, range]) => [
        key,
        yahooPerformanceAnchor(charts[key], range),
      ]),
    ),
  }
}

export async function getAnchorPrices(_supabase, ticker) {
  const rangeEntries = Object.entries(YAHOO_PERFORMANCE_RANGES)
  const results = await Promise.allSettled(
    rangeEntries.map(([, range]) => fetchYahooChart(ticker, range)),
  )
  const charts = Object.fromEntries(
    rangeEntries.map(([key], index) => [
      key,
      results[index].status === 'fulfilled' ? results[index].value : null,
    ]),
  )
  if (!Object.values(charts).some(Boolean)) {
    throw new Error(`No Yahoo performance ranges available for ${ticker}`)
  }
  return buildYahooPerformanceSnapshot(ticker, charts)
}
