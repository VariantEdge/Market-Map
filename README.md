# Market Map, Watchlist, and Valuation Analysis

Standalone Vite/React application containing the Market Map, Watchlist, and Valuation Analysis products. It includes the market-data, earnings, SEC-filing, and valuation services those products require, with no runtime dependency on the former Website App repository.

## Setup

1. Copy `.env.example` to `.env.local` and configure the existing Supabase URL and anon key.
2. Run `npm install`.
3. Run `npm run dev`.

Supabase provides stored prices and price history. Watchlist and valuation requests also use their existing Yahoo Finance, SEC EDGAR, and optional WiseSheets integrations. Local Ollama and SearXNG are optional and are used only by company chat and earnings commentary when enabled.
