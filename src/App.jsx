import { useState, useEffect, useCallback } from 'react'
import { AI_INFRASTRUCTURE_VERTICALS, MARKET_MAPS, SOFTWARE_VERTICALS } from './data.js'
import CompanyChatCard from './components/CompanyChatCard.jsx'
import WatchlistPage from './components/WatchlistPage.jsx'
import ValuationAnalysisPage from './components/ValuationAnalysisPage.jsx'
import { getCompanyChatConfig } from './companyChatConfig.js'

// ─── STATIC DATA (homepage themes) ───────────────────────────────────────────

const THEMES = [
  {
    id: 'optics',
    symbol: '◉',
    name: 'Optics',
    description: MARKET_MAPS.optics.description,
    marketCap: MARKET_MAPS.optics.marketCap,
    available: true,
  },
  {
    id: 'neoclouds',
    symbol: 'N',
    name: 'Neoclouds',
    description: MARKET_MAPS.neoclouds.description,
    marketCap: MARKET_MAPS.neoclouds.marketCap,
    available: true,
  },
  {
    id: 'etfs',
    symbol: 'ETF',
    name: 'ETFs',
    description: MARKET_MAPS.etfs.description,
    marketCap: MARKET_MAPS.etfs.marketCap,
    available: true,
  },
  {
    id: 'btm-energy',
    symbol: 'BTM',
    name: 'BTM Energy',
    description: MARKET_MAPS['btm-energy'].description,
    marketCap: MARKET_MAPS['btm-energy'].marketCap,
    available: true,
  },
  {
    id: 'hyperscalers',
    symbol: 'HYP',
    name: 'Hyperscalers',
    description: MARKET_MAPS.hyperscalers.description,
    marketCap: MARKET_MAPS.hyperscalers.marketCap,
    available: true,
  },
  {
    id: 'semiconductor-process-control',
    symbol: 'SPC',
    name: 'Semiconductor Process Control',
    description: MARKET_MAPS['semiconductor-process-control'].description,
    marketCap: MARKET_MAPS['semiconductor-process-control'].marketCap,
    available: true,
  },
  ...SOFTWARE_VERTICALS.map((vertical) => ({
    id: vertical.id,
    symbol: vertical.symbol,
    name: vertical.layer.name,
    description: vertical.description,
    marketCap: 'Live',
    available: true,
  })),
  ...AI_INFRASTRUCTURE_VERTICALS.map((vertical) => ({
    id: vertical.id,
    symbol: vertical.symbol,
    name: vertical.layer.name,
    description: vertical.description,
    marketCap: 'Live',
    available: true,
  })),
]

// Available theme-card stats are derived from the market-map data.
THEMES.forEach((theme) => {
  const marketMap = MARKET_MAPS[theme.id]
  if (!marketMap) return
  theme.companies = marketMap.layers.reduce((sum, layer) => sum + layer.companies.length, 0)
  theme.layers = marketMap.layers.length
})

// ─── ROUTING ──────────────────────────────────────────────────────────────────

const getStateFromURL = () => {
  const p = new URLSearchParams(window.location.search)
  const theme = p.get('theme')
  const layer = p.get('layer')
  const ticker = p.get('ticker')
  if (p.get('view') === 'watchlist') return { view: 'watchlist' }
  if (p.get('view') === 'valuation') return { view: 'valuation' }
  const marketMap = MARKET_MAPS[theme]
  if (marketMap && layer !== null && ticker) {
    const idx = parseInt(layer, 10) - 1
    const match = findCompany(theme, ticker, idx)
    if (match) return { view: 'ticker', themeId: theme, ticker }
  }
  if (marketMap && layer !== null) {
    const idx = parseInt(layer, 10) - 1 // URL is 1-based, internal is 0-based
    if (!isNaN(idx) && idx >= 0 && idx < marketMap.layers.length)
      return { view: 'layer', themeId: theme, layerIdx: idx }
  }
  if (marketMap) return { view: 'map', themeId: theme }
  return { view: 'home' }
}

// ─── PRICE HELPERS ────────────────────────────────────────────────────────────

const CURRENCY_SYMBOLS = {
  USD: '$', EUR: '€', CNY: '¥', JPY: '¥', GBP: '£',
  SEK: 'kr ', NOK: 'kr ', DKK: 'kr ', HKD: 'HK$', KRW: '₩',
}

// Yahoo Finance returns London prices in GBp (pence, not pounds).
// Display as "50.70p" so it's unambiguous. JPY/KRW are whole-number currencies.
function formatPrice(priceData) {
  if (!priceData || priceData.price == null) return '—'
  if (priceData.currency === 'GBp') return priceData.price.toFixed(2) + 'p'
  const sym = CURRENCY_SYMBOLS[priceData.currency] ?? (priceData.currency + ' ')
  const dp = (priceData.currency === 'JPY' || priceData.currency === 'KRW') ? 0 : 2
  return sym + priceData.price.toFixed(dp)
}

function formatQuotePrice(priceData) {
  if (!priceData || priceData.price == null) return 'â€”'
  if (priceData.currency === 'GBp') return `${Number(priceData.price).toFixed(1)}p`
  const sym = CURRENCY_SYMBOLS[priceData.currency] ?? `${priceData.currency} `
  const decimals = (priceData.currency === 'JPY' || priceData.currency === 'KRW') ? 0 : 1
  return sym + Number(priceData.price).toFixed(decimals)
}

// Renders a signed percentage cell from today's price and an anchor price.
// Both prices must be raw close; never adjusted_close.
function renderPct(todayPrice, anchorPrice) {
  if (todayPrice == null || anchorPrice == null || anchorPrice === 0)
    return <span className="pct-na">—</span>
  const pct = ((todayPrice - anchorPrice) / anchorPrice) * 100
  const text = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%'
  return <span className={pct >= 0 ? 'pct-pos' : 'pct-neg'}>{text}</span>
}

const CHART_RANGES = [
  { id: '1d', label: '1D' },
  { id: '5d', label: '5D' },
  { id: '1mo', label: '1M' },
  { id: '6mo', label: '6M' },
  { id: 'ytd', label: 'YTD' },
  { id: '1y', label: '1Y' },
  { id: '5y', label: '5Y' },
  { id: 'max', label: 'MAX' },
]

const CHART_WIDTH = 900
const CHART_HEIGHT = 280
const CHART_MARGIN = { top: 18, right: 18, bottom: 42, left: 64 }
const PEER_FUNDAMENTALS_CONCURRENCY = 2
const LAYER_BASKET_CONCURRENCY = 2
const MINI_CHART_WIDTH = 1000
const MINI_CHART_HEIGHT = 260
const MINI_CHART_MARGIN = { top: 18, right: 30, bottom: 42, left: 58 }
const CLIENT_CACHE_TTL_MS = 5 * 60 * 1000
const clientRequestCache = new Map()
const clientRequestsInFlight = new Map()

function getLayerLabel(layer, idx) {
  return layer.label ?? `L${idx + 1}`
}

async function fetchJson(url, options = {}) {
  const ttlMs = options.ttlMs ?? 0
  const cached = clientRequestCache.get(url)
  if (ttlMs > 0 && cached?.expiresAt > Date.now()) return cached.value
  if (clientRequestsInFlight.has(url)) return clientRequestsInFlight.get(url)

  const request = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
      return response.json()
    })
    .then((value) => {
      if (ttlMs > 0) {
        clientRequestCache.set(url, { value, expiresAt: Date.now() + ttlMs })
      }
      return value
    })
    .finally(() => clientRequestsInFlight.delete(url))

  clientRequestsInFlight.set(url, request)
  return request
}

async function fetchPeerFundamentals(peerTickers) {
  const results = []
  for (let i = 0; i < peerTickers.length; i += PEER_FUNDAMENTALS_CONCURRENCY) {
    const batch = peerTickers.slice(i, i + PEER_FUNDAMENTALS_CONCURRENCY)
    const batchResults = await Promise.all(
      batch.map((peerTicker) =>
        fetchJson(`/api/fundamentals?ticker=${peerTicker}`, { ttlMs: CLIENT_CACHE_TTL_MS })
          .catch((err) => ({ ticker: peerTicker, error: err.message })),
      ),
    )
    results.push(...batchResults)
  }
  return results
}

async function fetchLayerBasketCharts(tickers, range) {
  const results = []
  for (let i = 0; i < tickers.length; i += LAYER_BASKET_CONCURRENCY) {
    const batch = tickers.slice(i, i + LAYER_BASKET_CONCURRENCY)
    const batchResults = await Promise.all(
      batch.map((ticker) =>
        fetchJson(`/api/chart?ticker=${encodeURIComponent(ticker)}&range=${range}`)
          .catch((err) => ({ ticker, error: err.message })),
      ),
    )
    results.push(...batchResults)
  }
  return results
}

function findCompany(themeId, ticker, preferredLayerIdx = 0) {
  const marketMap = MARKET_MAPS[themeId]
  if (!marketMap) return null

  const preferredLayer = marketMap.layers[preferredLayerIdx]
  const preferredCompany = preferredLayer?.companies.find((co) => co.ticker === ticker)
  if (preferredCompany) {
    return {
      company: preferredCompany,
      layer: preferredLayer,
      layerIdx: preferredLayerIdx,
      marketMap,
    }
  }

  for (let layerIdx = 0; layerIdx < marketMap.layers.length; layerIdx += 1) {
    const layer = marketMap.layers[layerIdx]
    const company = layer.companies.find((co) => co.ticker === ticker)
    if (company) return { company, layer, layerIdx, marketMap }
  }
  return null
}

function calcPct(todayPrice, anchorPrice) {
  if (todayPrice == null || anchorPrice == null || anchorPrice === 0) return null
  return ((todayPrice - anchorPrice) / anchorPrice) * 100
}

function formatPctText(pct) {
  if (pct == null) return '—'
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`
}

function formatBasketPct(pct) {
  if (pct == null || !Number.isFinite(Number(pct))) return '--'
  return `${pct >= 0 ? '+' : ''}${Number(pct).toFixed(1)}%`
}

function formatMoneyValue(value, currency = 'USD', scale = 1) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  const scaled = Number(value) / scale
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `
  const abs = Math.abs(scaled)
  const dp = abs >= 100 ? 0 : abs >= 10 ? 1 : 2
  return `${symbol}${scaled.toLocaleString(undefined, {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  })}`
}

function formatCompactNumber(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return Number(value).toLocaleString(undefined, {
    notation: 'compact',
    maximumFractionDigits: 2,
  })
}

function formatWholeNumber(value) {
  if (value == null || !Number.isFinite(Number(value))) return 'n/a'
  return Number(value).toLocaleString()
}

function formatBeta(value) {
  if (value == null || !Number.isFinite(Number(value))) return 'â€”'
  return Number(value).toFixed(2)
}

function formatMarketDate(value) {
  if (!value) return 'â€”'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'â€”'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatFinancialValue(value, currency, kind = 'money') {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  if (kind === 'percent') return `${(Number(value) * 100).toFixed(1)}%`
  if (kind === 'eps') return Number(value).toFixed(2)
  return formatMoneyValue(value, currency, 1_000_000)
}

function formatMultiple(value) {
  if (value == null || !Number.isFinite(Number(value))) return 'n/a'
  return `${Number(value).toFixed(2)}x`
}

function isTradableCompany(company) {
  return company.type === 'Public' &&
    company.ticker &&
    company.ticker !== 'N/A' &&
    company.ticker !== 'Private'
}

function resampleSeries(points, sampleCount) {
  if (!points.length) return []
  if (points.length === 1 || sampleCount <= 1) return [{ ...points[0] }]

  return Array.from({ length: sampleCount }, (_, idx) => {
    const target = (idx / (sampleCount - 1)) * (points.length - 1)
    const leftIdx = Math.floor(target)
    const rightIdx = Math.min(points.length - 1, Math.ceil(target))
    const weight = target - leftIdx
    const left = points[leftIdx]
    const right = points[rightIdx]
    return {
      date: points[Math.round(target)]?.date ?? left.date,
      value: left.value + ((right.value - left.value) * weight),
    }
  })
}

const BASKET_TABLE_ANCHOR_KEYS = {
  '1d': 'd1',
  '1mo': 'm1',
  '6mo': 'm6',
  ytd: 'ytd',
  '1y': 'y1',
}

function normalizeBasketChart(chart, anchorPrice = null) {
  const points = chart?.points
    ?.map((point) => ({ ...point, close: Number(point.close) }))
    .filter((point) => Number.isFinite(point.close) && point.close > 0) ?? []
  const anchor = Number(anchorPrice) || Number(chart?.previousClose) || points[0]?.close
  if (!points.length || !Number.isFinite(anchor) || anchor <= 0) return null

  const normalizedPoints = points.map((point) => ({
    date: point.date,
    value: (point.close / anchor) * 100,
  }))
  const latest = normalizedPoints[normalizedPoints.length - 1]?.value

  return {
    ticker: chart.ticker,
    points: normalizedPoints,
    pct: Number.isFinite(latest) ? latest - 100 : null,
  }
}

function buildLayerBasketData(charts, companies, historyMap = {}, range = '') {
  const companyByTicker = new Map(companies.map((company) => [company.ticker, company]))
  const anchorKey = BASKET_TABLE_ANCHOR_KEYS[range]
  const series = charts
    .map((chart) => normalizeBasketChart(chart, anchorKey ? historyMap[chart?.ticker]?.[anchorKey]?.price : null))
    .filter(Boolean)
  if (!series.length) return null

  const sampleCount = Math.max(
    2,
    Math.min(160, Math.max(...series.map((item) => item.points.length))),
  )
  const sampled = series.map((item) => ({
    ...item,
    points: resampleSeries(item.points, sampleCount),
  }))
  const points = Array.from({ length: sampleCount }, (_, idx) => {
    const values = sampled
      .map((item) => item.points[idx]?.value)
      .filter((value) => Number.isFinite(value))
    return {
      date: sampled[0]?.points[idx]?.date,
      close: values.reduce((sum, value) => sum + value, 0) / values.length,
    }
  }).filter((point) => Number.isFinite(point.close))

  const endValues = series
    .map((item) => item.pct == null ? null : item.pct + 100)
    .filter((value) => Number.isFinite(value))
  const endIndex = endValues.reduce((sum, value) => sum + value, 0) / endValues.length
  const ranked = [...series]
    .filter((item) => Number.isFinite(item.pct))
    .sort((a, b) => b.pct - a.pct)
    .map((item) => ({
      ...item,
      name: companyByTicker.get(item.ticker)?.name ?? item.ticker,
    }))

  return {
    points,
    pct: endIndex - 100,
    validCount: series.length,
    best: ranked[0] ?? null,
    worst: ranked[ranked.length - 1] ?? null,
  }
}

function getMiniChartDomain(points) {
  if (!points?.length) return ''
  const values = points.map((point) => point.close)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const rawSpan = maxValue - minValue || 1
  return {
    min: minValue - rawSpan * 0.08,
    max: maxValue + rawSpan * 0.08,
    rawMin: minValue,
    rawMax: maxValue,
  }
}

function miniChartXForIndex(index, length) {
  if (length <= 1) return MINI_CHART_MARGIN.left
  return MINI_CHART_MARGIN.left +
    (index / (length - 1)) *
    (MINI_CHART_WIDTH - MINI_CHART_MARGIN.left - MINI_CHART_MARGIN.right)
}

function miniChartYForValue(value, domain) {
  const span = domain.max - domain.min || 1
  return MINI_CHART_HEIGHT - MINI_CHART_MARGIN.bottom -
    ((value - domain.min) / span) *
    (MINI_CHART_HEIGHT - MINI_CHART_MARGIN.top - MINI_CHART_MARGIN.bottom)
}

function buildMiniChartPath(points) {
  if (!points?.length) return ''
  const domain = getMiniChartDomain(points)

  return points.map((point, idx) => {
    const x = miniChartXForIndex(idx, points.length)
    const y = miniChartYForValue(point.close, domain)
    return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')
}

function buildMiniChartArea(path) {
  if (!path) return ''
  return `${path} L ${MINI_CHART_WIDTH - MINI_CHART_MARGIN.right} ${MINI_CHART_HEIGHT - MINI_CHART_MARGIN.bottom} L ${MINI_CHART_MARGIN.left} ${MINI_CHART_HEIGHT - MINI_CHART_MARGIN.bottom} Z`
}

function buildMiniYAxisTicks(points) {
  if (!points?.length) return []
  const domain = getMiniChartDomain(points)
  const span = domain.rawMax - domain.rawMin || 1
  return [
    domain.rawMax,
    domain.rawMax - span / 3,
    domain.rawMax - (span * 2) / 3,
    domain.rawMin,
  ]
}

function buildMiniXAxisTicks(points) {
  if (!points?.length) return []
  const indexes = [0, Math.floor((points.length - 1) / 3), Math.floor(((points.length - 1) * 2) / 3), points.length - 1]
  return [...new Set(indexes)].map((index) => ({ index, point: points[index] }))
}

function formatBasketIndex(value) {
  if (value == null || !Number.isFinite(Number(value))) return '--'
  return Number(value).toFixed(1)
}

function miniChartHoverPoint(points, clientX, rect) {
  if (!points?.length) return null
  const viewX = ((clientX - rect.left) / rect.width) * MINI_CHART_WIDTH
  const plotStart = MINI_CHART_MARGIN.left
  const plotEnd = MINI_CHART_WIDTH - MINI_CHART_MARGIN.right
  const ratio = Math.min(1, Math.max(0, (viewX - plotStart) / (plotEnd - plotStart)))
  const index = Math.round(ratio * (points.length - 1))
  const point = points[index]
  const domain = getMiniChartDomain(points)
  return {
    index,
    point,
    x: miniChartXForIndex(index, points.length),
    y: miniChartYForValue(point.close, domain),
  }
}

function buildChartPath(points) {
  if (!points?.length) return ''
  const values = points.map((p) => p.close)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return points.map((point, idx) => {
    const x = points.length === 1
      ? CHART_MARGIN.left
      : CHART_MARGIN.left + (idx / (points.length - 1)) * (CHART_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right)
    const y = CHART_HEIGHT - CHART_MARGIN.bottom -
      ((point.close - min) / span) * (CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom)
    return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')
}

function buildChartArea(path) {
  if (!path) return ''
  return `${path} L ${CHART_WIDTH - CHART_MARGIN.right} ${CHART_HEIGHT - CHART_MARGIN.bottom} L ${CHART_MARGIN.left} ${CHART_HEIGHT - CHART_MARGIN.bottom} Z`
}

function chartYForValue(value, values) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return CHART_HEIGHT - CHART_MARGIN.bottom -
    ((value - min) / span) * (CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom)
}

function chartXForIndex(index, length) {
  if (length <= 1) return CHART_MARGIN.left
  return CHART_MARGIN.left +
    (index / (length - 1)) * (CHART_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right)
}

function buildYAxisTicks(values) {
  if (!values.length) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return [max, max - span / 3, max - (span * 2) / 3, min]
}

function buildXAxisTicks(points) {
  if (!points.length) return []
  const indexes = [0, Math.floor((points.length - 1) / 3), Math.floor(((points.length - 1) * 2) / 3), points.length - 1]
  return [...new Set(indexes)].map((index) => ({ index, point: points[index] }))
}

function formatChartDate(value, range) {
  if (!value) return ''
  const date = new Date(value)
  if (range === '1d' || range === '5d') {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  if (range === '5y' || range === 'max') {
    return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatChartTooltipDate(value, range) {
  if (!value) return ''
  const date = new Date(value)
  if (range === '1d' || range === '5d') {
    return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── NAV BAR ──────────────────────────────────────────────────────────────────

function NavBar({ onNavigate }) {
  return (
    <nav className="nav-bar">
      <span className="nav-logo">Market Maps</span>
      <button type="button" className="nav-watchlist-btn" onClick={() => onNavigate('watchlist')}>Watchlist</button>
      <button type="button" className="nav-watchlist-btn" onClick={() => onNavigate('valuation')}>Valuation Analysis</button>
      <span className="nav-badge">Alpha Build · v0.1</span>
    </nav>
  )
}

// ─── COMING SOON MODAL ────────────────────────────────────────────────────────

function ComingSoonModal({ theme, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-symbol">{theme.symbol}</div>
        <div className="modal-title">{theme.name}</div>
        <div className="modal-desc">
          This market map is currently under construction.
          <br />
          <strong>{theme.companies} companies</strong> across{' '}
          <strong>{theme.layers} layers</strong> will be mapped here.
        </div>
        <button className="modal-close-btn" onClick={onClose}>
          Dismiss
        </button>
      </div>
    </div>
  )
}

// ─── HOME PAGE ────────────────────────────────────────────────────────────────

function HomePage({ onNavigate }) {
  const [comingSoon, setComingSoon] = useState(null)

  const handleCard = (theme) => {
    if (theme.available) {
      onNavigate('map', { themeId: theme.id })
    } else {
      setComingSoon(theme)
    }
  }

  return (
    <div className="homepage">
      <NavBar onNavigate={onNavigate} />

      <section className="hero">
        <div className="hero-grid-overlay" />
        <div className="hero-glow" />
        <p className="hero-eyebrow">Investment Intelligence Platform</p>
        <h1 className="hero-title">
          Interactive Investment
          <br />
          <span className="hero-title-gradient">Market Maps</span>
        </h1>
        <p className="hero-tagline">
          Navigate the deep structure of emerging technology sectors —
          layer by layer, company by company.
        </p>
      </section>

      <div className="section-header">
        <span className="section-label">Select a Theme</span>
        <button type="button" className="section-action-btn" onClick={() => onNavigate('watchlist')}>
          Open Watchlist
        </button>
        <button type="button" className="section-action-btn" onClick={() => onNavigate('valuation')}>
          Open Valuation Analysis
        </button>
      </div>

      <div className="cards-grid">
        {THEMES.map((theme) => (
          <div
            key={theme.id}
            className={`theme-card ${!theme.available ? 'theme-card--locked' : ''}`}
            onClick={() => handleCard(theme)}
          >
            {!theme.available && (
              <span className="card-coming-badge">Coming Soon</span>
            )}
            <div className="card-symbol">{theme.symbol}</div>
            <div className="card-name">{theme.name}</div>
            <div className="card-desc">{theme.description}</div>
            <div className="card-stats">
              <div className="stat">
                <span className="stat-value">{theme.companies}</span>
                <span className="stat-label">Companies</span>
              </div>
              <div className="stat">
                <span className="stat-value">{theme.marketCap}</span>
                <span className="stat-label">Mkt Cap</span>
              </div>
              <div className="stat">
                <span className="stat-value">{theme.layers}</span>
                <span className="stat-label">Layers</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {comingSoon && (
        <ComingSoonModal
          theme={comingSoon}
          onClose={() => setComingSoon(null)}
        />
      )}
    </div>
  )
}

// ─── OPTICS MAP PAGE ──────────────────────────────────────────────────────────
// Visual design unchanged — click now navigates to layer detail instead of
// toggling a highlight.

function MarketMapPage({ themeId, onNavigate }) {
  const marketMap = MARKET_MAPS[themeId]
  const layers = marketMap.layers
  const totalCompanies = layers.reduce((sum, layer) => sum + layer.companies.length, 0)
  const layerIcons = ['▣', '◒', '◇', '▦', '▱', '⬡', '✓', '↗']
  const visualLayers = layers
    .map((layer, idx) => ({ layer, idx }))
    .reverse()

  return (
    <div className="optics-page">
      <header className="page-header">
        <button className="back-btn" onClick={() => onNavigate('home')}>
          ← Back to Themes
        </button>
        <div className="page-header-center">
          <span className="page-title">{marketMap.mapTitle}</span>
          <span className="page-subtitle">
            {layers.length} {layers.length === 1 ? 'layer' : 'layers'} · {totalCompanies} {totalCompanies === 1 ? 'company' : 'companies'} · {marketMap.marketCap === 'Live'
              ? 'live market data'
              : `${marketMap.marketCap} total market cap`}
          </span>
        </div>
        <span className="page-badge">{marketMap.symbol} {marketMap.name}</span>
      </header>

      <main className="map-wrapper optics-investment-map">
        <section className={`optics-map-hero${layers.length <= 2 ? ' optics-map-hero--compact' : ''}`}>
          <div className="optics-map-bg" />
          <div className="optics-map-heading">
            <span className="map-section-label">{marketMap.stackLabel}</span>
            <h1>{marketMap.stackTitle}</h1>
            <p>{marketMap.stackDescription}</p>
          </div>

          <div
            className={`ecosystem-stack-visual${layers.length <= 2 ? ' ecosystem-stack-visual--compact' : ''}`}
            aria-label={`Clickable ${marketMap.name} ecosystem layers`}
          >
            {visualLayers.map(({ layer, idx }, visualIdx) => (
              <button
                key={idx}
                className="ecosystem-layer-deck"
                style={{
                  '--lc': layer.color,
                  '--lg': layer.glow,
                  '--ld': layer.dim,
                  '--i': visualIdx,
                }}
                onClick={() => onNavigate('layer', { themeId, layerIdx: idx })}
                type="button"
              >
                <span className="deck-edge" />
                <span className="deck-glow-line" />
                <span className="deck-node deck-node-left">{layerIcons[idx % layerIcons.length]}</span>
                <span className="deck-label">
                  <strong>{`Layer ${idx + 1}`}</strong>
                  <em>{layer.name}</em>
                </span>
                <span className="deck-metrics">
                  {layer.companies.length} companies
                  <b>Open ›</b>
                </span>
                <span className="deck-chip deck-chip-a" />
                <span className="deck-chip deck-chip-b" />
                <span className="deck-trace deck-trace-a" />
                <span className="deck-trace deck-trace-b" />
              </button>
            ))}
          </div>

          <div className="ecosystem-side-panel">
            <span>Layer Model</span>
            <strong>{layers.length} {layers.length === 1 ? 'deck' : 'decks'}</strong>
            <p>{totalCompanies} {marketMap.sideDescription}</p>
          </div>
        </section>

        <div className="legacy-layers-stack">
        <div className="map-section-label">
          Ecosystem Layers
          <span className="map-section-hint">Click any layer to explore</span>
        </div>

        <div className="layers-stack">
          {layers.map((layer, idx) => (
            <div
              key={idx}
              className="layer"
              style={{
                '--lc': layer.color,
                '--lg': layer.glow,
                '--ld': layer.dim,
              }}
              onClick={() => onNavigate('layer', { themeId, layerIdx: idx })}
            >
              <span className="layer-num">{layer.label ?? `L${idx + 1}`}</span>
              <span className="layer-name">{layer.name}</span>
              <div className="layer-right">
                <span className="layer-co-count">{layer.companies.length} cos</span>
                <span className="layer-chevron">›</span>
              </div>
            </div>
          ))}
        </div>
        </div>
      </main>

      <footer className="map-footer">
        <span>{marketMap.footer}</span>
        <span>Live market data · Research build</span>
      </footer>
    </div>
  )
}

// ─── LAYER DETAIL PAGE ────────────────────────────────────────────────────────

function LayerBasketPerformance({ layer, layerIdx, tickers }) {
  const [range, setRange] = useState('1d')
  const [basket, setBasket] = useState(null)
  const [basketCache, setBasketCache] = useState({})
  const [basketHistoryMap, setBasketHistoryMap] = useState({})
  const [basketHistoryLoaded, setBasketHistoryLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hoveredBasketPoint, setHoveredBasketPoint] = useState(null)
  const tickerKey = tickers.join(',')

  useEffect(() => {
    setBasketCache({})
    setBasket(null)
    setBasketHistoryMap({})
    setBasketHistoryLoaded(false)
    setHoveredBasketPoint(null)
  }, [layerIdx, tickerKey])

  useEffect(() => {
    let cancelled = false
    if (layerIdx !== 0 || !tickers.length) return () => { cancelled = true }

    fetchJson(`/api/history?tickers=${tickers.map(encodeURIComponent).join(',')}`)
      .then((data) => {
        if (cancelled) return
        const map = {}
        data.history?.forEach((item) => { map[item.ticker] = item })
        setBasketHistoryMap(map)
        setBasketHistoryLoaded(true)
        setBasketCache({})
      })
      .catch(() => {
        if (!cancelled) {
          setBasketHistoryMap({})
          setBasketHistoryLoaded(true)
        }
      })

    return () => { cancelled = true }
  }, [layerIdx, tickerKey])

  useEffect(() => {
    let cancelled = false

    if (layerIdx !== 0 || !tickers.length) {
      setBasket(null)
      setLoading(false)
      setError(null)
      return () => { cancelled = true }
    }

    const needsTableAnchor = Boolean(BASKET_TABLE_ANCHOR_KEYS[range])
    if (needsTableAnchor && !basketHistoryLoaded) {
      setLoading(true)
      setError(null)
      setBasket(null)
      setHoveredBasketPoint(null)
      return () => { cancelled = true }
    }

    if (basketCache[range]) {
      setBasket(basketCache[range])
      setLoading(false)
      setError(null)
      setHoveredBasketPoint(null)
      return () => { cancelled = true }
    }

    setLoading(true)
    setError(null)
    setBasket(null)
    setHoveredBasketPoint(null)

    fetchLayerBasketCharts(tickers, range)
      .then((charts) => {
        if (cancelled) return
        const nextBasket = buildLayerBasketData(charts, layer.companies, basketHistoryMap, range)
        setBasket(nextBasket)
        if (nextBasket) {
          setBasketCache((prev) => ({ ...prev, [range]: nextBasket }))
        }
        setLoading(false)
        if (!nextBasket) setError('No usable Yahoo chart data found for this layer.')
      })
      .catch((err) => {
        if (cancelled) return
        setBasket(null)
        setError(err.message)
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [layerIdx, tickerKey, range, layer.companies, basketCache, basketHistoryMap, basketHistoryLoaded])

  if (layerIdx !== 0) {
    return (
      <div className="chart-placeholder">
        <span className="chart-placeholder-label">
          Stock Performance â€” coming in next build
        </span>
      </div>
    )
  }

  const basketPoints = basket?.points ?? []
  const path = buildMiniChartPath(basketPoints)
  const area = buildMiniChartArea(path)
  const isPositive = (basket?.pct ?? 0) >= 0
  const selectedRange = CHART_RANGES.find((option) => option.id === range)?.label ?? range.toUpperCase()
  const yAxisTicks = buildMiniYAxisTicks(basketPoints)
  const xAxisTicks = buildMiniXAxisTicks(basketPoints)
  const handleBasketHover = (event) => {
    const point = miniChartHoverPoint(basketPoints, event.clientX, event.currentTarget.getBoundingClientRect())
    setHoveredBasketPoint(point)
  }

  return (
    <div className={`layer-basket-card${loading ? ' is-loading' : ''}`} style={{ '--layer-accent': layer.color }}>
      <div className="layer-basket-top">
        <div className="layer-basket-heading">
          <div className="layer-basket-code">
            {layer.label ?? `L${layerIdx + 1}`}
          </div>
          <h2>{layer.name}</h2>
          <p>{tickers.length} names · Equal-weight basket indexed to 100</p>
        </div>
        <div className="layer-basket-return-wrap">
          <span>{selectedRange} performance</span>
          <div className={`layer-basket-return ${isPositive ? 'is-positive' : 'is-negative'}`}>
            {loading && !basket ? 'Loading' : formatBasketPct(basket?.pct)}
          </div>
        </div>
      </div>

      <div className="layer-basket-tabs" aria-label="Layer basket range">
        {CHART_RANGES.map((option) => (
          <button
            key={option.id}
            type="button"
            className={range === option.id ? 'active' : ''}
            onClick={() => setRange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="layer-basket-chart">
        {path ? (
          <>
            <svg
              viewBox={`0 0 ${MINI_CHART_WIDTH} ${MINI_CHART_HEIGHT}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={`${layer.name} equal-weight stock performance`}
              onMouseMove={handleBasketHover}
              onMouseLeave={() => setHoveredBasketPoint(null)}
            >
              <defs>
                <linearGradient id={`basket-area-${layerIdx}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.42" />
                  <stop offset="100%" stopColor="#475569" stopOpacity="0.46" />
                </linearGradient>
              </defs>
              {yAxisTicks.map((tick) => {
                const y = miniChartYForValue(tick, getMiniChartDomain(basketPoints))
                return (
                  <g key={`basket-y-${tick}`}>
                    <line
                      className="layer-basket-grid"
                      x1={MINI_CHART_MARGIN.left}
                      x2={MINI_CHART_WIDTH - MINI_CHART_MARGIN.right}
                      y1={y}
                      y2={y}
                    />
                    <text className="layer-basket-axis-text" x={MINI_CHART_MARGIN.left - 12} y={y + 4} textAnchor="end">
                      {formatBasketIndex(tick)}
                    </text>
                  </g>
                )
              })}
              {xAxisTicks.map(({ index, point }) => {
                const x = miniChartXForIndex(index, basketPoints.length)
                return (
                  <g key={`basket-x-${index}`}>
                    <line
                      className="layer-basket-grid layer-basket-grid--vertical"
                      x1={x}
                      x2={x}
                      y1={MINI_CHART_MARGIN.top}
                      y2={MINI_CHART_HEIGHT - MINI_CHART_MARGIN.bottom}
                    />
                    <text className="layer-basket-axis-text" x={x} y={MINI_CHART_HEIGHT - 14} textAnchor="middle">
                      {formatChartDate(point.date, range)}
                    </text>
                  </g>
                )
              })}
              <line
                className="layer-basket-axis-line"
                x1={MINI_CHART_MARGIN.left}
                x2={MINI_CHART_WIDTH - MINI_CHART_MARGIN.right}
                y1={MINI_CHART_HEIGHT - MINI_CHART_MARGIN.bottom}
                y2={MINI_CHART_HEIGHT - MINI_CHART_MARGIN.bottom}
              />
              <line
                className="layer-basket-axis-line"
                x1={MINI_CHART_MARGIN.left}
                x2={MINI_CHART_MARGIN.left}
                y1={MINI_CHART_MARGIN.top}
                y2={MINI_CHART_HEIGHT - MINI_CHART_MARGIN.bottom}
              />
              <text className="layer-basket-axis-label" x={MINI_CHART_WIDTH / 2} y={MINI_CHART_HEIGHT - 2} textAnchor="middle">
                Date
              </text>
              <text
                className="layer-basket-axis-label"
                x={15}
                y={MINI_CHART_HEIGHT / 2}
                textAnchor="middle"
                transform={`rotate(-90 15 ${MINI_CHART_HEIGHT / 2})`}
              >
                Index
              </text>
              <path className="layer-basket-area" d={area} fill={`url(#basket-area-${layerIdx})`} />
              <path className="layer-basket-line" d={path} />
              {hoveredBasketPoint && (
                <g>
                  <line
                    className="layer-basket-hover-line"
                    x1={hoveredBasketPoint.x}
                    x2={hoveredBasketPoint.x}
                    y1={MINI_CHART_MARGIN.top}
                    y2={MINI_CHART_HEIGHT - MINI_CHART_MARGIN.bottom}
                  />
                  <circle className="layer-basket-hover-dot" cx={hoveredBasketPoint.x} cy={hoveredBasketPoint.y} r="5" />
                </g>
              )}
            </svg>
            {hoveredBasketPoint && (
              <div
                className="layer-basket-tooltip"
                style={{
                  left: `${(hoveredBasketPoint.x / MINI_CHART_WIDTH) * 100}%`,
                  top: `${(hoveredBasketPoint.y / MINI_CHART_HEIGHT) * 100}%`,
                }}
              >
                <span>{formatChartTooltipDate(hoveredBasketPoint.point.date, range)}</span>
                <strong>Index {formatBasketIndex(hoveredBasketPoint.point.close)}</strong>
              </div>
            )}
          </>
        ) : (
          <div className="layer-basket-empty">
            {error ?? 'Building equal-weight layer basket...'}
          </div>
        )}
      </div>

      <div className="layer-basket-footer">
        <span className={basket?.best?.pct >= 0 ? 'basket-good' : 'basket-bad'}>
          Best {basket?.best ? `${basket.best.ticker} ${formatBasketPct(basket.best.pct)}` : '--'}
        </span>
        <span>{basket?.validCount ?? 0}/{tickers.length} charts loaded</span>
        <span className={basket?.worst?.pct >= 0 ? 'basket-good' : 'basket-bad'}>
          Lag {basket?.worst ? `${basket.worst.ticker} ${formatBasketPct(basket.worst.pct)}` : '--'}
        </span>
      </div>
    </div>
  )
}

function LayerDetailPage({ themeId, layerIdx, onNavigate }) {
  const marketMap = MARKET_MAPS[themeId]
  const layer = marketMap.layers[layerIdx]
  const tickers = layer.companies
    .filter(isTradableCompany)
    .map((c) => c.ticker)
  const hasLivePrices = tickers.length > 0

  // Live prices and performance history are available across all public tickers.
  const [priceMap, setPriceMap] = useState({})   // { ticker: priceData }
  const [pricesLoading, setPricesLoading] = useState(false)
  const [historyMap, setHistoryMap] = useState({}) // { ticker: { price_1y_ago, date_used } }
  const [historiesLoading, setHistoriesLoading] = useState(false)

  useEffect(() => {
    setPriceMap({})
    setHistoryMap({})
    setPricesLoading(false)
    setHistoriesLoading(false)
    if (!tickers.length) return

    setPricesLoading(true)

    fetch(`/api/prices?tickers=${tickers.join(',')}`)
      .then((r) => r.json())
      .then((data) => {
        const map = {}
        data.prices?.forEach((p) => { map[p.ticker] = p })
        setPriceMap(map)
        setPricesLoading(false)
      })
      .catch(() => setPricesLoading(false))

    setHistoriesLoading(true)

    fetch(`/api/history?tickers=${tickers.join(',')}`)
      .then((r) => r.json())
      .then((data) => {
        const map = {}
        data.history?.forEach((h) => { map[h.ticker] = h })
        setHistoryMap(map)
        setHistoriesLoading(false)
      })
      .catch(() => setHistoriesLoading(false))
  }, [layerIdx])

  return (
    <div className="detail-page">
      {/* ── Sticky header ── */}
      <header className="page-header">
        <button className="back-btn" onClick={() => onNavigate('map', { themeId })}>
          ← Back to Map
        </button>
        <div className="page-header-center">
          <span className="page-title">{layer.name}</span>
          <span className="page-subtitle">
            {layer.label ?? `L${layerIdx + 1}`} · {marketMap.name} Ecosystem
          </span>
        </div>
        <span
          className="page-badge layer-badge"
          style={{ '--lc': layer.color, '--lg': layer.glow, '--ld': layer.dim }}
        >
          {layer.label ?? `L${layerIdx + 1}`}
        </span>
      </header>

      <div className={`detail-content${hasLivePrices ? ' detail-content--wide' : ''}`}>

        {/* ── SECTION A: Layer Overview ── */}
        <section className="detail-section">
          <div className="detail-section-label">A — Layer Overview</div>
          <h1 className="detail-title">{layer.name}</h1>
          <p className="overview-desc">{layer.overview.description}</p>

          <div className="overview-grid">
            <div className="overview-card">
              <div className="overview-card-label">Total Addressable Market</div>
              <div className="overview-card-value">{layer.overview.tam}</div>
            </div>
            <div className="overview-card">
              <div className="overview-card-label">Ecosystem Importance</div>
              <div className="overview-card-value">{layer.overview.importance}</div>
            </div>
            <div className="overview-card">
              <div className="overview-card-label">Growth Drivers</div>
              <ul className="overview-list">
                {layer.overview.growthDrivers.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
            <div className="overview-card">
              <div className="overview-card-label">Key Trends</div>
              <ul className="overview-list">
                {layer.overview.keyTrends.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── Chart placeholder ── */}
        <section className="detail-section">
          <LayerBasketPerformance layer={layer} layerIdx={layerIdx} tickers={tickers} />
        </section>

        {/* ── SECTION B: Company Table ── */}
        <section className="detail-section">
          <div className="detail-section-label">
            B — Company Table
            <span className="detail-section-count">{layer.companies.length} companies</span>
          </div>
          <div className="table-wrapper">
            <table className="co-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Ticker</th>
                  {hasLivePrices && <th>Price</th>}
                  {hasLivePrices && <th>1D</th>}
                  {hasLivePrices && <th>1M</th>}
                  {hasLivePrices && <th>3M</th>}
                  {hasLivePrices && <th>YTD</th>}
                  {hasLivePrices && <th>6M</th>}
                  {hasLivePrices && <th>1Y</th>}
                  {hasLivePrices && <th>18M</th>}
                  {hasLivePrices && <th>2Y</th>}
                  <th>Mkt Cap</th>
                  <th>Rev Growth</th>
                  <th>Gross Margin</th>
                  <th>Country</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {layer.companies.map((co, i) => {
                  const loading = pricesLoading || historiesLoading
                  const h = historyMap[co.ticker]
                  const today = h?.currentPrice ?? priceMap[co.ticker]?.price
                  const canShowPerformance = isTradableCompany(co)
                  const canOpenTickerPage = layerIdx === 0 && canShowPerformance
                  return (
                    <tr
                      key={i}
                      className={canOpenTickerPage ? 'co-row-clickable' : ''}
                      onClick={() => {
                        if (canOpenTickerPage) onNavigate('ticker', { themeId, ticker: co.ticker })
                      }}
                    >
                      <td className="co-name-cell">{co.name}</td>
                      <td>
                        {co.ticker && canOpenTickerPage
                          ? (
                            <button
                              className="ticker-badge ticker-badge-btn"
                              title={`Open ${co.ticker} detail page`}
                              onClick={(e) => {
                                e.stopPropagation()
                                onNavigate('ticker', { themeId, ticker: co.ticker })
                              }}
                              type="button"
                            >
                              {co.ticker}
                            </button>
                          )
                          : co.ticker
                          ? <span className="ticker-badge">{co.ticker}</span>
                          : <span className="ticker-none">—</span>}
                      </td>
                      {hasLivePrices && (
                        <td className="num-cell price-cell">
                          {!canShowPerformance
                            ? <span className="pct-na">—</span>
                            : pricesLoading
                            ? <span className="price-loading">…</span>
                            : <span className="price-live">{formatQuotePrice(
                                h?.currentPrice != null
                                  ? { price: h.currentPrice, currency: h.currency }
                                  : priceMap[co.ticker],
                              )}</span>}
                        </td>
                      )}
                      {hasLivePrices && <td className="num-cell">{!canShowPerformance ? <span className="pct-na">—</span> : loading ? <span className="pct-na">…</span> : renderPct(today, h?.d1?.price)}</td>}
                      {hasLivePrices && <td className="num-cell">{!canShowPerformance ? <span className="pct-na">—</span> : loading ? <span className="pct-na">…</span> : renderPct(today, h?.m1?.price)}</td>}
                      {hasLivePrices && <td className="num-cell">{!canShowPerformance ? <span className="pct-na">—</span> : loading ? <span className="pct-na">…</span> : renderPct(today, h?.m3?.price)}</td>}
                      {hasLivePrices && <td className="num-cell">{!canShowPerformance ? <span className="pct-na">—</span> : loading ? <span className="pct-na">…</span> : renderPct(today, h?.ytd?.price)}</td>}
                      {hasLivePrices && <td className="num-cell">{!canShowPerformance ? <span className="pct-na">—</span> : loading ? <span className="pct-na">…</span> : renderPct(today, h?.m6?.price)}</td>}
                      {hasLivePrices && <td className="num-cell">{!canShowPerformance ? <span className="pct-na">—</span> : loading ? <span className="pct-na">…</span> : renderPct(today, h?.y1?.price)}</td>}
                      {hasLivePrices && <td className="num-cell">{!canShowPerformance ? <span className="pct-na">—</span> : loading ? <span className="pct-na">…</span> : renderPct(today, h?.m18?.price)}</td>}
                      {hasLivePrices && <td className="num-cell">{!canShowPerformance ? <span className="pct-na">—</span> : loading ? <span className="pct-na">…</span> : renderPct(today, h?.y2?.price)}</td>}
                      <td className="num-cell">{co.marketCap}</td>
                      <td className="num-cell">{co.revenueGrowth}</td>
                      <td className="num-cell">{co.grossMargin}</td>
                      <td className="country-cell">{co.country}</td>
                      <td>
                        <span className={`type-badge type-badge--${co.type.toLowerCase()}`}>
                          {co.type}
                        </span>
                        {canOpenTickerPage && <span className="row-open-hint">Open</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── SECTION C: Company Cards ── */}
        <section className="detail-section">
          <div className="detail-section-label">C — Company Profiles</div>
          <div className="co-cards-grid">
            {layer.companies.map((co, i) => (
              <div key={i} className="co-card">
                <div className="co-card-top">
                  <div className="co-card-logo">
                    <span className="co-card-logo-text">{co.ticker ?? '—'}</span>
                  </div>
                  <span className={`type-badge type-badge--${co.type.toLowerCase()}`}>
                    {co.type}
                  </span>
                </div>
                <div className="co-card-name">{co.name}</div>
                <div className="co-card-desc">{co.description}</div>
                <div className="co-card-stats">
                  <div className="stat">
                    <span className="stat-value">{co.marketCap}</span>
                    <span className="stat-label">Mkt Cap</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">{co.revenueGrowth}</span>
                    <span className="stat-label">Rev Growth</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">{co.grossMargin}</span>
                    <span className="stat-label">Gross Margin</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  )
}

function buildUnavailableCommentary(ticker, reason = '') {
  return {
    ticker,
    available: false,
    periods: [],
    sources: {},
    sections: { takeaways: [], qna: [], guidance: [] },
    topics: [],
    sourceLimitations: reason || 'No latest-quarter earnings transcript was found for this ticker in the configured free sources.',
  }
}

function TickerDetailPage({ themeId, ticker, onNavigate }) {
  const match = findCompany(themeId, ticker)
  const [range, setRange] = useState('1y')
  const [priceData, setPriceData] = useState(null)
  const [chartData, setChartData] = useState(null)
  const [dailyChartData, setDailyChartData] = useState(null)
  const [marketChartData, setMarketChartData] = useState(null)
  const [fundamentals, setFundamentals] = useState(null)
  const [earningsCommentary, setEarningsCommentary] = useState(null)
  const [commentaryTab, setCommentaryTab] = useState('takeaways')
  const [activeTopicIndex, setActiveTopicIndex] = useState(null)
  const [earningsPeriod, setEarningsPeriod] = useState('')
  const [peerFundamentals, setPeerFundamentals] = useState([])
  const [hoveredChartPoint, setHoveredChartPoint] = useState(null)
  const [priceLoading, setPriceLoading] = useState(true)
  const [commentaryLoading, setCommentaryLoading] = useState(true)
  const [peersLoading, setPeersLoading] = useState(true)

  useEffect(() => {
    if (!match) return
    let cancelled = false
    setChartData(null)
    setHoveredChartPoint(null)

    Promise.allSettled([
      fetchJson(`/api/chart?ticker=${ticker}&range=${range}`, { ttlMs: CLIENT_CACHE_TTL_MS }),
      range === '1d'
        ? fetchJson(`/api/chart?ticker=${ticker}&range=1y`, { ttlMs: CLIENT_CACHE_TTL_MS })
        : fetchJson(`/api/chart?ticker=${ticker}&range=1d`, { ttlMs: CLIENT_CACHE_TTL_MS }),
    ])
      .then(([chartResult, comparisonResult]) => {
        if (cancelled) return
        const chart = chartResult.status === 'fulfilled' ? chartResult.value : null
        const comparisonChart = comparisonResult.status === 'fulfilled' ? comparisonResult.value : null
        setChartData(chart)
        if (range === '1d') {
          setDailyChartData(chart)
          setMarketChartData(comparisonChart)
        } else {
          setDailyChartData(comparisonChart)
          if (range === '1y') setMarketChartData(chart)
        }
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [ticker, range])

  useEffect(() => {
    if (!match) return
    let cancelled = false
    setPriceLoading(true)
    setPriceData(null)
    setFundamentals(null)

    fetchJson(`/api/prices?tickers=${ticker}`)
      .then((prices) => {
        if (!cancelled) setPriceData(prices?.prices?.[0] ?? null)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPriceLoading(false)
      })

    fetchJson(`/api/fundamentals?ticker=${ticker}`, { ttlMs: CLIENT_CACHE_TTL_MS })
      .then((fundamentalsData) => {
        if (!cancelled) setFundamentals(fundamentalsData)
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [ticker])

  useEffect(() => {
    if (!match) return
    let cancelled = false
    setCommentaryLoading(true)
    setEarningsCommentary(null)

    const commentaryUrl = `/api/earnings-commentary?ticker=${ticker}${earningsPeriod ? `&period=${encodeURIComponent(earningsPeriod)}` : ''}`
    fetchJson(commentaryUrl, { ttlMs: CLIENT_CACHE_TTL_MS })
      .then((commentaryData) => {
        if (!cancelled) setEarningsCommentary(commentaryData)
      })
      .catch((err) => {
        if (!cancelled) setEarningsCommentary(buildUnavailableCommentary(ticker, err.message))
      })
      .finally(() => {
        if (!cancelled) setCommentaryLoading(false)
      })

    return () => { cancelled = true }
  }, [ticker, earningsPeriod])

  useEffect(() => {
    if (!match) return
    let cancelled = false
    setPeersLoading(true)
    setPeerFundamentals([])

    const peerTickers = match.layer.companies
      .filter(isTradableCompany)
      .map((co) => co.ticker)
    const timer = window.setTimeout(() => {
      fetchPeerFundamentals(peerTickers)
        .then((peerFundamentalsData) => {
          if (!cancelled) setPeerFundamentals(peerFundamentalsData)
        })
        .finally(() => {
          if (!cancelled) setPeersLoading(false)
        })
    }, 1200)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [ticker])

  useEffect(() => {
    setCommentaryTab('takeaways')
    setActiveTopicIndex(null)
  }, [earningsCommentary?.selectedPeriodId])

  if (!match) {
    return (
      <div className="ticker-page">
        <button className="ticker-back-btn" onClick={() => onNavigate('layer', { themeId, layerIdx: 0 })}>
          Back to Layer 1
        </button>
        <div className="ticker-empty">Ticker not found in Layer 1.</div>
      </div>
    )
  }

  const { company, layer, layerIdx, marketMap } = match
  const companyChatConfig = getCompanyChatConfig(
    ticker,
    company.name,
    marketMap.contextTheme,
    layerIdx + 1,
  )
  const profile = fundamentals?.profile ?? {}
  const fallbackOverview = company.description && !company.description.toLowerCase().includes('placeholder')
    ? company.description
    : `${company.name} is mapped in the ${layer.name} layer of the ${marketMap.name} ecosystem.`
  const researchOverviewText = profile.summary ?? fallbackOverview
  const sectorIndustry = `${marketMap.name} / ${layer.name}`
  const todayPrice = priceData?.price
  const oneDayPct = calcPct(todayPrice, dailyChartData?.previousClose)
  const chartPoints = chartData?.points ?? []
  const chartPath = buildChartPath(chartPoints)
  const values = chartPoints.map((p) => p.close)
  const yAxisTicks = buildYAxisTicks(values)
  const xAxisTicks = buildXAxisTicks(chartPoints)
  const chartEndPrice = todayPrice ?? chartPoints[chartPoints.length - 1]?.close
  const chartStartPrice = chartData?.previousClose ?? chartPoints[0]?.close
  const handleChartHover = (event) => {
    if (!chartPoints.length) return
    const rect = event.currentTarget.getBoundingClientRect()
    const viewX = ((event.clientX - rect.left) / rect.width) * CHART_WIDTH
    const plotStart = CHART_MARGIN.left
    const plotEnd = CHART_WIDTH - CHART_MARGIN.right
    const ratio = Math.min(1, Math.max(0, (viewX - plotStart) / (plotEnd - plotStart)))
    const index = Math.round(ratio * (chartPoints.length - 1))
    const point = chartPoints[index]
    setHoveredChartPoint({
      index,
      point,
      x: chartXForIndex(index, chartPoints.length),
      y: chartYForValue(point.close, values),
    })
  }
  const selectedRangePct = calcPct(chartEndPrice, chartStartPrice)
  const pctClass = oneDayPct == null || oneDayPct >= 0 ? 'ticker-green' : 'ticker-red'
  const rangePctClass = selectedRangePct == null || selectedRangePct >= 0 ? 'ticker-green' : 'ticker-red'
  const layerLabel = getLayerLabel(layer, layerIdx)
  const selectedRange = CHART_RANGES.find((item) => item.id === range)?.label
  const marketPoints = marketChartData?.points ?? []
  const lastMarketPoint = marketPoints[marketPoints.length - 1]
  const volumePoints = marketPoints.filter((point) => point.volume != null)
  const recentVolumes = volumePoints.slice(-30).map((point) => point.volume)
  const avgVolume30d = recentVolumes.length
    ? recentVolumes.reduce((sum, volume) => sum + volume, 0) / recentVolumes.length
    : null
  const week52High = marketPoints.length ? Math.max(...marketPoints.map((point) => point.close)) : null
  const week52Low = marketPoints.length ? Math.min(...marketPoints.map((point) => point.close)) : null
  const financialCurrency = fundamentals?.currency ?? priceData?.currency ?? 'USD'
  const financialRows = fundamentals ? [
    { label: 'Revenue', values: fundamentals.financials.revenue, kind: 'money' },
    { label: 'Y/Y Growth, %', values: fundamentals.financials.revenueGrowth, kind: 'percent', muted: true },
    { label: 'Adj. EBIT', values: fundamentals.financials.ebit, kind: 'money' },
    { label: 'Y/Y Growth, %', values: fundamentals.financials.ebitGrowth, kind: 'percent', muted: true },
    { label: 'Adj. EBIT Margin, %', values: fundamentals.financials.ebitMargin, kind: 'percent', muted: true },
    { label: 'Adj. Earnings Per Share - WAD', values: fundamentals.financials.eps, kind: 'eps' },
    { label: 'Y/Y Growth, %', values: fundamentals.financials.epsGrowth, kind: 'percent', muted: true },
  ] : []
  const commentarySections = [
    { id: 'takeaways', label: 'Key Takeaways', items: earningsCommentary?.sections?.takeaways ?? [] },
    {
      id: 'qna',
      label: earningsCommentary?.qnaQuestionCount ? `Q&A (${earningsCommentary.qnaQuestionCount})` : 'Q&A',
      items: earningsCommentary?.sections?.qna ?? [],
    },
    { id: 'guidance', label: 'Guidance and Outlook', items: earningsCommentary?.sections?.guidance ?? [] },
  ]
  const commentaryTopics = earningsCommentary?.topics ?? []
  const activeTopic = activeTopicIndex == null ? null : commentaryTopics[activeTopicIndex]
  const activeCommentary = activeTopic
    ? {
        id: `topic-${activeTopicIndex}`,
        label: activeTopic.label,
        items: activeTopic.items ?? (activeTopic.support ? [activeTopic.support] : []),
      }
    : commentarySections.find((section) => section.id === commentaryTab) ?? commentarySections[0]
  const peerRows = match.layer.companies
    .filter(isTradableCompany)
    .map((peerCompany) => {
      const data = peerFundamentals.find((item) => item.ticker === peerCompany.ticker)
      return {
        company: peerCompany,
        data,
        currency: data?.currency ?? financialCurrency,
        marketCap: data?.capitalStructure?.marketCap,
        enterpriseValue: data?.capitalStructure?.enterpriseValue,
        evNtmRevenue: data?.ratios?.evNtmRevenue ?? null,
        evAdjEbitda: data?.ratios?.evAdjEbitda ?? null,
        peNtm: data?.ratios?.peNtm ?? null,
        revenueEstimate: data?.estimates?.revenue ?? null,
      }
    })

  return (
    <div className="ticker-page">
      <header className="ticker-hero">
        <div className="ticker-id">
          <button className="ticker-back-btn" onClick={() => onNavigate('layer', { themeId, layerIdx })}>
            Back to Layer 1
          </button>
          <div>
            <div className="ticker-title-row">
              <h1>{ticker}</h1>
              <span>{company.name}</span>
            </div>
            <div className="ticker-meta-row">
              <span className="ticker-pill">{company.marketCap ?? 'Mkt cap N/A'}</span>
              <span className="ticker-dot" />
              <span>{layerLabel} · {layer.name}</span>
            </div>
          </div>
        </div>
        <div className="ticker-price-block">
          <div className="ticker-price">{priceLoading ? '...' : formatQuotePrice(priceData)}</div>
          <div className={pctClass}>{formatPctText(oneDayPct)} today</div>
        </div>
      </header>

      <section className="research-overview">
        <h2>Research Overview</h2>
        <p>{researchOverviewText}</p>
        <div className="research-overview-grid">
          <div className="research-overview-item research-overview-item--wide">
            <span>Sector/Industry</span>
            <strong>{sectorIndustry}</strong>
          </div>
          <div className="research-overview-item">
            <span>Employees</span>
            <strong>{formatWholeNumber(profile.employees)}</strong>
          </div>
          <div className="research-overview-item">
            <span>Headquarters</span>
            <strong>{profile.headquarters ?? 'n/a'}</strong>
          </div>
          <div className="research-overview-item">
            <span>Website</span>
            {profile.website
              ? (
                <a href={profile.website} target="_blank" rel="noreferrer">
                  {profile.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </a>
              )
              : <strong>n/a</strong>}
          </div>
        </div>
      </section>

      <main className="ticker-layout">
        <section className="ticker-left">
          <div className="ticker-chart-card">
            <div className="ticker-chart-top">
              <div>
                <div className="ticker-chart-price">{priceLoading ? '...' : formatQuotePrice(priceData)}</div>
                <div className={rangePctClass}>
                  {formatPctText(selectedRangePct)} · {selectedRange}
                </div>
              </div>
              <div className="ticker-range-tabs">
                {CHART_RANGES.map((item) => (
                  <button
                    key={item.id}
                    className={range === item.id ? 'active' : ''}
                    onClick={() => setRange(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <svg
              className="ticker-chart"
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              onMouseMove={handleChartHover}
              onMouseLeave={() => setHoveredChartPoint(null)}
            >
              {values.length > 0 && (
                <>
                  {yAxisTicks.map((tick) => {
                    const y = chartYForValue(tick, values)
                    return (
                      <g key={`y-${tick}`}>
                        <line
                          className="ticker-chart-grid"
                          x1={CHART_MARGIN.left}
                          x2={CHART_WIDTH - CHART_MARGIN.right}
                          y1={y}
                          y2={y}
                        />
                        <text className="ticker-axis-text" x={CHART_MARGIN.left - 10} y={y + 4} textAnchor="end">
                          {formatQuotePrice({ price: tick, currency: priceData?.currency })}
                        </text>
                      </g>
                    )
                  })}
                  {xAxisTicks.map(({ index, point }) => {
                    const x = chartXForIndex(index, chartPoints.length)
                    return (
                      <g key={`x-${index}`}>
                        <line
                          className="ticker-chart-grid ticker-chart-grid-vertical"
                          x1={x}
                          x2={x}
                          y1={CHART_MARGIN.top}
                          y2={CHART_HEIGHT - CHART_MARGIN.bottom}
                        />
                        <text className="ticker-axis-text" x={x} y={CHART_HEIGHT - 18} textAnchor="middle">
                          {formatChartDate(point.date, range)}
                        </text>
                      </g>
                    )
                  })}
                  <line
                    className="ticker-axis-line"
                    x1={CHART_MARGIN.left}
                    x2={CHART_WIDTH - CHART_MARGIN.right}
                    y1={CHART_HEIGHT - CHART_MARGIN.bottom}
                    y2={CHART_HEIGHT - CHART_MARGIN.bottom}
                  />
                  <line
                    className="ticker-axis-line"
                    x1={CHART_MARGIN.left}
                    x2={CHART_MARGIN.left}
                    y1={CHART_MARGIN.top}
                    y2={CHART_HEIGHT - CHART_MARGIN.bottom}
                  />
                  <text className="ticker-axis-label" x={CHART_WIDTH / 2} y={CHART_HEIGHT - 4} textAnchor="middle">
                    Date
                  </text>
                  <text
                    className="ticker-axis-label"
                    transform={`translate(14 ${CHART_HEIGHT / 2}) rotate(-90)`}
                    textAnchor="middle"
                  >
                    Price
                  </text>
                </>
              )}
              {chartPath && (
                <>
                  <path className="ticker-chart-area" d={buildChartArea(chartPath)} />
                  <path className="ticker-chart-line" d={chartPath} />
                </>
              )}
              {hoveredChartPoint && (
                <g className="ticker-chart-hover">
                  <line
                    className="ticker-hover-line"
                    x1={hoveredChartPoint.x}
                    x2={hoveredChartPoint.x}
                    y1={CHART_MARGIN.top}
                    y2={CHART_HEIGHT - CHART_MARGIN.bottom}
                  />
                  <circle className="ticker-hover-dot" cx={hoveredChartPoint.x} cy={hoveredChartPoint.y} r="5" />
                  <g
                    className="ticker-hover-tooltip"
                    transform={`translate(${Math.min(CHART_WIDTH - 190, Math.max(CHART_MARGIN.left + 8, hoveredChartPoint.x + 12))} ${Math.max(CHART_MARGIN.top + 6, hoveredChartPoint.y - 50)})`}
                  >
                    <rect width="174" height="44" rx="7" />
                    <text x="10" y="17">{formatChartTooltipDate(hoveredChartPoint.point.date, range)}</text>
                    <text x="10" y="34">
                      Close {formatQuotePrice({ price: hoveredChartPoint.point.close, currency: priceData?.currency })}
                    </text>
                  </g>
                </g>
              )}
            </svg>
            <div className="ticker-market-data">
              <div className="ticker-market-heading">
                <h3>Market Data</h3>
                <span>{lastMarketPoint?.date ? `As of ${new Date(lastMarketPoint.date).toLocaleString()}` : 'Live from Yahoo'}</span>
              </div>
              <div className="ticker-market-grid">
                <div>
                  <span>Last Price</span>
                  <strong>{formatQuotePrice(priceData)}</strong>
                </div>
                <div>
                  <span>Daily Volume</span>
                  <strong>{formatCompactNumber(lastMarketPoint?.volume)}</strong>
                </div>
                <div>
                  <span>Daily Change %</span>
                  <strong className={pctClass}>{formatPctText(oneDayPct)}</strong>
                </div>
                <div>
                  <span>30D Avg Volume</span>
                  <strong>{formatCompactNumber(avgVolume30d)}</strong>
                </div>
                <div>
                  <span>52 Week Range</span>
                  <strong>
                    {week52Low == null || week52High == null
                      ? '—'
                      : `${formatQuotePrice({ price: week52Low, currency: priceData?.currency })} - ${formatQuotePrice({ price: week52High, currency: priceData?.currency })}`}
                  </strong>
                </div>
                <div>
                  <span>Beta (5Y Monthly)</span>
                  <strong>{formatBeta(fundamentals?.marketData?.beta5yMonthly)}</strong>
                </div>
                <div>
                  <span>Next Earnings Date</span>
                  <strong>{formatMarketDate(fundamentals?.marketData?.nextEarningsDate)}</strong>
                </div>
              </div>
            </div>
          </div>

          {companyChatConfig && <CompanyChatCard {...companyChatConfig} />}
        </section>

        <section className="ticker-right">
          <div className="financial-card">
            <div className="financial-card-header">
              <h2>Financial Performance</h2>
              <a href={`https://finance.yahoo.com/quote/${ticker}/financials`} target="_blank" rel="noreferrer">
                View All
              </a>
            </div>

            <div className="financial-section">
              <h3>Capital Structure</h3>
              <div className="financial-line">
                <span>Enterprise Value (mm)</span>
                <strong>{formatFinancialValue(fundamentals?.capitalStructure?.enterpriseValue, financialCurrency)}</strong>
              </div>
              <div className="financial-line">
                <span>Market Capitalization (mm)</span>
                <strong>{formatFinancialValue(fundamentals?.capitalStructure?.marketCap, financialCurrency)}</strong>
              </div>
            </div>

            <div className="financial-section">
              <div className="financial-table-title">
                <h3>Financials ({financialCurrency})</h3>
                <div className="financial-years">
                  {(fundamentals?.columns ?? ['FY2024', 'FY2025', 'FY2026E']).map((column) => (
                    <span key={column}>{column}</span>
                  ))}
                </div>
              </div>
              <table className="financial-table">
                <tbody>
                  {financialRows.map((row, rowIdx) => (
                    <tr key={`${row.label}-${rowIdx}`} className={row.muted ? 'financial-muted-row' : ''}>
                      <th>{row.label}</th>
                      {row.values.map((value, idx) => (
                        <td key={`${row.label}-${idx}`}>
                          {formatFinancialValue(value, financialCurrency, row.kind)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="financial-footnote">
              Historical values use Yahoo Finance fundamentals-timeseries. FY estimate sources are labeled by metric; EBIT/EBITDA stays n/a unless a free consensus source is found.
            </div>
          </div>

          <div className="earnings-commentary-card">
              <div className="earnings-commentary-top">
                <div className="earnings-title-row">
                  <h2>Earnings Commentary</h2>
                  <select
                    className="earnings-quarter-select"
                    value={earningsPeriod || earningsCommentary?.selectedPeriodId || ''}
                    onChange={(event) => {
                      setEarningsPeriod(event.target.value)
                      setCommentaryTab('takeaways')
                      setActiveTopicIndex(null)
                    }}
                  >
                    {(earningsCommentary?.periods?.length ? earningsCommentary.periods : [{ id: '', calendarLabel: earningsCommentary?.calendarQuarterDisplay ?? 'Latest earnings period' }]).map((period) => (
                      <option key={period.id || 'loading-period'} value={period.id}>
                        {period.calendarLabel ?? period.label}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="earnings-quarter-select">
                    {earningsCommentary?.calendarQuarterDisplay ?? earningsCommentary?.quarter ?? 'Latest earnings period'} <span>⌄</span>
                  </button>
                </div>
                <a
                  href={earningsCommentary?.docsUrl ?? `https://finance.yahoo.com/quote/${ticker}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View Company Docs
                </a>
              </div>

              <div className="earnings-commentary-shell">
                <div className="earnings-commentary-heading">
                  <div>
                    <strong>Transcript Summary</strong>
                    <span>{earningsCommentary?.calendarQuarter ? ` - ${earningsCommentary.calendarQuarter}` : ' - latest quarter'}</span>
                  </div>
                  {earningsCommentary?.fiscalQuarter && earningsCommentary?.calendarQuarter !== earningsCommentary.fiscalQuarter ? (
                    <em>Company reporting period: {earningsCommentary.fiscalQuarter} fiscal; selector uses calendar period.</em>
                  ) : null}
                </div>

                {commentaryLoading && !earningsCommentary ? (
                  <div className="earnings-empty-state">
                    Loading the selected quarter's transcript and filings...
                  </div>
                ) : earningsCommentary?.available ? (
                  <div className="earnings-commentary-body">
                    <aside className="earnings-commentary-nav">
                      <div className="earnings-nav-label">Summary</div>
                      {commentarySections.map((section, idx) => (
                        <button
                          key={section.id}
                          type="button"
                          className={!activeTopic && commentaryTab === section.id ? 'active' : ''}
                          onClick={() => {
                            setCommentaryTab(section.id)
                            setActiveTopicIndex(null)
                          }}
                        >
                          <span>{idx + 1}</span>
                          {section.label}
                        </button>
                      ))}

                      <div className="earnings-nav-label">Detected Topics</div>
                      {commentaryTopics.map((topic, idx) => (
                        <button
                          key={topic.label}
                          type="button"
                          className={`topic-row ${activeTopicIndex === idx ? 'active' : ''}`}
                          title={topic.support?.text ?? topic.items?.[0]?.text}
                          onClick={() => setActiveTopicIndex(idx)}
                        >
                          <span>{idx + 1}</span>
                          {topic.label}
                        </button>
                      ))}
                    </aside>

                    <section className="earnings-commentary-content">
                      <h3>{activeCommentary.label}</h3>
                      {activeCommentary.items.some((item) => item.group) ? (
                        <div className="earnings-guidance-groups">
                          {activeCommentary.items.map((group) => (
                            <div className="earnings-guidance-group" key={group.group}>
                              <h4>{group.group}</h4>
                              <p>{group.description}</p>
                              <ul>
                                {(group.items ?? []).map((item, idx) => (
                                  <li key={`${group.group}-${idx}`}>
                                    {item.label ? <strong className="earnings-guidance-metric">{item.label}</strong> : null}
                                    <span className={item.subject ? 'earnings-outlook-text' : 'earnings-question-text'}>
                                      {item.subject ? <strong>{item.subject}: </strong> : null}
                                      {item.text ?? item}
                                    </span>
                                    <a
                                      href={item.url ?? (item.source === 'Transcript' ? earningsCommentary.sources?.transcript : earningsCommentary.docsUrl)}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {item.source ?? 'Source'}
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <ul>
                          {activeCommentary.items.map((item, idx) => (
                            <li key={`${activeCommentary.id}-${idx}`}>
                              {item.speaker ? (
                                <em className="earnings-question-meta">
                                  Question {item.sequence ?? idx + 1} - {item.speaker}
                                  {item.firm ? ` - ${item.firm}` : ''}
                                </em>
                              ) : null}
                              <span className="earnings-question-text">{item.text ?? item}</span>
                              {item.answerSummary ? (
                                <div className="earnings-answer-summary">
                                  <strong>
                                    Answer summary
                                    {item.answerSpeakers?.length ? ` - ${item.answerSpeakers.join(', ')}` : ''}
                                  </strong>
                                  {item.answerSummary.includes('; ') ? (
                                    <ul className="earnings-answer-points">
                                      {item.answerSummary.split(/;\s+/).filter(Boolean).map((point, pointIdx) => (
                                        <li key={`${activeCommentary.id}-${idx}-answer-${pointIdx}`}>{point}</li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <span>{item.answerSummary}</span>
                                  )}
                                </div>
                              ) : null}
                              <a
                                href={item.url ?? (item.source === 'Transcript' ? earningsCommentary.sources?.transcript : earningsCommentary.docsUrl)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {item.source ?? 'Source'}
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="earnings-source-note">
                        {earningsCommentary.sourceLimitations}
                      </div>
                    </section>
                  </div>
                ) : (
                  <div className="earnings-empty-state">
                    No latest-quarter transcript was found for {ticker}. {earningsCommentary?.sourceLimitations}
                  </div>
                )}
              </div>
          </div>

          <div className="financial-card peer-performance-card">
            <div className="financial-card-header">
              <div>
                <h2>Performance vs. Peers</h2>
                <p>
                  {peersLoading
                    ? `Loading ${match.layer.companies.filter(isTradableCompany).length} companies in ${layer.name} comp group`
                    : `Showing ${peerRows.length}/${match.layer.companies.filter(isTradableCompany).length} in ${layer.name} comp group`}
                </p>
              </div>
              <a href={`https://finance.yahoo.com/quote/${ticker}/key-statistics`} target="_blank" rel="noreferrer">
                View All
              </a>
            </div>

            <div className="peer-table-wrap">
              <table className="peer-table">
                <thead>
                  <tr>
                    <th>Company Name</th>
                    <th>Market Cap</th>
                    <th>TEV</th>
                    <th>EV / NTM Revenue</th>
                    <th>EV / Adj. EBITDA</th>
                    <th>P/E NTM</th>
                  </tr>
                </thead>
                <tbody>
                  {peerRows.map((row) => (
                    <tr key={row.company.ticker} className={row.company.ticker === ticker ? 'selected-peer-row' : ''}>
                      <th>
                        <span>{row.company.name}</span>
                        <em>{row.company.ticker} · {row.company.country}</em>
                      </th>
                      <td>{formatFinancialValue(row.marketCap, row.currency)}</td>
                      <td>{formatFinancialValue(row.enterpriseValue, row.currency)}</td>
                      <td title={row.revenueEstimate?.source ? `${row.revenueEstimate.source}${row.revenueEstimate.endDate ? ` through ${row.revenueEstimate.endDate}` : ''}` : 'No usable consensus revenue estimate found'}>
                        {formatMultiple(row.evNtmRevenue)}
                      </td>
                      <td>{formatMultiple(row.evAdjEbitda)}</td>
                      <td>{formatMultiple(row.peNtm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="financial-footnote peer-note">
              EV / NTM Revenue blends Yahoo current-year and next-year consensus revenue by fiscal-year timing, with StockAnalysis as fallback for U.S. names. n/a means no usable consensus estimate was found.
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────

export default function App() {
  const [page, setPage] = useState(getStateFromURL)

  useEffect(() => {
    document.title = 'Market Maps'
  }, [])

  const navigate = useCallback((dest, payload = null) => {
    let url
    let state
    if (dest === 'home') {
      url = window.location.pathname
      state = { view: 'home' }
    } else if (dest === 'map') {
      url = `?theme=${encodeURIComponent(payload.themeId)}`
      state = { view: 'map', themeId: payload.themeId }
    } else if (dest === 'layer') {
      url = `?theme=${encodeURIComponent(payload.themeId)}&layer=${payload.layerIdx + 1}`
      state = { view: 'layer', themeId: payload.themeId, layerIdx: payload.layerIdx }
    } else if (dest === 'ticker') {
      const match = findCompany(payload.themeId, payload.ticker)
      const layerIdx = match?.layerIdx ?? 0
      url = `?theme=${encodeURIComponent(payload.themeId)}&layer=${layerIdx + 1}&ticker=${encodeURIComponent(payload.ticker)}`
      state = { view: 'ticker', themeId: payload.themeId, ticker: payload.ticker }
    } else if (dest === 'watchlist') {
      url = '?view=watchlist'
      state = { view: 'watchlist' }
    } else if (dest === 'valuation') {
      url = '?view=valuation'
      state = { view: 'valuation' }
    } else {
      url = `?theme=${dest}`
      state = { view: dest }
    }
    history.pushState({}, '', url)
    setPage(state)
  }, [])

  useEffect(() => {
    const onPop = () => setPage(getStateFromURL())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  if (page.view === 'ticker') {
    return (
      <TickerDetailPage
        key={`${page.themeId}:${page.ticker}`}
        themeId={page.themeId}
        ticker={page.ticker}
        onNavigate={navigate}
      />
    )
  }
  if (page.view === 'layer') {
    return <LayerDetailPage themeId={page.themeId} layerIdx={page.layerIdx} onNavigate={navigate} />
  }
  if (page.view === 'map') return <MarketMapPage themeId={page.themeId} onNavigate={navigate} />
  if (page.view === 'watchlist') return <WatchlistPage onBack={() => navigate('home')} />
  if (page.view === 'valuation') return <ValuationAnalysisPage onBack={() => navigate('home')} />
  return <HomePage onNavigate={navigate} />
}
