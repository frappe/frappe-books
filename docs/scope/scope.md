# Scope: RareBooks dashboard

RareBooks is small business accounting, inventory and point of sale on Frappe, used through the /books app. This slice adds two sections to the dashboard: what is in the money accounts right now, and which items sell best.

**Build approach:** Tracer Bullet (each section is built end to end, server query, permission check, Vue card and tests, and works before the next starts).
**Workflow:** Beta (after `/develop`: `/check verify`, then `/test`). The project default level of rigor. `/architect` is the recommended first stop for a feature with a real decision, but skippable when you already know the build. Any feature can carry its own tag (e.g. `· GA`) to do more or less.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| A | Dashboard | Existing | existing |
| 1 | Account balances card | Slice 1 | done |
| 2 | Best sellers chart | Slice 2 | in-progress |
| 3 | Choose dashboard accounts | Slice 3 | in-progress |

## Existing

### A. Dashboard · existing
Period selector, paid and unpaid invoice cards, Cashflow, Profit and Loss and Top expenses charts, backed by whitelisted queries in `frappe_books/reports/dashboard.py`. The new sections sit in a third two column row below Profit and Loss and Top expenses, and reuse its card, loading, empty and error patterns. code in `frontend/src/pages/Dashboard/`

## Slice 1: Account balances

### 1. Account balances card · done
A table card on the left of the new row listing each money account and its current balance, with a total, so you see cash on hand at a glance. Until accounts are chosen (feature 3) it lists every Cash and Bank account.
**Done when:** the card lists Cash and Bank accounts with their balance as of today (it ignores the period selector and says so), a Total row sums them, positive amounts show in the app's success color, it only shows to users who can read the ledger, and it matches the existing dashboard cards on desktop, phone and dark mode, with loading, empty and error states.
spec [0001](../specs/0001-account-balances-card/index.md) · code in `frappe_books/reports/dashboard.py`, `frontend/src/pages/Dashboard/AccountBalances.vue`
- [x] Design it (spec): `/architect account balances card`
- [x] Build it: `/develop account balances card`
  - [x] Server: `get_cash_balances` with permission check, cut off and Total, plus Python tests (AC-1, AC-2, AC-3, AC-4, AC-5, AC-7)
  - [x] Thin card end to end: `getCashBalances`, minimal `AccountBalances.vue` in the new dashboard row, no period reload (AC-1, AC-2, AC-3, AC-7, AC-11)
  - [x] Card complete: sign colors, General Ledger links, sticky Total scrolling, skeleton, empty and error states, phone and dark layout (AC-5, AC-6, AC-8, AC-9, AC-10)
  - [x] Playwright tests, desktop and mobile (AC-2, AC-5, AC-6, AC-8, AC-9, AC-10, AC-11)
- [x] Verify it: `/check verify account balances card`
- [x] Test it: `/test account balances card`

## Slice 2: Best sellers

### 2. Best sellers chart · in-progress
A donut on the right of the new row, built like Top expenses, ranking the top five items by sales amount in the selected period so you see what earns the most.
**Done when:** the donut shows the top 5 items by sales amount (net of returns, submitted sales only) for the selected period (no Others slice), the subtitle shows the total sales of every item and the centre the sum of the five shown, it follows the period selector, it only shows to users who can read sales invoices, and it has the same legend, loading, empty and error states as Top expenses.
spec [0002](../specs/0002-best-sellers-chart/index.md) · code in `frappe_books/reports/dashboard.py`, `frontend/src/pages/Dashboard/BestSellers.vue`
- [x] Design it (spec): `/architect best sellers chart`
- [x] Build it: `/develop best sellers chart`
  - [x] Server: `get_best_sellers` with permission check, top five, Others and total, plus Python tests for returns, currency, labels and edge cases (AC-1, AC-2, AC-3, AC-4, AC-5, AC-7)
  - [x] Thin card end to end: `getBestSellers`, minimal `BestSellers.vue` in the right column, following the period (AC-1, AC-5, AC-6, AC-7)
  - [x] Card complete: empty and error states, phone card, left column fallback, dark mode (AC-8, AC-9, AC-10)
  - [x] Playwright tests, desktop and mobile (AC-5, AC-6, AC-8, AC-9, AC-10)
  - [x] Top five only (spec update): drop the Others slice, "Total sales" over every item, `Top N` centre, tests updated (AC-3, AC-5)
- [x] Verify it: `/check verify best sellers chart`
- [ ] Test it: `/test best sellers chart`

## Slice 3: Choose accounts

### 3. Choose dashboard accounts · in-progress
A setting where you pick which accounts the Account balances card lists, so a business can include or leave out accounts (for example a petty cash or a loan account).
**Done when:** you can pick accounts in a settings screen, the card lists only those once any are picked, it falls back to Cash and Bank when none are picked, and the rule lives in the Python controller.
spec [0003](../specs/0003-choose-dashboard-accounts/index.md) · code in `frappe_books/reports/dashboard.py`, `frappe_books/frappe_books/doctype/books_accounting_settings/`, `frappe_books/frappe_books/doctype/books_dashboard_account/`, `frontend/src/pages/Dashboard/AccountBalances.vue`
- [x] Design it (spec): `/architect choose dashboard accounts`
- [x] Build it: `/develop choose dashboard accounts`
  - [x] Thin thread: Books Dashboard Account table on Accounting Settings, delete block test, `_dashboard_accounts()` reads the picks with the Cash and Bank fallback (AC-4, AC-5, AC-8, AC-10)
  - [x] Settings screen end to end: `DashboardAccount` row model without Create, help line under the table, a pick shows on the card after reload (AC-1, AC-2, AC-6)
  - [x] Rules in the controller: `DASHBOARD_ROOT_TYPES`, duplicate and leaf Asset or Liability checks on new or changed rows, stale picks skipped, Python tests (AC-3, AC-4, AC-5, AC-9)
  - [x] "Choose accounts" button on the card, gated on write to Accounting Settings, plus Playwright tests on desktop and phone (AC-1, AC-2, AC-4, AC-5, AC-6, AC-7)
- [ ] Verify it: `/check verify choose dashboard accounts`
- [ ] Test it: `/test choose dashboard accounts`

## Legend

**The decision box.** Every feature carries exactly one, the sub task whose label ends with `(spec)`. Skills locate it by that `(spec)` suffix, never by an exact label. Every other box is an execution box and `/architect` never ticks one.

**Feature lifecycle**: the scope updates as a feature moves; each row is what it shows and who sets it:

| State | Set by | The feature shows |
|---|---|---|
| `planned` · needs a decision | `/scope` | one box: `Design it (spec): /architect <feature>` |
| `in-progress` (designed) | **`/architect` at spec capture** | `Design it` ticked; spec linked; `Build it: /develop <feature>` + **2 to 5 milestones**; the tier's closing boxes (`Verify it` Alpha+, `Test it` Beta+, `Review it` + `Document it` GA) |
| `in-progress` (building) | `/develop` | milestone sub boxes tick one by one; code pointer filled |
| `in-progress` (verified) | `/check verify` | `Build it` + milestones ticked; `Verify it` ticked |
| `done` | **you, when you decide it is**; `/sync` reconciles | boxes you ran ticked, skipped ones marked skipped; for Beta the suggested point to call it done is after `/test` |

- **Next step** = the first unticked box (always a command or a tracked milestone).
- **needs a decision** = run `/architect` first; otherwise straight to `/develop`. The tag drops once the spec is captured.
- **Atomic build tasks live in the spec's `## Build plan`, not here**: the scope carries only the milestone rollup.
- **Status** `planned` → `in-progress` → `done`, plus `existing` (built before this workflow) and `dropped` (taken out of scope, kept for history).
- **Approach tag** beside a heading (e.g. `· Facade`) overrides the project default for that feature; no tag inherits it.
- **Workflow tier tag** beside a heading (e.g. `· GA`) sets that one feature's rigor above or below the project default; no tag inherits it.
- **Workflow** (header line) is the project default, what runs after `/develop`: **Prototype** = nothing; **Alpha** = `/check verify`; **Beta** = `/check verify` then `/test`; **GA** = adds a fresh model `/check review` then `/document`.
- **Pointer line** (`spec <n> · code in <path>`): the spec link added by `/architect`, the code path by `/develop`.
