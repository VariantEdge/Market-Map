import { createSupabaseClient, getPrice, parseTickers } from './marketData.js'

export default async function handler(req, res) {
  const tickers = parseTickers(req.query.tickers)

  if (!tickers.length) {
    res.status(400).json({ error: 'Missing ?tickers= parameter' })
    return
  }

  try {
    const supabase = createSupabaseClient()
    const results = await Promise.allSettled(
      tickers.map((ticker) => getPrice(supabase, ticker)),
    )
    const prices = results.map((result, i) =>
      result.status === 'fulfilled'
        ? result.value
        : {
            ticker: tickers[i],
            price: null,
            currency: null,
            error: result.reason?.message,
          },
    )

    res.status(200).json({ prices })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
