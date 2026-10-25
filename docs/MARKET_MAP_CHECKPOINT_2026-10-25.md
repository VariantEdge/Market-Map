# Market Map checkpoint — 2026-10-25

## Safe restore point
- Repository: `VariantEdge/Market-Map`
- Production code baseline: `main` commit `6c6ae84c65bcc711dc90d52f2558cd3de6402347`.
- This note is on the backup branch `backup/pre-fiscalai-migration-2026-10-25` only. The underlying app code was not changed.
- Do not change existing Website App or Valuation Analysis deployments, Vercel domains, production Supabase data, or financial snapshots without explicit authorization.

## Current implementation
- WiseSheets provides quarterly provider feeds for historical Revenue, Gross Profit, OCF, Capex and provider FCF (not a stand-alone EBIT or company-defined Adjusted EBITDA source).
- The financial pipeline uses SEC CompanyFacts, filing/XBRL/reconciliations, precise financial-period calendarization, and fails closed on source conflicts.
- Historical financial snapshots are read from Supabase; a controlled financial refresh triggers source acquisition, verification, and promotion.
- `npm run financials:audit` evaluates 12 tickers × 4 periods × 7 metrics = 336 cells.
- Prior recorded audit baseline: 125 verified reported, 165 verified derived, 37 accepted NA, 9 unresolved, 4 economic-sanity flags. This was from a prior audit run, NOT a verified result for current commit.
- The nine historically unresolved cells: MU calendar 2023/24/25 cash Capex; IREN calendar 2023/24 Gross Profit; IREN calendar 2023/24/25 Capex; IREN calendar 2023 FCF.
- Last CI for current commit (2026-10-19): 478/478 tests passed, plus lint/typecheck/build. CI did NOT execute a full live 336-cell financial audit.

## Fiscal.ai vs WiseSheets research
- Codex completed a live read-only benchmark: Fiscal.ai had 252/336 exact-period candidates vs WiseSheets 161/336. Coverage is NOT proof of higher numerical accuracy.
- SEC-adjudicated sample: Fiscal.ai 9 correct / 3 incorrect across 12 examined; WiseSheets 6 correct, 2 unresolved conflicts across 8 examined. Samples are small/nonidentical; no population accuracy inference.
- Fiscal.ai offers standardized income/cash flow and company-adjusted EBITDA data with source provenance. MCP works for research; production API authentication, licensing, limits and cost are NOT yet verified.
- Fiscal.ai company-defined Adjusted EBITDA is available for BE, CRWV, FCEL, GEV, IREN, NBIS; other tested names returned generic `adjusted:false` EBITDA, NOT qualifying company-defined Adjusted EBITDA.
- Independently reproduced data discrepancies:
  - GEV LTM Adjusted EBITDA as of June 30, 2026: Fiscal.ai $4.157B vs source-reconciled $4.115B; Q4 2025 headline figure $1.200B vs detailed $1.158B.
  - IREN LTM cash Capex at June 30, 2026: Fiscal.ai $4.433391B vs $4.333087B per 2026 Form 10-K for defined PP&E + hardware cash purchases. The extra $100.304M is an additional hardware-prepayment component in the LTM standardized feed. Fiscal.ai annual same-end-date figure is $4.333087B.
  - IREN corresponding FCF: OCF $2.100418B − Capex $4.333087B = −$2.232669B, rather than −$2.332973B.
- Definition caution: FCEL, BE, NBIS may have incompatible Adjusted EBITDA periods; NBIS continuing/discontinued cash-flow scopes may differ. Do not force LTM simply because numeric periods can be added.
- Fiscal.ai raw fiscal-year values must never be substituted for exact Jan–Dec calendar years; special care for MU, IREN, FCEL, INTC and any issuer with non-December fiscal periods.

## Next intended task (NOT yet authorized for production)
1. Develop a Fiscal.ai historical financial provider adapter/replacement in a local or isolated branch, using available MCP for research, without assuming MCP is usable as runtime production API.
2. Preserve SEC-backed verification, exact fiscal-to-calendar construction, source links, semantic definitions, and audit statuses.
3. Add focused GEV, IREN, fiscal-period and company-defined EBITDA regression tests.
4. Run all tests and complete live 336-cell audit. Report verified reported/derived, evidence-backed NA, unresolved cells, failures, regression deltas, plus evidence for nine historical gaps.
5. Verify production API credentials/licensing/economics. Do not commit to `main`, deploy, or update Supabase without independent review and explicit approval.

## Backup scope limitation
This GitHub backup includes only code already committed at the stated SHA; it does not automatically include uncommitted files, Codex local worktree changes, untracked audit caches, reports, or secrets. Preserve those separately from Codex if needed.
