import {
  createSupabaseClient,
  getWatchlistMarketRows,
  parseTickers,
} from './marketData.js'

export default async function handler(req, res) {
  const tickers = parseTickers(req.query.tickers)
  const referenceDate = req.query.referenceDate
  const fullHistory = req.query.fullHistory === '1'

  if (!tickers.length) {
    res.status(400).json({ error: 'Missing ?tickers= parameter' })
    return
  }

  try {
    const rows = await getWatchlistMarketRows(
      createSupabaseClient(),
      tickers,
      referenceDate,
      fullHistory,
    )
    res.status(200).json({ rows })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
