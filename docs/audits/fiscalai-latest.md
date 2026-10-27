# Fiscal.ai migration — independent review audit

- **Tested implementation commit:** `a6dd68d48a667a9c8bd0f76ac596b1f8cadab7f4`
- **Audit generated:** 2026-10-27T06:32:23.913Z
- **Scope:** 12 companies × 7 metrics × 4 periods = 336 cells.

This is a review branch. The audit **fails**; these results must not be promoted to production snapshots without separate approval.

## Results

- Verified reported: **113**
- Verified derived: **128**
- Accepted N/A by current validator: **7** (0 have stale-period evidence; see below)
- Unresolved: **88**
- Fiscal.ai-versus-SEC observation conflicts: **37** (underlying observations, not 336 final cells)
- Economic sanity flags: **4**

### Verification

| Check | Result |
| --- | --- |
| npm test | 502 passed, 0 failed |
| npm run lint | Passed |
| npm run typecheck | Passed |
| npm run build | Passed |
| npm run financials:audit | Failed closed: 88 unresolved / 336 |

The audit used Fiscal.ai MCP responses captured locally and SEC source checks. No production Fiscal.ai REST credential was available for this run. The complete local provider capture is **not** committed.

## Change since the immediately previous full audit

The prior full run (2026-10-25T23:02:07.723Z) had 256 verified, 7 accepted N/As, and 73 unresolved. This run has 241 verified, 7 accepted N/As, and 88 unresolved.

| Ticker | Metric | Period | Before | Before USD | After | After USD | Source accessions | Explanation |
| --- | --- | --- | --- | ---: | --- | ---: | --- | --- |
| INTC | revenue | 2023A | VERIFIED_REPORTED | 54,228,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | 0000050863-24-000076, 0000050863-24-000124, 0000050863-24-000149, 0000050863-26-000011, 0000050863-25-000074 | Prior fiscal reporting period does not exactly cover January–December; value withdrawn. |
| INTC | revenue | 2024A | VERIFIED_REPORTED | 53,101,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | 0000050863-25-000074, 0000050863-25-000109, 0000050863-25-000179, 0000050863-26-000011, 0000050863-26-000079 | Prior fiscal reporting period does not exactly cover January–December; value withdrawn. |
| INTC | revenue | 2025A | VERIFIED_REPORTED | 52,853,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | 0000050863-26-000079, 0000050863-26-000157, 0000050863-25-000179, 0000050863-26-000011, 0000050863-26-000079 | Prior fiscal reporting period does not exactly cover January–December; value withdrawn. |
| INTC | grossProfit | 2023A | VERIFIED_REPORTED | 21,711,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | 0000050863-24-000076, 0000050863-24-000124, 0000050863-24-000149, 0000050863-26-000011, 0000050863-25-000074 | Prior fiscal reporting period does not exactly cover January–December; value withdrawn. |
| INTC | grossProfit | 2024A | VERIFIED_REPORTED | 17,345,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | 0000050863-25-000074, 0000050863-25-000109, 0000050863-25-000179, 0000050863-26-000011, 0000050863-26-000079 | Prior fiscal reporting period does not exactly cover January–December; value withdrawn. |
| INTC | grossProfit | 2025A | VERIFIED_REPORTED | 18,375,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | 0000050863-26-000079, 0000050863-26-000157, 0000050863-25-000179, 0000050863-26-000011, 0000050863-26-000079 | Prior fiscal reporting period does not exactly cover January–December; value withdrawn. |
| INTC | ebit | 2023A | VERIFIED_REPORTED | 93,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | 0000050863-24-000076, 0000050863-24-000124, 0000050863-24-000149, 0000050863-26-000011, 0000050863-25-000074 | Prior fiscal reporting period does not exactly cover January–December; value withdrawn. |
| INTC | ebit | 2024A | VERIFIED_REPORTED | -11,678,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | 0000050863-25-000074, 0000050863-25-000109, 0000050863-25-000179, 0000050863-26-000011, 0000050863-26-000079 | Prior fiscal reporting period does not exactly cover January–December; value withdrawn. |
| INTC | ebit | 2025A | VERIFIED_REPORTED | -2,214,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | 0000050863-26-000079, 0000050863-26-000157, 0000050863-25-000179, 0000050863-26-000011, 0000050863-26-000079 | Prior fiscal reporting period does not exactly cover January–December; value withdrawn. |
| INTC | operatingCashFlow | 2023A | VERIFIED_REPORTED | 11,471,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | 0000050863-24-000076, 0000050863-24-000124, 0000050863-24-000149, 0000050863-26-000011, 0000050863-25-000074 | Prior fiscal reporting period does not exactly cover January–December; value withdrawn. |
| INTC | operatingCashFlow | 2024A | VERIFIED_REPORTED | 8,288,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | 0000050863-25-000074, 0000050863-25-000109, 0000050863-25-000179, 0000050863-26-000011, 0000050863-26-000079 | Prior fiscal reporting period does not exactly cover January–December; value withdrawn. |
| INTC | operatingCashFlow | 2025A | VERIFIED_REPORTED | 9,697,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | 0000050863-26-000079, 0000050863-26-000157, 0000050863-25-000179, 0000050863-26-000011, 0000050863-26-000079 | Prior fiscal reporting period does not exactly cover January–December; value withdrawn. |
| INTC | capitalExpenditures | 2023A | VERIFIED_REPORTED | 25,750,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | 0000050863-24-000076, 0000050863-24-000124, 0000050863-24-000149, 0000050863-26-000011, 0000050863-25-000074 | Prior fiscal reporting period does not exactly cover January–December; value withdrawn. |
| INTC | capitalExpenditures | 2024A | VERIFIED_REPORTED | 23,944,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | 0000050863-25-000074, 0000050863-25-000109, 0000050863-25-000179, 0000050863-26-000011, 0000050863-26-000079 | Prior fiscal reporting period does not exactly cover January–December; value withdrawn. |
| INTC | capitalExpenditures | 2025A | VERIFIED_REPORTED | 14,646,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | 0000050863-26-000079, 0000050863-26-000157, 0000050863-25-000179, 0000050863-26-000011, 0000050863-26-000079 | Prior fiscal reporting period does not exactly cover January–December; value withdrawn. |
| INTC | freeCashFlow | 2023A | VERIFIED_DERIVED | -14,279,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | See machine audit | Prior fiscal reporting period does not exactly cover January–December; value withdrawn. |
| INTC | freeCashFlow | 2024A | VERIFIED_DERIVED | -15,656,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | See machine audit | Prior fiscal reporting period does not exactly cover January–December; value withdrawn. |
| INTC | freeCashFlow | 2025A | VERIFIED_DERIVED | -4,949,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | See machine audit | Prior fiscal reporting period does not exactly cover January–December; value withdrawn. |
| CRWV | grossProfit | 2023A | INSUFFICIENT_PERIOD_COVERAGE | N/A | VERIFIED_DERIVED | 160,000,000 | 0001769628-26-000104 | Exact SEC period and calculation now verified. |
| CRWV | grossProfit | 2024A | VERIFIED_DERIVED | 1,422,076,000 | VERIFIED_DERIVED | 1,422,000,000 | 0001769628-26-000104 | Updated SEC comparative filing or provider reconciliation; inspect source periods and values. |
| CRWV | grossProfit | 2025A | VERIFIED_DERIVED | 3,677,641,000 | VERIFIED_DERIVED | 3,678,000,000 | 0001769628-26-000104 | Updated SEC comparative filing or provider reconciliation; inspect source periods and values. |
| CRWV | adjustedEbitda | 2023A | INSUFFICIENT_PERIOD_COVERAGE | N/A | VERIFIED_REPORTED | 103,913,000 | 0001193125-25-044231 | Exact SEC period and calculation now verified. |
| CRWV | adjustedEbitda | 2024A | VERIFIED_REPORTED | 1,219,000,000 | VERIFIED_REPORTED | 1,219,258,000 | 0001193125-25-044231 | Updated SEC comparative filing or provider reconciliation; inspect source periods and values. |
| IREN | grossProfit | LTM | VERIFIED_DERIVED | 487,339,000 | VERIFIED_DERIVED | 487,301,000 | 0001878848-26-000052 | Updated SEC comparative filing or provider reconciliation; inspect source periods and values. |
| IREN | capitalExpenditures | LTM | VERIFIED_DERIVED | 4,333,164,000 | VERIFIED_DERIVED | 4,333,087,000 | 0001878848-26-000052 | Updated SEC comparative filing or provider reconciliation; inspect source periods and values. |
| AMZN | grossProfit | 2023A | INSUFFICIENT_PERIOD_COVERAGE | N/A | VERIFIED_DERIVED | 270,046,000,000 | 0001018724-26-000004 | Exact SEC period and calculation now verified. |
| META | grossProfit | 2024A | VERIFIED_DERIVED | 134,338,000,000 | VERIFIED_DERIVED | 134,340,000,000 | 0001628280-26-003942 | Updated SEC comparative filing or provider reconciliation; inspect source periods and values. |
| META | grossProfit | 2025A | VERIFIED_DERIVED | 164,790,000,000 | VERIFIED_DERIVED | 164,791,000,000 | 0001628280-26-003942 | Updated SEC comparative filing or provider reconciliation; inspect source periods and values. |

## Change since the previous published Fiscal.ai audit

The previous review-branch audit (2026-10-25T22:18:28.569Z) had 278 verified, 8 accepted N/As, 50 unresolved, and 69 underlying observation conflicts. The current run has 241 verified, 7 accepted N/As, 88 unresolved, and 37 conflicts.
The generic Capex mapping correction resolved FCEL LTM cash Capex and FCF from exact source quarters and removed 33 mixed-project-asset observations from the provider/SEC conflict list. The exact-calendar guard withdrew 24 FCEL/MU annual values that had been prorated across calendar boundaries. These are disclosed verification regressions, not silently accepted N/As.

| Ticker | Metric | Period | Before status | Before USD | Current status | Current USD | Assessment |
| --- | --- | --- | --- | ---: | --- | ---: | --- |
| FCEL | revenue | 2023A | VERIFIED_DERIVED | 109,879,847.826 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| FCEL | revenue | 2024A | VERIFIED_DERIVED | 113,660,978.261 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| FCEL | revenue | 2025A | VERIFIED_DERIVED | 165,809,543.478 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| FCEL | grossProfit | 2023A | VERIFIED_DERIVED | -21,781,543.478 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| FCEL | grossProfit | 2024A | VERIFIED_DERIVED | -31,594,293.478 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| FCEL | grossProfit | 2025A | VERIFIED_DERIVED | -26,840,967.391 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| FCEL | ebit | 2023A | VERIFIED_DERIVED | -149,360,119.565 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| FCEL | ebit | 2024A | VERIFIED_DERIVED | -152,104,880.435 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| FCEL | ebit | 2025A | VERIFIED_DERIVED | -187,997,771.739 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| FCEL | operatingCashFlow | 2023A | VERIFIED_DERIVED | -143,492,282.609 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| FCEL | operatingCashFlow | 2024A | VERIFIED_DERIVED | -144,580,163.043 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| FCEL | operatingCashFlow | 2025A | VERIFIED_DERIVED | -117,484,989.13 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| FCEL | capitalExpenditures | 2023A | REQUIRES_REVIEW | N/A | INSUFFICIENT_PERIOD_COVERAGE | N/A | CHANGED_STATUS_OR_VALUE |
| FCEL | capitalExpenditures | 2024A | REQUIRES_REVIEW | N/A | INSUFFICIENT_PERIOD_COVERAGE | N/A | CHANGED_STATUS_OR_VALUE |
| FCEL | capitalExpenditures | 2025A | REQUIRES_REVIEW | N/A | INSUFFICIENT_PERIOD_COVERAGE | N/A | CHANGED_STATUS_OR_VALUE |
| FCEL | capitalExpenditures | LTM | REQUIRES_REVIEW | N/A | VERIFIED_DERIVED | 4,814,000 | IMPROVED_VERIFICATION |
| FCEL | freeCashFlow | LTM | OPERATION_SCOPE_INCOMPATIBLE | N/A | VERIFIED_DERIVED | -101,115,000 | IMPROVED_VERIFICATION |
| INTC | revenue | 2023A | VERIFIED_REPORTED | 54,228,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| INTC | revenue | 2024A | VERIFIED_REPORTED | 53,101,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| INTC | revenue | 2025A | VERIFIED_REPORTED | 52,853,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| INTC | grossProfit | 2023A | VERIFIED_REPORTED | 21,711,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| INTC | grossProfit | 2024A | VERIFIED_REPORTED | 17,345,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| INTC | grossProfit | 2025A | VERIFIED_REPORTED | 18,375,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| INTC | ebit | 2023A | VERIFIED_REPORTED | 93,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| INTC | ebit | 2024A | VERIFIED_REPORTED | -11,678,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| INTC | ebit | 2025A | VERIFIED_REPORTED | -2,214,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| INTC | operatingCashFlow | 2023A | VERIFIED_REPORTED | 11,471,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| INTC | operatingCashFlow | 2024A | VERIFIED_REPORTED | 8,288,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| INTC | operatingCashFlow | 2025A | VERIFIED_REPORTED | 9,697,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| INTC | capitalExpenditures | 2023A | VERIFIED_REPORTED | 25,750,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| INTC | capitalExpenditures | 2024A | VERIFIED_REPORTED | 23,944,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| INTC | capitalExpenditures | 2025A | VERIFIED_REPORTED | 14,646,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| INTC | freeCashFlow | 2023A | VERIFIED_DERIVED | -14,279,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| INTC | freeCashFlow | 2024A | VERIFIED_DERIVED | -15,656,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| INTC | freeCashFlow | 2025A | VERIFIED_DERIVED | -4,949,000,000 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| MU | revenue | 2023A | VERIFIED_DERIVED | 16,947,527,472.527 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| MU | revenue | 2024A | VERIFIED_DERIVED | 30,030,318,681.319 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| MU | revenue | 2025A | VERIFIED_DERIVED | 48,306,406,593.407 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| MU | grossProfit | 2023A | VERIFIED_DERIVED | -1,578,846,153.846 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| MU | grossProfit | 2024A | VERIFIED_DERIVED | 9,702,923,076.923 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| MU | grossProfit | 2025A | VERIFIED_DERIVED | 24,730,241,758.242 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| MU | ebit | 2023A | VERIFIED_DERIVED | -5,839,703,296.703 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| MU | ebit | 2024A | VERIFIED_DERIVED | 5,183,890,109.89 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| MU | ebit | 2025A | VERIFIED_DERIVED | 19,117,505,494.505 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| MU | operatingCashFlow | 2023A | VERIFIED_DERIVED | 2,319,186,813.187 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| MU | operatingCashFlow | 2024A | VERIFIED_DERIVED | 11,364,252,747.253 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| MU | operatingCashFlow | 2025A | VERIFIED_DERIVED | 25,709,758,241.758 | INSUFFICIENT_PERIOD_COVERAGE | N/A | WITHDRAWN_NON_EXACT_VALUE |
| CRWV | grossProfit | 2023A | INSUFFICIENT_PERIOD_COVERAGE | N/A | VERIFIED_DERIVED | 160,000,000 | IMPROVED_VERIFICATION |
| CRWV | grossProfit | 2024A | VERIFIED_DERIVED | 1,422,076,000 | VERIFIED_DERIVED | 1,422,000,000 | CHANGED_STATUS_OR_VALUE |
| CRWV | grossProfit | 2025A | VERIFIED_DERIVED | 3,677,641,000 | VERIFIED_DERIVED | 3,678,000,000 | CHANGED_STATUS_OR_VALUE |
| CRWV | adjustedEbitda | 2023A | INSUFFICIENT_PERIOD_COVERAGE | N/A | VERIFIED_REPORTED | 103,913,000 | IMPROVED_VERIFICATION |
| CRWV | adjustedEbitda | 2024A | VERIFIED_REPORTED | 1,219,000,000 | VERIFIED_REPORTED | 1,219,258,000 | CHANGED_STATUS_OR_VALUE |
| IREN | grossProfit | LTM | VERIFIED_DERIVED | 487,339,000 | VERIFIED_DERIVED | 487,301,000 | CHANGED_STATUS_OR_VALUE |
| IREN | capitalExpenditures | LTM | VERIFIED_DERIVED | 4,333,164,000 | VERIFIED_DERIVED | 4,333,087,000 | CHANGED_STATUS_OR_VALUE |
| AMZN | grossProfit | 2023A | INSUFFICIENT_PERIOD_COVERAGE | N/A | VERIFIED_DERIVED | 270,046,000,000 | IMPROVED_VERIFICATION |
| META | grossProfit | 2024A | VERIFIED_DERIVED | 134,338,000,000 | VERIFIED_DERIVED | 134,340,000,000 | CHANGED_STATUS_OR_VALUE |
| META | grossProfit | 2025A | VERIFIED_DERIVED | 164,790,000,000 | VERIFIED_DERIVED | 164,791,000,000 | CHANGED_STATUS_OR_VALUE |

### Original 50 unresolved cells

These are retained as the historical first-published audit state. Their latest dispositions appear in the change table above and in the current 336-cell table below.

| Ticker | Metric | Period | Original status | Original root cause |
| --- | --- | --- | --- | --- |
| FCEL | capitalExpenditures | 2023A | REQUIRES_REVIEW | Restated or conflicting SEC fact |
| FCEL | capitalExpenditures | 2024A | REQUIRES_REVIEW | Restated or conflicting SEC fact |
| FCEL | capitalExpenditures | 2025A | REQUIRES_REVIEW | Restated or conflicting SEC fact |
| FCEL | capitalExpenditures | LTM | REQUIRES_REVIEW | Restated or conflicting SEC fact |
| FCEL | freeCashFlow | 2023A | INSUFFICIENT_PERIOD_COVERAGE | Unavailable source coverage |
| FCEL | freeCashFlow | 2024A | INSUFFICIENT_PERIOD_COVERAGE | Unavailable source coverage |
| FCEL | freeCashFlow | 2025A | INSUFFICIENT_PERIOD_COVERAGE | Unavailable source coverage |
| FCEL | adjustedEbitda | 2023A | INSUFFICIENT_PERIOD_COVERAGE | Four exact company-defined quarters are unavailable |
| FCEL | adjustedEbitda | 2024A | INSUFFICIENT_PERIOD_COVERAGE | Four exact company-defined quarters are unavailable |
| FCEL | adjustedEbitda | 2025A | INSUFFICIENT_PERIOD_COVERAGE | Four exact company-defined quarters are unavailable |
| INTC | adjustedEbitda | 2023A | MISSING_SOURCE_DATA | Four exact company-defined quarters are unavailable |
| INTC | adjustedEbitda | 2024A | MISSING_SOURCE_DATA | Four exact company-defined quarters are unavailable |
| INTC | adjustedEbitda | 2025A | MISSING_SOURCE_DATA | Four exact company-defined quarters are unavailable |
| INTC | adjustedEbitda | LTM | MISSING_SOURCE_DATA | Unavailable source coverage |
| MU | capitalExpenditures | 2023A | INSUFFICIENT_PERIOD_COVERAGE | Unavailable source coverage |
| MU | capitalExpenditures | 2024A | INSUFFICIENT_PERIOD_COVERAGE | Unavailable source coverage |
| MU | capitalExpenditures | 2025A | INSUFFICIENT_PERIOD_COVERAGE | Unavailable source coverage |
| MU | freeCashFlow | 2023A | INSUFFICIENT_PERIOD_COVERAGE | Unavailable source coverage |
| MU | freeCashFlow | 2024A | INSUFFICIENT_PERIOD_COVERAGE | Unavailable source coverage |
| MU | freeCashFlow | 2025A | INSUFFICIENT_PERIOD_COVERAGE | Unavailable source coverage |
| MU | adjustedEbitda | 2023A | MISSING_SOURCE_DATA | Four exact company-defined quarters are unavailable |
| MU | adjustedEbitda | 2024A | MISSING_SOURCE_DATA | Four exact company-defined quarters are unavailable |
| MU | adjustedEbitda | 2025A | MISSING_SOURCE_DATA | Four exact company-defined quarters are unavailable |
| MU | adjustedEbitda | LTM | MISSING_SOURCE_DATA | Unavailable source coverage |
| NBIS | operatingCashFlow | 2025A | REQUIRES_REVIEW | Restated or conflicting SEC fact |
| NBIS | operatingCashFlow | LTM | REQUIRES_REVIEW | Restated or conflicting SEC fact |
| CRWV | grossProfit | 2023A | INSUFFICIENT_PERIOD_COVERAGE | Unavailable source coverage |
| CRWV | adjustedEbitda | 2023A | INSUFFICIENT_PERIOD_COVERAGE | Four exact company-defined quarters are unavailable |
| IREN | grossProfit | 2023A | INSUFFICIENT_PERIOD_COVERAGE | Unavailable source coverage |
| IREN | grossProfit | 2024A | INSUFFICIENT_PERIOD_COVERAGE | Unavailable source coverage |
| IREN | adjustedEbitda | 2023A | INSUFFICIENT_PERIOD_COVERAGE | Four exact company-defined quarters are unavailable |
| IREN | adjustedEbitda | 2024A | INSUFFICIENT_PERIOD_COVERAGE | Four exact company-defined quarters are unavailable |
| IREN | adjustedEbitda | 2025A | INSUFFICIENT_PERIOD_COVERAGE | Four exact company-defined quarters are unavailable |
| GOOGL | adjustedEbitda | 2023A | MISSING_SOURCE_DATA | Four exact company-defined quarters are unavailable |
| GOOGL | adjustedEbitda | 2024A | MISSING_SOURCE_DATA | Four exact company-defined quarters are unavailable |
| GOOGL | adjustedEbitda | 2025A | MISSING_SOURCE_DATA | Four exact company-defined quarters are unavailable |
| GOOGL | adjustedEbitda | LTM | MISSING_SOURCE_DATA | Unavailable source coverage |
| AMZN | grossProfit | 2023A | INSUFFICIENT_PERIOD_COVERAGE | Unavailable source coverage |
| AMZN | adjustedEbitda | 2023A | MISSING_SOURCE_DATA | Four exact company-defined quarters are unavailable |
| AMZN | adjustedEbitda | 2024A | MISSING_SOURCE_DATA | Four exact company-defined quarters are unavailable |
| AMZN | adjustedEbitda | 2025A | MISSING_SOURCE_DATA | Four exact company-defined quarters are unavailable |
| AMZN | adjustedEbitda | LTM | MISSING_SOURCE_DATA | Unavailable source coverage |
| META | adjustedEbitda | 2023A | MISSING_SOURCE_DATA | Four exact company-defined quarters are unavailable |
| META | adjustedEbitda | 2024A | MISSING_SOURCE_DATA | Four exact company-defined quarters are unavailable |
| META | adjustedEbitda | 2025A | MISSING_SOURCE_DATA | Four exact company-defined quarters are unavailable |
| META | adjustedEbitda | LTM | MISSING_SOURCE_DATA | Unavailable source coverage |
| MSFT | adjustedEbitda | 2023A | MISSING_SOURCE_DATA | Four exact company-defined quarters are unavailable |
| MSFT | adjustedEbitda | 2024A | MISSING_SOURCE_DATA | Four exact company-defined quarters are unavailable |
| MSFT | adjustedEbitda | 2025A | MISSING_SOURCE_DATA | Four exact company-defined quarters are unavailable |
| MSFT | adjustedEbitda | LTM | MISSING_SOURCE_DATA | Unavailable source coverage |

## Nine originally unresolved MU/IREN cells

| Cell | Value (USD millions) | Status | SEC-supported construction or gap |
| --- | ---: | --- | --- |
| MU capitalExpenditures 2023A | N/A | INSUFFICIENT_PERIOD_COVERAGE | Unavailable source coverage; no proration. |
| MU capitalExpenditures 2024A | N/A | INSUFFICIENT_PERIOD_COVERAGE | Unavailable source coverage; no proration. |
| MU capitalExpenditures 2025A | N/A | INSUFFICIENT_PERIOD_COVERAGE | Unavailable source coverage; no proration. |
| IREN grossProfit 2023A | N/A | INSUFFICIENT_PERIOD_COVERAGE | Unavailable source coverage; no proration. |
| IREN grossProfit 2024A | N/A | INSUFFICIENT_PERIOD_COVERAGE | Unavailable source coverage; no proration. |
| IREN capitalExpenditures 2023A | 115.423 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD: 116.064 [2022-07-01–2023-06-30; 0001878848-25-000063] + 64.015 [2023-07-01–2023-12-31; 0001878848-25-000009] − 64.656 [2022-07-01–2022-12-31; 0001140361-24-008183] |
| IREN capitalExpenditures 2024A | 986.845 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD: 479.909 [2023-07-01–2024-06-30; 0001878848-26-000052] + 570.951 [2024-07-01–2024-12-31; 0001878848-26-000015] − 64.015 [2023-07-01–2023-12-31; 0001878848-25-000009] |
| IREN capitalExpenditures 2025A | 1,801.385 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD: 1,372.627 [2024-07-01–2025-06-30; 0001878848-26-000052] + 999.709 [2025-07-01–2025-12-31; 0001878848-26-000015] − 570.951 [2024-07-01–2024-12-31; 0001878848-26-000015] |
| IREN freeCashFlow 2023A | -157.865 | VERIFIED_DERIVED | CY OCF -42.442 − CY cash Capex 115.423; OCF sources 0001878848-25-000063, 0001878848-25-000025, 0001140361-24-008183; Capex sources 0001878848-25-000063, 0001878848-25-000009, 0001140361-24-008183 |

### Exact-period evidence still missing

MU files on an August fiscal year. The preserved SEC observations do not cover January–December 2023, 2024, or 2025 cash Capex exactly; fiscal quarters cross calendar boundaries. [FY2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/723125/000072312525000028/mu-20250828.htm) and [FY2026 Form 10-K](https://www.sec.gov/Archives/edgar/data/723125/000072312526000023/mu-20260903.htm) provide fiscal periods, not a Jan–Dec substitute. The capped supplemental filing search does not prove no other exact primary-source periods exist, so all three cells remain unresolved.

IREN 2023/2024 Gross Profit has exact fiscal-year SEC revenue-minus-cost amounts of $36.090 million (July 2022–June 2023) and $100.125 million (July 2023–June 2024). The exact July–December 2023 Gross Profit comparison is missing from the selected SEC observations, so neither CY2023 nor CY2024 can be bridged. Fiscal.ai rows for that half-year map revenue and other income to Gross Profit without a cost component; the adapter rejects them. [FY2025 comparative filing](https://www.sec.gov/Archives/edgar/data/1878848/000187884825000063/iren-20250630.htm), [December 2024 half-year filing](https://www.sec.gov/Archives/edgar/data/1878848/000187884825000009/iren-20241231_d2.htm). These remain unresolved because the complete relevant source inventory has not been established.

INTC annual reporting periods end December 30, 2023; December 28, 2024; and December 27, 2025. Their exact starts are January 1, 2023; December 31, 2023; and December 29, 2024, respectively. Those are 52/53-week fiscal periods, not Jan 1–Dec 31 calendar years. The 18 prior verified INTC GAAP annual cells were withdrawn; fiscal values remain in the underlying observations. No day-count allocation is used.

## NBIS 2025 operating cash flow source conflict

The [2025 SEC Form 20-F](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm) (accession `0001104659-26-052948`) reports $401.9 million from continuing operations and $(17.1) million from discontinued operations; $401.9 million + $(17.1) million = $384.8 million total. Fiscal.ai’s annual standardized mapping corresponds to the reported total, while the canonical engine selects continuing operations. The 2025A and LTM OCF cells remain unresolved until the scope policy and LTM sources are reconciled. This is a scope difference, not evidence of a restatement.

IREN source accessions: [FY23 comparative 0001878848-25-000063](https://www.sec.gov/Archives/edgar/data/1878848/000187884825000063/iren-20250630.htm), [H2 CY23 0001878848-25-000009](https://www.sec.gov/Archives/edgar/data/1878848/000187884825000009/iren-20241231_d2.htm), [H2 CY22 0001140361-24-008183](https://www.sec.gov/Archives/edgar/data/1878848/000114036124008183/ef20015356_ex99-3.htm), [FY24/FY25 comparative 0001878848-26-000052](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm), and [H2 CY24/CY25 0001878848-26-000015](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000015/iren-20251231.htm). MU August fiscal-year filings: [0000723125-25-000028](https://www.sec.gov/Archives/edgar/data/723125/000072312525000028/mu-20250828.htm) and [0000723125-26-000023](https://www.sec.gov/Archives/edgar/data/723125/000072312526000023/mu-20260903.htm).

## Comparison with prior WiseSheets-based audit

The cached 2026-10-19T04:01:55.204Z WiseSheets/SEC run had 129 reported, 164 derived, 7 accepted N/As, and 36 unresolved. The current run has 53 verified-to-nonverified transitions and 17 changed verified values. Dates and newest LTM endpoints differ, so changed LTM values are not automatically provider errors. The earlier “nine unresolved” figure was a separate historical audit state; it is not this immediate baseline.

Prior verified FCEL/MU annual values that allocated fiscal quarters across January or December have been withdrawn. Their loss of verification enforces exact-calendar accounting; it is not evidence that the new provider alone caused missing data. Other transitions still need source adjudication.

### Every verified-to-nonverified transition

| Ticker | Metric | Period | Previous | Current | Explanation |
| --- | --- | --- | ---: | --- | --- |
| FCEL | revenue | 2023A | 109,879,847.826 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| FCEL | revenue | 2024A | 113,660,978.261 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| FCEL | revenue | 2025A | 165,809,543.478 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| FCEL | grossProfit | 2023A | -21,781,543.478 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| FCEL | grossProfit | 2024A | -31,594,293.478 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| FCEL | grossProfit | 2025A | -26,840,967.391 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| FCEL | ebit | 2023A | -149,360,119.565 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| FCEL | ebit | 2024A | -152,104,880.435 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| FCEL | ebit | 2025A | -187,997,771.739 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| FCEL | operatingCashFlow | 2023A | -143,492,282.609 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| FCEL | operatingCashFlow | 2024A | -144,580,163.043 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| FCEL | operatingCashFlow | 2025A | -117,484,989.13 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| FCEL | capitalExpenditures | 2023A | 41,211,521.739 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| FCEL | capitalExpenditures | 2024A | 45,397,032.609 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| FCEL | capitalExpenditures | 2025A | 14,432,445.652 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| FCEL | freeCashFlow | 2023A | -184,703,804.348 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| FCEL | freeCashFlow | 2024A | -189,977,195.652 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| FCEL | freeCashFlow | 2025A | -131,917,434.783 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| INTC | revenue | 2023A | 54,228,000,000 | INSUFFICIENT_PERIOD_COVERAGE | Source, mapping, and period construction require adjudication. |
| INTC | revenue | 2024A | 53,101,000,000 | INSUFFICIENT_PERIOD_COVERAGE | Source, mapping, and period construction require adjudication. |
| INTC | revenue | 2025A | 52,853,000,000 | INSUFFICIENT_PERIOD_COVERAGE | Source, mapping, and period construction require adjudication. |
| INTC | grossProfit | 2023A | 21,711,000,000 | INSUFFICIENT_PERIOD_COVERAGE | Source, mapping, and period construction require adjudication. |
| INTC | grossProfit | 2024A | 17,345,000,000 | INSUFFICIENT_PERIOD_COVERAGE | Source, mapping, and period construction require adjudication. |
| INTC | grossProfit | 2025A | 18,375,000,000 | INSUFFICIENT_PERIOD_COVERAGE | Source, mapping, and period construction require adjudication. |
| INTC | ebit | 2023A | 93,000,000 | INSUFFICIENT_PERIOD_COVERAGE | Source, mapping, and period construction require adjudication. |
| INTC | ebit | 2024A | -11,678,000,000 | INSUFFICIENT_PERIOD_COVERAGE | Source, mapping, and period construction require adjudication. |
| INTC | ebit | 2025A | -2,214,000,000 | INSUFFICIENT_PERIOD_COVERAGE | Source, mapping, and period construction require adjudication. |
| INTC | operatingCashFlow | 2023A | 11,471,000,000 | INSUFFICIENT_PERIOD_COVERAGE | Source, mapping, and period construction require adjudication. |
| INTC | operatingCashFlow | 2024A | 8,288,000,000 | INSUFFICIENT_PERIOD_COVERAGE | Source, mapping, and period construction require adjudication. |
| INTC | operatingCashFlow | 2025A | 9,697,000,000 | INSUFFICIENT_PERIOD_COVERAGE | Source, mapping, and period construction require adjudication. |
| INTC | capitalExpenditures | 2023A | 25,750,000,000 | INSUFFICIENT_PERIOD_COVERAGE | Source, mapping, and period construction require adjudication. |
| INTC | capitalExpenditures | 2024A | 23,944,000,000 | INSUFFICIENT_PERIOD_COVERAGE | Source, mapping, and period construction require adjudication. |
| INTC | capitalExpenditures | 2025A | 14,646,000,000 | INSUFFICIENT_PERIOD_COVERAGE | Source, mapping, and period construction require adjudication. |
| INTC | freeCashFlow | 2023A | -14,279,000,000 | INSUFFICIENT_PERIOD_COVERAGE | Source, mapping, and period construction require adjudication. |
| INTC | freeCashFlow | 2024A | -15,656,000,000 | INSUFFICIENT_PERIOD_COVERAGE | Source, mapping, and period construction require adjudication. |
| INTC | freeCashFlow | 2025A | -4,949,000,000 | INSUFFICIENT_PERIOD_COVERAGE | Source, mapping, and period construction require adjudication. |
| MU | revenue | 2023A | 16,947,527,472.527 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| MU | revenue | 2024A | 30,030,318,681.319 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| MU | revenue | 2025A | 48,306,406,593.407 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| MU | grossProfit | 2023A | -1,578,846,153.846 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| MU | grossProfit | 2024A | 9,702,923,076.923 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| MU | grossProfit | 2025A | 24,730,241,758.242 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| MU | ebit | 2023A | -5,839,703,296.703 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| MU | ebit | 2024A | 5,183,890,109.89 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| MU | ebit | 2025A | 19,117,505,494.505 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| MU | operatingCashFlow | 2023A | 2,319,186,813.187 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| MU | operatingCashFlow | 2024A | 11,364,252,747.253 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| MU | operatingCashFlow | 2025A | 25,709,758,241.758 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| MU | freeCashFlow | 2023A | -4,448,362,637.363 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| MU | freeCashFlow | 2024A | 569,230,769.231 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| MU | freeCashFlow | 2025A | 6,753,901,098.901 | INSUFFICIENT_PERIOD_COVERAGE | Earlier result allocated fiscal quarters across January/December boundaries; no exact Jan–Dec construction is established from the available source periods. |
| NBIS | operatingCashFlow | 2025A | 401,900,000 | REQUIRES_REVIEW | Fiscal standardized OCF and SEC continuing-operations observations conflict; recast/scope not adjudicated. |
| NBIS | operatingCashFlow | LTM | 5,258,000,000 | REQUIRES_REVIEW | Fiscal standardized OCF and SEC continuing-operations observations conflict; recast/scope not adjudicated. |

### Changed values that remain verified

| Ticker | Metric | Period | Prior USD | Current USD | Review note |
| --- | --- | --- | ---: | ---: | --- |
| BE | revenue | LTM | 3,113,150,000 | 3,829,939,000 | Check differing latest reported endpoints before calling this a regression. |
| BE | grossProfit | LTM | 972,686,000 | 1,238,115,000 | Check differing latest reported endpoints before calling this a regression. |
| BE | ebit | LTM | 349,802,000 | 567,405,000 | Check differing latest reported endpoints before calling this a regression. |
| BE | operatingCashFlow | LTM | 737,784,000 | 690,968,000 | Check differing latest reported endpoints before calling this a regression. |
| BE | capitalExpenditures | LTM | 113,078,000 | 254,264,000 | Check differing latest reported endpoints before calling this a regression. |
| BE | freeCashFlow | LTM | 624,706,000 | 436,704,000 | Check differing latest reported endpoints before calling this a regression. |
| CRWV | revenue | LTM | 7,590,000,000 | 7,589,580,000 | Check differing latest reported endpoints before calling this a regression. |
| CRWV | grossProfit | LTM | 5,117,000,000 | 5,116,641,000 | Check differing latest reported endpoints before calling this a regression. |
| CRWV | adjustedEbitda | 2024A | 1,219,000,000 | 1,219,258,000 | Compare filing/recast and provider mappings. |
| IREN | revenue | LTM | 707,007,000 | 707,012,000 | Check differing latest reported endpoints before calling this a regression. |
| GOOGL | revenue | LTM | 445,866,000,000 | 445,867,000,000 | Check differing latest reported endpoints before calling this a regression. |
| META | revenue | LTM | 228,248,000,000 | 241,606,000,000 | Check differing latest reported endpoints before calling this a regression. |
| META | grossProfit | LTM | 186,588,000,000 | 195,783,000,000 | Check differing latest reported endpoints before calling this a regression. |
| META | ebit | LTM | 86,927,000,000 | 79,380,000,000 | Check differing latest reported endpoints before calling this a regression. |
| META | operatingCashFlow | LTM | 130,301,000,000 | 133,087,000,000 | Check differing latest reported endpoints before calling this a regression. |
| META | capitalExpenditures | LTM | 89,325,000,000 | 104,438,000,000 | Check differing latest reported endpoints before calling this a regression. |
| META | freeCashFlow | LTM | 40,976,000,000 | 28,649,000,000 | Check differing latest reported endpoints before calling this a regression. |

The machine-readable report contains all 336 prior/current cell comparisons, including improvements and unchanged cells.

## Unresolved cells — all 88

These groups use the cell’s recorded root cause; no unresolved cell is treated as acceptable N/A.

### Four exact company-defined quarters are unavailable (24)

| Ticker | Metric | Period | Status | Warning |
| --- | --- | --- | --- | --- |
| FCEL | adjustedEbitda | 2023A | INSUFFICIENT_PERIOD_COVERAGE | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE |
| FCEL | adjustedEbitda | 2024A | INSUFFICIENT_PERIOD_COVERAGE | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE |
| FCEL | adjustedEbitda | 2025A | INSUFFICIENT_PERIOD_COVERAGE | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE |
| INTC | adjustedEbitda | 2023A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE \| INCOMPLETE_NEGATIVE_SOURCE_SEARCH |
| INTC | adjustedEbitda | 2024A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE \| INCOMPLETE_NEGATIVE_SOURCE_SEARCH |
| INTC | adjustedEbitda | 2025A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE \| INCOMPLETE_NEGATIVE_SOURCE_SEARCH |
| MU | adjustedEbitda | 2023A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE \| INCOMPLETE_NEGATIVE_SOURCE_SEARCH |
| MU | adjustedEbitda | 2024A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE \| INCOMPLETE_NEGATIVE_SOURCE_SEARCH |
| MU | adjustedEbitda | 2025A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE \| INCOMPLETE_NEGATIVE_SOURCE_SEARCH |
| IREN | adjustedEbitda | 2023A | INSUFFICIENT_PERIOD_COVERAGE | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE |
| IREN | adjustedEbitda | 2024A | INSUFFICIENT_PERIOD_COVERAGE | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE |
| IREN | adjustedEbitda | 2025A | INSUFFICIENT_PERIOD_COVERAGE | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE |
| GOOGL | adjustedEbitda | 2023A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE \| INCOMPLETE_NEGATIVE_SOURCE_SEARCH |
| GOOGL | adjustedEbitda | 2024A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE \| INCOMPLETE_NEGATIVE_SOURCE_SEARCH |
| GOOGL | adjustedEbitda | 2025A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE \| INCOMPLETE_NEGATIVE_SOURCE_SEARCH |
| AMZN | adjustedEbitda | 2023A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE \| INCOMPLETE_NEGATIVE_SOURCE_SEARCH |
| AMZN | adjustedEbitda | 2024A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE \| INCOMPLETE_NEGATIVE_SOURCE_SEARCH |
| AMZN | adjustedEbitda | 2025A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE \| INCOMPLETE_NEGATIVE_SOURCE_SEARCH |
| META | adjustedEbitda | 2023A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE \| INCOMPLETE_NEGATIVE_SOURCE_SEARCH |
| META | adjustedEbitda | 2024A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE \| INCOMPLETE_NEGATIVE_SOURCE_SEARCH |
| META | adjustedEbitda | 2025A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE \| INCOMPLETE_NEGATIVE_SOURCE_SEARCH |
| MSFT | adjustedEbitda | 2023A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE \| INCOMPLETE_NEGATIVE_SOURCE_SEARCH |
| MSFT | adjustedEbitda | 2024A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE \| INCOMPLETE_NEGATIVE_SOURCE_SEARCH |
| MSFT | adjustedEbitda | 2025A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE \| INCOMPLETE_NEGATIVE_SOURCE_SEARCH |

### Restated or conflicting SEC fact (2)

| Ticker | Metric | Period | Status | Warning |
| --- | --- | --- | --- | --- |
| NBIS | operatingCashFlow | 2025A | REQUIRES_REVIEW | VALUE_CONFLICT |
| NBIS | operatingCashFlow | LTM | REQUIRES_REVIEW | VALUE_CONFLICT |

### Unavailable source coverage (62)

| Ticker | Metric | Period | Status | Warning |
| --- | --- | --- | --- | --- |
| FCEL | revenue | 2023A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| FCEL | revenue | 2024A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| FCEL | revenue | 2025A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| FCEL | grossProfit | 2023A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| FCEL | grossProfit | 2024A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| FCEL | grossProfit | 2025A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| FCEL | ebit | 2023A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| FCEL | ebit | 2024A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| FCEL | ebit | 2025A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| FCEL | operatingCashFlow | 2023A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| FCEL | operatingCashFlow | 2024A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| FCEL | operatingCashFlow | 2025A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| FCEL | capitalExpenditures | 2023A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| FCEL | capitalExpenditures | 2024A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| FCEL | capitalExpenditures | 2025A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| FCEL | freeCashFlow | 2023A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| FCEL | freeCashFlow | 2024A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| FCEL | freeCashFlow | 2025A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| INTC | revenue | 2023A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| INTC | revenue | 2024A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| INTC | revenue | 2025A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| INTC | grossProfit | 2023A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| INTC | grossProfit | 2024A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| INTC | grossProfit | 2025A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| INTC | ebit | 2023A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| INTC | ebit | 2024A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| INTC | ebit | 2025A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| INTC | operatingCashFlow | 2023A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| INTC | operatingCashFlow | 2024A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| INTC | operatingCashFlow | 2025A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| INTC | capitalExpenditures | 2023A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| INTC | capitalExpenditures | 2024A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| INTC | capitalExpenditures | 2025A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| INTC | freeCashFlow | 2023A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| INTC | freeCashFlow | 2024A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| INTC | freeCashFlow | 2025A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| INTC | adjustedEbitda | LTM | MISSING_SOURCE_DATA | FOUR_STANDALONE_QUARTERS_UNAVAILABLE \| INCOMPLETE_NEGATIVE_SOURCE_SEARCH |
| MU | revenue | 2023A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| MU | revenue | 2024A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| MU | revenue | 2025A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| MU | grossProfit | 2023A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| MU | grossProfit | 2024A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| MU | grossProfit | 2025A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| MU | ebit | 2023A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| MU | ebit | 2024A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| MU | ebit | 2025A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| MU | operatingCashFlow | 2023A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| MU | operatingCashFlow | 2024A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| MU | operatingCashFlow | 2025A | INSUFFICIENT_PERIOD_COVERAGE | PARTIAL_FISCAL_PERIOD_ALLOCATION_PROHIBITED |
| MU | capitalExpenditures | 2023A | INSUFFICIENT_PERIOD_COVERAGE | INSUFFICIENT_PERIOD_COVERAGE |
| MU | capitalExpenditures | 2024A | INSUFFICIENT_PERIOD_COVERAGE | INSUFFICIENT_PERIOD_COVERAGE |
| MU | capitalExpenditures | 2025A | INSUFFICIENT_PERIOD_COVERAGE | INSUFFICIENT_PERIOD_COVERAGE |
| MU | freeCashFlow | 2023A | INSUFFICIENT_PERIOD_COVERAGE | INSUFFICIENT_PERIOD_COVERAGE |
| MU | freeCashFlow | 2024A | INSUFFICIENT_PERIOD_COVERAGE | INSUFFICIENT_PERIOD_COVERAGE |
| MU | freeCashFlow | 2025A | INSUFFICIENT_PERIOD_COVERAGE | INSUFFICIENT_PERIOD_COVERAGE |
| MU | adjustedEbitda | LTM | MISSING_SOURCE_DATA | FOUR_STANDALONE_QUARTERS_UNAVAILABLE \| INCOMPLETE_NEGATIVE_SOURCE_SEARCH |
| IREN | grossProfit | 2023A | INSUFFICIENT_PERIOD_COVERAGE | INSUFFICIENT_PERIOD_COVERAGE |
| IREN | grossProfit | 2024A | INSUFFICIENT_PERIOD_COVERAGE | INSUFFICIENT_PERIOD_COVERAGE |
| GOOGL | adjustedEbitda | LTM | MISSING_SOURCE_DATA | FOUR_STANDALONE_QUARTERS_UNAVAILABLE \| INCOMPLETE_NEGATIVE_SOURCE_SEARCH |
| AMZN | adjustedEbitda | LTM | MISSING_SOURCE_DATA | FOUR_STANDALONE_QUARTERS_UNAVAILABLE \| INCOMPLETE_NEGATIVE_SOURCE_SEARCH |
| META | adjustedEbitda | LTM | MISSING_SOURCE_DATA | FOUR_STANDALONE_QUARTERS_UNAVAILABLE \| INCOMPLETE_NEGATIVE_SOURCE_SEARCH |
| MSFT | adjustedEbitda | LTM | MISSING_SOURCE_DATA | FOUR_STANDALONE_QUARTERS_UNAVAILABLE \| INCOMPLETE_NEGATIVE_SOURCE_SEARCH |


## Validator-accepted N/A cells — all 7

| Ticker | Metric | Period | Status | Evidence |
| --- | --- | --- | --- | --- |
| BE | adjustedEbitda | LTM | DEFINITION_INCOMPATIBLE | 3 distinct source fingerprints; [0001628280-26-027913](https://www.sec.gov/Archives/edgar/data/1664703/000162828026027913/ex991_q126financialresults.htm), [0001628280-26-050150](https://www.sec.gov/Archives/edgar/data/1664703/000162828026050150/ex991_q226financialresults.htm) |
| FCEL | adjustedEbitda | LTM | DEFINITION_INCOMPATIBLE | 2 distinct source fingerprints; [0001104659-25-122295](https://www.sec.gov/Archives/edgar/data/886128/000110465925122295/fcel-20251218xex99d1.htm), [0001104659-26-104498](https://www.sec.gov/Archives/edgar/data/886128/000110465926104498/fcel-20260902xex99d1.htm) |
| NBIS | freeCashFlow | 2023A | OPERATION_SCOPE_INCOMPATIBLE | CONTINUING_OPERATIONS versus UNSPECIFIED; [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm), [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm) |
| NBIS | freeCashFlow | 2024A | OPERATION_SCOPE_INCOMPATIBLE | CONTINUING_OPERATIONS versus UNSPECIFIED; [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm), [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm) |
| NBIS | freeCashFlow | 2025A | OPERATION_SCOPE_INCOMPATIBLE | CONTINUING_OPERATIONS versus UNSPECIFIED; [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm) |
| NBIS | freeCashFlow | LTM | OPERATION_SCOPE_INCOMPATIBLE | CONTINUING_OPERATIONS versus UNSPECIFIED; [0001104659-26-094568](https://www.sec.gov/Archives/edgar/data/1513845/000110465926094568/tm2622968d1_ex99-1.htm), [0001104659-26-094568](https://www.sec.gov/Archives/edgar/data/1513845/000110465926094568/tm2622968d1_ex99-1.htm) |
| NBIS | adjustedEbitda | LTM | DEFINITION_INCOMPATIBLE | 2 distinct source fingerprints; [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm), [0001104659-26-094844](https://www.sec.gov/Archives/edgar/data/1513845/000110465926094844/nbis-20260812xex99d1.htm) |

## Fiscal.ai-versus-SEC mismatches — all 37

The exact bulk Fiscal.ai candidate values are withheld from this **public** repository pending confirmation of redistribution rights. This is a disclosed limitation, not a claim that the values match. SEC values and filing references below let an authorized reviewer re-query each indexed provider observation. The locally retained, ignored source audit contains the complete comparison.

| ID | Ticker | Metric | Economic end | SEC USD | SEC filing | Explanation |
| --- | --- | --- | --- | ---: | --- | --- |
| M001 | GEV | adjustedEbitda | 2026-06-30 | 4,115,000,000 | [0001996810-26-000147](https://www.sec.gov/Archives/edgar/data/1996810/000199681026000147/gevpressrelease2q26.htm) | Fiscal.ai LTM Adjusted EBITDA differs from the precise SEC reconciliation; SEC remains authoritative. |
| M002 | INTC | revenue | 2022-07-02 | 24,664,000,000 | [0000050863-24-000124](https://www.sec.gov/Archives/edgar/data/50863/000005086324000124/intc-20240629.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M003 | INTC | ebit | 2022-07-02 | -2,484,000,000 | [0000050863-24-000124](https://www.sec.gov/Archives/edgar/data/50863/000005086324000124/intc-20240629.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M004 | NBIS | revenue | 2023-03-31 | 163,275 | [0001513845-24-000012](https://www.sec.gov/Archives/edgar/data/1513845/000151384524000012/yndx-20240331xex99d1.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M005 | NBIS | revenue | 2023-12-31 | 6,700,000 | [0001104659-25-015480](https://www.sec.gov/Archives/edgar/data/1513845/000110465925015480/tm257185d1_ex99-1.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M006 | NBIS | revenue | 2024-03-31 | 229,359 | [0001513845-24-000012](https://www.sec.gov/Archives/edgar/data/1513845/000151384524000012/yndx-20240331xex99d1.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M007 | NBIS | grossProfit | 2023-12-31 | -3,100,000 | [0001104659-25-015480](https://www.sec.gov/Archives/edgar/data/1513845/000110465925015480/tm257185d1_ex99-1.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M008 | NBIS | ebit | 2023-03-31 | 1,970 | [0001513845-24-000012](https://www.sec.gov/Archives/edgar/data/1513845/000151384524000012/yndx-20240331xex99d1.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M009 | NBIS | ebit | 2023-12-31 | -93,500,000 | [0001104659-25-015480](https://www.sec.gov/Archives/edgar/data/1513845/000110465925015480/tm257185d1_ex99-1.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M010 | NBIS | ebit | 2024-03-31 | 15,766 | [0001513845-24-000012](https://www.sec.gov/Archives/edgar/data/1513845/000151384524000012/yndx-20240331xex99d1.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M011 | NBIS | ebit | 2025-12-31 | -250,000,000 | [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M012 | NBIS | operatingCashFlow | 2024-09-30 | -196,800,000 | [0001104659-25-110831](https://www.sec.gov/Archives/edgar/data/1513845/000110465925110831/tm2531034d1_ex99-1.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M013 | NBIS | operatingCashFlow | 2025-03-31 | -184,100,000 | [0001104659-26-064092](https://www.sec.gov/Archives/edgar/data/1513845/000110465926064092/nbis-20260331xex99d1.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M014 | NBIS | operatingCashFlow | 2025-06-30 | -167,900,000 | [0001104659-26-094844](https://www.sec.gov/Archives/edgar/data/1513845/000110465926094844/nbis-20260812xex99d1.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M015 | NBIS | operatingCashFlow | 2025-06-30 | -352,000,000 | [0001104659-26-094844](https://www.sec.gov/Archives/edgar/data/1513845/000110465926094844/nbis-20260812xex99d1.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M016 | NBIS | operatingCashFlow | 2025-09-30 | -80,400,000 | [0001104659-25-110831](https://www.sec.gov/Archives/edgar/data/1513845/000110465925110831/tm2531034d1_ex99-1.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M017 | NBIS | operatingCashFlow | 2025-09-30 | -432,400,000 | [0001104659-25-110831](https://www.sec.gov/Archives/edgar/data/1513845/000110465925110831/tm2531034d1_ex99-1.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M018 | NBIS | operatingCashFlow | 2025-12-31 | 401,900,000 | [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M019 | CRWV | ebit | 2024-12-31 | 112,316,000 | [0001769628-26-000104](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000104/crwv-20251231.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M020 | CRWV | adjustedEbitda | 2024-12-31 | 1,219,258,000 | [0001193125-26-148912](https://www.sec.gov/Archives/edgar/data/1769628/000119312526148912/d136714dex993.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M021 | IREN | revenue | 2023-03-31 | 16,382,000 | [0001140361-24-026268](https://www.sec.gov/Archives/edgar/data/1878848/000114036124026268/ef20027345_6k.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M022 | IREN | revenue | 2023-03-31 | 47,668,000 | [0001140361-24-026268](https://www.sec.gov/Archives/edgar/data/1878848/000114036124026268/ef20027345_6k.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M023 | IREN | revenue | 2023-06-30 | 27,841,000 | [0001878848-25-000063](https://www.sec.gov/Archives/edgar/data/1878848/000187884825000063/iren-20250630.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M024 | IREN | revenue | 2023-12-31 | 42,574,000 | [0001140361-24-008183](https://www.sec.gov/Archives/edgar/data/1878848/000114036124008183/ef20015356_6k.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M025 | IREN | revenue | 2024-06-30 | 55,872,000 | [0001878848-26-000052](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M026 | IREN | ebit | 2023-12-31 | -2,221,000 | [0001878848-25-000025](https://data.sec.gov/api/xbrl/companyfacts/CIK0001878848.json) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M027 | IREN | ebit | 2024-06-30 | -23,620,000 | [0001878848-26-000052](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M028 | IREN | ebit | 2025-06-30 | 17,888,000 | [0001878848-26-000052](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M029 | IREN | operatingCashFlow | 2023-06-30 | 6,727,000 | [0001878848-25-000063](https://www.sec.gov/Archives/edgar/data/1878848/000187884825000063/iren-20250630.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M030 | IREN | operatingCashFlow | 2023-09-30 | -30,269,000 | [0001878848-25-000023](https://data.sec.gov/api/xbrl/companyfacts/CIK0001878848.json) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M031 | IREN | operatingCashFlow | 2024-03-31 | -27,071,000 | [0001878848-25-000043](https://www.sec.gov/Archives/edgar/data/1878848/000187884825000043/iren-20250331.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M032 | IREN | operatingCashFlow | 2024-03-31 | -81,505,000 | [0001878848-25-000043](https://www.sec.gov/Archives/edgar/data/1878848/000187884825000043/iren-20250331.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M033 | IREN | operatingCashFlow | 2024-06-30 | 133,724,000 | [0001878848-26-000052](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M034 | IREN | operatingCashFlow | 2024-12-31 | 53,556,000 | [0001878848-26-000015](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000015/iren-20251231.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M035 | IREN | operatingCashFlow | 2025-03-31 | 93,104,000 | [0001878848-26-000026](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000026/iren-20260331.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M036 | IREN | operatingCashFlow | 2025-06-30 | 103,141,000 | [0001878848-26-000052](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |
| M037 | AMZN | grossProfit | 2022-12-31 | -3,123,000,000 | [0001018724-24-000008](https://www.sec.gov/Archives/edgar/data/1018724/000101872424000008/amzn-20231231.htm) | Provider candidate and SEC source differ for this economic period; mapping, recast, and scope require adjudication. |

Two permanent regression fixtures show the material behavior: GEV Fiscal.ai LTM Adjusted EBITDA 4.157B versus SEC-supported 4.115B, a 42M difference; IREN Fiscal.ai FY2026 cash Capex 4.433391B includes 100.304M of prepayments versus SEC-supported 4.333087B cash Capex. Both provider values were already supplied for these narrowly scoped regression tests; no full statement export is published.

### Original 69 provider/SEC observation mismatches

This preserves every initially identified conflict for independent review. “No longer flagged” means the latest candidate mapping no longer produces that conflict; it does not imply the original Fiscal.ai observation was corrected by the provider.

| ID | Ticker | Metric | Economic end | SEC USD | SEC filing | Current disposition |
| --- | --- | --- | --- | ---: | --- | --- |
| M001 | GEV | adjustedEbitda | 2026-06-30 | 4,115,000,000 | [0001996810-26-000147](https://www.sec.gov/Archives/edgar/data/1996810/000199681026000147/gevpressrelease2q26.htm) | STILL_FLAGGED |
| M002 | FCEL | capitalExpenditures | 2022-01-31 | 5,331,000 | [0001558370-23-003256](https://www.sec.gov/Archives/edgar/data/886128/000155837023003256/fcel-20230131x10q.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M003 | FCEL | capitalExpenditures | 2022-04-30 | 5,064,000 | [0001558370-23-010890](https://www.sec.gov/Archives/edgar/data/886128/000155837023010890/fcel-20230430x10q.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M004 | FCEL | capitalExpenditures | 2022-04-30 | 10,395,000 | [0001558370-23-010890](https://www.sec.gov/Archives/edgar/data/886128/000155837023010890/fcel-20230430x10q.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M005 | FCEL | capitalExpenditures | 2022-07-31 | 5,395,000 | [0001558370-23-015619](https://www.sec.gov/Archives/edgar/data/886128/000155837023015619/fcel-20230731x10q.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M006 | FCEL | capitalExpenditures | 2022-07-31 | 15,790,000 | [0001558370-23-015619](https://www.sec.gov/Archives/edgar/data/886128/000155837023015619/fcel-20230731x10q.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M007 | FCEL | capitalExpenditures | 2022-10-31 | 5,288,000 | [0001558370-24-016497](https://www.sec.gov/Archives/edgar/data/886128/000155837024016497/fcel-20241031x10k.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M008 | FCEL | capitalExpenditures | 2022-10-31 | 21,078,000 | [0001558370-24-016497](https://www.sec.gov/Archives/edgar/data/886128/000155837024016497/fcel-20241031x10k.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M009 | FCEL | capitalExpenditures | 2023-01-31 | 7,765,000 | [0001558370-24-002673](https://www.sec.gov/Archives/edgar/data/886128/000155837024002673/fcel-20240131x10q.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M010 | FCEL | capitalExpenditures | 2023-04-30 | 9,138,000 | [0001558370-24-009026](https://www.sec.gov/Archives/edgar/data/886128/000155837024009026/fcel-20240430x10q.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M011 | FCEL | capitalExpenditures | 2023-04-30 | 16,903,000 | [0001558370-24-009026](https://www.sec.gov/Archives/edgar/data/886128/000155837024009026/fcel-20240430x10q.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M012 | FCEL | capitalExpenditures | 2023-07-31 | 11,199,000 | [0001558370-24-012598](https://www.sec.gov/Archives/edgar/data/886128/000155837024012598/fcel-20240731x10q.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M013 | FCEL | capitalExpenditures | 2023-07-31 | 28,102,000 | [0001558370-24-012598](https://www.sec.gov/Archives/edgar/data/886128/000155837024012598/fcel-20240731x10q.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M014 | FCEL | capitalExpenditures | 2023-10-31 | 11,253,000 | [0001104659-25-122302](https://www.sec.gov/Archives/edgar/data/886128/000110465925122302/fcel-20251031x10k.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M015 | FCEL | capitalExpenditures | 2023-10-31 | 39,355,000 | [0001104659-25-122302](https://www.sec.gov/Archives/edgar/data/886128/000110465925122302/fcel-20251031x10k.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M016 | FCEL | capitalExpenditures | 2024-01-31 | 10,565,000 | [0001558370-25-002637](https://www.sec.gov/Archives/edgar/data/886128/000155837025002637/fcel-20250131x10q.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M017 | FCEL | capitalExpenditures | 2024-04-30 | 13,208,000 | [0001558370-25-008463](https://www.sec.gov/Archives/edgar/data/886128/000155837025008463/fcel-20250430x10q.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M018 | FCEL | capitalExpenditures | 2024-04-30 | 23,773,000 | [0001558370-25-008463](https://www.sec.gov/Archives/edgar/data/886128/000155837025008463/fcel-20250430x10q.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M019 | FCEL | capitalExpenditures | 2024-07-31 | 13,403,000 | [0001558370-25-011952](https://www.sec.gov/Archives/edgar/data/886128/000155837025011952/fcel-20250731x10q.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M020 | FCEL | capitalExpenditures | 2024-07-31 | 37,176,000 | [0001558370-25-011952](https://www.sec.gov/Archives/edgar/data/886128/000155837025011952/fcel-20250731x10q.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M021 | FCEL | capitalExpenditures | 2024-10-31 | 10,545,000 | [0001104659-25-122302](https://www.sec.gov/Archives/edgar/data/886128/000110465925122302/fcel-20251031x10k.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M022 | FCEL | capitalExpenditures | 2024-10-31 | 47,721,000 | [0001104659-25-122302](https://www.sec.gov/Archives/edgar/data/886128/000110465925122302/fcel-20251031x10k.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M023 | FCEL | capitalExpenditures | 2025-01-31 | 7,060,000 | [0001104659-26-024970](https://www.sec.gov/Archives/edgar/data/886128/000110465926024970/fcel-20260131x10q.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M024 | FCEL | capitalExpenditures | 2025-04-30 | 5,281,000 | [0001104659-26-071183](https://www.sec.gov/Archives/edgar/data/886128/000110465926071183/fcel-20260430x10q.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M025 | FCEL | capitalExpenditures | 2025-04-30 | 12,341,000 | [0001104659-26-071183](https://www.sec.gov/Archives/edgar/data/886128/000110465926071183/fcel-20260430x10q.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M026 | FCEL | capitalExpenditures | 2025-07-31 | 5,245,000 | [0001104659-26-104501](https://www.sec.gov/Archives/edgar/data/886128/000110465926104501/fcel-20260731x10q.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M027 | FCEL | capitalExpenditures | 2025-07-31 | 17,586,000 | [0001104659-26-104501](https://www.sec.gov/Archives/edgar/data/886128/000110465926104501/fcel-20260731x10q.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M028 | FCEL | capitalExpenditures | 2025-10-31 | 1,015,000 | [0001104659-25-122302](https://www.sec.gov/Archives/edgar/data/886128/000110465925122302/fcel-20251031x10k.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M029 | FCEL | capitalExpenditures | 2025-10-31 | 18,601,000 | [0001104659-25-122302](https://www.sec.gov/Archives/edgar/data/886128/000110465925122302/fcel-20251031x10k.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M030 | FCEL | capitalExpenditures | 2026-01-31 | 773,000 | [0001104659-26-024970](https://www.sec.gov/Archives/edgar/data/886128/000110465926024970/fcel-20260131x10q.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M031 | FCEL | capitalExpenditures | 2026-04-30 | 1,704,000 | [0001104659-26-071183](https://www.sec.gov/Archives/edgar/data/886128/000110465926071183/fcel-20260430x10q.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M032 | FCEL | capitalExpenditures | 2026-04-30 | 2,477,000 | [0001104659-26-071183](https://www.sec.gov/Archives/edgar/data/886128/000110465926071183/fcel-20260430x10q.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M033 | FCEL | capitalExpenditures | 2026-07-31 | 1,322,000 | [0001104659-26-104501](https://www.sec.gov/Archives/edgar/data/886128/000110465926104501/fcel-20260731x10q.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M034 | FCEL | capitalExpenditures | 2026-07-31 | 3,799,000 | [0001104659-26-104501](https://www.sec.gov/Archives/edgar/data/886128/000110465926104501/fcel-20260731x10q.htm) | NO_LONGER_FLAGGED_AFTER_MAPPING_FIX |
| M035 | INTC | revenue | 2022-07-02 | 24,664,000,000 | [0000050863-24-000124](https://www.sec.gov/Archives/edgar/data/50863/000005086324000124/intc-20240629.htm) | STILL_FLAGGED |
| M036 | INTC | ebit | 2022-07-02 | -2,484,000,000 | [0000050863-24-000124](https://www.sec.gov/Archives/edgar/data/50863/000005086324000124/intc-20240629.htm) | STILL_FLAGGED |
| M037 | NBIS | revenue | 2023-03-31 | 163,275 | [0001513845-24-000012](https://www.sec.gov/Archives/edgar/data/1513845/000151384524000012/yndx-20240331xex99d1.htm) | STILL_FLAGGED |
| M038 | NBIS | revenue | 2023-12-31 | 6,700,000 | [0001104659-25-015480](https://www.sec.gov/Archives/edgar/data/1513845/000110465925015480/tm257185d1_ex99-1.htm) | STILL_FLAGGED |
| M039 | NBIS | revenue | 2024-03-31 | 229,359 | [0001513845-24-000012](https://www.sec.gov/Archives/edgar/data/1513845/000151384524000012/yndx-20240331xex99d1.htm) | STILL_FLAGGED |
| M040 | NBIS | grossProfit | 2023-12-31 | -3,100,000 | [0001104659-25-015480](https://www.sec.gov/Archives/edgar/data/1513845/000110465925015480/tm257185d1_ex99-1.htm) | STILL_FLAGGED |
| M041 | NBIS | ebit | 2023-03-31 | 1,970 | [0001513845-24-000012](https://www.sec.gov/Archives/edgar/data/1513845/000151384524000012/yndx-20240331xex99d1.htm) | STILL_FLAGGED |
| M042 | NBIS | ebit | 2023-12-31 | -93,500,000 | [0001104659-25-015480](https://www.sec.gov/Archives/edgar/data/1513845/000110465925015480/tm257185d1_ex99-1.htm) | STILL_FLAGGED |
| M043 | NBIS | ebit | 2024-03-31 | 15,766 | [0001513845-24-000012](https://www.sec.gov/Archives/edgar/data/1513845/000151384524000012/yndx-20240331xex99d1.htm) | STILL_FLAGGED |
| M044 | NBIS | ebit | 2025-12-31 | -250,000,000 | [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm) | STILL_FLAGGED |
| M045 | NBIS | operatingCashFlow | 2024-09-30 | -196,800,000 | [0001104659-25-110831](https://www.sec.gov/Archives/edgar/data/1513845/000110465925110831/tm2531034d1_ex99-1.htm) | STILL_FLAGGED |
| M046 | NBIS | operatingCashFlow | 2025-03-31 | -184,100,000 | [0001104659-26-064092](https://www.sec.gov/Archives/edgar/data/1513845/000110465926064092/nbis-20260331xex99d1.htm) | STILL_FLAGGED |
| M047 | NBIS | operatingCashFlow | 2025-06-30 | -167,900,000 | [0001104659-26-094844](https://www.sec.gov/Archives/edgar/data/1513845/000110465926094844/nbis-20260812xex99d1.htm) | STILL_FLAGGED |
| M048 | NBIS | operatingCashFlow | 2025-06-30 | -352,000,000 | [0001104659-26-094844](https://www.sec.gov/Archives/edgar/data/1513845/000110465926094844/nbis-20260812xex99d1.htm) | STILL_FLAGGED |
| M049 | NBIS | operatingCashFlow | 2025-09-30 | -80,400,000 | [0001104659-25-110831](https://www.sec.gov/Archives/edgar/data/1513845/000110465925110831/tm2531034d1_ex99-1.htm) | STILL_FLAGGED |
| M050 | NBIS | operatingCashFlow | 2025-09-30 | -432,400,000 | [0001104659-25-110831](https://www.sec.gov/Archives/edgar/data/1513845/000110465925110831/tm2531034d1_ex99-1.htm) | STILL_FLAGGED |
| M051 | NBIS | operatingCashFlow | 2025-12-31 | 401,900,000 | [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm) | STILL_FLAGGED |
| M052 | CRWV | ebit | 2024-12-31 | 112,316,000 | [0001769628-26-000104](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000104/crwv-20251231.htm) | STILL_FLAGGED |
| M053 | IREN | revenue | 2023-03-31 | 16,382,000 | [0001140361-24-026268](https://www.sec.gov/Archives/edgar/data/1878848/000114036124026268/ef20027345_6k.htm) | STILL_FLAGGED |
| M054 | IREN | revenue | 2023-03-31 | 47,668,000 | [0001140361-24-026268](https://www.sec.gov/Archives/edgar/data/1878848/000114036124026268/ef20027345_6k.htm) | STILL_FLAGGED |
| M055 | IREN | revenue | 2023-06-30 | 27,841,000 | [0001878848-25-000063](https://www.sec.gov/Archives/edgar/data/1878848/000187884825000063/iren-20250630.htm) | STILL_FLAGGED |
| M056 | IREN | revenue | 2023-12-31 | 42,574,000 | [0001140361-24-008183](https://www.sec.gov/Archives/edgar/data/1878848/000114036124008183/ef20015356_6k.htm) | STILL_FLAGGED |
| M057 | IREN | revenue | 2024-06-30 | 55,872,000 | [0001878848-26-000052](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm) | STILL_FLAGGED |
| M058 | IREN | ebit | 2023-12-31 | -2,221,000 | [0001878848-25-000025](https://data.sec.gov/api/xbrl/companyfacts/CIK0001878848.json) | STILL_FLAGGED |
| M059 | IREN | ebit | 2024-06-30 | -23,620,000 | [0001878848-26-000052](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm) | STILL_FLAGGED |
| M060 | IREN | ebit | 2025-06-30 | 17,888,000 | [0001878848-26-000052](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm) | STILL_FLAGGED |
| M061 | IREN | operatingCashFlow | 2023-06-30 | 6,727,000 | [0001878848-25-000063](https://www.sec.gov/Archives/edgar/data/1878848/000187884825000063/iren-20250630.htm) | STILL_FLAGGED |
| M062 | IREN | operatingCashFlow | 2023-09-30 | -30,269,000 | [0001878848-25-000023](https://data.sec.gov/api/xbrl/companyfacts/CIK0001878848.json) | STILL_FLAGGED |
| M063 | IREN | operatingCashFlow | 2024-03-31 | -27,071,000 | [0001878848-25-000043](https://www.sec.gov/Archives/edgar/data/1878848/000187884825000043/iren-20250331.htm) | STILL_FLAGGED |
| M064 | IREN | operatingCashFlow | 2024-03-31 | -81,505,000 | [0001878848-25-000043](https://www.sec.gov/Archives/edgar/data/1878848/000187884825000043/iren-20250331.htm) | STILL_FLAGGED |
| M065 | IREN | operatingCashFlow | 2024-06-30 | 133,724,000 | [0001878848-26-000052](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm) | STILL_FLAGGED |
| M066 | IREN | operatingCashFlow | 2024-12-31 | 53,556,000 | [0001878848-26-000015](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000015/iren-20251231.htm) | STILL_FLAGGED |
| M067 | IREN | operatingCashFlow | 2025-03-31 | 93,104,000 | [0001878848-26-000026](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000026/iren-20260331.htm) | STILL_FLAGGED |
| M068 | IREN | operatingCashFlow | 2025-06-30 | 103,141,000 | [0001878848-26-000052](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm) | STILL_FLAGGED |
| M069 | AMZN | grossProfit | 2022-12-31 | -3,123,000,000 | [0001018724-24-000008](https://www.sec.gov/Archives/edgar/data/1018724/000101872424000008/amzn-20231231.htm) | STILL_FLAGGED |

## All 336 classified cells

Values are USD. The linked machine-readable file retains all public SEC source references and component periods.

| Ticker | Metric | Period | Value | Status | Calculation | Filing references |
| --- | --- | --- | ---: | --- | --- | --- |
| BE | revenue | 2023A | 1,333,470,000 | VERIFIED_REPORTED | unavailable | [0001628280-26-006516](https://www.sec.gov/Archives/edgar/data/1664703/000162828026006516/be-20251231.htm) |
| BE | revenue | 2024A | 1,473,856,000 | VERIFIED_REPORTED | unavailable | [0001628280-26-006516](https://www.sec.gov/Archives/edgar/data/1664703/000162828026006516/be-20251231.htm) |
| BE | revenue | 2025A | 2,023,994,000 | VERIFIED_REPORTED | unavailable | [0001628280-26-006516](https://www.sec.gov/Archives/edgar/data/1664703/000162828026006516/be-20251231.htm) |
| BE | revenue | LTM | 3,829,939,000 | VERIFIED_DERIVED | unavailable | [0001628280-26-006516](https://www.sec.gov/Archives/edgar/data/1664703/000162828026006516/be-20251231.htm), [0001628280-26-028021](https://www.sec.gov/Archives/edgar/data/1664703/000162828026028021/be-20260331.htm) |
| BE | grossProfit | 2023A | 197,794,000 | VERIFIED_REPORTED | unavailable | [0001628280-26-006516](https://www.sec.gov/Archives/edgar/data/1664703/000162828026006516/be-20251231.htm) |
| BE | grossProfit | 2024A | 404,648,000 | VERIFIED_REPORTED | unavailable | [0001628280-26-006516](https://www.sec.gov/Archives/edgar/data/1664703/000162828026006516/be-20251231.htm) |
| BE | grossProfit | 2025A | 587,400,000 | VERIFIED_REPORTED | unavailable | [0001628280-26-006516](https://www.sec.gov/Archives/edgar/data/1664703/000162828026006516/be-20251231.htm) |
| BE | grossProfit | LTM | 1,238,115,000 | VERIFIED_DERIVED | unavailable | [0001628280-26-006516](https://www.sec.gov/Archives/edgar/data/1664703/000162828026006516/be-20251231.htm), [0001628280-26-028021](https://www.sec.gov/Archives/edgar/data/1664703/000162828026028021/be-20260331.htm) |
| BE | ebit | 2023A | -208,907,000 | VERIFIED_REPORTED | unavailable | [0001628280-26-006516](https://www.sec.gov/Archives/edgar/data/1664703/000162828026006516/be-20251231.htm) |
| BE | ebit | 2024A | 22,909,000 | VERIFIED_REPORTED | unavailable | [0001628280-26-006516](https://www.sec.gov/Archives/edgar/data/1664703/000162828026006516/be-20251231.htm) |
| BE | ebit | 2025A | 72,802,000 | VERIFIED_REPORTED | unavailable | [0001628280-26-006516](https://www.sec.gov/Archives/edgar/data/1664703/000162828026006516/be-20251231.htm) |
| BE | ebit | LTM | 567,405,000 | VERIFIED_DERIVED | unavailable | [0001628280-26-006516](https://www.sec.gov/Archives/edgar/data/1664703/000162828026006516/be-20251231.htm), [0001628280-26-028021](https://www.sec.gov/Archives/edgar/data/1664703/000162828026028021/be-20260331.htm) |
| BE | operatingCashFlow | 2023A | -372,531,000 | VERIFIED_REPORTED | unavailable | [0001628280-26-006516](https://www.sec.gov/Archives/edgar/data/1664703/000162828026006516/be-20251231.htm) |
| BE | operatingCashFlow | 2024A | 91,998,000 | VERIFIED_REPORTED | unavailable | [0001628280-26-006516](https://www.sec.gov/Archives/edgar/data/1664703/000162828026006516/be-20251231.htm) |
| BE | operatingCashFlow | 2025A | 113,949,000 | VERIFIED_REPORTED | unavailable | [0001628280-26-006516](https://www.sec.gov/Archives/edgar/data/1664703/000162828026006516/be-20251231.htm) |
| BE | operatingCashFlow | LTM | 690,968,000 | VERIFIED_DERIVED | unavailable | [0001628280-26-006516](https://www.sec.gov/Archives/edgar/data/1664703/000162828026006516/be-20251231.htm), [0001628280-26-028021](https://www.sec.gov/Archives/edgar/data/1664703/000162828026028021/be-20260331.htm) |
| BE | capitalExpenditures | 2023A | 83,739,000 | VERIFIED_REPORTED | unavailable | [0001628280-26-006516](https://www.sec.gov/Archives/edgar/data/1664703/000162828026006516/be-20251231.htm) |
| BE | capitalExpenditures | 2024A | 58,852,000 | VERIFIED_REPORTED | unavailable | [0001628280-26-006516](https://www.sec.gov/Archives/edgar/data/1664703/000162828026006516/be-20251231.htm) |
| BE | capitalExpenditures | 2025A | 56,759,000 | VERIFIED_REPORTED | unavailable | [0001628280-26-006516](https://www.sec.gov/Archives/edgar/data/1664703/000162828026006516/be-20251231.htm) |
| BE | capitalExpenditures | LTM | 254,264,000 | VERIFIED_DERIVED | unavailable | [0001628280-26-006516](https://www.sec.gov/Archives/edgar/data/1664703/000162828026006516/be-20251231.htm), [0001628280-26-028021](https://www.sec.gov/Archives/edgar/data/1664703/000162828026028021/be-20260331.htm) |
| BE | freeCashFlow | 2023A | -456,270,000 | VERIFIED_DERIVED | CFO_MINUS_CAPEX | No filing link in flattened record |
| BE | freeCashFlow | 2024A | 33,146,000 | VERIFIED_DERIVED | CFO_MINUS_CAPEX | No filing link in flattened record |
| BE | freeCashFlow | 2025A | 57,190,000 | VERIFIED_DERIVED | CFO_MINUS_CAPEX | No filing link in flattened record |
| BE | freeCashFlow | LTM | 436,704,000 | VERIFIED_DERIVED | unavailable | No filing link in flattened record |
| BE | adjustedEbitda | 2023A | 81,791,000 | VERIFIED_REPORTED | COMPANY_REPORTED_ADJ_EBITDA | [0001628280-25-008626](https://www.sec.gov/Archives/edgar/data/1664703/000162828025008626/ex991_q42024financialresul.htm) |
| BE | adjustedEbitda | 2024A | 160,651,000 | VERIFIED_REPORTED | COMPANY_REPORTED_ADJ_EBITDA | [0001628280-25-008626](https://www.sec.gov/Archives/edgar/data/1664703/000162828025008626/ex991_q42024financialresul.htm) |
| BE | adjustedEbitda | 2025A | 271,591,000 | VERIFIED_REPORTED | COMPANY_REPORTED_ADJ_EBITDA | [0001628280-26-005798](https://www.sec.gov/Archives/edgar/data/1664703/000162828026005798/ex991_q42025financialresul.htm) |
| BE | adjustedEbitda | LTM | N/A | DEFINITION_INCOMPATIBLE | DEFINITION_INCOMPATIBLE | [0001628280-26-027913](https://www.sec.gov/Archives/edgar/data/1664703/000162828026027913/ex991_q126financialresults.htm), [0001628280-26-050150](https://www.sec.gov/Archives/edgar/data/1664703/000162828026050150/ex991_q226financialresults.htm) |
| GEV | revenue | 2023A | 33,239,000,000 | VERIFIED_REPORTED | unavailable | [0001996810-26-000015](https://www.sec.gov/Archives/edgar/data/1996810/000199681026000015/gev-20251231.htm) |
| GEV | revenue | 2024A | 34,935,000,000 | VERIFIED_REPORTED | unavailable | [0001996810-26-000015](https://www.sec.gov/Archives/edgar/data/1996810/000199681026000015/gev-20251231.htm) |
| GEV | revenue | 2025A | 38,068,000,000 | VERIFIED_REPORTED | unavailable | [0001996810-26-000015](https://www.sec.gov/Archives/edgar/data/1996810/000199681026000015/gev-20251231.htm) |
| GEV | revenue | LTM | 41,368,000,000 | VERIFIED_DERIVED | unavailable | [0001996810-25-000160](https://www.sec.gov/Archives/edgar/data/1996810/000199681025000160/gev-20250930.htm), [0001996810-26-000015](https://www.sec.gov/Archives/edgar/data/1996810/000199681026000015/gev-20251231.htm) |
| GEV | grossProfit | 2023A | 4,818,000,000 | VERIFIED_REPORTED | unavailable | [0001996810-26-000015](https://www.sec.gov/Archives/edgar/data/1996810/000199681026000015/gev-20251231.htm) |
| GEV | grossProfit | 2024A | 6,085,000,000 | VERIFIED_REPORTED | unavailable | [0001996810-26-000015](https://www.sec.gov/Archives/edgar/data/1996810/000199681026000015/gev-20251231.htm) |
| GEV | grossProfit | 2025A | 7,535,000,000 | VERIFIED_REPORTED | unavailable | [0001996810-26-000015](https://www.sec.gov/Archives/edgar/data/1996810/000199681026000015/gev-20251231.htm) |
| GEV | grossProfit | LTM | 8,360,000,000 | VERIFIED_DERIVED | unavailable | [0001996810-25-000160](https://www.sec.gov/Archives/edgar/data/1996810/000199681025000160/gev-20250930.htm), [0001996810-26-000015](https://www.sec.gov/Archives/edgar/data/1996810/000199681026000015/gev-20251231.htm) |
| GEV | ebit | 2023A | -923,000,000 | VERIFIED_REPORTED | unavailable | [0001996810-26-000015](https://www.sec.gov/Archives/edgar/data/1996810/000199681026000015/gev-20251231.htm) |
| GEV | ebit | 2024A | 471,000,000 | VERIFIED_REPORTED | unavailable | [0001996810-26-000015](https://www.sec.gov/Archives/edgar/data/1996810/000199681026000015/gev-20251231.htm) |
| GEV | ebit | 2025A | 1,388,000,000 | VERIFIED_REPORTED | unavailable | [0001996810-26-000015](https://www.sec.gov/Archives/edgar/data/1996810/000199681026000015/gev-20251231.htm) |
| GEV | ebit | LTM | 1,799,000,000 | VERIFIED_DERIVED | unavailable | [0001996810-25-000160](https://www.sec.gov/Archives/edgar/data/1996810/000199681025000160/gev-20250930.htm), [0001996810-26-000015](https://www.sec.gov/Archives/edgar/data/1996810/000199681026000015/gev-20251231.htm) |
| GEV | operatingCashFlow | 2023A | 1,186,000,000 | VERIFIED_REPORTED | unavailable | [0001996810-26-000015](https://www.sec.gov/Archives/edgar/data/1996810/000199681026000015/gev-20251231.htm) |
| GEV | operatingCashFlow | 2024A | 2,583,000,000 | VERIFIED_REPORTED | unavailable | [0001996810-26-000015](https://www.sec.gov/Archives/edgar/data/1996810/000199681026000015/gev-20251231.htm) |
| GEV | operatingCashFlow | 2025A | 4,987,000,000 | VERIFIED_REPORTED | unavailable | [0001996810-26-000015](https://www.sec.gov/Archives/edgar/data/1996810/000199681026000015/gev-20251231.htm) |
| GEV | operatingCashFlow | LTM | 14,139,000,000 | VERIFIED_DERIVED | unavailable | [0001996810-25-000160](https://www.sec.gov/Archives/edgar/data/1996810/000199681025000160/gev-20250930.htm), [0001996810-26-000015](https://www.sec.gov/Archives/edgar/data/1996810/000199681026000015/gev-20251231.htm) |
| GEV | capitalExpenditures | 2023A | 744,000,000 | VERIFIED_REPORTED | unavailable | [0001996810-26-000015](https://www.sec.gov/Archives/edgar/data/1996810/000199681026000015/gev-20251231.htm) |
| GEV | capitalExpenditures | 2024A | 883,000,000 | VERIFIED_REPORTED | unavailable | [0001996810-26-000015](https://www.sec.gov/Archives/edgar/data/1996810/000199681026000015/gev-20251231.htm) |
| GEV | capitalExpenditures | 2025A | 1,277,000,000 | VERIFIED_REPORTED | unavailable | [0001996810-26-000015](https://www.sec.gov/Archives/edgar/data/1996810/000199681026000015/gev-20251231.htm) |
| GEV | capitalExpenditures | LTM | 1,701,000,000 | VERIFIED_DERIVED | unavailable | [0001996810-25-000160](https://www.sec.gov/Archives/edgar/data/1996810/000199681025000160/gev-20250930.htm), [0001996810-26-000015](https://www.sec.gov/Archives/edgar/data/1996810/000199681026000015/gev-20251231.htm) |
| GEV | freeCashFlow | 2023A | 442,000,000 | VERIFIED_DERIVED | CFO_MINUS_CAPEX | No filing link in flattened record |
| GEV | freeCashFlow | 2024A | 1,700,000,000 | VERIFIED_DERIVED | CFO_MINUS_CAPEX | No filing link in flattened record |
| GEV | freeCashFlow | 2025A | 3,710,000,000 | VERIFIED_DERIVED | CFO_MINUS_CAPEX | No filing link in flattened record |
| GEV | freeCashFlow | LTM | 12,438,000,000 | VERIFIED_DERIVED | unavailable | No filing link in flattened record |
| GEV | adjustedEbitda | 2023A | 807,000,000 | VERIFIED_REPORTED | COMPANY_REPORTED_ADJ_EBITDA | [0001193125-24-037526](https://www.sec.gov/Archives/edgar/data/1996810/000119312524037526/d542465dex991.htm) |
| GEV | adjustedEbitda | 2024A | 2,035,000,000 | VERIFIED_REPORTED | COMPANY_REPORTED_ADJ_EBITDA | [0001996810-25-000004](https://www.sec.gov/Archives/edgar/data/1996810/000199681025000004/gev4q2024earningsrelease.htm) |
| GEV | adjustedEbitda | 2025A | 3,196,000,000 | VERIFIED_REPORTED | COMPANY_REPORTED_ADJ_EBITDA | [0001996810-26-000012](https://www.sec.gov/Archives/edgar/data/1996810/000199681026000012/gevpressrelease4q25.htm) |
| GEV | adjustedEbitda | LTM | 4,115,000,000 | VERIFIED_DERIVED | SUM_OF_LATEST_FOUR_COMPATIBLE_STANDALONE_QUARTERS | [0001996810-25-000160](https://www.sec.gov/Archives/edgar/data/1996810/000199681025000160/gev-20250930.htm), [0001996810-26-000012](https://www.sec.gov/Archives/edgar/data/1996810/000199681026000012/gevpressrelease4q25.htm) |
| FCEL | revenue | 2023A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0001558370-24-002673](https://www.sec.gov/Archives/edgar/data/886128/000155837024002673/fcel-20240131x10q.htm), [0001558370-24-009026](https://www.sec.gov/Archives/edgar/data/886128/000155837024009026/fcel-20240430x10q.htm) |
| FCEL | revenue | 2024A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0001558370-25-002637](https://www.sec.gov/Archives/edgar/data/886128/000155837025002637/fcel-20250131x10q.htm), [0001558370-25-008463](https://www.sec.gov/Archives/edgar/data/886128/000155837025008463/fcel-20250430x10q.htm) |
| FCEL | revenue | 2025A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0001104659-26-024970](https://www.sec.gov/Archives/edgar/data/886128/000110465926024970/fcel-20260131x10q.htm), [0001104659-26-071183](https://www.sec.gov/Archives/edgar/data/886128/000110465926071183/fcel-20260430x10q.htm) |
| FCEL | revenue | LTM | 154,137,000 | VERIFIED_DERIVED | unavailable | [0001104659-25-122302](https://www.sec.gov/Archives/edgar/data/886128/000110465925122302/fcel-20251031x10k.htm), [0001104659-26-024970](https://www.sec.gov/Archives/edgar/data/886128/000110465926024970/fcel-20260131x10q.htm) |
| FCEL | grossProfit | 2023A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0001558370-24-002673](https://www.sec.gov/Archives/edgar/data/886128/000155837024002673/fcel-20240131x10q.htm), [0001558370-24-009026](https://www.sec.gov/Archives/edgar/data/886128/000155837024009026/fcel-20240430x10q.htm) |
| FCEL | grossProfit | 2024A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0001558370-25-002637](https://www.sec.gov/Archives/edgar/data/886128/000155837025002637/fcel-20250131x10q.htm), [0001558370-25-008463](https://www.sec.gov/Archives/edgar/data/886128/000155837025008463/fcel-20250430x10q.htm) |
| FCEL | grossProfit | 2025A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0001104659-26-024970](https://www.sec.gov/Archives/edgar/data/886128/000110465926024970/fcel-20260131x10q.htm), [0001104659-26-071183](https://www.sec.gov/Archives/edgar/data/886128/000110465926071183/fcel-20260430x10q.htm) |
| FCEL | grossProfit | LTM | -49,921,000 | VERIFIED_DERIVED | unavailable | [0001104659-25-122302](https://www.sec.gov/Archives/edgar/data/886128/000110465925122302/fcel-20251031x10k.htm), [0001104659-26-024970](https://www.sec.gov/Archives/edgar/data/886128/000110465926024970/fcel-20260131x10q.htm) |
| FCEL | ebit | 2023A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0001558370-24-002673](https://www.sec.gov/Archives/edgar/data/886128/000155837024002673/fcel-20240131x10q.htm), [0001558370-24-009026](https://www.sec.gov/Archives/edgar/data/886128/000155837024009026/fcel-20240430x10q.htm) |
| FCEL | ebit | 2024A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0001558370-25-002637](https://www.sec.gov/Archives/edgar/data/886128/000155837025002637/fcel-20250131x10q.htm), [0001558370-25-008463](https://www.sec.gov/Archives/edgar/data/886128/000155837025008463/fcel-20250430x10q.htm) |
| FCEL | ebit | 2025A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0001104659-26-024970](https://www.sec.gov/Archives/edgar/data/886128/000110465926024970/fcel-20260131x10q.htm), [0001104659-26-071183](https://www.sec.gov/Archives/edgar/data/886128/000110465926071183/fcel-20260430x10q.htm) |
| FCEL | ebit | LTM | -179,186,000 | VERIFIED_DERIVED | unavailable | [0001104659-25-122302](https://www.sec.gov/Archives/edgar/data/886128/000110465925122302/fcel-20251031x10k.htm), [0001104659-26-024970](https://www.sec.gov/Archives/edgar/data/886128/000110465926024970/fcel-20260131x10q.htm) |
| FCEL | operatingCashFlow | 2023A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0001558370-24-002673](https://www.sec.gov/Archives/edgar/data/886128/000155837024002673/fcel-20240131x10q.htm), [0001558370-24-009026](https://www.sec.gov/Archives/edgar/data/886128/000155837024009026/fcel-20240430x10q.htm) |
| FCEL | operatingCashFlow | 2024A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0001558370-25-002637](https://www.sec.gov/Archives/edgar/data/886128/000155837025002637/fcel-20250131x10q.htm), [0001558370-25-008463](https://www.sec.gov/Archives/edgar/data/886128/000155837025008463/fcel-20250430x10q.htm) |
| FCEL | operatingCashFlow | 2025A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0001104659-26-024970](https://www.sec.gov/Archives/edgar/data/886128/000110465926024970/fcel-20260131x10q.htm), [0001104659-26-071183](https://www.sec.gov/Archives/edgar/data/886128/000110465926071183/fcel-20260430x10q.htm) |
| FCEL | operatingCashFlow | LTM | -96,301,000 | VERIFIED_DERIVED | unavailable | [0001104659-25-122302](https://www.sec.gov/Archives/edgar/data/886128/000110465925122302/fcel-20251031x10k.htm), [0001104659-26-024970](https://www.sec.gov/Archives/edgar/data/886128/000110465926024970/fcel-20260131x10q.htm) |
| FCEL | capitalExpenditures | 2023A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0001558370-24-002673](https://www.sec.gov/Archives/edgar/data/886128/000155837024002673/fcel-20240131x10q.htm), [0001558370-24-009026](https://www.sec.gov/Archives/edgar/data/886128/000155837024009026/fcel-20240430x10q.htm) |
| FCEL | capitalExpenditures | 2024A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0001558370-25-002637](https://www.sec.gov/Archives/edgar/data/886128/000155837025002637/fcel-20250131x10q.htm), [0001558370-25-008463](https://www.sec.gov/Archives/edgar/data/886128/000155837025008463/fcel-20250430x10q.htm) |
| FCEL | capitalExpenditures | 2025A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0001104659-26-024970](https://www.sec.gov/Archives/edgar/data/886128/000110465926024970/fcel-20260131x10q.htm), [0001104659-26-071183](https://www.sec.gov/Archives/edgar/data/886128/000110465926071183/fcel-20260430x10q.htm) |
| FCEL | capitalExpenditures | LTM | 4,814,000 | VERIFIED_DERIVED | unavailable | [0001104659-25-122302](https://www.sec.gov/Archives/edgar/data/886128/000110465925122302/fcel-20251031x10k.htm), [0001104659-26-024970](https://www.sec.gov/Archives/edgar/data/886128/000110465926024970/fcel-20260131x10q.htm) |
| FCEL | freeCashFlow | 2023A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | No filing link in flattened record |
| FCEL | freeCashFlow | 2024A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | No filing link in flattened record |
| FCEL | freeCashFlow | 2025A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | No filing link in flattened record |
| FCEL | freeCashFlow | LTM | -101,115,000 | VERIFIED_DERIVED | unavailable | No filing link in flattened record |
| FCEL | adjustedEbitda | 2023A | N/A | INSUFFICIENT_PERIOD_COVERAGE | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE | [0001104659-26-104498](https://www.sec.gov/Archives/edgar/data/886128/000110465926104498/fcel-20260902xex99d1.htm), [0001104659-26-071181](https://www.sec.gov/Archives/edgar/data/886128/000110465926071181/fcel-20260608xex99d1.htm) |
| FCEL | adjustedEbitda | 2024A | N/A | INSUFFICIENT_PERIOD_COVERAGE | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE | [0001104659-26-071181](https://www.sec.gov/Archives/edgar/data/886128/000110465926071181/fcel-20260608xex99d1.htm), [0001104659-26-071181](https://www.sec.gov/Archives/edgar/data/886128/000110465926071181/fcel-20260608xex99d1.htm) |
| FCEL | adjustedEbitda | 2025A | N/A | INSUFFICIENT_PERIOD_COVERAGE | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE | [0001104659-26-071181](https://www.sec.gov/Archives/edgar/data/886128/000110465926071181/fcel-20260608xex99d1.htm), [0001104659-26-071181](https://www.sec.gov/Archives/edgar/data/886128/000110465926071181/fcel-20260608xex99d1.htm) |
| FCEL | adjustedEbitda | LTM | N/A | DEFINITION_INCOMPATIBLE | DEFINITION_INCOMPATIBLE | [0001104659-25-122295](https://www.sec.gov/Archives/edgar/data/886128/000110465925122295/fcel-20251218xex99d1.htm), [0001104659-26-104498](https://www.sec.gov/Archives/edgar/data/886128/000110465926104498/fcel-20260902xex99d1.htm) |
| INTC | revenue | 2023A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0000050863-24-000076](https://www.sec.gov/Archives/edgar/data/50863/000005086324000076/intc-20240330.htm), [0000050863-24-000124](https://www.sec.gov/Archives/edgar/data/50863/000005086324000124/intc-20240629.htm) |
| INTC | revenue | 2024A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0000050863-25-000074](https://www.sec.gov/Archives/edgar/data/50863/000005086325000074/intc-20250329.htm), [0000050863-25-000109](https://www.sec.gov/Archives/edgar/data/50863/000005086325000109/intc-20250628.htm) |
| INTC | revenue | 2025A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0000050863-26-000079](https://www.sec.gov/Archives/edgar/data/50863/000005086326000079/intc-20260328.htm), [0000050863-26-000157](https://www.sec.gov/Archives/edgar/data/50863/000005086326000157/intc-20260627.htm) |
| INTC | revenue | LTM | 57,032,000,000 | VERIFIED_DERIVED | unavailable | [0000050863-25-000179](https://www.sec.gov/Archives/edgar/data/50863/000005086325000179/intc-20250927.htm), [0000050863-26-000011](https://www.sec.gov/Archives/edgar/data/50863/000005086326000011/intc-20251227.htm) |
| INTC | grossProfit | 2023A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0000050863-24-000076](https://www.sec.gov/Archives/edgar/data/50863/000005086324000076/intc-20240330.htm), [0000050863-24-000124](https://www.sec.gov/Archives/edgar/data/50863/000005086324000124/intc-20240629.htm) |
| INTC | grossProfit | 2024A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0000050863-25-000074](https://www.sec.gov/Archives/edgar/data/50863/000005086325000074/intc-20250329.htm), [0000050863-25-000109](https://www.sec.gov/Archives/edgar/data/50863/000005086325000109/intc-20250628.htm) |
| INTC | grossProfit | 2025A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0000050863-26-000079](https://www.sec.gov/Archives/edgar/data/50863/000005086326000079/intc-20260328.htm), [0000050863-26-000157](https://www.sec.gov/Archives/edgar/data/50863/000005086326000157/intc-20260627.htm) |
| INTC | grossProfit | LTM | 22,017,000,000 | VERIFIED_DERIVED | unavailable | [0000050863-25-000179](https://www.sec.gov/Archives/edgar/data/50863/000005086325000179/intc-20250927.htm), [0000050863-26-000011](https://www.sec.gov/Archives/edgar/data/50863/000005086326000011/intc-20251227.htm) |
| INTC | ebit | 2023A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0000050863-24-000076](https://www.sec.gov/Archives/edgar/data/50863/000005086324000076/intc-20240330.htm), [0000050863-24-000124](https://www.sec.gov/Archives/edgar/data/50863/000005086324000124/intc-20240629.htm) |
| INTC | ebit | 2024A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0000050863-25-000074](https://www.sec.gov/Archives/edgar/data/50863/000005086325000074/intc-20250329.htm), [0000050863-25-000109](https://www.sec.gov/Archives/edgar/data/50863/000005086325000109/intc-20250628.htm) |
| INTC | ebit | 2025A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0000050863-26-000079](https://www.sec.gov/Archives/edgar/data/50863/000005086326000079/intc-20260328.htm), [0000050863-26-000157](https://www.sec.gov/Archives/edgar/data/50863/000005086326000157/intc-20260627.htm) |
| INTC | ebit | LTM | -77,000,000 | VERIFIED_DERIVED | unavailable | [0000050863-25-000179](https://www.sec.gov/Archives/edgar/data/50863/000005086325000179/intc-20250927.htm), [0000050863-26-000011](https://www.sec.gov/Archives/edgar/data/50863/000005086326000011/intc-20251227.htm) |
| INTC | operatingCashFlow | 2023A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0000050863-24-000076](https://www.sec.gov/Archives/edgar/data/50863/000005086324000076/intc-20240330.htm), [0000050863-24-000124](https://www.sec.gov/Archives/edgar/data/50863/000005086324000124/intc-20240629.htm) |
| INTC | operatingCashFlow | 2024A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0000050863-25-000074](https://www.sec.gov/Archives/edgar/data/50863/000005086325000074/intc-20250329.htm), [0000050863-25-000109](https://www.sec.gov/Archives/edgar/data/50863/000005086325000109/intc-20250628.htm) |
| INTC | operatingCashFlow | 2025A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0000050863-26-000079](https://www.sec.gov/Archives/edgar/data/50863/000005086326000079/intc-20260328.htm), [0000050863-26-000157](https://www.sec.gov/Archives/edgar/data/50863/000005086326000157/intc-20260627.htm) |
| INTC | operatingCashFlow | LTM | 14,936,000,000 | VERIFIED_DERIVED | unavailable | [0000050863-25-000179](https://www.sec.gov/Archives/edgar/data/50863/000005086325000179/intc-20250927.htm), [0000050863-26-000011](https://www.sec.gov/Archives/edgar/data/50863/000005086326000011/intc-20251227.htm) |
| INTC | capitalExpenditures | 2023A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0000050863-24-000076](https://www.sec.gov/Archives/edgar/data/50863/000005086324000076/intc-20240330.htm), [0000050863-24-000124](https://www.sec.gov/Archives/edgar/data/50863/000005086324000124/intc-20240629.htm) |
| INTC | capitalExpenditures | 2024A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0000050863-25-000074](https://www.sec.gov/Archives/edgar/data/50863/000005086325000074/intc-20250329.htm), [0000050863-25-000109](https://www.sec.gov/Archives/edgar/data/50863/000005086325000109/intc-20250628.htm) |
| INTC | capitalExpenditures | 2025A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0000050863-26-000079](https://www.sec.gov/Archives/edgar/data/50863/000005086326000079/intc-20260328.htm), [0000050863-26-000157](https://www.sec.gov/Archives/edgar/data/50863/000005086326000157/intc-20260627.htm) |
| INTC | capitalExpenditures | LTM | 12,105,000,000 | VERIFIED_DERIVED | unavailable | [0000050863-25-000179](https://www.sec.gov/Archives/edgar/data/50863/000005086325000179/intc-20250927.htm), [0000050863-26-000011](https://www.sec.gov/Archives/edgar/data/50863/000005086326000011/intc-20251227.htm) |
| INTC | freeCashFlow | 2023A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | No filing link in flattened record |
| INTC | freeCashFlow | 2024A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | No filing link in flattened record |
| INTC | freeCashFlow | 2025A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | No filing link in flattened record |
| INTC | freeCashFlow | LTM | 2,831,000,000 | VERIFIED_DERIVED | unavailable | No filing link in flattened record |
| INTC | adjustedEbitda | 2023A | N/A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE | No filing link in flattened record |
| INTC | adjustedEbitda | 2024A | N/A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE | No filing link in flattened record |
| INTC | adjustedEbitda | 2025A | N/A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE | No filing link in flattened record |
| INTC | adjustedEbitda | LTM | N/A | MISSING_SOURCE_DATA | FOUR_STANDALONE_QUARTERS_UNAVAILABLE | No filing link in flattened record |
| MU | revenue | 2023A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0000723125-24-000007](https://www.sec.gov/Archives/edgar/data/723125/000072312524000007/mu-20240229.htm), [0000723125-24-000019](https://www.sec.gov/Archives/edgar/data/723125/000072312524000019/mu-20240530.htm) |
| MU | revenue | 2024A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0000723125-25-000009](https://www.sec.gov/Archives/edgar/data/723125/000072312525000009/mu-20250227.htm), [0000723125-25-000021](https://www.sec.gov/Archives/edgar/data/723125/000072312525000021/mu-20250529.htm) |
| MU | revenue | 2025A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0000723125-26-000006](https://www.sec.gov/Archives/edgar/data/723125/000072312526000006/mu-20260226.htm), [0000723125-26-000015](https://www.sec.gov/Archives/edgar/data/723125/000072312526000015/mu-20260528.htm) |
| MU | revenue | LTM | 133,188,000,000 | VERIFIED_REPORTED | LATEST_VERIFIED_FULL_YEAR | [0000723125-26-000023](https://www.sec.gov/Archives/edgar/data/723125/000072312526000023/mu-20260903.htm) |
| MU | grossProfit | 2023A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0000723125-24-000007](https://www.sec.gov/Archives/edgar/data/723125/000072312524000007/mu-20240229.htm), [0000723125-24-000019](https://www.sec.gov/Archives/edgar/data/723125/000072312524000019/mu-20240530.htm) |
| MU | grossProfit | 2024A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0000723125-25-000009](https://www.sec.gov/Archives/edgar/data/723125/000072312525000009/mu-20250227.htm), [0000723125-25-000021](https://www.sec.gov/Archives/edgar/data/723125/000072312525000021/mu-20250529.htm) |
| MU | grossProfit | 2025A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0000723125-26-000006](https://www.sec.gov/Archives/edgar/data/723125/000072312526000006/mu-20260226.htm), [0000723125-26-000015](https://www.sec.gov/Archives/edgar/data/723125/000072312526000015/mu-20260528.htm) |
| MU | grossProfit | LTM | 107,504,000,000 | VERIFIED_REPORTED | LATEST_VERIFIED_FULL_YEAR | [0000723125-26-000023](https://www.sec.gov/Archives/edgar/data/723125/000072312526000023/mu-20260903.htm) |
| MU | ebit | 2023A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0000723125-24-000007](https://www.sec.gov/Archives/edgar/data/723125/000072312524000007/mu-20240229.htm), [0000723125-24-000019](https://www.sec.gov/Archives/edgar/data/723125/000072312524000019/mu-20240530.htm) |
| MU | ebit | 2024A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0000723125-25-000009](https://www.sec.gov/Archives/edgar/data/723125/000072312525000009/mu-20250227.htm), [0000723125-25-000021](https://www.sec.gov/Archives/edgar/data/723125/000072312525000021/mu-20250529.htm) |
| MU | ebit | 2025A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0000723125-26-000006](https://www.sec.gov/Archives/edgar/data/723125/000072312526000006/mu-20260226.htm), [0000723125-26-000015](https://www.sec.gov/Archives/edgar/data/723125/000072312526000015/mu-20260528.htm) |
| MU | ebit | LTM | 99,340,000,000 | VERIFIED_REPORTED | LATEST_VERIFIED_FULL_YEAR | [0000723125-26-000023](https://www.sec.gov/Archives/edgar/data/723125/000072312526000023/mu-20260903.htm) |
| MU | operatingCashFlow | 2023A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0000723125-24-000007](https://www.sec.gov/Archives/edgar/data/723125/000072312524000007/mu-20240229.htm), [0000723125-24-000019](https://www.sec.gov/Archives/edgar/data/723125/000072312524000019/mu-20240530.htm) |
| MU | operatingCashFlow | 2024A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0000723125-25-000009](https://www.sec.gov/Archives/edgar/data/723125/000072312525000009/mu-20250227.htm), [0000723125-25-000021](https://www.sec.gov/Archives/edgar/data/723125/000072312525000021/mu-20250529.htm) |
| MU | operatingCashFlow | 2025A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | [0000723125-26-000006](https://www.sec.gov/Archives/edgar/data/723125/000072312526000006/mu-20260226.htm), [0000723125-26-000015](https://www.sec.gov/Archives/edgar/data/723125/000072312526000015/mu-20260528.htm) |
| MU | operatingCashFlow | LTM | 89,675,000,000 | VERIFIED_REPORTED | LATEST_VERIFIED_FULL_YEAR | [0000723125-26-000023](https://www.sec.gov/Archives/edgar/data/723125/000072312526000023/mu-20260903.htm) |
| MU | capitalExpenditures | 2023A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | No filing link in flattened record |
| MU | capitalExpenditures | 2024A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | No filing link in flattened record |
| MU | capitalExpenditures | 2025A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | No filing link in flattened record |
| MU | capitalExpenditures | LTM | 30,712,000,000 | VERIFIED_REPORTED | LATEST_VERIFIED_FULL_YEAR | [0000723125-26-000023](https://www.sec.gov/Archives/edgar/data/723125/000072312526000023/mu-20260903.htm) |
| MU | freeCashFlow | 2023A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | No filing link in flattened record |
| MU | freeCashFlow | 2024A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | No filing link in flattened record |
| MU | freeCashFlow | 2025A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | No filing link in flattened record |
| MU | freeCashFlow | LTM | 58,963,000,000 | VERIFIED_DERIVED | LATEST_VERIFIED_FULL_YEAR | No filing link in flattened record |
| MU | adjustedEbitda | 2023A | N/A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE | No filing link in flattened record |
| MU | adjustedEbitda | 2024A | N/A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE | No filing link in flattened record |
| MU | adjustedEbitda | 2025A | N/A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE | No filing link in flattened record |
| MU | adjustedEbitda | LTM | N/A | MISSING_SOURCE_DATA | FOUR_STANDALONE_QUARTERS_UNAVAILABLE | No filing link in flattened record |
| NBIS | revenue | 2023A | 9,800,000 | VERIFIED_REPORTED | unavailable | [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm) |
| NBIS | revenue | 2024A | 91,500,000 | VERIFIED_REPORTED | unavailable | [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm) |
| NBIS | revenue | 2025A | 529,800,000 | VERIFIED_REPORTED | unavailable | [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm) |
| NBIS | revenue | LTM | 1,355,100,000 | VERIFIED_DERIVED | unavailable | [0001104659-25-110831](https://www.sec.gov/Archives/edgar/data/1513845/000110465925110831/tm2531034d1_ex99-1.htm), [0001104659-26-013946](https://www.sec.gov/Archives/edgar/data/1513845/000110465926013946/tm266173d1_ex99-1.htm) |
| NBIS | grossProfit | 2023A | -9,800,000 | VERIFIED_DERIVED | REVENUE_MINUS_COST_OF_REVENUE | [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm), [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm) |
| NBIS | grossProfit | 2024A | 47,800,000 | VERIFIED_DERIVED | REVENUE_MINUS_COST_OF_REVENUE | [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm), [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm) |
| NBIS | grossProfit | 2025A | 363,600,000 | VERIFIED_DERIVED | REVENUE_MINUS_COST_OF_REVENUE | [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm), [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm) |
| NBIS | grossProfit | LTM | 1,006,300,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_YTD_MINUS_PRIOR_YTD | [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm), [0001104659-26-094844](https://www.sec.gov/Archives/edgar/data/1513845/000110465926094844/nbis-20260812xex99d1.htm) |
| NBIS | ebit | 2023A | -285,700,000 | VERIFIED_REPORTED | unavailable | [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm) |
| NBIS | ebit | 2024A | -399,600,000 | VERIFIED_REPORTED | unavailable | [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm) |
| NBIS | ebit | 2025A | -611,700,000 | VERIFIED_REPORTED | unavailable | [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm) |
| NBIS | ebit | LTM | -684,100,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_YTD_MINUS_PRIOR_YTD | [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm), [0001104659-26-094844](https://www.sec.gov/Archives/edgar/data/1513845/000110465926094844/nbis-20260812xex99d2.htm) |
| NBIS | operatingCashFlow | 2023A | -222,000,000 | VERIFIED_REPORTED | unavailable | [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm) |
| NBIS | operatingCashFlow | 2024A | -269,900,000 | VERIFIED_REPORTED | unavailable | [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm) |
| NBIS | operatingCashFlow | 2025A | N/A | REQUIRES_REVIEW | unavailable | No filing link in flattened record |
| NBIS | operatingCashFlow | LTM | N/A | REQUIRES_REVIEW | unavailable | No filing link in flattened record |
| NBIS | capitalExpenditures | 2023A | 82,900,000 | VERIFIED_REPORTED | unavailable | [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm) |
| NBIS | capitalExpenditures | 2024A | 807,500,000 | VERIFIED_REPORTED | unavailable | [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm) |
| NBIS | capitalExpenditures | 2025A | 4,066,000,000 | VERIFIED_REPORTED | unavailable | [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm) |
| NBIS | capitalExpenditures | LTM | 11,141,800,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_YTD_MINUS_PRIOR_YTD | [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm), [0001104659-26-094844](https://www.sec.gov/Archives/edgar/data/1513845/000110465926094844/nbis-20260812xex99d2.htm) |
| NBIS | freeCashFlow | 2023A | N/A | OPERATION_SCOPE_INCOMPATIBLE | unavailable | [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm), [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm) |
| NBIS | freeCashFlow | 2024A | N/A | OPERATION_SCOPE_INCOMPATIBLE | unavailable | [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm), [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm) |
| NBIS | freeCashFlow | 2025A | N/A | OPERATION_SCOPE_INCOMPATIBLE | unavailable | [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm) |
| NBIS | freeCashFlow | LTM | N/A | OPERATION_SCOPE_INCOMPATIBLE | unavailable | [0001104659-26-094568](https://www.sec.gov/Archives/edgar/data/1513845/000110465926094568/tm2622968d1_ex99-1.htm), [0001104659-26-094568](https://www.sec.gov/Archives/edgar/data/1513845/000110465926094568/tm2622968d1_ex99-1.htm) |
| NBIS | adjustedEbitda | 2023A | -240,700,000 | VERIFIED_REPORTED | COMPANY_REPORTED_ADJ_EBITDA | [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm) |
| NBIS | adjustedEbitda | 2024A | -226,300,000 | VERIFIED_REPORTED | COMPANY_REPORTED_ADJ_EBITDA | [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm) |
| NBIS | adjustedEbitda | 2025A | -64,900,000 | VERIFIED_REPORTED | COMPANY_REPORTED_ADJ_EBITDA | [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm) |
| NBIS | adjustedEbitda | LTM | N/A | DEFINITION_INCOMPATIBLE | DEFINITION_INCOMPATIBLE | [0001104659-26-052948](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm), [0001104659-26-094844](https://www.sec.gov/Archives/edgar/data/1513845/000110465926094844/nbis-20260812xex99d1.htm) |
| CRWV | revenue | 2023A | 229,000,000 | VERIFIED_REPORTED | unavailable | [0001769628-26-000104](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000104/crwv-20251231.htm) |
| CRWV | revenue | 2024A | 1,915,000,000 | VERIFIED_REPORTED | unavailable | [0001769628-26-000104](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000104/crwv-20251231.htm) |
| CRWV | revenue | 2025A | 5,131,000,000 | VERIFIED_REPORTED | unavailable | [0001769628-26-000104](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000104/crwv-20251231.htm) |
| CRWV | revenue | LTM | 7,589,580,000 | VERIFIED_DERIVED | unavailable | [0001769628-25-000062](https://www.sec.gov/Archives/edgar/data/1769628/000176962825000062/crwv-20250930.htm), [0001769628-26-000104](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000104/crwv-20251231.htm) |
| CRWV | grossProfit | 2023A | 160,000,000 | VERIFIED_DERIVED | REVENUE_MINUS_COST_OF_REVENUE | [0001769628-26-000104](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000104/crwv-20251231.htm), [0001769628-26-000104](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000104/crwv-20251231.htm) |
| CRWV | grossProfit | 2024A | 1,422,000,000 | VERIFIED_DERIVED | REVENUE_MINUS_COST_OF_REVENUE | [0001769628-26-000104](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000104/crwv-20251231.htm), [0001769628-26-000104](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000104/crwv-20251231.htm) |
| CRWV | grossProfit | 2025A | 3,678,000,000 | VERIFIED_DERIVED | REVENUE_MINUS_COST_OF_REVENUE | [0001769628-26-000104](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000104/crwv-20251231.htm), [0001769628-26-000104](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000104/crwv-20251231.htm) |
| CRWV | grossProfit | LTM | 5,116,641,000 | VERIFIED_DERIVED | unavailable | [0001769628-25-000062](https://www.sec.gov/Archives/edgar/data/1769628/000176962825000062/crwv-20250930.htm), [0001769628-26-000104](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000104/crwv-20251231.htm) |
| CRWV | ebit | 2023A | -14,000,000 | VERIFIED_REPORTED | unavailable | [0001769628-26-000104](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000104/crwv-20251231.htm) |
| CRWV | ebit | 2024A | 324,000,000 | VERIFIED_REPORTED | unavailable | [0001769628-26-000104](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000104/crwv-20251231.htm) |
| CRWV | ebit | 2025A | -46,000,000 | VERIFIED_REPORTED | unavailable | [0001769628-26-000104](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000104/crwv-20251231.htm) |
| CRWV | ebit | LTM | -230,739,000 | VERIFIED_DERIVED | unavailable | [0001769628-25-000062](https://www.sec.gov/Archives/edgar/data/1769628/000176962825000062/crwv-20250930.htm), [0001769628-26-000104](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000104/crwv-20251231.htm) |
| CRWV | operatingCashFlow | 2023A | 1,833,000,000 | VERIFIED_REPORTED | unavailable | [0001769628-26-000104](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000104/crwv-20251231.htm) |
| CRWV | operatingCashFlow | 2024A | 2,749,000,000 | VERIFIED_REPORTED | unavailable | [0001769628-26-000104](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000104/crwv-20251231.htm) |
| CRWV | operatingCashFlow | 2025A | 3,058,000,000 | VERIFIED_REPORTED | unavailable | [0001769628-26-000104](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000104/crwv-20251231.htm) |
| CRWV | operatingCashFlow | LTM | 6,911,000,000 | VERIFIED_DERIVED | unavailable | [0001769628-25-000062](https://www.sec.gov/Archives/edgar/data/1769628/000176962825000062/crwv-20250930.htm), [0001769628-26-000104](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000104/crwv-20251231.htm) |
| CRWV | capitalExpenditures | 2023A | 2,943,000,000 | VERIFIED_REPORTED | unavailable | [0001769628-26-000104](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000104/crwv-20251231.htm) |
| CRWV | capitalExpenditures | 2024A | 8,702,000,000 | VERIFIED_REPORTED | unavailable | [0001769628-26-000104](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000104/crwv-20251231.htm) |
| CRWV | capitalExpenditures | 2025A | 10,309,000,000 | VERIFIED_REPORTED | unavailable | [0001769628-26-000104](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000104/crwv-20251231.htm) |
| CRWV | capitalExpenditures | LTM | 20,566,000,000 | VERIFIED_DERIVED | unavailable | [0001769628-25-000062](https://www.sec.gov/Archives/edgar/data/1769628/000176962825000062/crwv-20250930.htm), [0001769628-26-000104](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000104/crwv-20251231.htm) |
| CRWV | freeCashFlow | 2023A | -1,110,000,000 | VERIFIED_DERIVED | CFO_MINUS_CAPEX | No filing link in flattened record |
| CRWV | freeCashFlow | 2024A | -5,953,000,000 | VERIFIED_DERIVED | CFO_MINUS_CAPEX | No filing link in flattened record |
| CRWV | freeCashFlow | 2025A | -7,251,000,000 | VERIFIED_DERIVED | CFO_MINUS_CAPEX | No filing link in flattened record |
| CRWV | freeCashFlow | LTM | -13,655,000,000 | VERIFIED_DERIVED | unavailable | No filing link in flattened record |
| CRWV | adjustedEbitda | 2023A | 103,913,000 | VERIFIED_REPORTED | COMPANY_REPORTED_ADJ_EBITDA | [0001193125-25-044231](https://www.sec.gov/Archives/edgar/data/1769628/000119312525044231/d899798ds1.htm) |
| CRWV | adjustedEbitda | 2024A | 1,219,258,000 | VERIFIED_REPORTED | COMPANY_REPORTED_ADJ_EBITDA | [0001193125-25-044231](https://www.sec.gov/Archives/edgar/data/1769628/000119312525044231/d899798ds1.htm) |
| CRWV | adjustedEbitda | 2025A | 3,093,000,000 | VERIFIED_REPORTED | COMPANY_REPORTED_ADJ_EBITDA | [0001769628-26-000094](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000094/coreweave4q25earningspress.htm) |
| CRWV | adjustedEbitda | LTM | 4,403,124,000 | VERIFIED_DERIVED | SUM_OF_LATEST_FOUR_COMPATIBLE_STANDALONE_QUARTERS | [0001769628-25-000059](https://www.sec.gov/Archives/edgar/data/1769628/000176962825000059/coreweave3q25earningspress.htm), [0001769628-26-000094](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000094/coreweave4q25earningspress.htm) |
| IREN | revenue | 2023A | 122,513,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | [0001878848-25-000063](https://www.sec.gov/Archives/edgar/data/1878848/000187884825000063/iren-20250630.htm), [0001878848-25-000025](https://www.sec.gov/ix?doc=/Archives/edgar/data/1878848/000187884825000025/iren-20241231_d2.htm) |
| IREN | revenue | 2024A | 279,129,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | [0001878848-26-000052](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm), [0001878848-26-000015](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000015/iren-20251231.htm) |
| IREN | revenue | 2025A | 757,102,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | [0001878848-26-000052](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm), [0001878848-26-000015](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000015/iren-20251231.htm) |
| IREN | revenue | LTM | 707,012,000 | VERIFIED_DERIVED | unavailable | [0001878848-25-000081](https://www.sec.gov/Archives/edgar/data/1878848/000187884825000081/iren-20250930.htm), [0001878848-26-000015](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000015/iren-20251231.htm) |
| IREN | grossProfit | 2023A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | No filing link in flattened record |
| IREN | grossProfit | 2024A | N/A | INSUFFICIENT_PERIOD_COVERAGE | unavailable | No filing link in flattened record |
| IREN | grossProfit | 2025A | 515,827,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | [0001878848-26-000052](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm), [0001878848-26-000015](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000015/iren-20251231.htm) |
| IREN | grossProfit | LTM | 487,301,000 | VERIFIED_DERIVED | LATEST_VERIFIED_FULL_YEAR | [0001878848-26-000052](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm) |
| IREN | ebit | 2023A | -27,890,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | [0001878848-25-000063](https://www.sec.gov/Archives/edgar/data/1878848/000187884825000063/iren-20250630.htm), [0001878848-25-000025](https://www.sec.gov/ix?doc=/Archives/edgar/data/1878848/000187884825000025/iren-20241231_d2.htm) |
| IREN | ebit | 2024A | -47,374,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | [0001878848-26-000052](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm), [0001878848-26-000015](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000015/iren-20251231.htm) |
| IREN | ebit | 2025A | -145,705,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | [0001878848-26-000052](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm), [0001878848-26-000015](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000015/iren-20251231.htm) |
| IREN | ebit | LTM | -1,046,714,000 | VERIFIED_REPORTED | LATEST_VERIFIED_FULL_YEAR | [0001878848-26-000052](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm) |
| IREN | operatingCashFlow | 2023A | -42,442,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | [0001878848-25-000063](https://www.sec.gov/Archives/edgar/data/1878848/000187884825000063/iren-20250630.htm), [0001878848-25-000025](https://www.sec.gov/ix?doc=/Archives/edgar/data/1878848/000187884825000025/iren-20241231_d2.htm) |
| IREN | operatingCashFlow | 2024A | 156,294,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | [0001878848-26-000052](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm), [0001878848-26-000015](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000015/iren-20251231.htm) |
| IREN | operatingCashFlow | 2025A | 410,249,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | [0001878848-26-000052](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm), [0001878848-26-000015](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000015/iren-20251231.htm) |
| IREN | operatingCashFlow | LTM | 2,100,418,000 | VERIFIED_REPORTED | LATEST_VERIFIED_FULL_YEAR | [0001878848-26-000052](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm) |
| IREN | capitalExpenditures | 2023A | 115,423,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | [0001878848-25-000063](https://www.sec.gov/Archives/edgar/data/1878848/000187884825000063/iren-20250630.htm), [0001878848-25-000009](https://www.sec.gov/Archives/edgar/data/1878848/000187884825000009/iren-20241231_d2.htm) |
| IREN | capitalExpenditures | 2024A | 986,845,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | [0001878848-26-000052](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm), [0001878848-26-000015](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000015/iren-20251231.htm) |
| IREN | capitalExpenditures | 2025A | 1,801,385,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | [0001878848-26-000052](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm), [0001878848-26-000015](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000015/iren-20251231.htm) |
| IREN | capitalExpenditures | LTM | 4,333,087,000 | VERIFIED_DERIVED | LATEST_VERIFIED_FULL_YEAR | [0001878848-26-000052](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm) |
| IREN | freeCashFlow | 2023A | -157,865,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | No filing link in flattened record |
| IREN | freeCashFlow | 2024A | -830,551,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | No filing link in flattened record |
| IREN | freeCashFlow | 2025A | -1,391,136,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | No filing link in flattened record |
| IREN | freeCashFlow | LTM | -2,232,669,000 | VERIFIED_DERIVED | LATEST_VERIFIED_FULL_YEAR | No filing link in flattened record |
| IREN | adjustedEbitda | 2023A | N/A | INSUFFICIENT_PERIOD_COVERAGE | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE | No filing link in flattened record |
| IREN | adjustedEbitda | 2024A | N/A | INSUFFICIENT_PERIOD_COVERAGE | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE | [0001878848-26-000025](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000025/irenreportsq3fy26results.htm), [0001878848-26-000014](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000014/a991irenreportsq2fy26res.htm) |
| IREN | adjustedEbitda | 2025A | N/A | INSUFFICIENT_PERIOD_COVERAGE | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE | [0001878848-26-000051](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000051/irenreportsfy26results.htm), [0001878848-26-000025](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000025/irenreportsq3fy26results.htm) |
| IREN | adjustedEbitda | LTM | 245,700,000 | VERIFIED_DERIVED | SUM_OF_LATEST_FOUR_COMPATIBLE_STANDALONE_QUARTERS | [0001878848-26-000014](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000014/a991irenreportsq2fy26res.htm), [0001878848-26-000025](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000025/irenreportsq3fy26results.htm) |
| GOOGL | revenue | 2023A | 307,394,000,000 | VERIFIED_REPORTED | unavailable | [0001652044-26-000018](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm) |
| GOOGL | revenue | 2024A | 350,018,000,000 | VERIFIED_REPORTED | unavailable | [0001652044-26-000018](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm) |
| GOOGL | revenue | 2025A | 402,836,000,000 | VERIFIED_REPORTED | unavailable | [0001652044-26-000018](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm) |
| GOOGL | revenue | LTM | 445,867,000,000 | VERIFIED_DERIVED | unavailable | [0001652044-25-000091](https://www.sec.gov/Archives/edgar/data/1652044/000165204425000091/goog-20250930.htm), [0001652044-26-000018](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm) |
| GOOGL | grossProfit | 2023A | 174,062,000,000 | VERIFIED_DERIVED | REVENUE_MINUS_COST_OF_REVENUE | [0001652044-26-000018](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm), [0001652044-26-000018](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm) |
| GOOGL | grossProfit | 2024A | 203,712,000,000 | VERIFIED_DERIVED | REVENUE_MINUS_COST_OF_REVENUE | [0001652044-26-000018](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm), [0001652044-26-000018](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm) |
| GOOGL | grossProfit | 2025A | 240,301,000,000 | VERIFIED_DERIVED | REVENUE_MINUS_COST_OF_REVENUE | [0001652044-26-000018](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm), [0001652044-26-000018](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm) |
| GOOGL | grossProfit | LTM | 271,517,000,000 | VERIFIED_DERIVED | unavailable | [0001652044-25-000091](https://www.sec.gov/Archives/edgar/data/1652044/000165204425000091/goog-20250930.htm), [0001652044-26-000018](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm) |
| GOOGL | ebit | 2023A | 84,293,000,000 | VERIFIED_REPORTED | unavailable | [0001652044-26-000018](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm) |
| GOOGL | ebit | 2024A | 112,390,000,000 | VERIFIED_REPORTED | unavailable | [0001652044-26-000018](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm) |
| GOOGL | ebit | 2025A | 129,039,000,000 | VERIFIED_REPORTED | unavailable | [0001652044-26-000018](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm) |
| GOOGL | ebit | LTM | 147,628,000,000 | VERIFIED_DERIVED | unavailable | [0001652044-25-000091](https://www.sec.gov/Archives/edgar/data/1652044/000165204425000091/goog-20250930.htm), [0001652044-26-000018](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm) |
| GOOGL | operatingCashFlow | 2023A | 101,746,000,000 | VERIFIED_REPORTED | unavailable | [0001652044-26-000018](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm) |
| GOOGL | operatingCashFlow | 2024A | 125,299,000,000 | VERIFIED_REPORTED | unavailable | [0001652044-26-000018](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm) |
| GOOGL | operatingCashFlow | 2025A | 164,713,000,000 | VERIFIED_REPORTED | unavailable | [0001652044-26-000018](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm) |
| GOOGL | operatingCashFlow | LTM | 185,675,000,000 | VERIFIED_DERIVED | unavailable | [0001652044-25-000091](https://www.sec.gov/Archives/edgar/data/1652044/000165204425000091/goog-20250930.htm), [0001652044-26-000018](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm) |
| GOOGL | capitalExpenditures | 2023A | 32,251,000,000 | VERIFIED_REPORTED | unavailable | [0001652044-26-000018](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm) |
| GOOGL | capitalExpenditures | 2024A | 52,535,000,000 | VERIFIED_REPORTED | unavailable | [0001652044-26-000018](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm) |
| GOOGL | capitalExpenditures | 2025A | 91,447,000,000 | VERIFIED_REPORTED | unavailable | [0001652044-26-000018](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm) |
| GOOGL | capitalExpenditures | LTM | 132,402,000,000 | VERIFIED_DERIVED | unavailable | [0001652044-25-000091](https://www.sec.gov/Archives/edgar/data/1652044/000165204425000091/goog-20250930.htm), [0001652044-26-000018](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm) |
| GOOGL | freeCashFlow | 2023A | 69,495,000,000 | VERIFIED_DERIVED | CFO_MINUS_CAPEX | No filing link in flattened record |
| GOOGL | freeCashFlow | 2024A | 72,764,000,000 | VERIFIED_DERIVED | CFO_MINUS_CAPEX | No filing link in flattened record |
| GOOGL | freeCashFlow | 2025A | 73,266,000,000 | VERIFIED_DERIVED | CFO_MINUS_CAPEX | No filing link in flattened record |
| GOOGL | freeCashFlow | LTM | 53,273,000,000 | VERIFIED_DERIVED | unavailable | No filing link in flattened record |
| GOOGL | adjustedEbitda | 2023A | N/A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE | No filing link in flattened record |
| GOOGL | adjustedEbitda | 2024A | N/A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE | No filing link in flattened record |
| GOOGL | adjustedEbitda | 2025A | N/A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE | No filing link in flattened record |
| GOOGL | adjustedEbitda | LTM | N/A | MISSING_SOURCE_DATA | FOUR_STANDALONE_QUARTERS_UNAVAILABLE | No filing link in flattened record |
| AMZN | revenue | 2023A | 574,785,000,000 | VERIFIED_REPORTED | unavailable | [0001018724-26-000004](https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm) |
| AMZN | revenue | 2024A | 637,959,000,000 | VERIFIED_REPORTED | unavailable | [0001018724-26-000004](https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm) |
| AMZN | revenue | 2025A | 716,924,000,000 | VERIFIED_REPORTED | unavailable | [0001018724-26-000004](https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm) |
| AMZN | revenue | LTM | 775,680,000,000 | VERIFIED_DERIVED | unavailable | [0001018724-25-000123](https://www.sec.gov/Archives/edgar/data/1018724/000101872425000123/amzn-20250930.htm), [0001018724-26-000004](https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm) |
| AMZN | grossProfit | 2023A | 270,046,000,000 | VERIFIED_DERIVED | REVENUE_MINUS_COST_OF_REVENUE | [0001018724-26-000004](https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm), [0001018724-26-000004](https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm) |
| AMZN | grossProfit | 2024A | 311,671,000,000 | VERIFIED_DERIVED | REVENUE_MINUS_COST_OF_REVENUE | [0001018724-26-000004](https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm), [0001018724-26-000004](https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm) |
| AMZN | grossProfit | 2025A | 360,510,000,000 | VERIFIED_DERIVED | REVENUE_MINUS_COST_OF_REVENUE | [0001018724-26-000004](https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm), [0001018724-26-000004](https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm) |
| AMZN | grossProfit | LTM | 393,810,000,000 | VERIFIED_DERIVED | unavailable | [0001018724-25-000123](https://www.sec.gov/Archives/edgar/data/1018724/000101872425000123/amzn-20250930.htm), [0001018724-26-000004](https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm) |
| AMZN | ebit | 2023A | 36,852,000,000 | VERIFIED_REPORTED | unavailable | [0001018724-26-000004](https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm) |
| AMZN | ebit | 2024A | 68,593,000,000 | VERIFIED_REPORTED | unavailable | [0001018724-26-000004](https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm) |
| AMZN | ebit | 2025A | 79,975,000,000 | VERIFIED_REPORTED | unavailable | [0001018724-26-000004](https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm) |
| AMZN | ebit | LTM | 93,712,000,000 | VERIFIED_DERIVED | unavailable | [0001018724-25-000123](https://www.sec.gov/Archives/edgar/data/1018724/000101872425000123/amzn-20250930.htm), [0001018724-26-000004](https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm) |
| AMZN | operatingCashFlow | 2023A | 84,946,000,000 | VERIFIED_REPORTED | unavailable | [0001018724-26-000004](https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm) |
| AMZN | operatingCashFlow | 2024A | 115,877,000,000 | VERIFIED_REPORTED | unavailable | [0001018724-26-000004](https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm) |
| AMZN | operatingCashFlow | 2025A | 139,514,000,000 | VERIFIED_REPORTED | unavailable | [0001018724-26-000004](https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm) |
| AMZN | operatingCashFlow | LTM | 161,403,000,000 | VERIFIED_DERIVED | unavailable | [0001018724-25-000123](https://www.sec.gov/Archives/edgar/data/1018724/000101872425000123/amzn-20250930.htm), [0001018724-26-000004](https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm) |
| AMZN | capitalExpenditures | 2023A | 52,729,000,000 | VERIFIED_REPORTED | unavailable | [0001018724-26-000004](https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm) |
| AMZN | capitalExpenditures | 2024A | 82,999,000,000 | VERIFIED_REPORTED | unavailable | [0001018724-26-000004](https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm) |
| AMZN | capitalExpenditures | 2025A | 131,819,000,000 | VERIFIED_REPORTED | unavailable | [0001018724-26-000004](https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm) |
| AMZN | capitalExpenditures | LTM | 173,028,000,000 | VERIFIED_DERIVED | unavailable | [0001018724-25-000123](https://www.sec.gov/Archives/edgar/data/1018724/000101872425000123/amzn-20250930.htm), [0001018724-26-000004](https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm) |
| AMZN | freeCashFlow | 2023A | 32,217,000,000 | VERIFIED_DERIVED | CFO_MINUS_CAPEX | No filing link in flattened record |
| AMZN | freeCashFlow | 2024A | 32,878,000,000 | VERIFIED_DERIVED | CFO_MINUS_CAPEX | No filing link in flattened record |
| AMZN | freeCashFlow | 2025A | 7,695,000,000 | VERIFIED_DERIVED | CFO_MINUS_CAPEX | No filing link in flattened record |
| AMZN | freeCashFlow | LTM | -11,625,000,000 | VERIFIED_DERIVED | unavailable | No filing link in flattened record |
| AMZN | adjustedEbitda | 2023A | N/A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE | No filing link in flattened record |
| AMZN | adjustedEbitda | 2024A | N/A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE | No filing link in flattened record |
| AMZN | adjustedEbitda | 2025A | N/A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE | No filing link in flattened record |
| AMZN | adjustedEbitda | LTM | N/A | MISSING_SOURCE_DATA | FOUR_STANDALONE_QUARTERS_UNAVAILABLE | No filing link in flattened record |
| META | revenue | 2023A | 134,902,000,000 | VERIFIED_REPORTED | unavailable | [0001628280-26-003942](https://www.sec.gov/Archives/edgar/data/1326801/000162828026003942/meta-20251231.htm) |
| META | revenue | 2024A | 164,501,000,000 | VERIFIED_REPORTED | unavailable | [0001628280-26-003942](https://www.sec.gov/Archives/edgar/data/1326801/000162828026003942/meta-20251231.htm) |
| META | revenue | 2025A | 200,966,000,000 | VERIFIED_REPORTED | unavailable | [0001628280-26-003942](https://www.sec.gov/Archives/edgar/data/1326801/000162828026003942/meta-20251231.htm) |
| META | revenue | LTM | 241,606,000,000 | VERIFIED_DERIVED | unavailable | [0001628280-26-003942](https://www.sec.gov/Archives/edgar/data/1326801/000162828026003942/meta-20251231.htm), [0001628280-26-028526](https://www.sec.gov/Archives/edgar/data/1326801/000162828026028526/meta-20260331.htm) |
| META | grossProfit | 2023A | 108,943,000,000 | VERIFIED_DERIVED | REVENUE_MINUS_COST_OF_REVENUE | [0001628280-26-003942](https://www.sec.gov/Archives/edgar/data/1326801/000162828026003942/meta-20251231.htm), [0001628280-26-003942](https://www.sec.gov/Archives/edgar/data/1326801/000162828026003942/meta-20251231.htm) |
| META | grossProfit | 2024A | 134,340,000,000 | VERIFIED_DERIVED | REVENUE_MINUS_COST_OF_REVENUE | [0001628280-26-003942](https://www.sec.gov/Archives/edgar/data/1326801/000162828026003942/meta-20251231.htm), [0001628280-26-003942](https://www.sec.gov/Archives/edgar/data/1326801/000162828026003942/meta-20251231.htm) |
| META | grossProfit | 2025A | 164,791,000,000 | VERIFIED_DERIVED | REVENUE_MINUS_COST_OF_REVENUE | [0001628280-26-003942](https://www.sec.gov/Archives/edgar/data/1326801/000162828026003942/meta-20251231.htm), [0001628280-26-003942](https://www.sec.gov/Archives/edgar/data/1326801/000162828026003942/meta-20251231.htm) |
| META | grossProfit | LTM | 195,783,000,000 | VERIFIED_DERIVED | unavailable | [0001628280-26-003942](https://www.sec.gov/Archives/edgar/data/1326801/000162828026003942/meta-20251231.htm), [0001628280-26-028526](https://www.sec.gov/Archives/edgar/data/1326801/000162828026028526/meta-20260331.htm) |
| META | ebit | 2023A | 46,751,000,000 | VERIFIED_REPORTED | unavailable | [0001628280-26-003942](https://www.sec.gov/Archives/edgar/data/1326801/000162828026003942/meta-20251231.htm) |
| META | ebit | 2024A | 69,380,000,000 | VERIFIED_REPORTED | unavailable | [0001628280-26-003942](https://www.sec.gov/Archives/edgar/data/1326801/000162828026003942/meta-20251231.htm) |
| META | ebit | 2025A | 83,276,000,000 | VERIFIED_REPORTED | unavailable | [0001628280-26-003942](https://www.sec.gov/Archives/edgar/data/1326801/000162828026003942/meta-20251231.htm) |
| META | ebit | LTM | 79,380,000,000 | VERIFIED_DERIVED | unavailable | [0001628280-26-003942](https://www.sec.gov/Archives/edgar/data/1326801/000162828026003942/meta-20251231.htm), [0001628280-26-028526](https://www.sec.gov/Archives/edgar/data/1326801/000162828026028526/meta-20260331.htm) |
| META | operatingCashFlow | 2023A | 71,113,000,000 | VERIFIED_REPORTED | unavailable | [0001628280-26-003942](https://www.sec.gov/Archives/edgar/data/1326801/000162828026003942/meta-20251231.htm) |
| META | operatingCashFlow | 2024A | 91,328,000,000 | VERIFIED_REPORTED | unavailable | [0001628280-26-003942](https://www.sec.gov/Archives/edgar/data/1326801/000162828026003942/meta-20251231.htm) |
| META | operatingCashFlow | 2025A | 115,800,000,000 | VERIFIED_REPORTED | unavailable | [0001628280-26-003942](https://www.sec.gov/Archives/edgar/data/1326801/000162828026003942/meta-20251231.htm) |
| META | operatingCashFlow | LTM | 133,087,000,000 | VERIFIED_DERIVED | unavailable | [0001628280-26-003942](https://www.sec.gov/Archives/edgar/data/1326801/000162828026003942/meta-20251231.htm), [0001628280-26-028526](https://www.sec.gov/Archives/edgar/data/1326801/000162828026028526/meta-20260331.htm) |
| META | capitalExpenditures | 2023A | 27,045,000,000 | VERIFIED_REPORTED | unavailable | [0001628280-26-003942](https://www.sec.gov/Archives/edgar/data/1326801/000162828026003942/meta-20251231.htm) |
| META | capitalExpenditures | 2024A | 37,256,000,000 | VERIFIED_REPORTED | unavailable | [0001628280-26-003942](https://www.sec.gov/Archives/edgar/data/1326801/000162828026003942/meta-20251231.htm) |
| META | capitalExpenditures | 2025A | 69,691,000,000 | VERIFIED_REPORTED | unavailable | [0001628280-26-003942](https://www.sec.gov/Archives/edgar/data/1326801/000162828026003942/meta-20251231.htm) |
| META | capitalExpenditures | LTM | 104,438,000,000 | VERIFIED_DERIVED | unavailable | [0001628280-26-003942](https://www.sec.gov/Archives/edgar/data/1326801/000162828026003942/meta-20251231.htm), [0001628280-26-028526](https://www.sec.gov/Archives/edgar/data/1326801/000162828026028526/meta-20260331.htm) |
| META | freeCashFlow | 2023A | 44,068,000,000 | VERIFIED_DERIVED | CFO_MINUS_CAPEX | No filing link in flattened record |
| META | freeCashFlow | 2024A | 54,072,000,000 | VERIFIED_DERIVED | CFO_MINUS_CAPEX | No filing link in flattened record |
| META | freeCashFlow | 2025A | 46,109,000,000 | VERIFIED_DERIVED | CFO_MINUS_CAPEX | No filing link in flattened record |
| META | freeCashFlow | LTM | 28,649,000,000 | VERIFIED_DERIVED | unavailable | No filing link in flattened record |
| META | adjustedEbitda | 2023A | N/A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE | No filing link in flattened record |
| META | adjustedEbitda | 2024A | N/A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE | No filing link in flattened record |
| META | adjustedEbitda | 2025A | N/A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE | No filing link in flattened record |
| META | adjustedEbitda | LTM | N/A | MISSING_SOURCE_DATA | FOUR_STANDALONE_QUARTERS_UNAVAILABLE | No filing link in flattened record |
| MSFT | revenue | 2023A | 227,583,000,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | [0000950170-25-100235](https://www.sec.gov/Archives/edgar/data/789019/000095017025100235/msft-20250630.htm), [0000950170-25-010491](https://www.sec.gov/Archives/edgar/data/789019/000095017025010491/msft-20241231.htm) |
| MSFT | revenue | 2024A | 261,802,000,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | [0001193125-26-323660](https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/msft-20260630.htm), [0001193125-26-027207](https://www.sec.gov/Archives/edgar/data/789019/000119312526027207/msft-20251231.htm) |
| MSFT | revenue | 2025A | 305,453,000,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | [0001193125-26-323660](https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/msft-20260630.htm), [0001193125-26-027207](https://www.sec.gov/Archives/edgar/data/789019/000119312526027207/msft-20251231.htm) |
| MSFT | revenue | LTM | 331,839,000,000 | VERIFIED_REPORTED | LATEST_VERIFIED_FULL_YEAR | [0001193125-26-323660](https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/msft-20260630.htm) |
| MSFT | grossProfit | 2023A | 158,735,000,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | [0000950170-25-100235](https://www.sec.gov/Archives/edgar/data/789019/000095017025100235/msft-20250630.htm), [0000950170-25-010491](https://www.sec.gov/Archives/edgar/data/789019/000095017025010491/msft-20241231.htm) |
| MSFT | grossProfit | 2024A | 181,715,000,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | [0001193125-26-323660](https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/msft-20260630.htm), [0001193125-26-027207](https://www.sec.gov/Archives/edgar/data/789019/000119312526027207/msft-20251231.htm) |
| MSFT | grossProfit | 2025A | 209,499,000,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | [0001193125-26-323660](https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/msft-20260630.htm), [0001193125-26-027207](https://www.sec.gov/Archives/edgar/data/789019/000119312526027207/msft-20251231.htm) |
| MSFT | grossProfit | LTM | 225,465,000,000 | VERIFIED_REPORTED | LATEST_VERIFIED_FULL_YEAR | [0001193125-26-323660](https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/msft-20260630.htm) |
| MSFT | ebit | 2023A | 100,533,000,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | [0000950170-25-100235](https://www.sec.gov/Archives/edgar/data/789019/000095017025100235/msft-20250630.htm), [0000950170-25-010491](https://www.sec.gov/Archives/edgar/data/789019/000095017025010491/msft-20241231.htm) |
| MSFT | ebit | 2024A | 117,711,000,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | [0001193125-26-323660](https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/msft-20260630.htm), [0001193125-26-027207](https://www.sec.gov/Archives/edgar/data/789019/000119312526027207/msft-20251231.htm) |
| MSFT | ebit | 2025A | 142,559,000,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | [0001193125-26-323660](https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/msft-20260630.htm), [0001193125-26-027207](https://www.sec.gov/Archives/edgar/data/789019/000119312526027207/msft-20251231.htm) |
| MSFT | ebit | LTM | 155,237,000,000 | VERIFIED_REPORTED | LATEST_VERIFIED_FULL_YEAR | [0001193125-26-323660](https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/msft-20260630.htm) |
| MSFT | operatingCashFlow | 2023A | 102,647,000,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | [0000950170-25-100235](https://www.sec.gov/Archives/edgar/data/789019/000095017025100235/msft-20250630.htm), [0000950170-25-010491](https://www.sec.gov/Archives/edgar/data/789019/000095017025010491/msft-20241231.htm) |
| MSFT | operatingCashFlow | 2024A | 125,583,000,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | [0001193125-26-323660](https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/msft-20260630.htm), [0001193125-26-027207](https://www.sec.gov/Archives/edgar/data/789019/000119312526027207/msft-20251231.htm) |
| MSFT | operatingCashFlow | 2025A | 160,506,000,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | [0001193125-26-323660](https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/msft-20260630.htm), [0001193125-26-027207](https://www.sec.gov/Archives/edgar/data/789019/000119312526027207/msft-20251231.htm) |
| MSFT | operatingCashFlow | LTM | 182,935,000,000 | VERIFIED_REPORTED | LATEST_VERIFIED_FULL_YEAR | [0001193125-26-323660](https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/msft-20260630.htm) |
| MSFT | capitalExpenditures | 2023A | 35,202,000,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | [0000950170-25-100235](https://www.sec.gov/Archives/edgar/data/789019/000095017025100235/msft-20250630.htm), [0000950170-25-010491](https://www.sec.gov/Archives/edgar/data/789019/000095017025010491/msft-20241231.htm) |
| MSFT | capitalExpenditures | 2024A | 55,552,000,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | [0001193125-26-323660](https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/msft-20260630.htm), [0001193125-26-027207](https://www.sec.gov/Archives/edgar/data/789019/000119312526027207/msft-20251231.htm) |
| MSFT | capitalExpenditures | 2025A | 83,094,000,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | [0001193125-26-323660](https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/msft-20260630.htm), [0001193125-26-027207](https://www.sec.gov/Archives/edgar/data/789019/000119312526027207/msft-20251231.htm) |
| MSFT | capitalExpenditures | LTM | 115,948,000,000 | VERIFIED_REPORTED | LATEST_VERIFIED_FULL_YEAR | [0001193125-26-323660](https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/msft-20260630.htm) |
| MSFT | freeCashFlow | 2023A | 67,445,000,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | No filing link in flattened record |
| MSFT | freeCashFlow | 2024A | 70,031,000,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | No filing link in flattened record |
| MSFT | freeCashFlow | 2025A | 77,412,000,000 | VERIFIED_DERIVED | FY_PLUS_CURRENT_COMPARABLE_PERIOD_MINUS_PRIOR_COMPARABLE_PERIOD | No filing link in flattened record |
| MSFT | freeCashFlow | LTM | 66,987,000,000 | VERIFIED_DERIVED | LATEST_VERIFIED_FULL_YEAR | No filing link in flattened record |
| MSFT | adjustedEbitda | 2023A | N/A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE | No filing link in flattened record |
| MSFT | adjustedEbitda | 2024A | N/A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE | No filing link in flattened record |
| MSFT | adjustedEbitda | 2025A | N/A | MISSING_SOURCE_DATA | FOUR_EXACT_CALENDAR_QUARTERS_UNAVAILABLE | No filing link in flattened record |
| MSFT | adjustedEbitda | LTM | N/A | MISSING_SOURCE_DATA | FOUR_STANDALONE_QUARTERS_UNAVAILABLE | No filing link in flattened record |

## Authentication, performance, and deployment blockers

- The runtime requires a server-only `FISCAL_API_KEY` for the documented REST Data API. The Codex MCP connection is not a deployable credential. No production key was present, so live REST authentication and full-company entitlements remain untested.
- A free API key has 50 requests/minute, 250/day, and a restricted 100-company universe. Commercial permissions and limits require the actual Data Feed agreement; no account or purchase was changed.
- The adapter batches two companies (at most six core endpoint calls at once), retries 429/5xx, caches acquisitions, and only fetches on controlled financial refresh. Normal page loads continue to read durable snapshots. These local tests do not establish production latency or licensing.
- The audit has 88 unresolved cells, 37 underlying provider/SEC conflicts, and 0 stale-scope evidence concern(s). Do not merge or deploy until independently adjudicated.
- No Supabase table, existing production financial snapshot, Vercel deployment, domain, Website App, or old Valuation Analysis repository was changed.

Fiscal.ai documentation: [authentication](https://docs.fiscal.ai/docs/authentication), [financial endpoints](https://docs.fiscal.ai/docs/api-reference), [free-plan limits](https://docs.fiscal.ai/docs/guides/rate-limits), and [terms](https://fiscal.ai/terms-of-service/).
