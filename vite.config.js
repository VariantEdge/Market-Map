import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { createClient } from '@supabase/supabase-js'
import { fetchEarningsCommentary } from './api/earningsCommentaryCore.js'
import { handleCompanyChatRoute } from './server/http/companyChatHandlers.ts'
import {
  fetchYahooChart,
  fetchYahooFundamentals,
  fetchYahooPrice,
  getAnchorPrices,
  getPrice,
} from './api/marketData.js'

function marketMapApiPlugin(supabaseUrl, supabaseKey) {
  const supabase = createClient(supabaseUrl, supabaseKey)

  return {
    name: 'market-map-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (await handleCompanyChatRoute(req, res)) return

        if (req.url.startsWith('/api/chart')) {
          res.setHeader('Content-Type', 'application/json')
          const url = new URL(req.url, 'http://localhost')
          const ticker = url.searchParams.get('ticker')?.trim()
          const range = url.searchParams.get('range')?.trim() || '1y'
          if (!ticker) return writeError(res, 400, 'Missing ?ticker= parameter')
          try {
            res.end(JSON.stringify(await fetchYahooChart(ticker, range)))
          } catch (error) {
            writeError(res, 500, error.message)
          }
          return
        }

        if (req.url.startsWith('/api/fundamentals')) {
          res.setHeader('Content-Type', 'application/json')
          const url = new URL(req.url, 'http://localhost')
          const ticker = url.searchParams.get('ticker')?.trim()
          if (!ticker) return writeError(res, 400, 'Missing ?ticker= parameter')
          try {
            const price = await fetchYahooPrice(ticker)
            res.end(JSON.stringify(await fetchYahooFundamentals(ticker, price.currency)))
          } catch (error) {
            writeError(res, 500, error.message)
          }
          return
        }

        if (req.url.startsWith('/api/earnings-commentary')) {
          res.setHeader('Content-Type', 'application/json')
          const url = new URL(req.url, 'http://localhost')
          const ticker = url.searchParams.get('ticker')?.trim()
          if (!ticker) return writeError(res, 400, 'Missing ?ticker= parameter')
          try {
            res.end(JSON.stringify(await fetchEarningsCommentary(ticker, {
              period: url.searchParams.get('period')?.trim() ?? '',
              returnAudit: url.searchParams.get('audit') === '1',
              localOllama: url.searchParams.get('deterministic') === '1' ? false : undefined,
            })))
          } catch (error) {
            writeError(res, 500, error.message)
          }
          return
        }

        if (req.url.startsWith('/api/history')) {
          res.setHeader('Content-Type', 'application/json')
          const url = new URL(req.url, 'http://localhost')
          const tickers = parseTickers(url.searchParams.get('tickers'))
          if (!tickers.length) return writeError(res, 400, 'Missing ?tickers= parameter')
          const results = await Promise.allSettled(tickers.map((ticker) => getAnchorPrices(null, ticker)))
          const history = results.map((result, index) => result.status === 'fulfilled'
            ? result.value
            : { ticker: tickers[index], error: result.reason?.message })
          res.end(JSON.stringify({ history }))
          return
        }

        if (req.url.startsWith('/api/prices')) {
          res.setHeader('Content-Type', 'application/json')
          const url = new URL(req.url, 'http://localhost')
          const tickers = parseTickers(url.searchParams.get('tickers'))
          if (!tickers.length) return writeError(res, 400, 'Missing ?tickers= parameter')
          const results = await Promise.allSettled(tickers.map((ticker) => getPrice(supabase, ticker)))
          const prices = results.map((result, index) => result.status === 'fulfilled'
            ? result.value
            : { ticker: tickers[index], price: null, currency: null, error: result.reason?.message })
          res.end(JSON.stringify({ prices }))
          return
        }

        next()
      })
    },
  }
}

function parseTickers(value) {
  return String(value ?? '').split(',').map((ticker) => ticker.trim()).filter(Boolean)
}

function writeError(res, status, message) {
  res.statusCode = status
  res.end(JSON.stringify({ error: message }))
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  Object.assign(process.env, env)

  const supabaseUrl = env.SUPABASE_URL || 'http://127.0.0.1:54321'
  const supabaseKey = env.SUPABASE_ANON_KEY || 'development-anon-key'

  return {
    plugins: [react(), marketMapApiPlugin(supabaseUrl, supabaseKey)],
    server: { host: '127.0.0.1' },
  }
})
