create table if not exists public.valuation_financial_snapshots (
  ticker text primary key,
  engine_version text not null,
  actual_years integer[] not null default '{}',
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.valuation_financial_snapshots enable row level security;

-- The valuation API uses SUPABASE_SERVICE_ROLE_KEY server-side. No browser or
-- anonymous role receives direct read/write access to financial snapshots.

alter table public.valuation_financial_snapshots
  add column if not exists actual_years integer[] not null default '{}';
