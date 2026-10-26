# Fiscal.ai input preservation and replay

**Review branch:** `review/fiscalai-migration`

**Inventory:** [machine-readable completeness manifest](fiscalai-preservation-manifest.json)

**Scope:** AMZN, BE, CRWV, FCEL, GEV, GOOGL, INTC, IREN, META, MU, MSFT, NBIS.

## Preserved locally

The original ignored `.cache/fiscal-ai-mcp-2026-10-25` directory contains **12 ticker JSON files** (2,884,186 bytes). Each contains the selected standardized income statement metrics, selected standardized cash flow metrics, and Adjusted EBITDA metrics captured through the connected Fiscal.ai MCP. Six audit JSON fixtures are also retained: the October 19 WiseSheets baseline, the first October 25 Fiscal.ai audit (50 unresolved, 69 provider/SEC conflicts), the intermediate October 25 audit that was rejected for fractional calendarization, the corrected October 25 audit (73 unresolved, 36 active conflicts), and both AMZN-only and full-universe restored-fixture replays. A new, targeted **AMZN as-reported income** capture covers 2022–2026 sales, cost of sales, and Gross Profit rows (67 period records) with source citations. It was obtained to preserve inputs relevant to the unresolved AMZN Gross Profit cell. These are internal research inputs, not a complete raw provider export.

The additional private backup is at `C:\Users\Dale\AppData\Local\MarketMap\FiscalAiPreservation\2026-10-25`. It contains the 12 provider captures, targeted AMZN capture, six audit fixtures, and a copy of the manifest. The archive is outside the Git repository and OneDrive. Its access control grants Dale, SYSTEM, Administrators, and the current Codex app capability; general Codex sandbox users are excluded. All **19 data and audit files** (15,372,218 bytes) were SHA-256 verified after backup, and a restore to an ignored workspace directory passed integrity verification. Raw provider responses and audit fixtures remain excluded from public GitHub.

The manifest records every archive and source-relative path, byte size, SHA-256 hash, local capture timestamp, endpoint row counts, period ends, metric-presence counts, and observed gaps. For the original 12 files, the exact MCP retrieval timestamp was not embedded; the manifest uses local file creation time as an explicitly labeled proxy. The AMZN targeted capture includes its actual retrieval timestamp.

## Coverage and gaps

Counts below are **Annual / Quarterly / Semi-Annual / YTD / LTM** period rows. A period row or provider Adjusted EBITDA number does **not** establish an exact January–December actual or a company-defined SEC reconciliation.

| Ticker | Standardized income | Standardized cash flow | Adjusted metric | Targeted as-reported income |
| --- | --- | --- | --- | --- |
| AMZN | 4/18/9/18/18 | 4/18/9/18/18 | 4/18/9/18/18 | 67 rows, selected core metrics |
| BE | 4/19/9/19/19 | 4/19/9/19/19 | 4/19/9/19/19 | Missing |
| CRWV | 4/11/5/13/10 | 4/11/5/13/10 | 4/14/7/14/14 | Missing |
| FCEL | 4/19/9/19/19 | 4/19/9/19/19 | 4/19/9/19/19 | Missing |
| GEV | 4/14/7/15/12 | 4/14/7/15/13 | 4/16/8/16/16 | Missing |
| GOOGL | 4/18/9/18/18 | 4/18/9/18/18 | 4/18/9/18/18 | Missing |
| INTC | 4/18/9/18/18 | 4/18/9/18/18 | 4/18/9/18/18 | Missing |
| IREN | 5/18/9/18/18 | 5/16/9/17/14 | 5/18/9/18/18 | Missing |
| META | 4/19/9/19/19 | 4/19/9/19/19 | 4/19/9/19/19 | Missing |
| MU | 5/19/10/19/19 | 5/19/10/19/19 | 5/19/10/19/19 | Missing |
| MSFT | 5/18/9/18/18 | 5/18/9/18/18 | 5/18/9/18/18 | Missing |
| NBIS | 4/18/9/18/18 | 4/16/9/17/14 | 4/18/9/18/18 | Missing |

All three existing endpoint captures have at least one row of **each** period type for every ticker. The as-reported cash flow endpoint is absent for all 12; complete as-reported income statements are absent for 11, and the AMZN capture is deliberately limited to five relevant line items. No full company-defined Adjusted EBITDA reconciliation schedule was captured. The manifest enumerates individual period ends and non-null metric counts rather than assuming these endpoint-level counts prove value quality.

Specific period gaps relative to captured standardized income:

- **IREN cash flow:** quarterly 2022-09-30 and 2022-12-31; YTD 2022-09-30; LTM 2022-09-30, 2022-12-31, 2023-03-31, and 2023-09-30.
- **NBIS cash flow:** quarterly 2024-03-31 and 2024-06-30; YTD 2024-03-31; LTM 2024-03-31, 2024-06-30, 2024-09-30, and 2025-03-31.
- **FCEL, INTC, IREN, MU, MSFT:** no directly reported Annual row ending December 31 for 2023–2025 in these captures. This reflects fiscal period boundaries; an exact calendar year may still be reconstructed from compatible primary-source periods. The archive does not itself prove such a construction.

The live MCP connection currently exposes a **free-plan universe**. Targeted as-reported requests for IREN, FCEL, and MU were denied as unavailable on that plan. AMZN was permitted, and its targeted as-reported income rows were captured. No purchase or entitlement change was made. The missing as-reported inputs for the restricted tickers remain a preservation limitation, especially for the 73 unresolved cells.

For AMZN 2023, the targeted as-reported Annual response contains source-cited **Total net sales** and **Cost of sales** entries, while its provider **Gross Profit** entry is empty. Those raw inputs may support a later exact Revenue-minus-Cost construction after SEC scope and period checks. No financial value or audit status was changed in this preservation pass. The existing standardized responses also contain selected contributing as-reported mappings where Fiscal.ai supplied them; they are not full as-reported statement captures.

## Replay and restore commands

Run from the Market Map App repository in PowerShell. The restore is idempotent and refuses to replace a differing local file.

```powershell
$archive = Join-Path $env:LOCALAPPDATA 'MarketMap\FiscalAiPreservation\2026-10-25'
$manifest = Join-Path $archive 'manifest.json'
node scripts/fiscal-ai-preservation.mjs verify --archive $archive --manifest $manifest
node scripts/fiscal-ai-preservation.mjs restore --archive $archive --manifest $manifest --target .
$env:FISCAL_API_KEY = ''
npm run financials:audit -- --fiscal-fixture-dir .cache/fiscal-ai-mcp-2026-10-25
```

`--fiscal-fixture-dir` makes `scripts/financials-audit.mjs` read each ticker's local JSON before financial construction; it does not invoke `fetchFiscalAiHistorical` or the Fiscal.ai MCP. The replay commands ran with `FISCAL_API_KEY` empty. A restored-fixture AMZN replay completed **28/28 input cells**, with **zero value/status differences** from the prior full audit. Its audit intentionally failed closed on five unresolved financial cells.

The **full restored-fixture replay succeeded for all 12 tickers and 336 cells**. Every value and validation status matched the corrected October 25 audit: **127 verified reported, 129 verified derived, 7 evidenced N/As, 73 unresolved**, with 36 Fiscal.ai/SEC observation conflicts. The replay audit exited 1 because unresolved cells correctly fail validation; this is not a provider-fixture load failure. Its ignored output is `.cache/financial-audits/financial-audit-2026-10-26T04-47-29Z.json`, and a copy is held in the private archive. The comparison found **zero value/status differences across all 336 cells**.

The **full audit is not network-offline**: it still resolves issuers, retrieves SEC CompanyFacts, and examines SEC filings and current reports. The provider input is replayable without Fiscal.ai, but SEC source verification needs SEC network access or a separately complete SEC fixture inventory. No such complete offline SEC inventory is claimed here.

## Access and retention boundary

The archive is for internal, authorized research use. The public [Fiscal.ai terms](https://fiscal.ai/terms-of-service/) distinguish MCP access from a separate Data Feed API subscription and defer to an applicable Order Form. That Order Form and its caching/retention terms were not available to inspect. This workflow does **not** assert a perpetual right to retain or use provider data after a license ends; confirm the agreement and delete the private archive if required. The public GitHub commit includes only this report, hashes, period metadata, and replay code—no raw provider exports, credentials, or private environment variables.
