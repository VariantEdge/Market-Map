# Market Map

Standalone Vite/React application for public-company market maps, ticker research, market data, earnings commentary, and local company chat.

## Setup

1. Copy `.env.example` to `.env.local` and configure the existing Supabase URL and anon key.
2. Run `npm install`.
3. Run `npm run dev`.

The application reads only the existing `prices` and `price_history` Supabase tables. Local Ollama and SearXNG are optional and are used only by company chat and earnings commentary when enabled.
