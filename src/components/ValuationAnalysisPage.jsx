import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './ValuationAnalysisPage.css'

const STORAGE_KEY = 'market-maps:valuation-analysis:v2'
const REFRESH_MS = 15 * 60 * 1000

const STARTING_COMPANIES = [
  ['Bloom Energy', 'BE'], ['GE Vernova', 'GEV'], ['FuelCell Energy', 'FCEL'],
  ['Intel', 'INTC'], ['Micron Technology', 'MU'], ['Nebius Group', 'NBIS'],
  ['CoreWeave', 'CRWV'], ['IREN', 'IREN'], ['Google', 'GOOGL'],
  ['Amazon', 'AMZN'], ['Meta', 'META'], ['Microsoft', 'MSFT'],
].map(([name, ticker]) => ({ name, ticker }))

const CURRENCY_SYMBOLS = { USD: '$', EUR: 'EUR ', JPY: 'JPY ', GBP: 'GBP ', GBp: 'p', CNY: 'CNY ' }

function formatPrice(value, currency) {
  if (value == null || !Number.isFinite(Number(value))) return 'N/A'
  if (currency === 'GBp') return `${Number(value).toFixed(1)}p`
  const digits = currency === 'JPY' || currency === 'KRW' ? 0 : 2
  return `${CURRENCY_SYMBOLS[currency] ?? `${currency ?? ''} `}${Number(value).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

function formatLargeNumber(value, currency) {
  if (value == null || !Number.isFinite(Number(value))) return 'N/A'
  const absolute = Math.abs(Number(value))
  const divisor = absolute >= 1e12 ? 1e12 : absolute >= 1e9 ? 1e9 : absolute >= 1e6 ? 1e6 : 1
  const suffix = divisor === 1e12 ? 'T' : divisor === 1e9 ? 'B' : divisor === 1e6 ? 'M' : ''
  const display = `${CURRENCY_SYMBOLS[currency] ?? `${currency ?? ''} `}${(absolute / divisor).toFixed(divisor === 1 ? 0 : 1)}${suffix}`
  return Number(value) < 0 ? `(${display})` : display
}

function formatPercent(value) {
  if (value == null || !Number.isFinite(Number(value))) return 'N/A'
  return `${Number(value) >= 0 ? '+' : ''}${(Number(value) * 100).toFixed(1)}%`
}

function formatMultiple(value, denominator) {
  if (value != null && Number.isFinite(Number(value))) return `${Number(value).toFixed(1)}x`
  return denominator != null && Number(denominator) <= 0 ? 'N/M' : 'N/A'
}

function valueClass(value) {
  if (value == null || !Number.isFinite(Number(value))) return 'valuation-value--na'
  if (value > 0) return 'valuation-value--positive'
  if (value < 0) return 'valuation-value--negative'
  return 'valuation-value--neutral'
}

function columnId(group, key) {
  return `${group}:${key}`
}

const MULTIPLE_METRICS = new Set(['evRevenue', 'evGrossProfit', 'evEbitda', 'evFreeCashFlow'])

function createColumns(periods = { actual: ['2023A', '2024A', '2025A'], ltm: 'LTM', ntm: 'NTM', estimate: ['2026E', '2027E'] }) {
  const financialPeriods = [...periods.actual, periods.ltm, periods.ntm ?? 'NTM', ...periods.estimate]
  const metricColumns = (table, group, metric, kind, options = {}) => financialPeriods.map((period) => ({
    id: columnId(metric, period), table, group, label: period, metric, period, kind,
    width: options.width ?? 88, periodType: period.endsWith('A') ? 'actual' : period.endsWith('E') ? 'estimate' : period === 'NTM' ? 'ntm' : 'ltm',
    tooltip: period === 'NTM' ? `${group} for the next twelve months. Revenue uses Street consensus when available; other metrics are only shown when directly sourced or explicitly derived.` : `${group} for calendar period ${period}.`,
  }))
  const identity = [
    { id: 'company', table: 'multiples', group: 'Identity', label: 'Company', kind: 'text', width: 190, frozen: 'company' },
    { id: 'ticker', table: 'multiples', group: 'Identity', label: 'Ticker', kind: 'text', width: 76, frozen: 'ticker' },
  ]
  const multipleColumns = [
    ...identity,
    { id: 'price', table: 'multiples', group: 'Market Data', label: 'Price', kind: 'price', width: 92, frozen: 'market-price', tooltip: 'Latest Yahoo Finance market quote.' },
    { id: 'dailyPercent', table: 'multiples', group: 'Market Data', label: 'Chg %', kind: 'percent', width: 74, frozen: 'market-change', tooltip: 'Current quote versus prior close.' },
    { id: 'belowHigh52', table: 'multiples', group: 'Market Data', label: 'vs 52W High', kind: 'percent', width: 94, tooltip: 'Current quote / trailing 52-week high - 1.' },
    { id: 'aboveLow52', table: 'multiples', group: 'Market Data', label: 'vs 52W Low', kind: 'percent', width: 94, tooltip: 'Current quote / trailing 52-week low - 1.' },
    { id: 'equityValue', table: 'multiples', group: 'Enterprise Value', label: 'Basic Equity', kind: 'money', width: 100, tooltip: 'Latest price multiplied by SEC-reported common shares outstanding. This is not a fully diluted equity value.' },
    { id: 'debt', table: 'multiples', group: 'Enterprise Value', label: 'Debt', kind: 'money', width: 92, tooltip: 'Latest SEC-reported debt, with Yahoo Finance fallback.' },
    { id: 'cash', table: 'multiples', group: 'Enterprise Value', label: 'Cash', kind: 'money', width: 92, tooltip: 'Latest SEC-reported cash, with Yahoo Finance fallback.' },
    { id: 'enterpriseValue', table: 'multiples', group: 'Enterprise Value', label: 'EV', kind: 'money', width: 100, tooltip: 'FD equity value plus debt less cash. Manual adjustments are not applied in this build.' },
    ...metricColumns('multiples', 'EV / Revenue', 'evRevenue', 'multiple', { width: 82 }),
    ...metricColumns('multiples', 'EV / Gross Profit', 'evGrossProfit', 'multiple', { width: 94 }),
    ...metricColumns('multiples', 'EV / Adjusted EBITDA', 'evEbitda', 'multiple', { width: 96 }),
    ...metricColumns('multiples', 'EV / Free Cash Flow', 'evFreeCashFlow', 'multiple', { width: 102 }),
  ]
  const operatingColumns = [
    { ...identity[0], id: 'operating-company', table: 'operating' },
    { ...identity[1], id: 'operating-ticker', table: 'operating' },
    ...metricColumns('operating', 'Revenue', 'revenue', 'money'),
    ...metricColumns('operating', 'Gross Profit', 'grossProfit', 'money'),
    ...metricColumns('operating', 'Adjusted EBITDA', 'ebitda', 'money'),
    ...metricColumns('operating', 'Free Cash Flow', 'freeCashFlow', 'money'),
    ...metricColumns('operating', 'Revenue Growth', 'revenueGrowth', 'percent', { width: 78 }),
    ...metricColumns('operating', 'Gross Margin', 'grossMargin', 'percent', { width: 78 }),
    ...metricColumns('operating', 'Adjusted EBITDA Margin', 'ebitdaMargin', 'percent', { width: 92 }),
  ]
  return [...multipleColumns, ...operatingColumns]
}

function defaultState() {
  const columns = createColumns()
  return {
    items: STARTING_COMPANIES,
    columnOrder: columns.map((column) => column.id),
    hiddenColumns: [],
    columnWidths: {},
    // Historical actuals are decision-grade only after the SEC ledger has
    // reconciled the four reported quarters. Users can inspect exceptions in
    // Data Quality, but the primary table starts in this fail-closed mode.
    strictHistorical: true,
  }
}

function normalizeColumnOrder(savedOrder = [], columns = createColumns()) {
  const validIds = new Set(columns.map((column) => column.id))
  const order = [...new Set(savedOrder.filter((id) => validIds.has(id)))]

  for (const column of columns) {
    if (order.includes(column.id)) continue
    if (column.period === 'NTM' && column.metric) {
      const ltmIndex = order.indexOf(columnId(column.metric, 'LTM'))
      if (ltmIndex >= 0) {
        order.splice(ltmIndex + 1, 0, column.id)
        continue
      }
    }
    order.push(column.id)
  }
  return order
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (saved?.items?.length) {
      const defaults = defaultState()
      return { ...defaults, ...saved, columnOrder: normalizeColumnOrder(saved.columnOrder, createColumns()) }
    }
  } catch {
    // Browser storage is optional. Fall back to the supplied starter comp set.
  }
  return defaultState()
}

function grouped(columns) {
  return columns.reduce((groups, column) => {
    const prior = groups.at(-1)
    if (prior?.group === column.group) prior.columns.push(column)
    else groups.push({ group: column.group, columns: [column] })
    return groups
  }, [])
}

function csvDownload(filename, rows) {
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = rows.map((row) => row.map(escape).join(',')).join('\n')
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

function jsonDownload(filename, value) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' }))
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

function auditForCell(row, column) {
  if (!column || column.kind === 'text') return null
  const key = column.metric ? `${column.metric}:${column.period}` : column.id
  return row.audit?.cells?.[key] ?? null
}

function sourceForCell(row, column) {
  if (column.metric) return row.provenance?.[column.metric]?.[column.period] ?? null
  if (['equityValue', 'debt', 'cash', 'enterpriseValue'].includes(column.id)) return row.provenance?.capital?.[column.id === 'equityValue' ? 'dilutedShares' : column.id] ?? null
  if (['price', 'dailyPercent', 'belowHigh52', 'aboveLow52'].includes(column.id)) return row.provenance?.market ?? null
  return null
}

function cellValue(row, column, displayName) {
  if (column.id === 'company' || column.id === 'operating-company') return displayName ?? row.name
  if (column.id === 'ticker' || column.id === 'operating-ticker') return row.ticker
  if (column.id === 'price') return row.price
  if (column.id === 'dailyPercent') return row.dailyPercent
  if (column.id === 'belowHigh52') return row.ranges?.belowHigh52
  if (column.id === 'aboveLow52') return row.ranges?.aboveLow52
  if (column.id in (row.capital ?? {})) return row.capital[column.id]
  if (column.metric) return row[MULTIPLE_METRICS.has(column.metric) ? 'multiples' : 'metrics']?.[column.metric]?.[column.period]
  return null
}

function isStrictlyDisplayable(audit, column) {
  if (!audit?.displayable) return false
  if (column?.periodType !== 'actual') return true
  return ['VERIFIED_REPORTED', 'VERIFIED_DERIVED'].includes(audit.status)
}

export default function ValuationAnalysisPage({ onBack }) {
  const [state, setState] = useState(loadState)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [addQuery, setAddQuery] = useState('')
  const [showColumns, setShowColumns] = useState(false)
  const [showAudit, setShowAudit] = useState(false)
  const [auditFilter, setAuditFilter] = useState('All')
  const [sort, setSort] = useState({ id: 'company', direction: 'asc' })
  const [selectedCell, setSelectedCell] = useState(null)
  const dragColumn = useRef(null)

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)), [state])

  const tickers = useMemo(() => state.items.map((item) => item.ticker).filter(Boolean), [state.items])
  const tickerKey = tickers.join(',')
  const refresh = useCallback(async () => {
    if (!tickers.length) { setData({ rows: [], periods: { actual: [], ltm: 'LTM', ntm: 'NTM', estimate: [] } }); return }
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/valuation?tickers=${encodeURIComponent(tickerKey)}`)
      if (!response.ok) throw new Error(`Valuation request failed (${response.status})`)
      setData(await response.json())
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [tickerKey, tickers.length])

  useEffect(() => {
    refresh()
    const timer = window.setInterval(refresh, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [refresh])

  const columns = useMemo(() => createColumns(data?.periods), [data?.periods])
  const byId = useMemo(() => Object.fromEntries(columns.map((column) => [column.id, column])), [columns])
  const visibleColumns = useMemo(() => {
    const normalized = normalizeColumnOrder(state.columnOrder, columns)
    return normalized.filter((id) => !state.hiddenColumns.includes(id)).map((id) => byId[id])
  }, [byId, columns, state.columnOrder, state.hiddenColumns])
  const multipleColumns = useMemo(() => visibleColumns.filter((column) => column.table === 'multiples'), [visibleColumns])
  const operatingColumns = useMemo(() => visibleColumns.filter((column) => column.table === 'operating'), [visibleColumns])
  const rows = useMemo(() => {
    const mapped = (data?.rows ?? []).map((row) => ({ ...row, displayName: state.items.find((item) => item.ticker === row.ticker)?.name ?? row.name }))
    const filtered = mapped.filter((row) => `${row.displayName} ${row.ticker}`.toLowerCase().includes(query.toLowerCase()))
    return [...filtered].sort((left, right) => {
      const column = byId[sort.id]
      const a = column ? cellValue(left, column, left.displayName) : null
      const b = column ? cellValue(right, column, right.displayName) : null
      const multiplier = sort.direction === 'asc' ? 1 : -1
      if (a == null) return 1
      if (b == null) return -1
      if (typeof a === 'string' || typeof b === 'string') return String(a).localeCompare(String(b)) * multiplier
      return (Number(a) - Number(b)) * multiplier
    })
  }, [byId, data?.rows, query, sort, state.items])
  const auditRecords = useMemo(() => rows.flatMap((row) => Object.values(row.audit?.cells ?? {}).map((record) => ({ ...record, company: row.displayName }))), [rows])
  const filteredAuditRecords = useMemo(() => auditFilter === 'All' ? auditRecords : auditRecords.filter((record) => record.status === auditFilter), [auditFilter, auditRecords])

  const updateState = (updater) => setState((current) => updater(current))
  const addCompany = () => {
    const ticker = addQuery.trim().toUpperCase()
    if (!ticker || state.items.some((item) => item.ticker === ticker)) return
    updateState((current) => ({ ...current, items: [...current.items, { name: ticker, ticker }] }))
    setAddQuery('')
  }
  const removeCompany = (ticker) => updateState((current) => ({ ...current, items: current.items.filter((item) => item.ticker !== ticker) }))
  const toggleColumn = (id) => updateState((current) => ({
    ...current,
    hiddenColumns: current.hiddenColumns.includes(id) ? current.hiddenColumns.filter((item) => item !== id) : [...current.hiddenColumns, id],
  }))
  const updateColumnOrder = (moving, target) => updateState((current) => {
    if (!moving || moving === target) return current
    const order = normalizeColumnOrder(current.columnOrder, columns)
    order.splice(order.indexOf(moving), 1)
    order.splice(order.indexOf(target), 0, moving)
    return { ...current, columnOrder: order }
  })
  const resize = (event, column) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = state.columnWidths[column.id] ?? column.width
    const onMove = (move) => updateState((current) => ({ ...current, columnWidths: { ...current.columnWidths, [column.id]: Math.max(68, startWidth + move.clientX - startX) } }))
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }
  const formatCell = (row, column) => {
    const audit = auditForCell(row, column)
    const value = audit && !isStrictlyDisplayable(audit, column) ? null : cellValue(row, column, row.displayName)
    if (column.kind === 'text') return value ?? 'N/A'
    if (column.kind === 'price') return formatPrice(value, row.currency)
    if (column.kind === 'money') return formatLargeNumber(value, row.currency)
    if (column.kind === 'percent') return formatPercent(value)
    if (column.kind === 'multiple') {
      const denominatorMetric = column.metric === 'evRevenue'
        ? 'revenue'
        : column.metric === 'evGrossProfit'
          ? 'grossProfit'
          : column.metric === 'evEbitda'
            ? 'ebitda'
            : 'freeCashFlow'
      return formatMultiple(value, row.metrics?.[denominatorMetric]?.[column.period])
    }
    return 'N/A'
  }

  const renderTable = (tableColumns, title, description, variant) => {
    if (!tableColumns.length) return null
    const tableGroups = grouped(tableColumns)
    const groupStarts = new Set(tableGroups.map((group) => group.columns[0].id))
    const frozenColumns = tableColumns.filter((column) => column.frozen)
    const lastFrozen = frozenColumns.at(-1)?.id
    const companyColumn = frozenColumns.find((column) => column.frozen === 'company')
    const tickerColumn = frozenColumns.find((column) => column.frozen === 'ticker')
    const marketColumn = frozenColumns.find((column) => column.frozen === 'market-price')
    const tableStyle = {
      '--va-company-width': `${state.columnWidths[companyColumn?.id] ?? companyColumn?.width ?? 190}px`,
      '--va-ticker-width': `${state.columnWidths[tickerColumn?.id] ?? tickerColumn?.width ?? 76}px`,
      '--va-price-width': `${state.columnWidths[marketColumn?.id] ?? marketColumn?.width ?? 0}px`,
    }
    const tableRows = loading && !data
      ? state.items.map((item) => ({ ...item, displayName: item.name, loading: true }))
      : rows
    return <section className={`valuation-table-section valuation-table-section--${variant}`}>
      <div className="valuation-table-heading"><div><span>{variant === 'multiples' ? 'Valuation' : 'Fundamentals'}</span><h2>{title}</h2></div><p>{description}</p></div>
      <div className={`valuation-table-scroll valuation-table-scroll--${variant}`} role="region" aria-label={`${title} comp table`} tabIndex="0">
        <table className="valuation-table" style={tableStyle}>
          <thead><tr className="valuation-group-row">{tableGroups.map((group) => <th key={group.group} colSpan={group.columns.length} className={group.group === 'Identity' ? 'valuation-group--identity' : ''}>{group.group}</th>)}</tr><tr className="valuation-column-row">{tableColumns.map((column) => <th key={column.id} title={column.tooltip} className={`valuation-column--${column.id.replace(':', '-')}${column.frozen ? ` valuation-frozen valuation-frozen--${column.frozen}` : ''}${column.id === lastFrozen ? ' valuation-frozen--end' : ''}${groupStarts.has(column.id) ? ' valuation-group-start' : ''}${column.periodType ? ` valuation-period--${column.periodType}` : ''}`} style={{ width: state.columnWidths[column.id] ?? column.width, minWidth: state.columnWidths[column.id] ?? column.width }}><button type="button" onClick={() => setSort((current) => current.id === column.id ? { id: column.id, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { id: column.id, direction: 'asc' })}>{column.label}<span>{sort.id === column.id ? (sort.direction === 'asc' ? ' up' : ' down') : ''}</span></button><i onMouseDown={(event) => resize(event, column)} /></th>)}</tr></thead>
          <tbody>{tableRows.map((row) => <tr key={row.ticker} className={row.loading ? 'valuation-loading-row' : ''}>{tableColumns.map((column) => {
            const audit = auditForCell(row, column)
            const value = audit && !isStrictlyDisplayable(audit, column) ? null : cellValue(row, column, row.displayName)
            const sourceData = sourceForCell(row, column)
            const numeric = column.kind === 'percent' ? value : null
            const unresolved = ['MISMATCH', 'MISSING_BUT_AVAILABLE', 'LEGITIMATE_NA', 'REQUIRES_REVIEW', 'ETF_NOT_APPLICABLE', 'OUT_OF_SEC_SCOPE', 'FAILED', 'UNAVAILABLE', 'UNVERIFIED'].includes(audit?.status)
            return <td key={column.id} onClick={() => column.kind !== 'text' && setSelectedCell({ row, column })} className={`${column.frozen ? `valuation-frozen valuation-frozen--${column.frozen}` : ''}${column.id === lastFrozen ? ' valuation-frozen--end' : ''}${groupStarts.has(column.id) ? ' valuation-group-start' : ''}${column.id === 'price' ? ' valuation-current-price' : ''}${column.kind === 'percent' ? ` ${valueClass(numeric)}` : ''}${sourceData?.confidence === 'Low' ? ' valuation-low-confidence' : ''}${sourceData?.sourceType?.includes('Derived') ? ' valuation-derived' : ''}${audit?.status === 'VERIFIED_DERIVED' ? ' valuation-audit-warning' : ''}${unresolved ? ' valuation-audit-hidden' : ''}`} style={{ width: state.columnWidths[column.id] ?? column.width, minWidth: state.columnWidths[column.id] ?? column.width }}>{column.frozen === 'company' ? <div className="valuation-company"><span>{formatCell(row, column)}</span><button type="button" title={`Remove ${row.ticker}`} onClick={(event) => { event.stopPropagation(); removeCompany(row.ticker) }}>x</button></div> : <span>{formatCell(row, column)}</span>}</td>
          })}</tr>)}{!loading && !rows.length && <tr><td className="valuation-empty" colSpan={tableColumns.length}>No companies match the current search.</td></tr>}</tbody>
        </table>
      </div>
    </section>
  }

  const selectedAudit = selectedCell ? auditForCell(selectedCell.row, selectedCell.column) : null
  const source = selectedAudit?.source ?? (selectedCell ? sourceForCell(selectedCell.row, selectedCell.column) : null)
  const firstSourceComponent = selectedAudit?.components?.[0] ?? null
  return (
    <main className="valuation-page">
      <header className="valuation-topbar">
        <button type="button" className="valuation-brand" onClick={onBack}>Market Maps</button>
        <div><span>Institutional comps</span><h1>Valuation Analysis</h1></div>
        <div className="valuation-actions"><span>{data?.retrievedAt ? `Market data ${new Date(data.retrievedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Loading data'}</span><button type="button" onClick={refresh} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</button></div>
      </header>
      <section className="valuation-workspace">
        <div className="valuation-toolbar">
          <div className="valuation-add"><input value={addQuery} onChange={(event) => setAddQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addCompany() }} placeholder="Add ticker" /><button type="button" onClick={addCompany}>Add</button></div>
          <input className="valuation-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search company or ticker" />
          <div className="valuation-tools"><button type="button" onClick={() => setShowColumns((open) => !open)} className={showColumns ? 'is-selected' : ''}>Columns</button><button type="button" className="is-selected" disabled title="Historical actuals use WiseSheets quarterly data with SEC validation and exception handling.">WiseSheets primary</button><button type="button" onClick={() => setShowAudit((open) => !open)} className={showAudit ? 'is-selected' : ''}>Data Quality</button><button type="button" onClick={() => csvDownload('valuation-analysis.csv', [[...visibleColumns.map((column) => column.label)], ...rows.map((row) => visibleColumns.map((column) => formatCell(row, column)))])}>Export CSV</button><strong>{rows.length}/{state.items.length} companies</strong></div>
        </div>
        {showColumns && <aside className="valuation-column-panel"><div><h2>Table columns</h2><p>Drag to reorder. Visibility and widths save to this browser.</p></div><div>{normalizeColumnOrder(state.columnOrder, columns).map((id) => {
          const column = byId[id]
          if (!column) return null
          return <label key={id} draggable onDragStart={() => { dragColumn.current = id }} onDragOver={(event) => event.preventDefault()} onDrop={() => updateColumnOrder(dragColumn.current, id)}><span>||</span><input type="checkbox" checked={!state.hiddenColumns.includes(id)} onChange={() => toggleColumn(id)} /><b>{column.label}</b><small>{column.group}</small></label>
        })}</div></aside>}
        {showAudit && <aside className="valuation-audit-panel">
          <div className="valuation-audit-panel__head"><div><span>Server-side checks</span><h2>Data Quality</h2><p>Historical actuals are source-lined and fail closed. Only reported or validated-derived historical values display.</p></div><div className="valuation-audit-actions"><select value={auditFilter} onChange={(event) => setAuditFilter(event.target.value)}><option>All</option><option>VERIFIED_REPORTED</option><option>VERIFIED_DERIVED</option><option>MISMATCH</option><option>MISSING_BUT_AVAILABLE</option><option>LEGITIMATE_NA</option><option>REQUIRES_REVIEW</option><option>ETF_NOT_APPLICABLE</option><option>OUT_OF_SEC_SCOPE</option></select><button type="button" onClick={() => jsonDownload('valuation-audit.json', { summary: data?.audit ?? null, historicalSummary: data?.historicalAudit ?? null, records: auditRecords })}>Export JSON</button><button type="button" onClick={() => csvDownload('valuation-audit.csv', [['Company', 'Ticker', 'Metric', 'Period', 'Status', 'Displayed value', 'Source', 'Formula', 'Warnings'], ...auditRecords.map((record) => [record.company, record.ticker, record.metric, record.period, record.status, record.value ?? 'N/A', record.source.provider, record.formula, record.warnings.join(' | ')])])}>Export CSV</button></div></div>
          <div className="valuation-audit-stats">{[['Reported', data?.historicalAudit?.VERIFIED_REPORTED ?? 0], ['Derived', data?.historicalAudit?.VERIFIED_DERIVED ?? 0], ['Mismatch', data?.historicalAudit?.MISMATCH ?? 0], ['Missing', data?.historicalAudit?.MISSING_BUT_AVAILABLE ?? 0], ['Review', data?.historicalAudit?.REQUIRES_REVIEW ?? 0], ['ETF N/A', data?.historicalAudit?.ETF_NOT_APPLICABLE ?? 0], ['Out of scope', data?.historicalAudit?.OUT_OF_SEC_SCOPE ?? 0]].map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
          <div className="valuation-audit-list">{filteredAuditRecords.slice(0, 20).map((record) => <div key={`${record.ticker}:${record.metric}:${record.period}`}><b>{record.status}</b><span>{record.company} · {record.metric} · {record.period}</span><small>{record.warnings[0] ?? record.formula}</small></div>)}{filteredAuditRecords.length > 20 && <p>{filteredAuditRecords.length - 20} additional records are included in the exports.</p>}</div>
        </aside>}
        {error && <div className="valuation-error">Market or financial-data issue: {error}. Existing comp selections are unaffected.</div>}
        {renderTable(multipleColumns, 'Valuation Multiples', 'Enterprise-value and market-data context. NTM revenue uses Street consensus where available; derived NTM values retain cell-level provenance.', 'multiples')}
        {renderTable(operatingColumns, 'Operating Performance', 'Historical actuals use four valid WiseSheets quarters ending in the labeled calendar year; NTM and estimate columns retain the existing consensus methodology. Yellow cells are derived rather than directly reported or consensus.', 'operating')}
        <p className="valuation-note">Revenue, gross profit, CFO, capex, and FCF use complete WiseSheets quarters, with SEC retained for audit and defined exceptions. FCF is CFO less matched-period capex. Adjusted EBITDA remains company-reported and SEC sourced. N/M means the valuation denominator is zero or negative.</p>
      </section>
      {selectedCell && <aside className="valuation-source-drawer">
        <button type="button" onClick={() => setSelectedCell(null)}>Close</button>
        <span>Cell audit trail</span>
        <h2>{selectedCell.row.displayName} - {selectedCell.column.label}</h2>
        <strong>{formatCell(selectedCell.row, selectedCell.column)}</strong>
        <dl>
          <dt>Ticker</dt><dd>{selectedCell.row.ticker}</dd>
          <dt>Validation status</dt><dd>{selectedAudit?.status ?? 'UNVERIFIED'}</dd>
          <dt>Requested period</dt><dd>{selectedAudit?.period ?? selectedCell.column.period ?? 'Current market data'}</dd>
          <dt>Requested period type</dt><dd>{source?.requestedPeriodType ?? 'N/A'}</dd>
          <dt>Metric definition</dt><dd>{source?.definition ?? 'See source metric classification.'}</dd>
          <dt>Metric method</dt><dd>{source?.adjustedEbitdaMethod ?? firstSourceComponent?.adjustedEbitdaMethod ?? source?.method ?? 'N/A'}</dd>
          <dt>Exact company label</dt><dd>{firstSourceComponent?.exactCompanyMetricLabel ?? firstSourceComponent?.rowLabel ?? 'N/A'}</dd>
          <dt>Filing form</dt><dd>{firstSourceComponent?.filingForm ?? 'N/A'}</dd>
          <dt>Accession</dt><dd>{firstSourceComponent?.accn ?? 'N/A'}</dd>
          <dt>Document</dt><dd>{firstSourceComponent?.document ?? 'N/A'}</dd>
          <dt>Table</dt><dd>{firstSourceComponent?.tableTitle ?? 'N/A'}</dd>
          <dt>Row</dt><dd>{firstSourceComponent?.rowLabel ?? 'N/A'}</dd>
          <dt>Column</dt><dd>{firstSourceComponent?.columnLabel ?? 'N/A'}</dd>
          <dt>Raw value</dt><dd>{firstSourceComponent?.rawCellValue ?? firstSourceComponent?.rawReportedValue ?? selectedAudit?.rawValue ?? 'N/A'}</dd>
          <dt>Reported units</dt><dd>{firstSourceComponent?.reportedUnits ?? selectedAudit?.units ?? 'N/A'}</dd>
          <dt>Normalized value</dt><dd>{firstSourceComponent?.normalizedValue ?? selectedAudit?.normalizedValue ?? 'N/A'}</dd>
          <dt>Source period</dt><dd>{firstSourceComponent ? `${firstSourceComponent.sourceStart} to ${firstSourceComponent.sourceEnd} (${firstSourceComponent.sourcePeriodType ?? 'N/A'})` : 'N/A'}</dd>
          <dt>Derivation</dt><dd>{source?.derivation ?? selectedAudit?.formula ?? 'Direct reported value'}</dd>
          <dt>Definition fingerprint</dt><dd>{source?.definitionFingerprint ?? firstSourceComponent?.definitionFingerprint ?? 'N/A'}</dd>
          <dt>Denominator identity</dt><dd>{source?.denominatorIdentity ?? 'N/A'}</dd>
          <dt>Structural validation</dt><dd>{selectedAudit?.checks?.canonicalAdjustedEbitda?.passed ? 'Passed' : selectedAudit?.checks?.canonicalAdjustedEbitda?.reason ?? 'N/A'}</dd>
          <dt>Calculation validation</dt><dd>{selectedAudit?.checks?.calculation?.passed ? 'Passed' : selectedAudit?.checks?.calculation?.reason ?? 'N/A'}</dd>
          <dt>Source hash</dt><dd>{firstSourceComponent?.documentHash ?? source?.documentHash ?? 'N/A'}</dd>
          <dt>Source URL</dt><dd>{firstSourceComponent?.sourceUrl || source?.sourceUrl ? <a href={firstSourceComponent?.sourceUrl ?? source.sourceUrl} target="_blank" rel="noreferrer">Open SEC source</a> : 'N/A'}</dd>
        </dl>
        {source?.alternativeSources?.length > 0 && <div className="valuation-source-components"><h3>Alternative source values</h3>{source.alternativeSources.map((alternative) => <p key={alternative.sourceUrl ?? alternative.provider}>{alternative.provider}: {formatLargeNumber(alternative.value, selectedCell.row.currency)} ({(alternative.difference * 100).toFixed(1)}% difference)</p>)}</div>}
        {selectedAudit?.warnings?.length > 0 && <div className="valuation-source-components"><h3>Warnings</h3>{selectedAudit.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
        {selectedAudit?.inputs && Object.keys(selectedAudit.inputs).length > 0 && <div className="valuation-source-components"><h3>Calculation inputs</h3>{Object.entries(selectedAudit.inputs).map(([key, value]) => <p key={key}>{key}: {value ?? 'N/A'}</p>)}</div>}
        {selectedAudit?.components?.length > 0 && <div className="valuation-source-components"><h3>Underlying SEC components</h3>{selectedAudit.components.map((component, index) => <div key={`${component.sourceEnd}-${index}`}><p>{component.sourceStart} to {component.sourceEnd}: {formatLargeNumber(component.normalizedValue ?? component.sourceValue, selectedCell.row.currency)}</p><small>{component.filingForm ?? 'SEC filing'} · {component.accn ?? 'No accession'} · {component.rowLabel ?? 'Adjusted EBITDA'} / {component.columnLabel ?? 'N/A'}</small>{component.adjustmentComponents?.map((adjustment) => <small key={adjustment.category}>{adjustment.label}: {formatLargeNumber(adjustment.value, selectedCell.row.currency)}</small>)}</div>)}</div>}
      </aside>}
    </main>
  )
}
