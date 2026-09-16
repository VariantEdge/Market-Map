import { fetchEarningsCommentary } from '../api/earningsCommentaryCore.js'

const ticker = String(process.argv[2] || 'COHR').toUpperCase()
const mode = String(process.argv[3] || 'all').toLowerCase()
const index = await fetchEarningsCommentary(ticker, { localOllama: false })

if (!index.available) {
  console.error(`${ticker}: ${index.error || 'earnings commentary unavailable'}`)
  process.exitCode = 1
} else {
  const periods = mode === 'latest' ? index.periods.slice(0, 1) : index.periods
  const rows = []

  for (const period of periods) {
    const result = await fetchEarningsCommentary(ticker, {
      period: period.id,
      returnAudit: true,
    })
    if (!result?.commentary || !result?.audit) {
      rows.push({
        period: period.fiscalLabel,
        passed: false,
        error: result?.error || 'Audit payload unavailable',
      })
      continue
    }
    rows.push({
      period: period.fiscalLabel,
      calendar: period.calendarLabel,
      passed: result.audit.passed,
      ...result.audit.checks,
      qna: result.commentary.qnaQuestionCount,
      topics: result.commentary.topics?.length ?? 0,
      evidenceDocuments: result.sourcePacket.evidenceDocuments.length,
      hardGuidanceItems: result.sourcePacket.hardGuidanceItems,
      missingQna: result.audit.details.missingQnaCoverage.join(','),
      missingGuidance: result.audit.details.missingGuidanceNumbers.join(','),
    })
    if (result.audit.details.missingQnaBlocks?.length) {
      console.log(JSON.stringify({
        period: period.fiscalLabel,
        missingQnaBlocks: result.audit.details.missingQnaBlocks,
      }, null, 2))
    }
  }

  console.table(rows)
  if (rows.some((row) => !row.passed)) process.exitCode = 1
}
