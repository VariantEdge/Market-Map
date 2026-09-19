import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractStructuredFinancialTableFacts,
  extractStructuredNonGaapTableFacts,
  extractStructuredNonGaapSlideFacts,
  selectSupplementalFilings,
} from '../server/valuation/filingFactExtractor.js'
import {
  adjustedEbitdaDenominatorIdentity,
  ADJUSTED_EBITDA_PERIOD,
  assertCanonicalAdjustedEbitdaEntry,
  buildCanonicalAdjustedEbitda,
} from '../server/valuation/adjustedEbitdaEngine.js'
import { buildRowAudit, VALIDATION_STATUS } from '../server/valuation/validation.js'
import { hasUsableAuditRecords } from '../server/valuation/auditSnapshot.js'

const company = { name: 'Fixture Co', ticker: 'FIX', cik: '0000000001', fiscalYearEnd: '1231' }
const filing = {
  id: 'fixture', immutableSourceId: 'SEC:fixture', form: '8-K', accessionNumber: '0000000001-26-000001',
  filingDate: '2026-02-01', reportDate: '2025-12-31', filingUrl: 'https://www.sec.gov/Archives/fixture.htm',
}

function extract(table) {
  return extractStructuredNonGaapTableFacts({ company, filing, html: `<p>Non-GAAP reconciliation</p>${table}` })
}

test('fails closed when units are unknown', () => {
  const facts = extract('<table><tr><th>Metric</th><th>2025</th></tr><tr><td>Adjusted EBITDA</td><td>100</td></tr></table>')
  assert.deepEqual(facts, [])
})

test('fails closed when multiple Adjusted EBITDA rows are ambiguous', () => {
  const facts = extract('<p>($ in millions)</p><table><tr><th>Metric</th><th>2025</th></tr><tr><td>Adjusted EBITDA</td><td>$100</td></tr><tr><td>Adjusted EBITDA</td><td>$90</td></tr></table>')
  assert.deepEqual(facts, [])
})

test('fails closed when a numeric value has no explicit period mapping', () => {
  const facts = extract('<p>($ in millions)</p><table><tr><td>Metric</td><td>Value</td></tr><tr><td>Adjusted EBITDA</td><td>$100</td></tr></table>')
  assert.deepEqual(facts, [])
})

test('parentheses remain negative through unit normalization', () => {
  const facts = extract('<p>($ in millions)</p><table><tr><th>Metric</th><th>2025</th></tr><tr><td>Adjusted EBITDA</td><td>$(64.9)</td></tr></table>')
  assert.equal(facts[0].value, -64_900_000)
})

test('bare year columns in a quarterly earnings table remain quarters, never calendar years', () => {
  const quarterlyFiling = { ...filing, reportDate: '2026-03-31' }
  const html = `
    <p>Non-GAAP reconciliation for the three months ended March 31</p>
    <p>($ in millions)</p>
    <table>
      <tr><th>Metric</th><th>2026</th><th>2025</th></tr>
      <tr><td>Adjusted EBITDA</td><td>$266</td><td>$115</td></tr>
    </table>`
  const facts = extractStructuredNonGaapTableFacts({ company, filing: quarterlyFiling, html })
  assert.deepEqual(facts.map((fact) => [fact.periodType, fact.startDate, fact.endDate]), [
    ['QUARTER', '2026-01-01', '2026-03-31'],
    ['QUARTER', '2025-01-01', '2025-03-31'],
  ])
})

test('annual selection preserves the most precise contemporaneous SEC disclosure', () => {
  const htmlThousands = '<p>Non-GAAP reconciliation ($ in thousands)</p><table><tr><th>Metric</th><th>2024</th></tr><tr><td>Adjusted EBITDA</td><td>$1,219,258</td></tr></table>'
  const htmlMillions = '<p>Non-GAAP reconciliation ($ in millions)</p><table><tr><th>Metric</th><th>2024</th></tr><tr><td>Adjusted EBITDA</td><td>$1,219</td></tr></table>'
  const exact = extractStructuredNonGaapTableFacts({ company, filing: { ...filing, filingDate: '2025-03-03' }, html: htmlThousands })
  const rounded = extractStructuredNonGaapTableFacts({ company, filing: { ...filing, accessionNumber: 'later', filingDate: '2026-02-20' }, html: htmlMillions })
  const engine = buildCanonicalAdjustedEbitda({ company, rawLedger: [...exact, ...rounded], years: [2024] })
  assert.equal(engine.calendarActuals[2024].value, 1_219_258_000)
  assert.equal(engine.calendarActuals[2024].components[0].reportedScale, 1_000)
})

test('failed ingestion records are not accepted as an audited snapshot', () => {
  const failed = [{ ticker: 'FIX', formula: 'ingestion-failed', failureReason: 'Source ingestion failure' }]
  const usable = [{ ticker: 'FIX', formula: 'COMPANY_REPORTED_ADJ_EBITDA', displayedValue: 100 }]
  assert.equal(hasUsableAuditRecords(failed, 'FIX'), false)
  assert.equal(hasUsableAuditRecords(usable, 'FIX'), true)
})

test('accepts only the consolidated total row from a reportable-segments reconciliation', () => {
  const html = `
    <p>Summary of reportable segments reconciliation ($ in millions)</p>
    <table>
      <tr><th>Metric</th><th>2025</th></tr>
      <tr><td>Europe segment adjusted EBITDA loss</td><td>$(20)</td></tr>
      <tr><td>Total segment adjusted EBITDA loss</td><td>$(64.9)</td></tr>
    </table>`
  const facts = extractStructuredNonGaapTableFacts({ company, filing, html })
  assert.equal(facts.length, 1)
  assert.equal(facts[0].value, -64_900_000)
  assert.equal(facts[0].tableContext.rowLabel, 'Total segment adjusted EBITDA loss')
})

test('extracts dated Adjusted EBITDA rows from an SEC reconciliation slide text layer', () => {
  const html = `<html><body><div>Adjusted EBITDA Reconciliation (USD$m)
    Quarter ended September 30, 2025 Quarter ended June 30, 2025
    Net income (loss) 384.6 176.9 Depreciation and amortization 85.2 63.8
    Adjusted EBITDA 91.7 121.9 Adjusted EBITDA Margin 38% 65%</div></body></html>`
  const facts = extractStructuredNonGaapSlideFacts({ company, filing, html })
  assert.deepEqual(facts.map((fact) => [fact.periodType, fact.endDate, fact.value]), [
    ['QUARTER', '2025-09-30', 91_700_000],
    ['QUARTER', '2025-06-30', 121_900_000],
  ])
  assert.ok(facts.every((fact) => fact.tableContext.extractionLayout === 'SEC_FILING_SLIDE_TEXT_LAYER'))
})

test('uses an explicit document-level unit convention for a structurally reconciled table', () => {
  const html = `
    <p>Unless otherwise noted, tables are presented in U.S. dollars in millions.</p>
    <table>
      <tr><th colspan="3">Adjusted EBITDA and Adjusted EBITDA Margin (Non-GAAP)</th></tr>
      <tr><th>Metric</th><th>2025</th><th>2024</th><th>V%</th><th>2023</th></tr>
      <tr><td>Net income (loss) (GAAP)</td><td>$4,879</td><td>$1,559</td><td>F</td><td>$(474)</td></tr>
      <tr><td>Add: Restructuring charges</td><td>277</td><td>426</td><td></td><td>433</td></tr>
      <tr><td>Add: Depreciation and amortization</td><td>847</td><td>1,008</td><td></td><td>847</td></tr>
      <tr><td>Adjusted EBITDA (Non-GAAP)</td><td>$3,196</td><td>$2,035</td><td>57%</td><td>$807</td></tr>
    </table>`
  const facts = extractStructuredNonGaapTableFacts({ company, filing, html })
  assert.deepEqual(facts.map((fact) => fact.value), [3_196_000_000, 2_035_000_000, 807_000_000])
  assert.ok(facts.every((fact) => fact.reportedUnits === 'USD millions'))
  assert.ok(facts.every((fact) => /Adjusted EBITDA and Adjusted EBITDA Margin/i.test(fact.tableContext.tableTitle)))
  assert.ok(facts.every((fact) => fact.structuralIntegrity.excludedVarianceColumnCount === 1))
})

test('normalizes explicitly reported USD billions once', () => {
  const facts = extract('<p>($ in billions)</p><table><tr><th>Metric</th><th>2025</th></tr><tr><td>Adjusted EBITDA</td><td>$1.25</td></tr></table>')
  assert.equal(facts[0].value, 1_250_000_000)
  assert.equal(facts[0].reportedScale, 1_000_000_000)
})

test('parses split accounting parentheses and excludes an explicitly labeled absolute change column', () => {
  const html = `
    <p>Unless otherwise noted, tables are presented in U.S. dollars in millions.</p>
    <table>
      <tr><th>Metric</th><th colspan="2">2024</th><th colspan="2">2025</th><th colspan="2">Change</th></tr>
      <tr><td>Net income (loss) (GAAP)</td><td>(100</td><td>)</td><td>(80</td><td>)</td><td>20</td><td>%</td></tr>
      <tr><td>Add: Depreciation and amortization</td><td>20</td><td></td><td>30</td><td></td><td>50</td><td>%</td></tr>
      <tr><td>Add: Share-based compensation</td><td>16.1</td><td></td><td>35</td><td></td><td>118</td><td>%</td></tr>
      <tr><td>Adjusted EBITDA / (loss)</td><td>(63.9</td><td>)</td><td>15.0</td><td></td><td>-123</td><td>%</td></tr>
    </table>`
  const facts = extractStructuredNonGaapTableFacts({ company, filing, html })
  assert.deepEqual(facts.map((fact) => fact.value), [-63_900_000, 15_000_000])
  assert.deepEqual(facts.map((fact) => fact.tableContext.rawCellValue), ['(63.9)', '15.0'])
  assert.ok(facts.every((fact) => fact.structuralIntegrity.excludedVarianceColumnCount === 1))
})

test('annual companion selection retains a foreign issuer earnings release inside the filing cap', () => {
  const filing = (form, filingDate, reportDate, accessionNumber) => ({
    form, filingDate, reportDate, accessionNumber,
    filingUrl: `https://www.sec.gov/Archives/${accessionNumber}`,
  })
  const filings = [
    filing('20-F', '2026-04-30', '2025-12-31', 'annual-2025'),
    filing('20-F', '2025-04-30', '2024-12-31', 'annual-2024'),
    filing('20-F', '2024-04-30', '2023-12-31', 'annual-2023'),
    filing('20-F', '2023-04-30', '2022-12-31', 'annual-2022'),
    filing('6-K', '2026-02-10', '2026-02-10', 'current-a'),
    filing('6-K', '2026-02-12', '2026-02-12', 'current-c'),
    filing('6-K', '2026-02-12', '2026-02-12', 'current-b'),
    filing('6-K', '2026-03-11', '2026-03-11', 'current-d'),
    filing('6-K', '2025-02-11', '2025-02-11', 'prior-a'),
    filing('6-K', '2025-02-13', '2025-02-13', 'prior-b'),
    filing('6-K', '2024-02-14', '2024-02-14', 'older-a'),
    filing('6-K', '2024-02-15', '2024-02-15', 'older-b'),
  ]
  const selected = selectSupplementalFilings({ filingIndex: { filings }, years: [2023, 2024, 2025], maxFilings: 12 })
  assert.equal(selected.length, 12)
  assert.ok(selected.some((item) => item.accessionNumber === 'current-b'))
})

test('supplemental selection always retains the latest reported quarter inside the filing cap', () => {
  const filing = (form, filingDate, reportDate, accessionNumber) => ({
    form, filingDate, reportDate, accessionNumber,
    filingUrl: `https://www.sec.gov/Archives/${accessionNumber}`,
  })
  const filings = [
    filing('10-Q', '2026-07-28', '2026-06-30', 'latest-quarter'),
    ...Array.from({ length: 4 }, (_, index) => filing('10-K', `202${5 - index}-02-01`, `202${4 - index}-12-31`, `annual-${index}`)),
    ...Array.from({ length: 12 }, (_, index) => filing('8-K', `2026-0${Math.min(index + 1, 9)}-15`, `2026-0${Math.min(index + 1, 9)}-15`, `current-${index}`)),
  ]
  const selected = selectSupplementalFilings({ filingIndex: { filings }, years: [2023, 2024, 2025], maxFilings: 12 })
  assert.ok(selected.some((item) => item.accessionNumber === 'latest-quarter'))
})

test('maps an explicit year in an adjacent header cell across SEC spacer columns', () => {
  const facts = extract(`<p>($ in millions)</p><table>
    <tr><th></th><th colspan="3">Three months ended July 31,</th><th></th><th colspan="4">Nine months ended July 31,</th></tr>
    <tr><th></th><th>2026</th><th></th><th>2025</th><th></th><th>2026</th><th colspan="2"></th><th>2025</th></tr>
    <tr><td>Net loss</td><td>(10)</td><td></td><td>(11)</td><td></td><td>(20)</td><td></td><td>(21)</td></tr>
    <tr><td>Depreciation</td><td>1</td><td></td><td>1</td><td></td><td>2</td><td></td><td>2</td></tr>
    <tr><td>Stock-based compensation</td><td>1</td><td></td><td>1</td><td></td><td>2</td><td></td><td>2</td></tr>
    <tr><td>Adjusted EBITDA</td><td>(8)</td><td></td><td>(9)</td><td></td><td>(16)</td><td></td><td>(17)</td></tr>
  </table>`)
  assert.deepEqual(facts.map((fact) => [fact.periodType, fact.endDate, fact.value]), [
    ['QUARTER', '2026-07-31', -8_000_000],
    ['QUARTER', '2025-07-31', -9_000_000],
    ['YTD_9M', '2026-07-31', -16_000_000],
    ['YTD_9M', '2025-07-31', -17_000_000],
  ])
})

test('contextual comparative year uses the period end matching the filing report date', () => {
  const quarterlyFiling = { ...filing, reportDate: '2026-06-30' }
  const html = `<p>Prior annual discussion: year ended December 31.</p>
    <p>Results for the three months ended June 30.</p>
    <p>($ in millions)</p><table>
      <tr><th>Metric</th><th>2026</th><th>2025</th></tr>
      <tr><td>Net income</td><td>10</td><td>8</td></tr>
      <tr><td>Depreciation and amortization</td><td>2</td><td>2</td></tr>
      <tr><td>Interest expense</td><td>1</td><td>1</td></tr>
      <tr><td>Income tax expense</td><td>1</td><td>1</td></tr>
      <tr><td>Stock-based compensation</td><td>1</td><td>1</td></tr>
      <tr><td>Adjusted EBITDA</td><td>15</td><td>13</td></tr>
    </table>`
  const facts = extractStructuredNonGaapTableFacts({ company, filing: quarterlyFiling, html })
  assert.deepEqual(facts.map((item) => item.endDate), ['2026-06-30', '2025-06-30'])
  assert.ok(facts.every((item) => item.periodType === 'QUARTER'))
})

test('accepts a structurally complete reconciliation whose adjustment rows omit Add or Less prefixes', () => {
  const quarterlyFiling = { ...filing, reportDate: '2026-04-30' }
  const html = `<p>Non-GAAP measures ($ in thousands)</p><table>
    <tr><th>Metric</th><th colspan="2">Three Months Ended April 30</th><th colspan="2">Six Months Ended April 30</th></tr>
    <tr><th></th><th>2026</th><th>2025</th><th>2026</th><th>2025</th></tr>
    <tr><td>Net loss</td><td>(77,629)</td><td>(37,749)</td><td>(103,680)</td><td>(70,135)</td></tr>
    <tr><td>Depreciation and amortization</td><td>10,842</td><td>10,890</td><td>21,360</td><td>20,836</td></tr>
    <tr><td>Interest expense</td><td>2,859</td><td>2,548</td><td>5,617</td><td>5,155</td></tr>
    <tr><td>Stock-based compensation expense</td><td>2,628</td><td>4,824</td><td>5,020</td><td>6,966</td></tr>
    <tr><td>Adjusted EBITDA</td><td>(17,056)</td><td>(19,310)</td><td>(34,086)</td><td>(40,383)</td></tr>
  </table>`
  const facts = extractStructuredNonGaapTableFacts({ company, filing: quarterlyFiling, html })
  assert.deepEqual(facts.map((fact) => [fact.value, fact.periodType, fact.startDate, fact.endDate]), [
    [-17_056_000, 'QUARTER', '2026-02-01', '2026-04-30'],
    [-19_310_000, 'QUARTER', '2025-02-01', '2025-04-30'],
    [-34_086_000, 'YTD_6M', '2025-11-01', '2026-04-30'],
    [-40_383_000, 'YTD_6M', '2024-11-01', '2025-04-30'],
  ])
})

test('annual companion selection prioritizes the current report closest to the annual filing date', () => {
  const filing = (form, filingDate, reportDate, accessionNumber) => ({
    form, filingDate, reportDate, accessionNumber,
    filingUrl: `https://www.sec.gov/Archives/${accessionNumber}`,
  })
  const filings = [
    filing('10-K', '2025-12-18', '2025-10-31', 'annual-2025'),
    ...Array.from({ length: 8 }, (_, index) => filing('8-K', `2025-11-${String(index + 1).padStart(2, '0')}`,
      `2025-11-${String(index + 1).padStart(2, '0')}`, `older-${index}`)),
    filing('8-K', '2025-12-18', '2025-10-31', 'same-day-earnings'),
  ]
  const selected = selectSupplementalFilings({
    filingIndex: { company: { cik: '0000886128' }, filings }, years: [2025], maxFilings: 5,
  })
  assert.ok(selected.some((item) => item.accessionNumber === 'same-day-earnings'))
})

test('extracts reported revenue quarters and YTD values from a foreign issuer SEC earnings table', () => {
  const html = `
    <p>Unaudited Condensed Consolidated Statements of Operations</p>
    <p>(in millions of U.S. dollars)</p>
    <table>
      <tr><th></th><th colspan="2">Three months ended June 30</th><th colspan="2">Six months ended June 30</th></tr>
      <tr><th></th><th>2025</th><th>2026</th><th>2025</th><th>2026</th></tr>
      <tr><td>Revenues</td><td>105.1</td><td>582.3</td><td>156.0</td><td>981.3</td></tr>
    </table>`
  const facts = extractStructuredFinancialTableFacts({ company, filing, html })
  assert.deepEqual(facts.map((fact) => [fact.startDate, fact.endDate, fact.value]), [
    ['2025-04-01', '2025-06-30', 105_100_000],
    ['2026-04-01', '2026-06-30', 582_300_000],
    ['2025-01-01', '2025-06-30', 156_000_000],
    ['2026-01-01', '2026-06-30', 981_300_000],
  ])
})

test('a fiscal annual cannot directly populate a calendar-year cell', () => {
  const fiscalCompany = { ...company, fiscalYearEnd: '1031' }
  const html = '<p>Non-GAAP reconciliation ($ in millions)</p><table><tr><th>Metric</th><th>2025</th></tr><tr><td>Adjusted EBITDA</td><td>$100</td></tr></table>'
  const facts = extractStructuredNonGaapTableFacts({ company: fiscalCompany, filing: { ...filing, reportDate: '2025-10-31' }, html })
  const engine = buildCanonicalAdjustedEbitda({ company: fiscalCompany, rawLedger: facts, years: [2025] })
  assert.equal(facts[0].periodType, ADJUSTED_EBITDA_PERIOD.FISCAL_YEAR)
  assert.equal(engine.calendarActuals[2025].value, null)
})

test('display invariants reject standardized methods and missing lineage', () => {
  assert.throws(() => assertCanonicalAdjustedEbitdaEntry({ value: 1, adjustedEbitdaMethod: 'STANDARDIZED_ADJ_EBITDA', components: [] }, ADJUSTED_EBITDA_PERIOD.CALENDAR_YEAR))
  assert.throws(() => assertCanonicalAdjustedEbitdaEntry({ value: 1, adjustedEbitdaMethod: 'COMPANY_REPORTED_ADJ_EBITDA', components: [] }, ADJUSTED_EBITDA_PERIOD.CALENDAR_YEAR))
})

test('EV / Adjusted EBITDA fails closed when its denominator identity differs from the displayed metric', () => {
  const entry = {
    value: 100_000_000,
    sourceType: 'SEC-filed company non-GAAP reconciliation',
    provider: 'SEC',
    exactness: 'REPORTED',
    validationStatus: 'VERIFIED_REPORTED',
    method: 'COMPANY_REPORTED_ADJ_EBITDA',
    adjustedEbitdaMethod: 'COMPANY_REPORTED_ADJ_EBITDA',
    definitionFingerprint: 'fixture-definition',
    requestedPeriodType: 'CALENDAR_YEAR',
    sourcePeriodType: 'CALENDAR_YEAR',
    verificationBasis: 'STRUCTURAL_SEC_TABLE_CELL_PROVENANCE',
    components: [{
      sourceStart: '2025-01-01', sourceEnd: '2025-12-31', sourcePeriodType: 'CALENDAR_YEAR',
      sourceValue: 100_000_000, sourceUrl: filing.filingUrl, sourceId: 'SEC:fixture', documentHash: 'hash',
      exactCompanyMetricLabel: 'Adjusted EBITDA', accn: filing.accessionNumber, filingForm: filing.form,
      document: 'fixture.htm', sourceType: 'SEC-filed company non-GAAP reconciliation', tableTitle: 'Reconciliation',
      tableIndex: 0, rowIndex: 2, columnIndex: 1, rowLabel: 'Adjusted EBITDA', columnLabel: '2025',
      rawCellValue: '$100', rawReportedValue: 100, reportedScale: 1_000_000, reportedUnits: 'USD millions',
      normalizedValue: 100_000_000, definitionFingerprint: 'fixture-definition',
      adjustedEbitdaMethod: 'COMPANY_REPORTED_ADJ_EBITDA',
    }],
  }
  entry.denominatorIdentity = adjustedEbitdaDenominatorIdentity(entry)
  assertCanonicalAdjustedEbitdaEntry(entry, ADJUSTED_EBITDA_PERIOD.CALENDAR_YEAR)

  const row = {
    ticker: 'FIX', currency: 'USD', capital: { enterpriseValue: 1_000_000_000 },
    metrics: { revenue: { '2025A': null }, ebitda: { '2025A': entry.value } },
    multiples: { evEbitda: { '2025A': 10 } },
    provenance: { ebitda: { '2025A': entry } },
    multipleDenominatorIdentity: { evEbitda: { '2025A': 'legacy-pipeline-denominator' } },
  }
  const audit = buildRowAudit(row)
  assert.equal(audit.cells['ebitda:2025A'].status, VALIDATION_STATUS.VERIFIED_REPORTED)
  assert.equal(audit.cells['evEbitda:2025A'].status, VALIDATION_STATUS.FAILED)
  assert.match(audit.cells['evEbitda:2025A'].warnings.join(' '), /different pipeline/i)
})
