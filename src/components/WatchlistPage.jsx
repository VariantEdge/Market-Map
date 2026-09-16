import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AI_INFRASTRUCTURE_VERTICALS, MARKET_MAPS } from '../data.js'
import './WatchlistPage.css'

const STORAGE_KEY = 'market-maps:watchlists:v1'
const REFRESH_MS = 15 * 60 * 1000
const HISTORY_BATCH_SIZE = 6
const WATCHLIST_LAYOUT_VERSION = 5

const CURRENCY_SYMBOLS = {
  USD: '$', EUR: '€', CNY: '¥', JPY: '¥', GBP: '£',
  SEK: 'kr ', NOK: 'kr ', DKK: 'kr ', HKD: 'HK$', KRW: '₩',
}

const COLUMNS = [
  { id: 'company', label: 'Company', group: 'Identity', kind: 'text', width: 215, frozen: 'company' },
  { id: 'ticker', label: 'Ticker', group: 'Identity', kind: 'text', width: 88, frozen: 'ticker' },
  { id: 'category', label: 'Category', group: 'Identity', kind: 'text', width: 142, frozen: 'category' },
  { id: 'perf1d', label: '1D', group: 'Performance', kind: 'percent', width: 74, tooltip: 'Current price / prior market close - 1.' },
  { id: 'perf1w', label: '1W', group: 'Performance', kind: 'percent', width: 74, tooltip: 'Current price / adjusted close one week ago - 1.' },
  { id: 'perf1m', label: '1M', group: 'Performance', kind: 'percent', width: 74, tooltip: 'Current price / adjusted close one month ago - 1.' },
  { id: 'perf3m', label: '3M', group: 'Performance', kind: 'percent', width: 74, tooltip: 'Current price / adjusted close three months ago - 1.' },
  { id: 'perf6m', label: '6M', group: 'Performance', kind: 'percent', width: 74, tooltip: 'Current price / adjusted close six months ago - 1.' },
  { id: 'perfYtd', label: 'YTD', group: 'Performance', kind: 'percent', width: 74, tooltip: 'Current price / final valid close from the prior calendar year - 1.' },
  { id: 'perf1y', label: '1Y', group: 'Performance', kind: 'percent', width: 74, tooltip: 'Current price / adjusted close one year ago - 1.' },
  { id: 'perf18m', label: '18M', group: 'Performance', kind: 'percent', width: 78, tooltip: 'Current price / adjusted close eighteen months ago - 1.' },
  { id: 'perf2y', label: '2Y', group: 'Performance', kind: 'percent', width: 74, tooltip: 'Current price / adjusted close two years ago - 1.' },
  { id: 'perfCustom', label: 'Since Ref', group: 'Performance', kind: 'percent', width: 98, tooltip: 'Current price / adjusted close on your selected reference date - 1.' },
  { id: 'lastPrice', label: 'Last Price', group: 'Reference Prices', kind: 'price', width: 98, tooltip: 'Latest available market price used as the numerator for every performance calculation.' },
  { id: 'ref1d', label: 'Prior Close', group: 'Reference Prices', kind: 'reference', width: 96, tooltip: 'Prior market close used by 1D performance.' },
  { id: 'ref1w', label: '1W Ago', group: 'Reference Prices', kind: 'reference', width: 92, tooltip: 'Adjusted close on or before one calendar week ago, used by 1W performance.' },
  { id: 'ref1m', label: '1M Ago', group: 'Reference Prices', kind: 'reference', width: 92, tooltip: 'Adjusted close on or before one calendar month ago.' },
  { id: 'ref3m', label: '3M Ago', group: 'Reference Prices', kind: 'reference', width: 92, tooltip: 'Adjusted close on or before three calendar months ago.' },
  { id: 'ref6m', label: '6M Ago', group: 'Reference Prices', kind: 'reference', width: 92, tooltip: 'Adjusted close on or before six calendar months ago.' },
  { id: 'refYtd', label: 'Prior YE', group: 'Reference Prices', kind: 'reference', width: 92, tooltip: 'Final valid adjusted closing price from the prior calendar year, used by YTD performance.' },
  { id: 'ref1y', label: '1Y Ago', group: 'Reference Prices', kind: 'reference', width: 92, tooltip: 'Adjusted close on or before one calendar year ago.' },
  { id: 'ref18m', label: '18M Ago', group: 'Reference Prices', kind: 'reference', width: 94, tooltip: 'Adjusted close on or before eighteen calendar months ago.' },
  { id: 'ref2y', label: '2Y Ago', group: 'Reference Prices', kind: 'reference', width: 92, tooltip: 'Adjusted close on or before two calendar years ago.' },
  { id: 'refCustom', label: 'Ref Date', group: 'Reference Prices', kind: 'reference', width: 98, tooltip: 'Adjusted close on or before your selected reference date, used by Since Ref performance.' },
  { id: 'belowHigh52', label: 'vs 52W High', group: 'Range', kind: 'percent', width: 104, tooltip: 'Current price / 52-week high - 1.' },
  { id: 'aboveLow52', label: 'vs 52W Low', group: 'Range', kind: 'percent', width: 100, tooltip: 'Current price / 52-week low - 1.' },
  { id: 'belowAllTimeHigh', label: 'vs ATH', group: 'Range', kind: 'percent', width: 88, tooltip: 'Current price / all-time high - 1.' },
  { id: 'high52', label: '52W High', group: 'Range', kind: 'price', width: 96, tooltip: 'Highest adjusted closing price in the trailing 52 weeks.' },
  { id: 'low52', label: '52W Low', group: 'Range', kind: 'price', width: 92, tooltip: 'Lowest adjusted closing price in the trailing 52 weeks.' },
  { id: 'allTimeHigh', label: 'All-Time High', group: 'Range', kind: 'price', width: 108, tooltip: 'Highest adjusted closing price in the available Yahoo Finance history.' },
  { id: 'country', label: 'Geography', group: 'Profile', kind: 'text', width: 110 },
  { id: 'exchange', label: 'Exchange', group: 'Profile', kind: 'text', width: 104 },
]

const DEFAULT_COLUMNS = COLUMNS.map((column) => column.id)
const COLUMN_BY_ID = Object.fromEntries(COLUMNS.map((column) => [column.id, column]))
const DEFAULT_HIDDEN_COLUMNS = ['category']

function createId(prefix = 'watch') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function localDateInputValue(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function exchangeForTicker(ticker = '') {
  const suffix = ticker.split('.').at(-1)
  const exchanges = {
    PA: 'Euronext Paris', L: 'London', T: 'Tokyo', DE: 'Xetra',
    ST: 'Stockholm', SZ: 'Shenzhen', SS: 'Shanghai', HK: 'Hong Kong',
  }
  if (ticker.includes('.') && exchanges[suffix]) return exchanges[suffix]
  return 'US listed'
}

function buildUniverse() {
  const seen = new Set()
  return Object.values(MARKET_MAPS).flatMap((marketMap) =>
    marketMap.layers.flatMap((layer) => layer.companies.map((company) => ({
      ...company,
      mapId: marketMap.id,
      defaultCategory: layer.name,
    }))),
  ).filter((company) => {
    if (company.type !== 'Public' || !company.ticker || seen.has(company.ticker)) return false
    seen.add(company.ticker)
    return true
  })
}

const COMPANY_UNIVERSE = buildUniverse()
const AI_INFRASTRUCTURE_MAP_IDS = new Set(AI_INFRASTRUCTURE_VERTICALS.map((vertical) => vertical.id))

function itemFromCompany(company, category = company.defaultCategory ?? 'Unassigned') {
  return {
    id: createId('item'),
    ticker: company.ticker.toUpperCase(),
    name: company.name,
    category,
    country: company.country ?? 'Unknown',
    exchange: exchangeForTicker(company.ticker),
  }
}

const ETF_ITEMS = MARKET_MAPS.etfs.layers.flatMap((layer) => layer.companies.map((company) => ({
  ...itemFromCompany(company, 'ETFs'),
  id: `etf-${company.ticker}`,
})))

function defaultWorkspace() {
  const optics = COMPANY_UNIVERSE.filter((company) => company.mapId === 'optics')
  const neoclouds = COMPANY_UNIVERSE.filter((company) => company.mapId === 'neoclouds')
  const etfs = COMPANY_UNIVERSE.filter((company) => company.mapId === 'etfs')
  const aiInfrastructure = COMPANY_UNIVERSE.filter((company) => AI_INFRASTRUCTURE_MAP_IDS.has(company.mapId))
  const makeWatchlist = (name, companies) => ({
    id: createId('list'),
    name,
    items: companies.map((company) => itemFromCompany(company)),
    categories: [...new Set(companies.map((company) => company.defaultCategory))],
    columnOrder: DEFAULT_COLUMNS,
    hiddenColumns: DEFAULT_HIDDEN_COLUMNS,
    columnWidths: {},
    referenceDate: localDateInputValue(),
    referenceDateIsDefault: true,
    layoutVersion: WATCHLIST_LAYOUT_VERSION,
  })
  const opticsList = makeWatchlist('Optics', optics)
  const neocloudsList = makeWatchlist('Neoclouds', neoclouds)
  const etfsList = makeWatchlist('ETFs', etfs)
  const aiInfrastructureList = makeWatchlist('AI Infrastructure', aiInfrastructure)
  return { activeId: opticsList.id, watchlists: [opticsList, neocloudsList, etfsList, aiInfrastructureList] }
}

function normalizeWatchlistLayout(watchlist) {
  if (watchlist.layoutVersion === WATCHLIST_LAYOUT_VERSION && watchlist.referenceDateIsDefault === false) return watchlist
  const needsColumnSchemaMigration = (watchlist.layoutVersion ?? 1) < WATCHLIST_LAYOUT_VERSION
  return {
    ...watchlist,
    columnOrder: needsColumnSchemaMigration ? DEFAULT_COLUMNS : watchlist.columnOrder,
    hiddenColumns: needsColumnSchemaMigration
      ? [...new Set([...(watchlist.hiddenColumns ?? []).filter((id) => DEFAULT_COLUMNS.includes(id)), ...DEFAULT_HIDDEN_COLUMNS])]
      : watchlist.hiddenColumns,
    referenceDate: watchlist.referenceDateIsDefault === false ? watchlist.referenceDate : localDateInputValue(),
    referenceDateIsDefault: watchlist.referenceDateIsDefault === false ? false : true,
    layoutVersion: WATCHLIST_LAYOUT_VERSION,
  }
}

function loadWorkspace() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (saved?.activeId && Array.isArray(saved.watchlists) && saved.watchlists.length) {
      const defaultLists = defaultWorkspace().watchlists
      const watchlists = ['AI Infrastructure', 'ETFs'].reduce((lists, name) => {
        if (lists.some((watchlist) => watchlist.name === name)) return lists
        const defaultList = defaultLists.find((watchlist) => watchlist.name === name)
        return defaultList ? [...lists, defaultList] : lists
      }, saved.watchlists)
      return { ...saved, watchlists: watchlists.map(normalizeWatchlistLayout) }
    }
  } catch {
    // Ignore malformed browser storage and start with the supplied market-map universe.
  }
  return defaultWorkspace()
}

function formatPrice(value, currency) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  if (currency === 'GBp') return `${Number(value).toFixed(1)}p`
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency ?? ''} `
  const digits = currency === 'JPY' || currency === 'KRW' ? 0 : 2
  return `${symbol}${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}

function formatChange(value, currency) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  const sign = Number(value) > 0 ? '+' : ''
  return `${sign}${formatPrice(value, currency)}`
}

function formatPercent(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(1)}%`
}

function numericCellClass(value) {
  if (value == null || !Number.isFinite(Number(value))) return 'watchlist-value--na'
  if (value > 0) return 'watchlist-value--positive'
  if (value < 0) return 'watchlist-value--negative'
  return 'watchlist-value--neutral'
}

function referenceForColumn(row, columnId) {
  const key = {
    ref1d: 'day', ref1w: 'week', refCustom: 'custom', refYtd: 'ytd', ref1m: 'month', ref3m: 'month3',
    ref6m: 'month6', ref1y: 'year', ref18m: 'month18', ref2y: 'year2',
  }[columnId]
  return key ? row?.references?.[key]?.price ?? null : null
}

function valueForColumn(item, market, id) {
  const price = market?.price ?? null
  const values = {
    company: item.name,
    ticker: item.ticker,
    category: item.category,
    lastPrice: price,
    high52: market?.ranges?.high52 ?? null,
    low52: market?.ranges?.low52 ?? null,
    allTimeHigh: market?.ranges?.allTimeHigh ?? null,
    belowHigh52: market?.ranges?.belowHigh52 ?? null,
    aboveLow52: market?.ranges?.aboveLow52 ?? null,
    belowAllTimeHigh: market?.ranges?.belowAllTimeHigh ?? null,
    perf1d: market?.performance?.day ?? null,
    perf1w: market?.performance?.week ?? null,
    perf1m: market?.performance?.month ?? null,
    perf3m: market?.performance?.month3 ?? null,
    perf6m: market?.performance?.month6 ?? null,
    perfYtd: market?.performance?.ytd ?? null,
    perf1y: market?.performance?.year ?? null,
    perf18m: market?.performance?.month18 ?? null,
    perf2y: market?.performance?.year2 ?? null,
    perfCustom: market?.performance?.custom ?? null,
    country: item.country,
    exchange: item.exchange,
  }
  return id.startsWith('ref') ? referenceForColumn(market, id) : values[id]
}

function groupedColumns(columns) {
  return columns.reduce((groups, column) => {
    const previous = groups.at(-1)
    if (previous?.group === column.group) previous.columns.push(column)
    else groups.push({ group: column.group, columns: [column] })
    return groups
  }, [])
}

function downloadCsv(filename, rows) {
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const data = rows.map((row) => row.map(escape).join(',')).join('\n')
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([data], { type: 'text/csv;charset=utf-8' }))
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

function NameDialog({ mode, value, onCancel, onSave }) {
  const [name, setName] = useState(value ?? '')
  return (
    <div className="watchlist-dialog-backdrop" role="presentation">
      <form className="watchlist-dialog" onSubmit={(event) => { event.preventDefault(); onSave(name.trim()) }}>
        <h2>{mode === 'rename' ? 'Rename watchlist' : 'Create watchlist'}</h2>
        <label>
          Watchlist name
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Networking" />
        </label>
        <div className="watchlist-dialog-actions">
          <button type="button" className="watchlist-btn watchlist-btn--quiet" onClick={onCancel}>Cancel</button>
          <button type="submit" className="watchlist-btn watchlist-btn--primary" disabled={!name.trim()}>
            {mode === 'rename' ? 'Save name' : 'Create watchlist'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default function WatchlistPage({ onBack }) {
  const [workspace, setWorkspace] = useState(loadWorkspace)
  const [query, setQuery] = useState('')
  const [addQuery, setAddQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [countryFilter, setCountryFilter] = useState('all')
  const [exchangeFilter, setExchangeFilter] = useState('all')
  const [showColumns, setShowColumns] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [dialog, setDialog] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [sort, setSort] = useState({ id: 'company', direction: 'asc' })
  const [quotes, setQuotes] = useState({})
  const [marketRows, setMarketRows] = useState({})
  const [quotesLoading, setQuotesLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [error, setError] = useState('')
  const dragItemId = useRef(null)
  const dragColumnId = useRef(null)

  const active = workspace.watchlists.find((watchlist) => watchlist.id === workspace.activeId) ?? workspace.watchlists[0]
  const tickers = [...new Set([...(active?.items.map((item) => item.ticker).filter(Boolean) ?? []), ...ETF_ITEMS.map((item) => item.ticker)])]
  const tickersKey = tickers.join(',')

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace))
  }, [workspace])

  const updateActive = useCallback((update) => {
    setWorkspace((current) => ({
      ...current,
      watchlists: current.watchlists.map((watchlist) =>
        watchlist.id === current.activeId ? update(watchlist) : watchlist,
      ),
    }))
  }, [])

  const refreshMarketData = useCallback(async () => {
    if (!tickers.length) {
      setQuotes({})
      setMarketRows({})
      return
    }
    setError('')
    setQuotesLoading(true)
    setHistoryLoading(true)
    const encodedTickers = encodeURIComponent(tickersKey)
    const referenceDate = encodeURIComponent(active.referenceDate)

    fetch(`/api/prices?tickers=${encodedTickers}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`Price request failed (${response.status})`)))
      .then((payload) => setQuotes(Object.fromEntries((payload.prices ?? []).map((row) => [row.ticker, row]))))
      .catch((requestError) => setError(requestError.message))
      .finally(() => setQuotesLoading(false))

    setMarketRows({})
    ;(async () => {
      try {
        for (let start = 0; start < tickers.length; start += HISTORY_BATCH_SIZE) {
          const batch = tickers.slice(start, start + HISTORY_BATCH_SIZE)
          const response = await fetch(
            `/api/watchlist?tickers=${encodeURIComponent(batch.join(','))}&referenceDate=${referenceDate}&fullHistory=1`,
          )
          if (!response.ok) throw new Error(`History request failed (${response.status})`)
          const payload = await response.json()
          setMarketRows((current) => ({
            ...current,
            ...Object.fromEntries((payload.rows ?? []).map((row) => [row.ticker, row])),
          }))
        }
      } catch (requestError) {
        setError(requestError.message)
      } finally {
        setHistoryLoading(false)
      }
    })()
  }, [active?.referenceDate, tickers.length, tickersKey])

  useEffect(() => {
    refreshMarketData()
    const interval = window.setInterval(refreshMarketData, REFRESH_MS)
    return () => window.clearInterval(interval)
  }, [refreshMarketData])

  const visibleColumns = useMemo(() => {
    const order = active?.columnOrder?.length ? active.columnOrder : DEFAULT_COLUMNS
    return order
      .filter((id) => !active.hiddenColumns?.includes(id))
      .map((id) => COLUMN_BY_ID[id])
      .filter(Boolean)
  }, [active])
  const columnGroups = useMemo(() => groupedColumns(visibleColumns), [visibleColumns])
  const groupStartIds = useMemo(() => new Set(columnGroups.map(({ columns }) => columns[0].id)), [columnGroups])
  const lastFrozenColumnId = useMemo(
    () => visibleColumns.filter((column) => column.frozen).at(-1)?.id,
    [visibleColumns],
  )
  const categories = useMemo(() => [...new Set([...(active?.categories ?? []), ...(active?.items.map((item) => item.category) ?? [])])].filter(Boolean).sort(), [active])
  const countries = useMemo(() => [...new Set(active?.items.map((item) => item.country).filter(Boolean) ?? [])].sort(), [active])
  const exchanges = useMemo(() => [...new Set(active?.items.map((item) => item.exchange).filter(Boolean) ?? [])].sort(), [active])

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const filtered = (active?.items ?? []).filter((item) =>
      (!normalizedQuery || item.name.toLowerCase().includes(normalizedQuery) || item.ticker.toLowerCase().includes(normalizedQuery)) &&
      (categoryFilter === 'all' || item.category === categoryFilter) &&
      (countryFilter === 'all' || item.country === countryFilter) &&
      (exchangeFilter === 'all' || item.exchange === exchangeFilter),
    )
    return [...filtered].sort((left, right) => {
      const a = valueForColumn(left, marketRows[left.ticker] ?? quotes[left.ticker], sort.id)
      const b = valueForColumn(right, marketRows[right.ticker] ?? quotes[right.ticker], sort.id)
      const multiplier = sort.direction === 'asc' ? 1 : -1
      if (a == null) return 1
      if (b == null) return -1
      if (typeof a === 'string' || typeof b === 'string') return String(a).localeCompare(String(b)) * multiplier
      return (Number(a) - Number(b)) * multiplier
    })
  }, [active, categoryFilter, countryFilter, exchangeFilter, marketRows, query, quotes, sort])

  const etfRows = useMemo(() => [...ETF_ITEMS].sort((left, right) => {
    const a = valueForColumn(left, marketRows[left.ticker] ?? quotes[left.ticker], sort.id)
    const b = valueForColumn(right, marketRows[right.ticker] ?? quotes[right.ticker], sort.id)
    const multiplier = sort.direction === 'asc' ? 1 : -1
    if (a == null) return 1
    if (b == null) return -1
    if (typeof a === 'string' || typeof b === 'string') return String(a).localeCompare(String(b)) * multiplier
    return (Number(a) - Number(b)) * multiplier
  }), [marketRows, quotes, sort])

  const addTicker = (candidate) => {
    const ticker = candidate.ticker.trim().toUpperCase()
    if (!ticker || active.items.some((item) => item.ticker === ticker)) return
    const source = COMPANY_UNIVERSE.find((company) => company.ticker === ticker)
    const item = source
      ? itemFromCompany(source)
      : { id: createId('item'), ticker, name: candidate.name ?? ticker, category: categories[0] ?? 'Unassigned', country: 'Unknown', exchange: exchangeForTicker(ticker) }
    updateActive((watchlist) => ({ ...watchlist, items: [...watchlist.items, item] }))
    setAddQuery('')
  }

  const removeTicker = (id) => updateActive((watchlist) => ({ ...watchlist, items: watchlist.items.filter((item) => item.id !== id) }))
  const updateItem = (id, patch) => updateActive((watchlist) => ({
    ...watchlist,
    items: watchlist.items.map((item) => item.id === id ? { ...item, ...patch } : item),
  }))

  const moveItem = (fromId, toId) => {
    if (!fromId || fromId === toId) return
    updateActive((watchlist) => {
      const items = [...watchlist.items]
      const fromIndex = items.findIndex((item) => item.id === fromId)
      const toIndex = items.findIndex((item) => item.id === toId)
      if (fromIndex < 0 || toIndex < 0) return watchlist
      const [moved] = items.splice(fromIndex, 1)
      items.splice(toIndex, 0, moved)
      return { ...watchlist, items }
    })
  }

  const updateColumnOrder = (fromId, toId) => {
    if (!fromId || fromId === toId) return
    updateActive((watchlist) => {
      const order = [...(watchlist.columnOrder ?? DEFAULT_COLUMNS)]
      const fromIndex = order.indexOf(fromId)
      const toIndex = order.indexOf(toId)
      if (fromIndex < 0 || toIndex < 0) return watchlist
      const [moved] = order.splice(fromIndex, 1)
      order.splice(toIndex, 0, moved)
      return { ...watchlist, columnOrder: order }
    })
  }

  const toggleColumn = (id) => updateActive((watchlist) => ({
    ...watchlist,
    hiddenColumns: watchlist.hiddenColumns?.includes(id)
      ? watchlist.hiddenColumns.filter((columnId) => columnId !== id)
      : [...(watchlist.hiddenColumns ?? []), id],
  }))

  const resizeColumn = (event, column) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = active.columnWidths?.[column.id] ?? column.width
    const onMove = (moveEvent) => updateActive((watchlist) => ({
      ...watchlist,
      columnWidths: { ...watchlist.columnWidths, [column.id]: Math.max(68, startWidth + moveEvent.clientX - startX) },
    }))
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const applyImport = () => {
    const imported = [...new Set(importText.split(/[\s,;]+/).map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))]
    imported.forEach((ticker) => addTicker({ ticker }))
    setImportText('')
    setShowImport(false)
  }

  const suggestedCompanies = addQuery.trim()
    ? COMPANY_UNIVERSE.filter((company) => `${company.name} ${company.ticker}`.toLowerCase().includes(addQuery.trim().toLowerCase())).slice(0, 6)
    : []

  const renderCell = (item, column, readOnly = false) => {
    const market = marketRows[item.ticker] ?? quotes[item.ticker]
    const value = valueForColumn(item, market, column.id)
    const isMarketCell = !['company', 'ticker', 'category', 'country', 'exchange'].includes(column.id)
    if (isMarketCell && historyLoading && !marketRows[item.ticker] && column.id !== 'lastPrice') {
      return <span className="watchlist-skeleton" aria-label="Loading market history" />
    }
    if (column.id === 'company') return (
      <div className={`watchlist-company-cell${readOnly ? ' watchlist-company-cell--readonly' : ''}`}>
        <span className="watchlist-drag" title="Drag to reorder" aria-hidden="true">⠿</span>
        <span>{item.name}</span>
        <button type="button" className="watchlist-row-remove" title={`Remove ${item.ticker}`} onClick={() => removeTicker(item.id)}>×</button>
      </div>
    )
    if (column.id === 'ticker') return <span className="watchlist-ticker">{item.ticker}</span>
    if (column.id === 'category') return (
      <select className="watchlist-category-select" aria-label={`Category for ${item.ticker}`} value={item.category} onChange={(event) => updateItem(item.id, { category: event.target.value })}>
        {categories.map((category) => <option key={category} value={category}>{category}</option>)}
      </select>
    )
    if (column.kind === 'price' || column.kind === 'reference') return <span className="watchlist-number">{formatPrice(value, market?.currency)}</span>
    if (column.kind === 'change') return <span className={`watchlist-number ${numericCellClass(value)}`}>{formatChange(value, market?.currency)}</span>
    if (column.kind === 'percent') return <span className={`watchlist-number ${numericCellClass(value)}`}>{formatPercent(value)}</span>
    return <span>{value ?? '—'}</span>
  }

  const handleSort = (id) => setSort((current) => current.id === id ? { id, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { id, direction: 'asc' })
  const marketTimestamp = Object.values(quotes).find((quote) => quote?.fetchedAt)?.fetchedAt

  return (
    <main className="watchlist-page">
      <header className="watchlist-topbar">
        <button type="button" className="watchlist-brand" onClick={onBack}>Market Maps</button>
        <div className="watchlist-title-block">
          <span className="watchlist-kicker">Market monitor</span>
          <h1>Stock Watchlist</h1>
        </div>
        <div className="watchlist-topbar-actions">
          <span className="watchlist-asof">{marketTimestamp ? `Quotes cached ${new Date(marketTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Waiting for quotes'}</span>
          <button type="button" className="watchlist-btn watchlist-btn--quiet" onClick={refreshMarketData} disabled={quotesLoading || historyLoading}>
            {quotesLoading || historyLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      <section className="watchlist-workspace">
        <div className="watchlist-toolbar">
          <div className="watchlist-selector">
            <label htmlFor="watchlist-select">Watchlist</label>
            <select id="watchlist-select" value={active.id} onChange={(event) => setWorkspace((current) => ({ ...current, activeId: event.target.value }))}>
              {workspace.watchlists.map((watchlist) => <option key={watchlist.id} value={watchlist.id}>{watchlist.name}</option>)}
            </select>
            <button type="button" className="watchlist-icon-btn" title="Create watchlist" onClick={() => setDialog({ mode: 'create' })}>＋</button>
            <button type="button" className="watchlist-icon-btn" title="Rename watchlist" onClick={() => setDialog({ mode: 'rename', value: active.name })}>✎</button>
            <button type="button" className="watchlist-icon-btn" title="Duplicate watchlist" onClick={() => {
              const copy = { ...active, id: createId('list'), name: `${active.name} copy`, items: active.items.map((item) => ({ ...item, id: createId('item') })) }
              setWorkspace((current) => ({ activeId: copy.id, watchlists: [...current.watchlists, copy] }))
            }}>⧉</button>
            <button type="button" className="watchlist-icon-btn watchlist-icon-btn--danger" title="Delete watchlist" disabled={workspace.watchlists.length === 1} onClick={() => setConfirmDelete(true)}>×</button>
          </div>

          <div className="watchlist-add">
            <input value={addQuery} onChange={(event) => setAddQuery(event.target.value)} placeholder="Add ticker or company" aria-label="Add ticker or company" onKeyDown={(event) => { if (event.key === 'Enter') addTicker({ ticker: addQuery }) }} />
            <button type="button" className="watchlist-btn watchlist-btn--primary" onClick={() => addTicker({ ticker: addQuery })}>Add</button>
            {suggestedCompanies.length > 0 && (
              <div className="watchlist-suggestions">
                {suggestedCompanies.map((company) => (
                  <button type="button" key={company.ticker} onClick={() => addTicker(company)}>
                    <strong>{company.ticker}</strong><span>{company.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="watchlist-toolbar-tools">
            <button type="button" className="watchlist-btn watchlist-btn--quiet" onClick={() => setShowImport((open) => !open)}>Import</button>
            <button type="button" className="watchlist-btn watchlist-btn--quiet" onClick={() => {
              const header = visibleColumns.map((column) => column.label)
              const data = rows.map((item) => visibleColumns.map((column) => {
                const market = marketRows[item.ticker] ?? quotes[item.ticker]
                return valueForColumn(item, market, column.id)
              }))
              downloadCsv(`${active.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}-watchlist.csv`, [header, ...data])
            }}>Export CSV</button>
            <button type="button" className={`watchlist-btn ${showColumns ? 'watchlist-btn--selected' : 'watchlist-btn--quiet'}`} onClick={() => setShowColumns((open) => !open)}>Columns</button>
          </div>
        </div>

        {showImport && (
          <div className="watchlist-import-panel">
            <label>
              Paste tickers separated by commas, spaces, or new lines
              <textarea value={importText} onChange={(event) => setImportText(event.target.value)} placeholder={'COHR\nLITE\nAAOI'} />
            </label>
            <button type="button" className="watchlist-btn watchlist-btn--primary" onClick={applyImport}>Add tickers</button>
          </div>
        )}

        {showColumns && (
          <aside className="watchlist-column-panel">
            <div>
              <h2>Table columns</h2>
              <p>Drag to reorder. Visibility and widths save to this browser.</p>
            </div>
            <div className="watchlist-column-list">
              {(active.columnOrder ?? DEFAULT_COLUMNS).map((id) => {
                const column = COLUMN_BY_ID[id]
                if (!column) return null
                const visible = !active.hiddenColumns?.includes(id)
                return (
                  <label key={id} className="watchlist-column-option" draggable onDragStart={() => { dragColumnId.current = id }} onDragOver={(event) => event.preventDefault()} onDrop={() => updateColumnOrder(dragColumnId.current, id)}>
                    <span className="watchlist-drag" aria-hidden="true">⠿</span>
                    <input type="checkbox" checked={visible} onChange={() => toggleColumn(id)} />
                    <span>{column.label}</span>
                    <small>{column.group}</small>
                  </label>
                )
              })}
            </div>
          </aside>
        )}

        <div className="watchlist-filterbar">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search company or ticker" aria-label="Search company or ticker" />
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Filter by category">
            <option value="all">All categories</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          <select value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)} aria-label="Filter by geography">
            <option value="all">All geographies</option>{countries.map((country) => <option key={country} value={country}>{country}</option>)}
          </select>
          <select value={exchangeFilter} onChange={(event) => setExchangeFilter(event.target.value)} aria-label="Filter by exchange">
            <option value="all">All exchanges</option>{exchanges.map((exchange) => <option key={exchange} value={exchange}>{exchange}</option>)}
          </select>
          <label className="watchlist-reference-date">Reference date <input type="date" value={active.referenceDate} onChange={(event) => updateActive((watchlist) => ({ ...watchlist, referenceDate: event.target.value, referenceDateIsDefault: false }))} /></label>
          <div className="watchlist-new-category">
            <input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="New category" aria-label="New category" />
            <button type="button" className="watchlist-icon-btn" title="Add category" onClick={() => {
              const category = newCategory.trim()
              if (category && !categories.includes(category)) updateActive((watchlist) => ({ ...watchlist, categories: [...watchlist.categories, category] }))
              setNewCategory('')
            }}>＋</button>
          </div>
          <span className="watchlist-result-count">{rows.length}/{active.items.length} names</span>
        </div>

        {error && <div className="watchlist-error" role="alert">Market data issue: {error}. Existing saved watchlist settings are unaffected.</div>}

        <div className="watchlist-table-scroll" role="region" aria-label="Stock watchlist table" tabIndex="0">
          <table
            className="watchlist-table"
            style={{
              '--wl-company-width': `${active.columnWidths?.company ?? COLUMN_BY_ID.company.width}px`,
              '--wl-ticker-width': `${active.columnWidths?.ticker ?? COLUMN_BY_ID.ticker.width}px`,
            }}
          >
            <thead>
              <tr className="watchlist-group-row">
                {columnGroups.map(({ group, columns }) => (
                  <th
                    key={`${group}-${columns[0].id}`}
                    className={group === 'Identity' ? 'watchlist-group--identity' : ''}
                    colSpan={columns.length}
                  >
                    {group}
                  </th>
                ))}
              </tr>
              <tr className="watchlist-column-row">
                {visibleColumns.map((column) => (
                  <th key={column.id} className={`watchlist-column--${column.id}${column.frozen ? ` watchlist-frozen watchlist-frozen--${column.frozen}` : ''}${column.id === lastFrozenColumnId ? ' watchlist-frozen--end' : ''}${groupStartIds.has(column.id) ? ' watchlist-group-start' : ''}`} style={{ width: active.columnWidths?.[column.id] ?? column.width, minWidth: active.columnWidths?.[column.id] ?? column.width }} title={column.tooltip}>
                    <button type="button" onClick={() => handleSort(column.id)}>{column.label}<span className="watchlist-sort">{sort.id === column.id ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}</span></button>
                    <span className="watchlist-resize-handle" onMouseDown={(event) => resizeColumn(event, column)} aria-hidden="true" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id} draggable onDragStart={() => { dragItemId.current = item.id }} onDragOver={(event) => event.preventDefault()} onDrop={() => moveItem(dragItemId.current, item.id)}>
                  {visibleColumns.map((column) => (
                    <td key={column.id} className={`watchlist-column--${column.id}${column.frozen ? ` watchlist-frozen watchlist-frozen--${column.frozen}` : ''}${column.id === lastFrozenColumnId ? ' watchlist-frozen--end' : ''}${column.id === 'lastPrice' ? ' watchlist-current-price' : ''}${groupStartIds.has(column.id) ? ' watchlist-group-start' : ''}`} style={{ width: active.columnWidths?.[column.id] ?? column.width, minWidth: active.columnWidths?.[column.id] ?? column.width }}>
                      {renderCell(item, column)}
                    </td>
                  ))}
                </tr>
              ))}
              {!rows.length && (
                <tr><td className="watchlist-empty" colSpan={visibleColumns.length}>{active.items.length ? 'No names match the current filters.' : 'This watchlist is empty. Add a ticker or import a list to begin.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <section className="watchlist-etf-section" aria-labelledby="etf-monitor-title">
          <header className="watchlist-secondary-heading">
            <div>
              <span>ETF-only reference table</span>
              <h2 id="etf-monitor-title">ETF Monitor</h2>
            </div>
            <strong>{etfRows.length} ETFs</strong>
          </header>
          <div className="watchlist-table-scroll watchlist-table-scroll--secondary" role="region" aria-label="ETF-only watchlist table" tabIndex="0">
            <table
              className="watchlist-table"
              style={{
                '--wl-company-width': `${active.columnWidths?.company ?? COLUMN_BY_ID.company.width}px`,
                '--wl-ticker-width': `${active.columnWidths?.ticker ?? COLUMN_BY_ID.ticker.width}px`,
              }}
            >
              <thead>
                <tr className="watchlist-group-row">
                  {columnGroups.map(({ group, columns }) => (
                    <th
                      key={`etf-${group}-${columns[0].id}`}
                      className={group === 'Identity' ? 'watchlist-group--identity' : ''}
                      colSpan={columns.length}
                    >
                      {group}
                    </th>
                  ))}
                </tr>
                <tr className="watchlist-column-row">
                  {visibleColumns.map((column) => (
                    <th key={`etf-${column.id}`} className={`watchlist-column--${column.id}${column.frozen ? ` watchlist-frozen watchlist-frozen--${column.frozen}` : ''}${column.id === lastFrozenColumnId ? ' watchlist-frozen--end' : ''}${groupStartIds.has(column.id) ? ' watchlist-group-start' : ''}`} style={{ width: active.columnWidths?.[column.id] ?? column.width, minWidth: active.columnWidths?.[column.id] ?? column.width }} title={column.tooltip}>
                      <button type="button" onClick={() => handleSort(column.id)}>{column.label}<span className="watchlist-sort">{sort.id === column.id ? (sort.direction === 'asc' ? 'â†‘' : 'â†“') : 'â†•'}</span></button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {etfRows.map((item) => (
                  <tr key={item.id}>
                    {visibleColumns.map((column) => (
                      <td key={`etf-${item.id}-${column.id}`} className={`watchlist-column--${column.id}${column.frozen ? ` watchlist-frozen watchlist-frozen--${column.frozen}` : ''}${column.id === lastFrozenColumnId ? ' watchlist-frozen--end' : ''}${column.id === 'lastPrice' ? ' watchlist-current-price' : ''}${groupStartIds.has(column.id) ? ' watchlist-group-start' : ''}`} style={{ width: active.columnWidths?.[column.id] ?? column.width, minWidth: active.columnWidths?.[column.id] ?? column.width }}>
                        {renderCell(item, column, true)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <p className="watchlist-note">Last Price is the live market quote. Each historical reference price is the exact anchor used by its matching performance period; adjusted closes are used where available.</p>
      </section>

      {dialog && <NameDialog mode={dialog.mode} value={dialog.value} onCancel={() => setDialog(null)} onSave={(name) => {
        if (!name) return
        if (dialog.mode === 'rename') updateActive((watchlist) => ({ ...watchlist, name }))
        else {
          const newWatchlist = { id: createId('list'), name, items: [], categories: ['Unassigned'], columnOrder: DEFAULT_COLUMNS, hiddenColumns: DEFAULT_HIDDEN_COLUMNS, columnWidths: {}, referenceDate: localDateInputValue(), referenceDateIsDefault: true, layoutVersion: WATCHLIST_LAYOUT_VERSION }
          setWorkspace((current) => ({ activeId: newWatchlist.id, watchlists: [...current.watchlists, newWatchlist] }))
        }
        setDialog(null)
      }} />}

      {confirmDelete && (
        <div className="watchlist-dialog-backdrop" role="presentation">
          <div className="watchlist-dialog"><h2>Delete {active.name}?</h2><p>This removes the saved watchlist from this browser. It cannot be undone.</p><div className="watchlist-dialog-actions"><button type="button" className="watchlist-btn watchlist-btn--quiet" onClick={() => setConfirmDelete(false)}>Cancel</button><button type="button" className="watchlist-btn watchlist-btn--danger" onClick={() => { setWorkspace((current) => { const watchlists = current.watchlists.filter((watchlist) => watchlist.id !== current.activeId); return { activeId: watchlists[0].id, watchlists } }); setConfirmDelete(false) }}>Delete watchlist</button></div></div>
        </div>
      )}
    </main>
  )
}
