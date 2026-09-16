import { fetchYahooChart } from './marketData.js'

export default async function handler(req, res) {
  const ticker = String(req.query.ticker ?? '').trim()
  const range = String(req.query.range ?? '1y').trim()

  if (!ticker) {
    res.status(400).json({ error: 'Missing ?ticker= parameter' })
    return
  }

  try {
    const chart = await fetchYahooChart(ticker, range)
    res.status(200).json(chart)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
