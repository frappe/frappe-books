# 0001. Account balances card on the dashboard

**Date**: 2026-11-03
**Status**: Accepted

Decision history: [rationale.md](rationale.md). Verify steps: [verify.md](verify.md).

## Summary

The dashboard gets a new table card that lists every Cash and Bank account with its balance today, plus a Total row. One new server method in `dashboard.py` works out the rows and the Total, and a small Vue card shows them in the left half of a new dashboard row. The balance ignores the period selector and says "As of today". No new DocType or field is needed. Feature 3 (choose dashboard accounts) later only swaps which accounts the method picks.

## Requirements

**User stories**:
- As a business owner who can read the ledger, I want to see each cash and bank account with its balance today and the total, so I know my cash on hand at a glance.
- As that user, I want to click an account to see its ledger entries, so I can check where a balance comes from.

**Acceptance criteria**:
- **AC-1**: The card lists every leaf (`is_group = 0`) Books Account whose `account_type` is Cash or Bank, in chart of accounts order (`lft`), each row showing its `account_name` and its balance (debit minus credit).
- **AC-2**: A balance counts only GL entries with `is_cancelled = 0` and `posting_date` on or before today. Entries dated after today are left out. The card's subtitle reads "As of today", and changing the period selector neither changes the figures nor reloads the card.
- **AC-3**: A Total row, pinned at the bottom of the table, shows the sum of the listed balances, computed on the server.
- **AC-4**: An account with a zero balance is still listed and shows `0.00` in the default ink.
- **AC-5**: A positive amount (row or Total) shows in the app's success ink (`text-ink-green-5`). A negative amount shows with a minus sign in red ink (`text-ink-red-6`). Zero shows in default ink (`text-ink-gray-8`).
- **AC-6**: Clicking an account row opens the General Ledger filtered to that account up to the card's `as_of` date, with no from date, so the ledger's closing balance equals the row's balance. The Total row is not a link.
- **AC-7**: The card renders only for users who can read Books GL Entry (`canRead.ledger`). On the server, `get_cash_balances` throws a permission error for a user without that read access.
- **AC-8**: When there are more rows than fit, the body rows scroll inside the card and the header and Total row stay visible.
- **AC-9**: While loading (`!isLoaded && !error`), the card shows three skeleton rows at its final height. When loaded with no rows, it shows "No cash or bank accounts". When the request fails, `ChartLoadError` replaces the table (even if rows loaded earlier), and Try again reloads it.
- **AC-10**: The card sits in the left column of a new two column row below Profit and Loss and Top expenses (`lg:grid-cols-2`, `md:h-80` like its neighbours). It keeps the left half even when the right card is hidden. On phones it stacks full width on its own bordered card (`cardClass`) at `h-72`. Long account names truncate rather than widen the card. It reads correctly in dark mode through frappe-ui tokens only, with no hard coded colors.
- **AC-11**: The card reloads each time the dashboard is shown again (`activated`) and on Try again, and at no other time.

## Decision

**Chosen option**: Option 2: New `get_cash_balances` in `dashboard.py` returning rows and Total.

Add a whitelisted, argument free `get_cash_balances()` that returns each Cash or Bank leaf account's balance as of today plus their Total, and render it in an `AccountBalances.vue` card that extends `BaseDashboardChart`.

**Implementation skills**: `frappe-app-dev` (`frappe/skills`, `.agents/skills/frappe-app-dev/`) · `frappe-ui` (`frappe/frappe-ui`, `.agents/skills/frappe-ui/`) · `vue-best-practices` (`vuejs-ai/skills`, `.agents/skills/vue-best-practices/`) · `tailwindcss` (`hairyf/skills`, `.agents/skills/tailwindcss/`) · `playwright-best-practices` (`currents-dev/playwright-best-practices-skill`, `.agents/skills/playwright-best-practices/`)

## Feature design

**Data model sketch**:
No new DocType, field, index or migration. Read only use of:

| DocType | Fields read | Role |
|---|---|---|
| Books Account | `name` (PK), `account_name`, `account_type`, `is_group`, `lft` | Picks the rows and their order |
| Books GL Entry | `account` (FK → Books Account.name), `debit`, `credit`, `posting_date`, `is_cancelled` | Sums each account's balance |

Relationship: Books Account 1:N Books GL Entry. Feature 3 will add the account setting; it is out of scope here.

**State transitions**: none (read only).

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `frappe_books.reports.dashboard.get_cash_balances` | POST via `call()` | none | `accounts: [{account: str, account_name: str, balance: number}]`, `total: number`, `as_of: date` | logged in, Books GL Entry read | `frappe.PermissionError` (403) without GL read |

Server shape (in `dashboard.py`, next to `get_top_expenses`):
- `get_cash_balances() -> dict`, whitelisted and type annotated, docstring "Return each cash and bank account's balance as of today, and their total."
- `_dashboard_accounts() -> list`: `frappe.get_all("Books Account", filters={"account_type": ["in", ["Cash", "Bank"]], "is_group": 0}, fields=["name", "account_name"], order_by="lft")`. This is the seam feature 3 replaces.
- First line: `frappe.has_permission(LEDGER, "read", throw=True)`.
- Ledger sums: `frappe.get_list(LEDGER, filters={"is_cancelled": 0, "posting_date": ["<=", as_of], "account": ["in", names]}, fields=["account", DEBIT_MINUS_CREDIT], group_by="account", order_by="account")`, where `as_of = getdate()`. The explicit `order_by="account"` copies `get_top_expenses` (Postgres needs it beside `GROUP BY`). Never order by the `balance` alias (see the note at `dashboard.py:73`). Skip the query when `names` is empty.
- Each row: `{"account": name, "account_name": account_name, "balance": rounded(sums.get(name, 0))}`, kept in `_dashboard_accounts()` order. `total = rounded(sum(row["balance"] for row in rows))` (`rounded` returns `Decimal`, so the sum is exact). Return `{"accounts": rows, "total": total, "as_of": as_of}`.

Client shape:
- `frontend/src/utils/dashboard.ts`: add an `AccountBalance` interface, a `CashBalances` interface (`accounts`, `total`, `as_of`) and `getCashBalances(): Promise<CashBalances>` calling `call('frappe_books.reports.dashboard.get_cash_balances')`, shaped like `getInvoiceSummary` (not `getDashboardData`, which requires a period).
- `frontend/src/pages/Dashboard/AccountBalances.vue`: extends `DashboardChartBase` and wraps itself in `cardClass` like `Expenses.vue`. The card ignores the inherited `period` prop.
  - Header: the title "Account balances" and the subtitle "As of today" (both through the `t` tag). A table has no chart header to reuse, so copy the title and subtitle classes that frappe-ui's chart header renders (read them from `frappe-ui/charts`), keeping the two cards in the row visually identical.
  - States: skeleton when `!isLoaded && !error` (three `animate-pulse` bars in `bg-surface-gray-2`, the height of the rows). `ChartLoadError @retry="loadData"` whenever `error` is set, replacing the table. The empty copy (`text-p-sm text-ink-gray-5`, as in `Expenses.vue`) when `isLoaded && !accounts.length`. Otherwise the table.
  - Table: a `div` with `min-h-0 flex-1 overflow-y-auto` wraps a normal `<table class="w-full">`, with `<thead>` (Account, Balance) and `<tfoot>` (Total) cells made `sticky top-0` / `sticky bottom-0` with `bg-surface-base` (or `bg-surface-white` on desktop, matching the card background). Do not set `display: block` on `tbody`, because that breaks column alignment. The name cell is `truncate` with `max-w-0 w-full`, and amounts are `tabular-nums text-end` (logical, RTL safe).
  - Amounts: `fyo.format(value, 'Currency')` alone, with no extra minus sign added. The color comes from the sign of the rounded value returned by the server.
  - Rows: each account name is a `router-link` with `:to="{ path: '/report/GeneralLedger', query: { account: row.account, toDate: as_of } }"` (an object, so the name is URL encoded). Without `fromDate`, the ledger covers all time up to `as_of`. `GeneralLedger.setDefaultFilters` only applies the fiscal year default when `toDate` is missing (`GeneralLedger.ts:31-36`).
- `Dashboard.vue`: a new `<div class="grid gap-4 md:gap-8 lg:grid-cols-2">` row after the Profit and Loss / Top expenses row, **outside** the `<template v-if="canRead.ledger">` block (so Best sellers, gated on sales, can share it). Show it with `v-if="canRead.ledger || canRead.sales"`, preceded by the same `max-md:hidden` divider. `<AccountBalances v-if="canRead.ledger" class="h-72 min-w-0 md:h-80" />` goes in the first column, with no `:period` and a one line comment saying why. Best sellers (feature 2) takes the second column under its own `v-if`.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| get_cash_balances | which accounts are listed | `_dashboard_accounts()`: Books Account `account_type in (Cash, Bank)` and `is_group = 0` (feature 3 later: the settings list, falling back to this) |
| get_cash_balances | row order | Books Account `lft` |
| get_cash_balances | `account` (link key) | Books Account `name` |
| get_cash_balances | `account_name` (label) | Books Account `account_name` |
| get_cash_balances | "today" cut off and `as_of` | `frappe.utils.getdate()` (site timezone, the same as `get_period_dates`), returned so the client never computes its own date |
| get_cash_balances | `balance` | `SUM(debit) - SUM(credit)` of Books GL Entry, `is_cancelled = 0`, `posting_date <= today`, rounded with `accounting.money.rounded`, `0` when no entries |
| get_cash_balances | `total` | sum of the rounded row `balance` values, then `rounded` |
| AccountBalances.vue | formatted amounts and currency symbol | `fyo.format(value, 'Currency')` (base currency from SystemSettings) |
| AccountBalances.vue | amount color | sign of the server rounded value: `> 0` green-5, `< 0` red-6, `0` gray-8 |
| AccountBalances.vue | row link | route `{ path: '/report/GeneralLedger', query: { account, toDate: as_of } }`, read by `Report.getRouteFilters` |
| Dashboard.vue | whether the card shows | `fyo.can(ModelNameEnum.GLEntry, 'read')` (`canRead.ledger`) |

**Key invariants**:
- `total` equals the sum of the returned row `balance` values, exactly.
- Only leaf accounts are listed, so no amount is counted twice through a parent.
- No entry with `posting_date > today` or `is_cancelled = 1` affects any figure.
- The response never depends on the period selector (the method takes no arguments).
- The query uses only `frappe.get_list` / `frappe.get_all` dict fields, so it is portable across SQLite, MariaDB and Postgres.

**Security model**:
Read only. Any logged in user with read on Books GL Entry may call it. The server enforces this with `frappe.has_permission(LEDGER, "read", throw=True)`, and the sums go through `frappe.get_list`, so GL permission rules apply. Account names come from `get_all`, which is acceptable because a ledger reader already sees them. The client hides the card for anyone without GL read, so they never trigger the 403. Money balances are business sensitive but not regulated data, so there is no compliance scope and no audit log (nothing is written).

**Configuration required**: none.

**Critical test scenarios**:
- Happy path (Python, `test_dashboard.py`): create two Cash/Bank leaves, a group Bank account and an Expense account with `make_account`, and post entries with `_post` under `freeze_time(TODAY)`. The seeded chart already has Cash and Bank leaves, so assert on the created accounts (their rows, relative `lft` order, balances, and the group and expense being absent), and assert `total` equals the sum of every returned row. Verifies **AC-1**, **AC-3**.
- Cut off (Python): an entry dated tomorrow and a cancelled entry change nothing. Verifies **AC-2**.
- Zero and negative (Python): an account with no entries returns `0`, and an overdrawn bank returns a negative balance that lowers the Total. Verifies **AC-4**, **AC-5**.
- Permission (Python): a user without Books GL Entry read gets `frappe.PermissionError`. Verifies **AC-7**.
- UI (Playwright): the card shows "As of today", rows and Total, and positive and negative amounts carry their ink classes. Changing the period sends no new `get_cash_balances` request. Clicking a row lands on the General Ledger with the account and to date filters set, and its closing balance equals the row's balance. Verifies **AC-2**, **AC-5**, **AC-6**.
- Existing specs: add a `page.route` mock for `get_cash_balances` to `mobile-dashboard.spec.ts` (next to the `get_cashflow` / `get_top_expenses` mocks), so those tests don't depend on site data.
- UI states (Playwright, routed responses): an empty `accounts` list shows the empty copy, and a 500 shows `ChartLoadError` whose Try again recovers. Many rows scroll with the Total still visible. Verifies **AC-8**, **AC-9**.
- UI layout (Playwright, `mobile-dashboard.spec.ts` plus desktop): on a phone the card is full width with its own border, on desktop it sits in the left half, and in dark mode it uses no fixed colors. Verifies **AC-10**.

## Build plan

Tracer Bullet: one thin thread first (server to screen), then thicken it with states, links and tests. Feature 2 starts only after this card works end to end.

1. Add `get_cash_balances` (permission check first) and `_dashboard_accounts` to `frappe_books/reports/dashboard.py`, with Python tests for the happy path, the cut off and the permission in `frappe_books/tests/test_dashboard.py`. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-7**.
2. Add `getCashBalances` to `frontend/src/utils/dashboard.ts`, and a minimal `AccountBalances.vue` (title, subtitle, rows, Total) in a new row in `Dashboard.vue` behind `canRead.ledger`, with no `period` prop. Mock it in `mobile-dashboard.spec.ts`. This makes the thread work end to end in the browser. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-7**, **AC-11**.
3. Add the Python tests for zero and negative balances. Satisfies **AC-4**, **AC-5**.
4. Add the amount sign colors, the row links to the General Ledger (`account` plus `toDate: as_of`), the scrolling wrapper with the sticky header and Total, and the skeleton, empty and error states. Satisfies **AC-5**, **AC-6**, **AC-8**, **AC-9**.
5. Polish the layout: left half on `lg`, phone card styling, RTL safe alignment, a dark mode check. Satisfies **AC-10**.
6. Add Playwright tests (desktop and the mobile dashboard spec) for content, colors, the no reload on period change, the link, the states and the layout. Satisfies **AC-2**, **AC-5**, **AC-6**, **AC-8**, **AC-9**, **AC-10**, **AC-11**.

## Consequences

**Positive**:
- Cash on hand is visible on the dashboard with one cheap grouped query, and the account rule has one seam for feature 3.
- No schema change, so nothing to migrate and no patch.

**Negative / tradeoffs**:
- Two places now compute account balances (`dashboard.get_cash_balances` and `financial_statements.get_account_balances`). Both must keep "balance" as debit minus credit for asset accounts.
- Extending `BaseDashboardChart` without passing `period` relies on the prop never changing. If someone later passes `:period` to the card, it starts reloading on every period change. A one line comment in `Dashboard.vue` should say why the prop is left off.
- `get_all` on accounts skips Account permissions on purpose. If Books ever restricts account visibility per user, this card must be revisited.
- Many accounts (dozens) scroll inside a fixed height card, so not all of them are visible at once until feature 3 lets users trim the list.

**Neutral**:
- The new dashboard row is shared with feature 2. Its right column stays empty until Best sellers is built.
- "Today" is the site timezone date, the same as every other dashboard figure. A dashboard left open past midnight shows yesterday's figures until it is shown again, the same as the other cards.
- `get_list` on the ledger applies any user permission filters, while `get_all` on accounts does not. A restricted user would see a restricted account listed at 0 instead of hidden. Books sets no such restrictions today.
- Two quick reloads are not cancelled, and the last response wins (the same as the other cards).

## Follow-up

- [ ] Feature 3 (choose dashboard accounts) replaces `_dashboard_accounts()` and keeps the Cash and Bank fallback.
- [ ] Feature 2 (best sellers) owns the right column of the new row and its own `canRead.sales` gate. If a user can read sales but not the ledger, decide there whether Best sellers moves to the left.
