import {
  getAnchorPrices,
  parseTickers,
} from './marketData.js'

export default async function handler(req, res) {
  const tickers = parseTickers(req.query.tickers)

  if (!tickers.length) {
    res.status(400).json({ error: 'Missing ?tickers= parameter' })
    return
  }

  try {
    const results = await Promise.allSettled(
      tickers.map((ticker) => getAnchorPrices(null, ticker)),
    )
    const history = results.map((result, i) =>
      result.status === 'fulfilled'
        ? result.value
        : {
            ticker: tickers[i],
            d1: null,
            m1: null,
            m3: null,
            ytd: null,
            m6: null,
            y1: null,
            m18: null,
            y2: null,
            error: result.reason?.message,
          },
    )

    res.status(200).json({ history })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
