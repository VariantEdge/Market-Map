# Market Map, Watchlist, and Valuation Analysis

Standalone Vite/React application containing the Market Map, Watchlist, and Valuation Analysis products. It includes the market-data, earnings, SEC-filing, and valuation services those products require, with no runtime dependency on the former Website App repository.

## Setup

1. Copy `.env.example` to `.env.local` and configure the existing Supabase URL and anon key.
2. Run `npm install`.
3. Run `npm run dev`.

Supabase provides stored prices and price history. Valuation uses Fiscal.ai as its historical provider candidate, verifies economic periods and values against SEC filings, and reads durable financial snapshots for normal page loads. Supply a server-only `FISCAL_API_KEY` from a Fiscal.ai Data API subscription for controlled refreshes; the Codex MCP connection is not a production credential. `FINANCIAL_HISTORY_PROVIDER=WISESHEETS` explicitly activates the retained rollback path. Yahoo Finance supplies market and consensus data. Local Ollama and SearXNG are optional for company chat and earnings commentary.
