import { createSupabaseClient, parseTickers } from './marketData.js'
import { getValuationRows } from './valuationData.js'

export default async function handler(req, res) {
  const tickers = parseTickers(req.query.tickers)
  if (!tickers.length) {
    res.status(400).json({ error: 'Missing ?tickers= parameter' })
    return
  }

  try {
    res.status(200).json(await getValuationRows(createSupabaseClient(), tickers))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
