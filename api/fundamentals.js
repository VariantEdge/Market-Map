import { fetchYahooFundamentals, fetchYahooPrice } from './marketData.js'

export default async function handler(req, res) {
  const ticker = String(req.query.ticker ?? '').trim()

  if (!ticker) {
    res.status(400).json({ error: 'Missing ?ticker= parameter' })
    return
  }

  try {
    const price = await fetchYahooPrice(ticker)
    const fundamentals = await fetchYahooFundamentals(ticker, price.currency)
    res.status(200).json(fundamentals)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
