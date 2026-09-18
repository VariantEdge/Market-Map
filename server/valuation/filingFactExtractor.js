import { createHash } from 'node:crypto'
import * as cheerio from 'cheerio'
import { fetchSecText } from '../sec/edgar.js'
import { hydrateFilingExhibits } from './filingIndex.js'
import { metricCandidatesForConcept } from './sourceLedger.js'

const DAY_MS = 24 * 60 * 60 * 1000
const DOCUMENT_FORMS = new Set([
  '10-K', '10-K/A', '10-Q', '10-Q/A', '20-F', '20-F/A', '40-F', '40-F/A',
  '8-K', '8-K/A', '6-K', 'S-1', 'S-1/A', 'F-1', 'F-1/A', '10', '10/A', '10-12B', '10-12B/A',
])

function decodeHtml(value) {
  return String(value ?? '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
}

function attributes(value) {
  const output = {}
  for (const match of String(value ?? '').matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    output[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? '')
  }
  return output
}

function text(value) {
  return decodeHtml(String(value ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function dateValue(body, tag) {
  return body.match(new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([^<]+)<`, 'i'))?.[1]?.trim() ?? null
}

function contexts(html) {
  const output = new Map()
  for (const match of html.matchAll(/<(?:\w+:)?context\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?context>/gi)) {
    const attrs = attributes(match[1])
    const id = attrs.id
    if (!id) continue
    const startDate = dateValue(match[2], 'startDate')
    const endDate = dateValue(match[2], 'endDate')
    output.set(id, {
      startDate,
      endDate,
      instant: dateValue(match[2], 'instant'),
      segment: /<(?:\w+:)?(?:segment|scenario)\b/i.test(match[2]) ? text(match[2]) : null,
    })
  }
  return output
}

function units(html) {
  const output = new Map()
  for (const match of html.matchAll(/<(?:\w+:)?unit\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?unit>/gi)) {
    const id = attributes(match[1]).id
    const measure = match[2].match(/<(?:\w+:)?measure\b[^>]*>([^<]+)</i)?.[1]?.trim() ?? ''
    if (id) output.set(id, measure.includes(':') ? measure.split(':').at(-1) : measure)
  }
  return output
}

function humanizeConcept(concept) {
  return String(concept ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim()
}

function parseNumeric(value, attrs) {
  if (/nil\s*=\s*["']true/i.test(JSON.stringify(attrs))) return null
  const normalized = text(value).replace(/[,$€£¥₩\s]/g, '').replace(/^\((.+)\)$/, '-$1')
  if (!normalized || !Number.isFinite(Number(normalized))) return null
  const scale = Number(attrs.scale ?? 0)
  const sign = attrs.sign === '-' ? -1 : 1
  return Number(normalized) * Math.pow(10, Number.isFinite(scale) ? scale : 0) * sign
}

function normalizedCellText(value) {
  return decodeHtml(String(value ?? '')).replace(/\s+/g, ' ').trim()
}

function tableGrid($, table) {
  const grid = []
  $(table).find('tr').each((rowIndex, row) => {
    grid[rowIndex] ??= []
    let columnIndex = 0
    $(row).children('th,td').each((_, element) => {
      while (grid[rowIndex][columnIndex]) columnIndex += 1
      const colspan = Math.max(1, Number.parseInt($(element).attr('colspan') ?? '1', 10) || 1)
      const rowspan = Math.max(1, Number.parseInt($(element).attr('rowspan') ?? '1', 10) || 1)
      const cell = {
        text: normalizedCellText($(element).text()),
        tagName: String(element.tagName ?? element.name ?? '').toLowerCase(),
        rowIndex,
        columnIndex,
        colspan,
        rowspan,
      }
      for (let rowOffset = 0; rowOffset < rowspan; rowOffset += 1) {
        grid[rowIndex + rowOffset] ??= []
        for (let columnOffset = 0; columnOffset < colspan; columnOffset += 1) {
          grid[rowIndex + rowOffset][columnIndex + columnOffset] = cell
        }
      }
      columnIndex += colspan
    })
  })
  return grid
}

function tableNumber(value) {
  const input = normalizedCellText(value)
  if (!input || /^(?:\$|—|-|–|N\/A)$/i.test(input)) return null
  const normalized = input.replace(/[,$€£¥₩%\s]/g, '').replace(/^\((.+)\)$/, '-$1')
  if (!normalized) return null
  return Number.isFinite(Number(normalized)) ? Number(normalized) : null
}

function tableRowNumber(cell, originCells) {
  const nextCell = originCells.find((candidate) => candidate.columnIndex === cell.columnIndex + 1)
  const previousCell = originCells.find((candidate) => candidate.columnIndex === cell.columnIndex - 1)
  if (/^\([^)]*$/.test(cell.text) && nextCell?.text === ')') {
    return { value: tableNumber(`${cell.text})`), rawCellValue: `${cell.text})` }
  }
  if (previousCell?.text === '(' && nextCell?.text === ')' && tableNumber(cell.text) != null) {
    return { value: -Math.abs(tableNumber(cell.text)), rawCellValue: `(${cell.text})` }
  }
  return { value: tableNumber(cell.text), rawCellValue: cell.text }
}

function inferredUnits(value, rowText = '') {
  const input = normalizedCellText(value).toLowerCase()
  const currency = /\b(?:usd|u\.s\. dollars?)\b|\$/.test(input) || /\$/.test(rowText) ? 'USD'
    : /\b(?:eur|euros?)\b|€/.test(input) || /€/.test(rowText) ? 'EUR'
      : /\b(?:gbp|pounds? sterling)\b|£/.test(input) || /£/.test(rowText) ? 'GBP'
        : null
  const match = input.match(/(?:in|amounts? in|\$\s*in)\s+(?:(?:usd|eur|gbp|u\.s\. dollars?)\s+)?(thousands|millions|billions)|\b(?:usd|eur|gbp)\s+(thousands|millions|billions)|\$\s*\(?0{3}s?\)?|\$000s?/i)
  const scaleLabel = (match?.[1] ?? match?.[2])?.toLowerCase() ?? (/\$\s*\(?0{3}s?\)?|\$000s?/i.test(input) ? 'thousands' : null)
  const scale = scaleLabel === 'thousands' ? 1_000
    : scaleLabel === 'millions' ? 1_000_000
      : scaleLabel === 'billions' ? 1_000_000_000
        : /\b(?:actual dollars|dollars)\b/i.test(input) ? 1
          : null
  if (!currency || scale == null) return null
  return {
    currency,
    reportedScale: scale,
    reportedUnits: `${currency} ${scale === 1 ? 'dollars' : scaleLabel}`,
  }
}

function explicitDocumentUnitContext(value) {
  const text = normalizedCellText(value)
  const patterns = [
    /unless otherwise (?:noted|stated|indicated),? tables? (?:are|is) presented in (?:u\.s\. |us )?dollars in (?:thousands|millions|billions)/i,
    /unless otherwise (?:noted|stated|indicated),? (?:all )?(?:amounts|figures|financial information) (?:are|is) (?:presented )?in (?:u\.s\. |us )?dollars in (?:thousands|millions|billions)/i,
    /all dollar amounts (?:are )?(?:presented )?in (?:thousands|millions|billions),? unless otherwise (?:noted|stated|indicated)/i,
  ]
  return patterns.map((pattern) => text.match(pattern)?.[0]).find(Boolean) ?? null
}

function isoDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.toISOString().slice(0, 10)
}

function shiftDate(value, { days = 0, months = 0 } = {}) {
  const [year, month, day] = String(value).split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1 + months, day + days))
  return date.toISOString().slice(0, 10)
}

function fiscalYearEnd(company, filing) {
  const configured = String(company?.fiscalYearEnd ?? '').replace(/\D/g, '')
  if (/^\d{4}$/.test(configured)) return configured
  const report = String(filing?.reportDate ?? '')
  return /^\d{4}-\d{2}-\d{2}$/.test(report) ? report.slice(5).replace('-', '') : null
}

function fiscalYearRange(year, fye) {
  if (!/^\d{4}$/.test(String(fye ?? ''))) return null
  const month = Number(String(fye).slice(0, 2))
  const day = Number(String(fye).slice(2, 4))
  const endDate = isoDate(year, month, day)
  const priorEnd = isoDate(year - 1, month, day)
  return { startDate: shiftDate(priorEnd, { days: 1 }), endDate }
}

function fiscalQuarterRange(year, quarter, fye) {
  const annual = fiscalYearRange(year, fye)
  if (!annual || quarter < 1 || quarter > 4) return null
  const startDate = shiftDate(annual.startDate, { months: (quarter - 1) * 3 })
  const endDate = shiftDate(shiftDate(startDate, { months: 3 }), { days: -1 })
  return { startDate, endDate }
}

function parseDateHeader(value) {
  const match = normalizedCellText(value).match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(20\d{2})\b/i)
  if (!match) return null
  const month = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].indexOf(match[1].toLowerCase()) + 1
  return isoDate(Number(match[3]), month, Number(match[2]))
}

function contextualPeriodEnd(context, year) {
  const match = normalizedCellText(context).match(/\b(?:(?:three|six|nine|twelve) months|year) ended\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i)
  if (match) return parseDateHeader(`${match[1]} ${match[2]}, ${year}`)
  return null
}

function explicitHeaderCell(grid, headerRow, columnIndex, periodCellCount) {
  const direct = grid[headerRow]?.[columnIndex]
  if (direct?.text || periodCellCount < 2) return direct
  const yearPattern = /\b20\d{2}(?:A)?\b|\bQ[1-4]\b|\b[1-4]Q\b/i
  const left = grid[headerRow]?.[columnIndex - 1]
  if (left?.text && yearPattern.test(left.text)) return left
  const right = grid[headerRow]?.[columnIndex + 1]
  return right?.text && yearPattern.test(right.text) ? right : direct
}

function periodFromHeaders(headers, company, filing, context = '') {
  const labels = [...new Set(headers.map(normalizedCellText).filter(Boolean))]
  const combined = labels.join(' | ')
  const combinedPlain = labels.join(' ')
  const fye = fiscalYearEnd(company, filing)
  const quarter = combinedPlain.match(/\b(?:q([1-4])\s*['-]?\s*(20)?(\d{2})|([1-4])q\s*['-]?\s*(20)?(\d{2}))\b/i)
  if (quarter) {
    const quarterNumber = Number(quarter[1] ?? quarter[4])
    const shortYear = Number(quarter[3] ?? quarter[6])
    const fiscalYear = shortYear < 100 ? 2000 + shortYear : shortYear
    const range = fiscalQuarterRange(fiscalYear, quarterNumber, fye)
    if (!range) return null
    return {
      type: 'QUARTER',
      basis: 'FISCAL_QUARTER',
      dateAuthority: 'INFERRED',
      explicitPeriodMapping: false,
      fiscalYear,
      fiscalQuarter: quarterNumber,
      ...range,
      sourceLabel: quarter[0],
    }
  }

  const endDate = parseDateHeader(combinedPlain)
  if (endDate) {
    const duration = /three months ended/i.test(combinedPlain) ? { type: 'QUARTER', months: 3 }
      : /six months ended/i.test(combinedPlain) ? { type: 'YTD_6M', months: 6 }
        : /nine months ended/i.test(combinedPlain) ? { type: 'YTD_9M', months: 9 }
          : /(?:\bltm|trailing twelve months) ended/i.test(combinedPlain) ? { type: 'LTM', months: 12 }
            : /(?:twelve months|year) ended/i.test(combinedPlain) ? { type: 'FISCAL_YEAR', months: 12 }
              : null
    if (duration) {
      const calendarAnnual = duration.type === 'FISCAL_YEAR' && endDate.endsWith('-12-31')
      return {
        type: calendarAnnual ? 'CALENDAR_YEAR' : duration.type,
        basis: calendarAnnual ? 'CALENDAR_YEAR' : duration.type,
        dateAuthority: 'DERIVED_FROM_REPORTED_BOUNDARIES',
        explicitPeriodMapping: true,
        startEvidence: 'DERIVED_FROM_EXPLICIT_DURATION_AND_END',
        endEvidence: 'EXPLICIT_TABLE_PERIOD_LABEL',
        startDate: shiftDate(shiftDate(endDate, { days: 1 }), { months: -duration.months }),
        endDate,
        fiscalYear: Number(endDate.slice(0, 4)),
        calendarYear: calendarAnnual ? Number(endDate.slice(0, 4)) : null,
        sourceLabel: combined,
      }
    }
  }

  const explicitCalendar = combinedPlain.match(/\bCY\s*(20\d{2})\b/i)
  if (explicitCalendar) {
    const year = Number(explicitCalendar[1])
    return { type: 'CALENDAR_YEAR', basis: 'CALENDAR_YEAR', dateAuthority: 'INFERRED', explicitPeriodMapping: false,
      startDate: `${year}-01-01`, endDate: `${year}-12-31`, calendarYear: year, sourceLabel: explicitCalendar[0] }
  }
  const annual = combinedPlain.match(/(?:\bFY\s*)?\b(20\d{2})(?:A)?\b/i)
  if (!annual) return null
  const year = Number(annual[1])
  const contextualDuration = /three months ended/i.test(context) ? { type: 'QUARTER', months: 3 }
    : /six months ended/i.test(context) ? { type: 'YTD_6M', months: 6 }
      : /nine months ended/i.test(context) ? { type: 'YTD_9M', months: 9 }
        : /(?:\bltm|trailing twelve months) ended/i.test(context) ? { type: 'LTM', months: 12 }
          : /(?:twelve months|year) ended/i.test(context) ? { type: 'FISCAL_YEAR', months: 12 }
          : null
  if (contextualDuration) {
    const contextualEnd = contextualPeriodEnd(context, year)
    if (!contextualEnd) return null
    const calendarAnnual = contextualDuration.type === 'FISCAL_YEAR' && contextualEnd.endsWith('-12-31')
    return {
      type: calendarAnnual ? 'CALENDAR_YEAR' : contextualDuration.type,
      basis: calendarAnnual ? 'CALENDAR_YEAR' : contextualDuration.type,
      dateAuthority: 'DERIVED_FROM_REPORTED_BOUNDARIES',
      explicitPeriodMapping: true,
      startEvidence: 'DERIVED_FROM_EXPLICIT_DURATION_AND_END',
      endEvidence: 'EXPLICIT_TABLE_PERIOD_LABEL',
      startDate: shiftDate(shiftDate(contextualEnd, { days: 1 }), { months: -contextualDuration.months }),
      endDate: contextualEnd,
      fiscalYear: year,
      calendarYear: calendarAnnual ? year : null,
      sourceLabel: `${contextualDuration.type}:${annual[0]}`,
    }
  }
  if (fye === '1231') return { type: 'CALENDAR_YEAR', basis: 'CALENDAR_YEAR', dateAuthority: 'INFERRED', explicitPeriodMapping: false,
    startDate: `${year}-01-01`, endDate: `${year}-12-31`, calendarYear: year, fiscalYear: year, sourceLabel: annual[0] }
  const range = fiscalYearRange(year, fye)
  return range ? { type: 'FISCAL_YEAR', basis: 'FISCAL_YEAR', dateAuthority: 'INFERRED', explicitPeriodMapping: false,
    fiscalYear: year, ...range, sourceLabel: annual[0] } : null
}

function definitionFingerprint(context, rowLabels) {
  const normalized = [context, ...rowLabels]
    .join('|').toLowerCase().replace(/\d+(?:\.\d+)?/g, '#').replace(/[^a-z#]+/g, ' ').trim()
  return createHash('sha256').update(normalized).digest('hex')
}

function isCompanyAdjustedEbitdaLabel(value) {
  const label = normalizedCellText(value)
    .replace(/[\s*†‡]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return /^(?:total |consolidated )?adjusted ebitda(?:\s*\(non-gaap\))?(?:\s*\/\s*\(?loss\)?)?(?: attributable to (?:the company|[\w .&'-]+))?$/i.test(label) ||
    /^total segment adjusted ebitda (?:loss|profit)$/i.test(label)
}

function nearbyTableContext($, table) {
  const parts = []
  const caption = $(table).find('caption').first().text()
  if (caption) parts.push(caption)
  let current = $(table)
  for (let depth = 0; depth < 8 && current.length; depth += 1) {
    let cursor = current.prev()
    for (let sibling = 0; sibling < 8 && cursor.length; sibling += 1) {
      const value = normalizedCellText(cursor.text())
      if (value) parts.unshift(value)
      cursor = cursor.prev()
    }
    current = current.parent()
  }
  return normalizedCellText(parts.join(' ')).slice(-2_000)
}

function statementWideOperationScope($, table) {
  const headings = [$(table).find('caption').first().text()]
  let cursor = $(table).prev()
  for (let index = 0; index < 3 && cursor.length; index += 1) {
    const text = normalizedCellText(cursor.text())
    const headingElement = cursor.is('h1,h2,h3,h4,h5,h6') ||
      (text.length <= 200 && cursor.find('strong,b').length > 0) ||
      (text.length <= 250 && /\bsummary of cash flows from continuing operations\b/i.test(text))
    if (headingElement) headings.unshift(text)
    cursor = cursor.prev()
  }
  const heading = normalizedCellText(headings.join(' '))
  const scopedHeading = /\b(?:summary of cash flows from continuing operations|continuing\s+operations.{0,80}(?:consolidated\s+)?(?:statements?\s+of\s+(?:income|operations|cash\s+flows?)|(?:financial\s+)?results)|(?:consolidated\s+)?(?:statements?\s+of\s+(?:income|operations|cash\s+flows?)|(?:financial\s+)?results).{0,80}continuing\s+operations)\b/i
  return scopedHeading.test(heading)
    ? 'continuing operations'
    : null
}

function linkedEarningsExhibits(html, filing) {
  const $ = cheerio.load(html)
  const filingUrl = new URL(filing.filingUrl)
  const filingDirectory = filingUrl.pathname.slice(0, filingUrl.pathname.lastIndexOf('/') + 1)
  const exhibits = []
  $('a[href]').each((_, anchor) => {
    const href = $(anchor).attr('href') ?? ''
    const label = normalizedCellText($(anchor).text())
    if (!/(?:ex(?:hibit)?[-_]?99|earnings|release|results)/i.test(`${href} ${label}`) && !/^99(?:\.\d+)?$/i.test(label)) return
    let url
    try { url = new URL(href, filingUrl) } catch { return }
    if (url.hostname !== 'www.sec.gov' || !url.pathname.startsWith(filingDirectory) || !/\.html?$/i.test(url.pathname)) return
    exhibits.push({ name: url.pathname.split('/').at(-1), url: url.href, isLikelyEarningsExhibit: true })
  })
  return [...new Map(exhibits.map((exhibit) => [exhibit.url, exhibit])).values()]
}

export function extractStructuredNonGaapTableFacts({
  company,
  filing,
  html,
  sourceUrl = filing.filingUrl,
  retrievedAt = new Date().toISOString(),
  diagnostics = null,
}) {
  const $ = cheerio.load(html)
  const documentHash = createHash('sha256').update(html).digest('hex')
  const documentUnitContext = explicitDocumentUnitContext($('body').text())
  const records = []

  $('table').each((tableIndex, table) => {
    const grid = tableGrid($, table)
    const context = nearbyTableContext($, table)
    const tableText = normalizedCellText($(table).text())
    const reject = (reason, details = {}) => {
      if (!Array.isArray(diagnostics)) return
      diagnostics.push({ tableIndex, reason, sourceUrl, ...details })
    }

    const rows = grid.map((row, rowIndex) => {
      const originCells = [...new Map((row ?? []).filter(Boolean)
        .map((cell) => [`${cell.rowIndex}:${cell.columnIndex}`, cell])).values()]
      const labelCell = originCells.find((cell) => isCompanyAdjustedEbitdaLabel(cell.text))
      return { rowIndex, originCells, labelCell }
    })
    const adjustedRows = rows.filter((row) => row.labelCell)
    if (adjustedRows.length !== 1) {
      if (adjustedRows.length > 0 || /adjusted ebitda/i.test(tableText)) {
        reject('ADJUSTED_EBITDA_ROW_COUNT', { adjustedEbitdaRowCount: adjustedRows.length })
      }
      return
    }
    const rowLabels = rows.map(({ originCells }) => originCells
      .find((cell) => cell.text && tableNumber(cell.text) == null)?.text)
      .filter(Boolean)
    const combinedContext = `${context} ${tableText}`
    const adjustmentRows = rowLabels.filter((label) =>
      /^(?:add|less|deduct):?/i.test(label) ||
      /^(?:depreciation|amortization|interest|income taxes?|provision|benefit|stock-based compensation|impairment|restructuring|unrealized (?:loss|gain))/i.test(label))
    const reconciliationContext = /reconciliation/i.test(combinedContext) ||
      (rowLabels.some((label) => /^net (?:income|loss)(?: \(loss\))?/i.test(label)) && adjustmentRows.length >= 2)
    const nonGaapContext = /non-gaap|adjusted ebitda/i.test(combinedContext)
    if (!nonGaapContext || !reconciliationContext) {
      reject('RECONCILIATION_CONTEXT_MISSING', { nonGaapContext, reconciliationContext })
      return
    }
    const consolidatedSegmentTotal = /^total segment adjusted ebitda (?:loss|profit)$/i.test(normalizedCellText(adjustedRows[0]?.labelCell?.text))
    if (/\b(?:summary of reportable segments|segment results|segment adjusted ebitda|segment ebitda)\b/i.test(combinedContext) && !consolidatedSegmentTotal) {
      reject('SEGMENT_TABLE_EXCLUDED')
      return
    }

    const adjustedRow = adjustedRows[0]
    const { rowIndex, originCells, labelCell } = adjustedRow
    const unitContext = `${context} ${grid.slice(0, Math.min(rowIndex + 1, 6)).flat().map((cell) => cell?.text).join(' ')}`
    const unitMetadata = inferredUnits(unitContext, labelCell.text) ??
      (documentUnitContext ? inferredUnits(documentUnitContext, labelCell.text) : null)
    if (!unitMetadata) {
      reject('EXPLICIT_UNITS_MISSING')
      return
    }

    const numericCells = originCells
      .filter((candidate) => candidate.columnIndex > labelCell.columnIndex)
      .map((cell) => ({ cell, ...tableRowNumber(cell, originCells) }))
      .filter((item) => item.value != null)
    if (!numericCells.length) {
      reject('NUMERIC_VALUES_MISSING')
      return
    }

    const mapped = []
    for (const item of numericCells) {
      const headerLabels = []
      for (let headerRow = 0; headerRow < rowIndex; headerRow += 1) {
        const rowCells = [...new Map((grid[headerRow] ?? []).filter(Boolean)
          .map((cell) => [`${cell.rowIndex}:${cell.columnIndex}`, cell])).values()]
        const rowText = rowCells.map((cell) => cell.text).join(' ')
        const explicitPeriodRow = /\b(?:three|six|nine|twelve) months ended|\byear ended|\bCY\s*20\d{2}|\bFY\s*20\d{2}|\bQ[1-4]\b|\b[1-4]Q\b/i.test(rowText)
        const periodCellCount = rowCells.filter((cell) => /\b20\d{2}(?:A)?\b|\bQ[1-4]\b|\b[1-4]Q\b/i.test(cell.text)).length
        const headerCell = explicitHeaderCell(grid, headerRow, item.cell.columnIndex, periodCellCount)
        if (headerCell?.text && (headerCell.tagName === 'th' || explicitPeriodRow || periodCellCount >= 2)) {
          headerLabels.push(headerCell.text)
        }
      }
      const period = periodFromHeaders(headerLabels, company, filing, combinedContext)
      if (!period) {
        const explicitVarianceColumn = headerLabels.some((label) => {
          const columnHeader = normalizedCellText(label)
          return /^(?:v|var(?:iance)?|change|chg|yoy)(?:\s*%)?$/i.test(columnHeader) || columnHeader === '%'
        })
        if (explicitVarianceColumn) continue
        reject('PERIOD_MAPPING_MISSING', { columnIndex: item.cell.columnIndex, headerLabels, rawCellValue: item.rawCellValue })
        continue
      }
      mapped.push({ ...item, period })
    }

    const periodKeys = mapped.map(({ period }) => `${period.type}:${period.startDate}:${period.endDate}`)
    if (!mapped.length || new Set(periodKeys).size !== periodKeys.length) {
      reject('PERIOD_MAPPING_DUPLICATE_OR_EMPTY', { mappedPeriodCount: mapped.length, periodKeys })
      return
    }
    const fingerprint = definitionFingerprint(labelCell.text, rowLabels)
    const embeddedTableTitle = rows.slice(0, rowIndex).flatMap((row) => row.originCells)
      .map((cell) => cell.text)
      .find((text) => /adjusted ebitda|non-gaap|reconciliation/i.test(text))
    const tableTitle = embeddedTableTitle || context || null

    for (const item of mapped) {
      const { period } = item
      const normalizedValue = Math.round(item.value * unitMetadata.reportedScale * 100) / 100
      const durationDays = Math.round((new Date(`${period.endDate}T12:00:00`) - new Date(`${period.startDate}T12:00:00`)) / DAY_MS) + 1
      if (!Number.isFinite(normalizedValue) || durationDays <= 0) {
        reject('NORMALIZED_VALUE_OR_DURATION_INVALID', { normalizedValue, durationDays })
        return
      }
      const periodId = `${period.type}:${period.startDate}:${period.endDate}`
      records.push({
        id: createHash('sha256').update(`${filing.id}:${sourceUrl}:${tableIndex}:${rowIndex}:${item.cell.columnIndex}:${periodId}:${item.value}`).digest('hex'),
        issuer: company.name,
        ticker: company.ticker,
        cik: company.cik,
        metricCandidates: ['adjustedEbitda'],
        namespace: 'company-non-gaap',
        concept: 'AdjustedEBITDA',
        label: labelCell.text,
        description: 'Company-reported Adjusted EBITDA from an SEC-filed non-GAAP reconciliation table',
        value: normalizedValue,
        units: unitMetadata.currency,
        currency: unitMetadata.currency,
        reportedScale: unitMetadata.reportedScale,
        reportedUnits: unitMetadata.reportedUnits,
        rawReportedValue: item.value,
        startDate: period.startDate,
        endDate: period.endDate,
        durationDays,
        periodType: period.type,
        periodBasis: period.basis,
        period,
        fiscalYear: period.fiscalYear ?? null,
        fiscalPeriod: period.fiscalQuarter ? `Q${period.fiscalQuarter}` : period.type === 'FISCAL_YEAR' ? 'FY' : null,
        calendarYear: period.calendarYear ?? null,
        frame: period.type === 'CALENDAR_YEAR' ? `CY${period.calendarYear}` : null,
        segment: null,
        filingForm: filing.form,
        accessionNumber: filing.accessionNumber,
        filingDate: filing.filingDate,
        reportDate: filing.reportDate,
        filingUrl: sourceUrl,
        rawSourceType: 'SEC_NON_GAAP_RECONCILIATION_TABLE',
        definitionFingerprint: fingerprint,
        structuralIntegrity: {
          valid: true,
          mapping: 'EXPLICIT_TABLE_GRID',
          adjustedEbitdaRowCount: adjustedRows.length,
          numericValueCount: numericCells.length,
          mappedPeriodCount: mapped.length,
          excludedVarianceColumnCount: numericCells.length - mapped.length,
        },
        tableContext: {
          tableIndex,
          rowIndex,
          columnIndex: item.cell.columnIndex,
          tableTitle,
          rowLabel: labelCell.text,
          columnLabel: period.sourceLabel,
          rawCellValue: item.rawCellValue,
          rawReportedValue: item.value,
          reportedScale: unitMetadata.reportedScale,
          reportedUnits: unitMetadata.reportedUnits,
          rowLabels,
          reconciliationContext: true,
        },
        standardXbrl: false,
        companyExtension: true,
        restatedOrRecast: false,
        provenance: {
          sourceId: `${filing.immutableSourceId}:${sourceUrl.split('/').at(-1)}:table-${tableIndex}:row-${rowIndex}:column-${item.cell.columnIndex}`,
          sourceHash: documentHash,
          retrievedAt,
        },
      })
    }
  })
  return records
}

export function extractStructuredNonGaapSlideFacts({ company, filing, html, sourceUrl = filing.filingUrl, retrievedAt }) {
  const $ = cheerio.load(html)
  const text = normalizedCellText($('body').text())
  const records = []
  const titlePattern = /Adjusted EBITDA Reconciliation\s*\((US|USD|EUR|GBP)\s*\$?m\)/gi
  for (const titleMatch of text.matchAll(titlePattern)) {
    const start = titleMatch.index ?? 0
    const margin = text.indexOf('Adjusted EBITDA Margin', start + titleMatch[0].length)
    if (margin < 0 || margin - start > 8_000) continue
    const block = text.slice(start, margin)
    const dates = [...block.matchAll(/Quarter ended\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(20\d{2})/gi)]
      .map((match) => `${match[1]} ${match[2]}, ${match[3]}`)
    if (dates.length < 1 || dates.length > 4) continue
    const rowMatches = [...block.matchAll(/Adjusted EBITDA\s+((?:\(?-?[\d,.]+\)?\s*)+)/gi)]
    const values = rowMatches.at(-1)?.[1]?.trim().split(/\s+/).slice(0, dates.length) ?? []
    if (values.length !== dates.length || values.some((value) => tableNumber(value) == null)) continue
    const syntheticTable = `
      <p>Adjusted EBITDA Reconciliation (${titleMatch[1].toUpperCase() === 'US' ? 'USD' : titleMatch[1].toUpperCase()} millions)</p>
      <table>
        <tr><th>Metric</th>${dates.map((date) => `<th>Three months ended ${date}</th>`).join('')}</tr>
        <tr><td>Adjusted EBITDA</td>${values.map((value) => `<td>${value}</td>`).join('')}</tr>
      </table>`
    records.push(...extractStructuredNonGaapTableFacts({
      company,
      filing,
      html: syntheticTable,
      sourceUrl,
      retrievedAt,
    }).map((record) => ({
      ...record,
      description: 'Company-reported Adjusted EBITDA from an SEC-filed reconciliation slide text layer',
      tableContext: { ...record.tableContext, extractionLayout: 'SEC_FILING_SLIDE_TEXT_LAYER' },
    })))
  }
  return records
}

const STRUCTURED_FINANCIAL_METRICS = new Set([
  'revenue', 'grossProfit', 'costOfRevenue', 'ebit', 'operatingCashFlow',
  'capitalExpenditures', 'depreciationAmortization', 'depreciation', 'amortization',
])

function structuredFinancialCandidates(label) {
  const normalizedLabel = normalizedCellText(label)
    .replace(/(?:\s*(?:\(\d+\)|[*†‡]))+\s*$/g, '')
    .trim()
  return metricCandidatesForConcept('company-table', '', normalizedLabel)
    .filter((metric) => STRUCTURED_FINANCIAL_METRICS.has(metric))
}

export function extractStructuredFinancialTableFacts({
  company,
  filing,
  html,
  sourceUrl = filing.filingUrl,
  retrievedAt = new Date().toISOString(),
}) {
  const $ = cheerio.load(html)
  const documentHash = createHash('sha256').update(html).digest('hex')
  const documentUnitContext = explicitDocumentUnitContext($('body').text())
  const records = []

  $('table').each((tableIndex, table) => {
    const grid = tableGrid($, table)
    const context = nearbyTableContext($, table)
    const tableText = normalizedCellText($(table).text())
    const statementScopeEvidence = statementWideOperationScope($, table) ??
      (/\bsummary of cash flows from continuing operations\b/i.test(context) ? 'continuing operations' : null)
    if (/\b(?:segment\s+results|reportable\s+segments|by\s+segment|segment\s+(?:adjusted\s+)?ebitda|other\s+segment|geographic\s+information)/i
      .test(`${context} ${tableText}`)) return

    const rows = grid.map((row, rowIndex) => {
      const originCells = [...new Map((row ?? []).filter(Boolean)
        .map((cell) => [`${cell.rowIndex}:${cell.columnIndex}`, cell])).values()]
      const labelCell = originCells.find((cell) => cell.text && tableNumber(cell.text) == null &&
        structuredFinancialCandidates(cell.text).length > 0)
      return { rowIndex, originCells, labelCell }
    })
    const metricRows = rows.filter((row) => row.labelCell)
    if (!metricRows.length) return
    const tableMetrics = new Set(metricRows.flatMap((row) => structuredFinancialCandidates(row.labelCell.text)))

    const unitContext = `${context} ${grid.slice(0, 8).flat().map((cell) => cell?.text).join(' ')}`
    const unitMetadata = inferredUnits(unitContext) ??
      (documentUnitContext ? inferredUnits(documentUnitContext) : null)
    if (!unitMetadata) return

    for (const { rowIndex, originCells, labelCell } of metricRows) {
      const metricCandidates = structuredFinancialCandidates(labelCell.text)
      const isolatedCostAllocation = metricCandidates.includes('costOfRevenue') &&
        !tableMetrics.has('revenue') && !tableMetrics.has('grossProfit') &&
        /\b(?:share\W*based compensation|expense allocation|allocation of (?:an? )?expense|expenses? by (?:function|category)|depreciation and amortization expenses?)\b/i
          .test(tableText)
      if (isolatedCostAllocation) continue
      const numericCells = originCells
        .filter((candidate) => candidate.columnIndex > labelCell.columnIndex)
        .map((cell) => ({ cell, ...tableRowNumber(cell, originCells) }))
        .filter((item) => item.value != null)

      for (const item of numericCells) {
        const headerLabels = []
        for (let headerRow = 0; headerRow < rowIndex; headerRow += 1) {
          const rowCells = [...new Map((grid[headerRow] ?? []).filter(Boolean)
            .map((cell) => [`${cell.rowIndex}:${cell.columnIndex}`, cell])).values()]
          const rowText = rowCells.map((cell) => cell.text).join(' ')
          const explicitPeriodRow = /\b(?:three|six|nine|twelve) months ended|\byear ended|\bCY\s*20\d{2}|\bFY\s*20\d{2}|\bQ[1-4]\b|\b[1-4]Q\b/i.test(rowText)
          const periodCellCount = rowCells.filter((cell) => /\b20\d{2}(?:A)?\b|\bQ[1-4]\b|\b[1-4]Q\b/i.test(cell.text)).length
          const headerCell = explicitHeaderCell(grid, headerRow, item.cell.columnIndex, periodCellCount)
          if (headerCell?.text && (headerCell.tagName === 'th' || explicitPeriodRow || periodCellCount >= 2)) {
            headerLabels.push(headerCell.text)
          }
        }
        const period = periodFromHeaders(headerLabels, company, filing, `${context} ${tableText}`)
        if (!period) continue
        const normalizedValue = Math.round(item.value * unitMetadata.reportedScale * 100) / 100
        const durationDays = Math.round((new Date(`${period.endDate}T12:00:00`) - new Date(`${period.startDate}T12:00:00`)) / DAY_MS) + 1
        if (!Number.isFinite(normalizedValue) || durationDays <= 0) continue

        const periodId = `${period.type}:${period.startDate}:${period.endDate}`
        records.push({
          id: createHash('sha256').update(`${filing.id}:${sourceUrl}:${tableIndex}:${rowIndex}:${item.cell.columnIndex}:${periodId}:${item.value}`).digest('hex'),
          issuer: company.name,
          ticker: company.ticker,
          cik: company.cik,
          metricCandidates,
          namespace: 'company-table',
          concept: labelCell.text.replace(/[^A-Za-z0-9]+/g, ''),
          label: labelCell.text,
          description: 'Company-reported financial metric from an SEC-filed financial table',
          value: normalizedValue,
          units: unitMetadata.currency,
          currency: unitMetadata.currency,
          reportedScale: unitMetadata.reportedScale,
          reportedUnits: unitMetadata.reportedUnits,
          rawReportedValue: item.value,
          startDate: period.startDate,
          endDate: period.endDate,
          durationDays,
          periodType: period.type,
          periodBasis: period.basis,
          dateAuthority: period.dateAuthority ?? 'INFERRED',
          explicitPeriodMapping: period.explicitPeriodMapping === true,
          startEvidence: period.startEvidence ?? null,
          endEvidence: period.endEvidence ?? null,
          period,
          fiscalYear: period.fiscalYear ?? null,
          fiscalPeriod: period.fiscalQuarter ? `Q${period.fiscalQuarter}` : period.type === 'FISCAL_YEAR' ? 'FY' : null,
          calendarYear: period.calendarYear ?? null,
          frame: period.type === 'CALENDAR_YEAR' ? `CY${period.calendarYear}` : null,
          segment: null,
          filingForm: filing.form,
          accessionNumber: filing.accessionNumber,
          filingDate: filing.filingDate,
          reportDate: filing.reportDate,
          filingUrl: sourceUrl,
          rawSourceType: 'SEC_STRUCTURED_FINANCIAL_TABLE',
          tableContext: {
            tableIndex,
            rowIndex,
            columnIndex: item.cell.columnIndex,
            tableTitle: context || null,
            statementScopeEvidence,
            rowLabel: labelCell.text,
            columnLabel: period.sourceLabel,
            rawCellValue: item.rawCellValue,
            rawReportedValue: item.value,
            reportedScale: unitMetadata.reportedScale,
            reportedUnits: unitMetadata.reportedUnits,
          },
          standardXbrl: false,
          companyExtension: true,
          restatedOrRecast: false,
          provenance: {
            sourceId: `${filing.immutableSourceId}:${sourceUrl.split('/').at(-1)}:table-${tableIndex}:row-${rowIndex}:column-${item.cell.columnIndex}`,
            sourceHash: documentHash,
            retrievedAt,
          },
        })
      }
    }
  })
  return records
}

export function extractInlineXbrlFacts({ company, filing, html, retrievedAt = new Date().toISOString() }) {
  const contextMap = contexts(html)
  const unitMap = units(html)
  const documentHash = createHash('sha256').update(html).digest('hex')
  const records = []
  for (const match of html.matchAll(/<ix:nonfraction\b([^>]*)>([\s\S]*?)<\/ix:nonfraction>/gi)) {
    const attrs = attributes(match[1])
    const qualifiedName = attrs.name ?? ''
    const context = contextMap.get(attrs.contextref)
    if (!qualifiedName || !context?.startDate || !context?.endDate) continue
    const [namespace = 'extension', concept = qualifiedName] = qualifiedName.includes(':')
      ? qualifiedName.split(':', 2)
      : ['extension', qualifiedName]
    const label = humanizeConcept(concept)
    const metricCandidates = metricCandidatesForConcept(namespace, concept, label)
    if (!metricCandidates.length) continue
    const value = parseNumeric(match[2], attrs)
    const unit = unitMap.get(attrs.unitref) ?? attrs.unitref ?? null
    if (!Number.isFinite(value) || !/^[A-Z]{3}$/.test(String(unit ?? ''))) continue
    const start = new Date(`${context.startDate}T12:00:00`)
    const end = new Date(`${context.endDate}T12:00:00`)
    const durationDays = Math.round((end - start) / DAY_MS) + 1
    if (durationDays < 45 || durationDays > 400) continue
    records.push({
      id: createHash('sha256').update(`${filing.id}:${qualifiedName}:${attrs.contextref}:${value}`).digest('hex'),
      issuer: company.name,
      ticker: company.ticker,
      cik: company.cik,
      metricCandidates,
      namespace,
      concept,
      label,
      description: null,
      value,
      units: unit,
      currency: unit,
      startDate: context.startDate,
      endDate: context.endDate,
      durationDays,
      fiscalYear: null,
      fiscalPeriod: null,
      frame: null,
      segment: context.segment,
      filingForm: filing.form,
      accessionNumber: filing.accessionNumber,
      filingDate: filing.filingDate,
      reportDate: filing.reportDate,
      filingUrl: filing.filingUrl,
      rawSourceType: 'SEC_INLINE_XBRL',
      tableContext: attrs.contextref,
      standardXbrl: namespace === 'us-gaap' || namespace === 'ifrs-full',
      companyExtension: namespace !== 'us-gaap' && namespace !== 'ifrs-full' && namespace !== 'dei',
      restatedOrRecast: false,
      provenance: {
        sourceId: `${filing.immutableSourceId}:${qualifiedName}:${attrs.contextref}`,
        sourceHash: documentHash,
        retrievedAt,
      },
    })
  }
  return records
}

export function extractXbrlInstanceFacts({ company, filing, xml, sourceUrl, retrievedAt = new Date().toISOString() }) {
  const contextMap = contexts(xml)
  const unitMap = units(xml)
  const documentHash = createHash('sha256').update(xml).digest('hex')
  const records = []
  const factPattern = /<([A-Za-z_][\w.-]*):([A-Za-z_][\w.-]*)\b([^>]*\bcontextRef\s*=\s*(?:"[^"]+"|'[^']+')[^>]*)>([\s\S]*?)<\/\1:\2>/gi
  for (const match of xml.matchAll(factPattern)) {
    const attrs = attributes(match[3])
    const context = contextMap.get(attrs.contextref)
    if (!context?.startDate || !context?.endDate || !attrs.unitref) continue
    const namespace = match[1]
    const concept = match[2]
    const label = humanizeConcept(concept)
    const metricCandidates = metricCandidatesForConcept(namespace, concept, label)
    if (!metricCandidates.length) continue
    const value = parseNumeric(match[4], attrs)
    const unit = unitMap.get(attrs.unitref) ?? attrs.unitref ?? null
    if (!Number.isFinite(value) || !/^[A-Z]{3}$/.test(String(unit ?? ''))) continue
    const start = new Date(`${context.startDate}T12:00:00`)
    const end = new Date(`${context.endDate}T12:00:00`)
    const durationDays = Math.round((end - start) / DAY_MS) + 1
    if (durationDays < 45 || durationDays > 400) continue
    records.push({
      id: createHash('sha256').update(`${filing.id}:${sourceUrl}:${namespace}:${concept}:${attrs.contextref}:${value}`).digest('hex'),
      issuer: company.name,
      ticker: company.ticker,
      cik: company.cik,
      metricCandidates,
      namespace,
      concept,
      label,
      description: null,
      value,
      units: unit,
      currency: unit,
      startDate: context.startDate,
      endDate: context.endDate,
      durationDays,
      fiscalYear: null,
      fiscalPeriod: null,
      frame: null,
      segment: context.segment,
      filingForm: filing.form,
      accessionNumber: filing.accessionNumber,
      filingDate: filing.filingDate,
      reportDate: filing.reportDate,
      filingUrl: sourceUrl,
      rawSourceType: 'SEC_XBRL_INSTANCE',
      tableContext: attrs.contextref,
      standardXbrl: namespace === 'us-gaap' || namespace === 'ifrs-full',
      companyExtension: namespace !== 'us-gaap' && namespace !== 'ifrs-full' && namespace !== 'dei',
      restatedOrRecast: false,
      provenance: {
        sourceId: `${filing.immutableSourceId}:${sourceUrl.split('/').at(-1)}:${namespace}:${concept}:${attrs.contextref}`,
        sourceHash: documentHash,
        retrievedAt,
      },
    })
  }
  return records
}

function likelyXbrlInstance(exhibit) {
  if (!exhibit?.url || !/\.xml$/i.test(exhibit.name)) return false
  return !/(?:_cal|_def|_lab|_pre|filingsummary|metalinks|report|r\d+)\.xml$/i.test(exhibit.name)
}

export function selectSupplementalFilings({ filingIndex, years, maxFilings = 20 }) {
  const minimumYear = Math.min(...years) - 1
  const eligible = (filingIndex?.filings ?? [])
    .filter((filing) => DOCUMENT_FORMS.has(filing.form) && filing.filingUrl)
    .filter((filing) => Number(String(filing.reportDate || filing.filingDate).slice(0, 4)) >= minimumYear)
    .sort((left, right) => String(right.filingDate ?? '').localeCompare(String(left.filingDate ?? '')) ||
      String(right.accessionNumber ?? '').localeCompare(String(left.accessionNumber ?? '')))
  const annualForms = new Set(['10-K', '10-K/A', '20-F', '20-F/A', '40-F', '40-F/A', 'S-1', 'S-1/A', 'F-1', 'F-1/A', '10', '10/A', '10-12B', '10-12B/A'])
  const annual = eligible.filter((filing) => annualForms.has(filing.form)).slice(0, Math.min(4, maxFilings))
  const latestQuarterlies = eligible.filter((filing) => ['10-Q', '10-Q/A'].includes(filing.form)).slice(0, 4)
  const allCurrentReports = eligible.filter((filing) => ['8-K', '8-K/A', '6-K'].includes(filing.form))
  const issuerAccessionPrefix = String(filingIndex?.company?.cik ?? '').padStart(10, '0')
  const quarterlyCompanions = latestQuarterlies.flatMap((quarterly) => allCurrentReports
    .filter((filing) => {
      const filingTime = new Date(`${filing.filingDate}T12:00:00`).getTime()
      const quarterlyTime = new Date(`${quarterly.filingDate}T12:00:00`).getTime()
      return Number.isFinite(filingTime) && Number.isFinite(quarterlyTime) &&
        Math.abs(filingTime - quarterlyTime) <= 2 * DAY_MS
    })
    .sort((left, right) => {
      const companyFiledLeft = String(left.accessionNumber ?? '').startsWith(issuerAccessionPrefix) ? 0 : 1
      const companyFiledRight = String(right.accessionNumber ?? '').startsWith(issuerAccessionPrefix) ? 0 : 1
      return companyFiledLeft - companyFiledRight || String(right.filingDate).localeCompare(String(left.filingDate))
    })
    .slice(0, 2))
  const latestCurrentReports = allCurrentReports.slice(0, 6)
  const companionBuckets = annual.map((annualFiling) => allCurrentReports
    .filter((filing) => filing.filingDate > annualFiling.reportDate && filing.filingDate <= annualFiling.filingDate)
    .sort((left, right) => {
      const annualTime = new Date(`${annualFiling.filingDate}T12:00:00Z`).getTime()
      const leftDistance = Math.abs(annualTime - new Date(`${left.filingDate}T12:00:00Z`).getTime())
      const rightDistance = Math.abs(annualTime - new Date(`${right.filingDate}T12:00:00Z`).getTime())
      return leftDistance - rightDistance || String(right.filingDate).localeCompare(String(left.filingDate)) ||
        String(right.accessionNumber).localeCompare(String(left.accessionNumber))
    })
    .slice(0, 4))
  const annualEarningsBuckets = years.map((year) => allCurrentReports.filter((filing) => {
    const filingDate = String(filing.filingDate ?? '')
    return filingDate >= `${year + 1}-01-01` && filingDate <= `${year + 1}-03-31`
  }).slice(0, 2))
  const annualEarningsReports = []
  for (let rank = 0; rank < 4; rank += 1) {
    for (const bucket of companionBuckets) if (bucket[rank]) annualEarningsReports.push(bucket[rank])
  }
  for (let rank = 0; rank < 2; rank += 1) {
    for (const bucket of annualEarningsBuckets) if (bucket[rank]) annualEarningsReports.push(bucket[rank])
  }
  const selectedCurrentReports = [...new Map(annualEarningsReports
    .map((filing) => [filing.accessionNumber, filing])).values()]
    .slice(0, Math.max(0, maxFilings - annual.length))
  const selectedAccessions = new Set([...annual, ...selectedCurrentReports].map((filing) => filing.accessionNumber))
  const currentReports = [
    ...selectedCurrentReports,
    ...allCurrentReports.filter((filing) => !selectedAccessions.has(filing.accessionNumber)),
  ].slice(0, Math.max(0, maxFilings - annual.length))
  currentReports.forEach((filing) => selectedAccessions.add(filing.accessionNumber))
  return [...new Map([
    ...latestQuarterlies,
    ...quarterlyCompanions,
    ...latestCurrentReports,
    ...annual,
    ...currentReports,
    ...eligible,
  ].map((filing) => [filing.accessionNumber, filing])).values()].slice(0, maxFilings)
}

export async function loadSupplementalFilingFacts({ company, filingIndex, years, maxFilings = 20, signal }) {
  const sourceCompany = {
    ...company,
    fiscalYearEnd: filingIndex?.company?.fiscalYearEnd ?? company?.fiscalYearEnd ?? null,
  }
  const candidates = selectSupplementalFilings({ filingIndex, years, maxFilings })
  const records = []
  const errors = []
  for (const filing of candidates) {
    signal?.throwIfAborted()
    try {
      const html = await fetchSecText(filing.filingUrl, { signal })
      records.push(...extractInlineXbrlFacts({ company: sourceCompany, filing, html }))
      records.push(...extractStructuredFinancialTableFacts({ company: sourceCompany, filing, html }))
      const hydrated = await hydrateFilingExhibits(filing, { signal })
      records.push(...extractStructuredNonGaapTableFacts({ company: sourceCompany, filing, html }))
      records.push(...extractStructuredNonGaapSlideFacts({ company: sourceCompany, filing, html }))
      const linked = linkedEarningsExhibits(html, filing)
      const exhibits = [...new Map([...hydrated.exhibits, ...linked].map((item) => [item.url, item])).values()]
      for (const exhibit of exhibits.filter((item) => item.isLikelyEarningsExhibit && /\.html?$/i.test(item.name)).slice(0, 4)) {
        signal?.throwIfAborted()
        const exhibitHtml = await fetchSecText(exhibit.url, { signal })
        records.push(...extractStructuredFinancialTableFacts({ company: sourceCompany, filing, html: exhibitHtml, sourceUrl: exhibit.url }))
        records.push(...extractStructuredNonGaapTableFacts({ company: sourceCompany, filing, html: exhibitHtml, sourceUrl: exhibit.url }))
        records.push(...extractStructuredNonGaapSlideFacts({ company: sourceCompany, filing, html: exhibitHtml, sourceUrl: exhibit.url }))
      }
      const instanceDocuments = hydrated.exhibits.filter(likelyXbrlInstance).slice(0, 2)
      for (const instance of instanceDocuments) {
        signal?.throwIfAborted()
        const xml = await fetchSecText(instance.url, { signal })
        records.push(...extractXbrlInstanceFacts({ company: sourceCompany, filing, xml, sourceUrl: instance.url }))
      }
    } catch (error) {
      if (signal?.aborted) throw error
      errors.push({ accessionNumber: filing.accessionNumber, error: error.message })
    }
  }
  return { records, errors, filingsExamined: candidates.length }
}
