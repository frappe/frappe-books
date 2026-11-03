# 0001. Account balances card: rationale

The decision record behind [index.md](index.md).

## Context

The dashboard shows flows over a period (cashflow, profit, expenses, invoices) but never the stock of money: how much is in each cash drawer and bank account right now. A user has to open the Balance Sheet or the General Ledger to answer "how much cash do I have", which is the most common question a small business owner asks.

Forces that shape the design:
- **Every rule lives in Python** (root `AGENTS.md`). Which accounts count, the cut off date and the Total belong on the server. The client only formats.
- **Three databases.** The query must run on SQLite, MariaDB and Postgres, so it uses `frappe.get_list` / `frappe.get_all` with the query builder dict fields that `dashboard.py` already uses, never raw SQL.
- **Existing patterns.** `dashboard.py` already defines `CASH_ACCOUNTS`, `DEBIT_MINUS_CREDIT` and `LEDGER`. The Vue cards share `BaseDashboardChart.vue` (load, error and retry on `activated`, phone card styling) and `ChartLoadError.vue`. `Report.vue` turns route query values into report filters, so `/report/GeneralLedger?account=<name>` opens the ledger filtered to one account.
- **Feature 3 is coming.** A setting will pick which accounts the card lists, falling back to Cash and Bank when none are picked. This design must leave one obvious place to plug that in.
- **Single company, single currency.** The dashboard already ignores the `company` field and the ledger is posted in the base currency. This card does the same: amounts are base currency, formatted with `fyo.format(value, 'Currency')`.

## Options considered

### Option 1: Reuse `financial_statements.get_account_balances`

Call the existing whitelisted helper and filter Cash and Bank accounts in the client.

**Pros**:
- No new server code.

**Cons**:
- It sums every entry ever posted, future dated ones included, so it breaks AC-2.
- It returns every account in the chart, and the client would then apply the Cash and Bank rule, which breaks the "rules in Python" convention and leaves feature 3 nowhere to plug in.

### Option 2: New `get_cash_balances` in `dashboard.py` returning rows and Total (chosen)

A whitelisted method that picks the accounts, sums the ledger up to today and returns `{accounts, total}`. A Vue card extends `BaseDashboardChart` and renders a plain table.

**Pros**:
- Every rule (which accounts, the cut off, the Total) is on the server, in one place feature 3 can change.
- Reuses the `dashboard.py` constants and the card base, loading, error and retry pattern.

**Cons**:
- A second "balances" query beside the financial statements one. The two must not drift on what "balance" means (debit minus credit).

### Option 3: Same server method, but the client sums the Total

Like `get_top_expenses`: return the list only and reduce it in the browser.

**Pros**:
- Matches the shape of the existing chart endpoints.

**Cons**:
- Money arithmetic in JavaScript floats, and a business figure computed outside the controller.

## Rationale

The "rules in Python" convention and feature 3 decide this. The account rule, the cut off date and the Total all have to change together when feature 3 lands, so they live in one server function with one seam (`_dashboard_accounts()`). Option 1 fails AC-2 outright. Option 3 only moves the Total, but money sums belong on the server, where `as_decimal` / `rounded` already handle precision.

Calls made while writing, each with its runner up:
- **The card extends `BaseDashboardChart` but gets no `period` prop.** That way it inherits `activated` loading, `error`, `isLoaded`, `cardClass` and `isMobile`, and the base's `period` watch never fires, because the prop keeps its default and never changes (AC-2, AC-11). Runner up: a standalone `<script setup>` card that copies those 30 lines.
- **The account list uses `frappe.get_all` after an explicit `frappe.has_permission(LEDGER, "read", throw=True)`.** A ledger reader already sees these account names on every GL row, and requiring Account read too would break the card for some roles. The ledger sums still go through `frappe.get_list`, so GL permission rules apply. Runner up: `get_list` on both.
- **The total is the sum of the rounded row balances**, so the Total always equals what the rows add up to on screen. Runner up: rounding the raw sum, which can differ from the visible rows by a cent.
- **Balance sign is debit minus credit** for both Cash and Bank (asset accounts), the same as `DEBIT_MINUS_CREDIT`, so an overdraft comes out negative (AC-5).

