import { fetchEarningsCommentary } from './earningsCommentaryCore.js'

export default async function handler(req, res) {
  const ticker = String(req.query.ticker ?? '').trim()
  const period = String(req.query.period ?? '').trim()
  const returnAudit = String(req.query.audit ?? '') === '1'
  const localOllama = String(req.query.deterministic ?? '') === '1' ? false : undefined

  if (!ticker) {
    res.status(400).json({ error: 'Missing ?ticker= parameter' })
    return
  }

  try {
    const commentary = await fetchEarningsCommentary(ticker, {
      period,
      returnAudit,
      localOllama,
    })
    res.status(200).json(commentary)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
