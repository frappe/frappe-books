# 0002. Best sellers chart on the dashboard

**Date**: 2026-11-03
**Status**: In Progress

Decision history: [rationale.md](rationale.md).

## Summary

The dashboard gets a donut chart, built like Top expenses, that ranks the five items that brought in the most sales money in the selected period. Only those five are drawn; there is no Others slice. One new server method in `dashboard.py` sums the sold amount of each item from submitted sales invoices (returns count as negative), converts it to the base currency (the company's own currency), and returns the five slices plus the total sales of every item. A small Vue card shows it in the right half of the row that Account balances opened. No new DocType or field is needed.

## Requirements

**User stories**:
- As a business owner who can read sales invoices, I want to see which items earned the most in the period I picked, so I know what sells.
- As that user, I want the total sales of every item next to the chart, so I can see the top five next to my total sales.

**Acceptance criteria**:
- **AC-1**: The chart shows up to five items, ranked by sales amount in the selected period, largest first. An item's sales amount is the sum of its Books Sales Invoice Item `amount` times the invoice's `conversion_rate` (base currency, before tax, after row discounts), over invoices with `docstatus = 1` and a `posting_date` inside the period. Each slice is labelled with the Books Item `item_name`; when two returned slices share a name, each of them shows `item_name (item_code)`; when the Books Item is missing or has no name, the slice shows its `item_code`.
- **AC-2**: Returns (credit notes) count on their own `posting_date` and need no special handling: their row amounts are already negative, so they lower that period's figure for the item. Draft and cancelled invoices never count.
- **AC-3**: Only the top five items are drawn. Items past the fifth are not shown as a slice or in the legend (there is no Others slice), but they still count in the total (AC-5). The chart draws the five in frappe-ui's own order, biggest first.
- **AC-4**: An item whose rounded net amount for the period is zero or below is left out entirely: it is neither a slice nor part of the total.
- **AC-5**: The subtitle reads "Total sales: <amount>", where the amount is the server `total`: the sum of every item's rounded amount that is above zero, the five shown and every item past them. The centre shows the sum of the visible slices with the label "Top N", where N is the number of items returned ("Top 5", or "Top 3" when only three sold), and each legend percent is that item's share of the visible slices. Hiding legend entries recomputes the centre and the percents over the slices still shown (frappe-ui's own behaviour; the last slice cannot be hidden). So when more than five items sold, the subtitle is larger than the centre.
- **AC-6**: The chart follows the period selector: changing the period reloads it for the new period, the same as Top expenses.
- **AC-7**: The card renders only for users who can read Books Sales Invoice (`canRead.sales`). On the server, `get_best_sellers` throws a permission error for a user without that read access.
- **AC-8**: The card has the same legend, loading, empty and error states as Top expenses: while loading the donut's loading state shows, with no sales it shows "No sales in this period", and when the request fails `ChartLoadError` shows and Try again reloads it.
- **AC-9**: The card sits in the right column of the Account balances row (`lg:grid-cols-2`, `md:h-80`). When Account balances is hidden (a user who can read sales but not the ledger), Best sellers takes the left column instead. On phones it stacks full width on its own bordered card (`cardClass`) at `h-96`, like Top expenses. It reads correctly in dark mode through frappe-ui tokens only.
- **AC-10**: Clicking a slice or a legend entry does nothing beyond the chart's own tooltip, the same as Top expenses.

## Decision

**Chosen option**: Option 1: New `get_best_sellers(period)` in `dashboard.py`, one joined grouped query, returning the top five slices and the total of every item.

Add a whitelisted `get_best_sellers(period)` that checks sales invoice read access, sums each item's base currency row amount over the period's submitted invoices in one `frappe.qb` query, ranks in Python, and returns `{items, total}` (the top five, and the total of every item above zero), rendered by a `BestSellers.vue` donut that copies `Expenses.vue`.

**Implementation skills**: `frappe-app-dev` (`frappe/skills`, `.agents/skills/frappe-app-dev/`) · `frappe-ui` (`frappe/frappe-ui`, `.agents/skills/frappe-ui/`) · `vue-best-practices` (`vuejs-ai/skills`, `.agents/skills/vue-best-practices/`) · `tailwindcss` (`hairyf/skills`, `.agents/skills/tailwindcss/`) · `playwright-best-practices` (`currents-dev/playwright-best-practices-skill`, `.agents/skills/playwright-best-practices/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:
No new DocType, field, index or migration. Read only use of:

| DocType | Fields read | Role |
|---|---|---|
| Books Sales Invoice | `name` (PK), `docstatus`, `posting_date` (Date), `conversion_rate` (Float, `1` for base currency invoices, treated as `1` when empty) | Picks the period's submitted invoices (returns included) and converts to base currency |
| Books Sales Invoice Item | `parent` (FK → Books Sales Invoice.name), `parenttype`, `parentfield`, `item_code` (FK → Books Item.name, required), `amount` | The sold amount per row; return rows carry a negative `qty`, so a negative `amount` |
| Books Item | `name` (PK), `item_name` | The slice label |

Relationships: Books Sales Invoice 1:N Books Sales Invoice Item; Books Item 1:N Books Sales Invoice Item.

**State transitions**: none (read only). Only `docstatus = 1` (submitted) invoices count; a cancel (`docstatus = 2`) drops an invoice out of every figure on the next load.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `frappe_books.reports.dashboard.get_best_sellers` | POST via `call()` | `period: str` (req, `This Year` · `This Quarter` · `This Month` · `YTD`) | `items: [{item: str, item_name: str, amount: number}]` (at most 5, largest first), `total: number` (every item above zero, not only the five) | logged in, Books Sales Invoice read | `frappe.PermissionError` (403) without sales read; `ValidationError` for an unknown period (from `get_period_dates`) |

Server shape (in `dashboard.py`, after `get_top_expenses`):
- Constants: `SALES_INVOICE = "Books Sales Invoice"` and `TOP_COUNT = 5`; change `get_top_expenses` to use `TOP_COUNT` too.
- `get_best_sellers(period: str) -> dict`, whitelisted and type annotated, docstring "Return the five items with the most sales in the period, and the total sales of every item."
- First line: `frappe.has_permission(SALES_INVOICE, "read", throw=True)`. Then `from_date, to_date = get_period_dates(period)`.
- `_item_sales(from_date, to_date) -> list`: one `frappe.qb` query. `invoice = frappe.qb.DocType(SALES_INVOICE)`, `row = frappe.qb.DocType("Books Sales Invoice Item")`; `from_(row).join(invoice).on(row.parent == invoice.name)`; select `row.item_code` and `Sum(row.amount * Coalesce(NullIf(invoice.conversion_rate, 0), 1)).as_("amount")` (Frappe stores an empty Float as `0`, not NULL, so `NullIf` makes an empty rate count as `1`, as the invoice code does with `conversion_rate or 1`); where `row.parenttype == SALES_INVOICE`, `row.parentfield == "items"`, `invoice.docstatus == 1`, `invoice.posting_date >= from_date`, `invoice.posting_date <= to_date`; `groupby(row.item_code)`; `.run(as_dict=True)`. No `ORDER BY` in SQL (see the Postgres alias note at `dashboard.py:73`); ranking happens in Python. `Sum`, `Coalesce` and `NullIf` come from `frappe.query_builder.functions`, as in `inventory/stock.py`. SQLite returns floats and MariaDB/Postgres return `Decimal`, so never compare or sort the raw sums.
- Rank: first pass every sum through `rounded(...)` (one rounding per item, to the base currency unit), keep rows with a rounded amount `> 0`, sort by amount descending then `item_code` ascending in plain string order (a stable tie break), and take the first `TOP_COUNT`.
- Names: `frappe.get_all("Books Item", filters={"name": ["in", top_codes]}, fields=["name", "item_name"])` for the top five codes only, built into `names = {row.name: row.item_name}`; the label is `names.get(code) or code`. If two of the top five labels are equal, each becomes `f"{label} ({code})"`.
- Each slice: `{"item": code, "item_name": name, "amount": rounded_amount}`. No Others row.
- `total = rounded(sum_decimal(amount for every kept row))`: all rows with a rounded amount `> 0`, not only the five. Return `{"items": items, "total": total}`. The `Decimal` values reach the client as JSON numbers through Frappe's response encoder, as in `get_top_expenses`; do not convert them to strings.

Client shape:
- `frontend/src/utils/dashboard.ts`: add `BestSeller` (`item: string`, `item_name`, `amount`) and `BestSellers` (`items`, `total`) interfaces, and `getBestSellers(period: PeriodKey): Promise<BestSellers>` calling `call('frappe_books.reports.dashboard.get_best_sellers', { period })`, shaped like `getInvoiceSummary`. Leave `getDashboardData`'s method union as is.
- `frontend/src/pages/Dashboard/BestSellers.vue`: a copy of `Expenses.vue` with these differences only: title `t\`Best sellers\``; `category="item_name"`, `value="amount"`; `:data="items"`; subtitle `t\`Total sales: ${fyo.format(total, 'Currency')}\`` when `items.length`, else `undefined`; `:center-label="t\`Top ${items.length}\`"`; empty copy `t\`No sales in this period\``; `setData` calls `getBestSellers(this.period)` and stores `items` and `total`. Keep the `#center` slot (compact currency, percent), `phoneChartListeners`, `cardClass`, the `dir` rule and `#error` with `ChartLoadError @retry="loadData"`.
- `Dashboard.vue`: in the existing `ledger || sales` row, after `AccountBalances`, add `<BestSellers v-if="canRead.sales" class="h-96 min-w-0 md:h-80" :period="period" />`. Grid auto placement puts it in the left column when `AccountBalances` is not rendered (AC-9); no extra class needed. Register the component. The divider above the row stays as it is.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| get_best_sellers | period bounds | `get_period_dates(period)` (site timezone, ends today), the same as every period card |
| get_best_sellers | which rows count | Books Sales Invoice `docstatus = 1` and `posting_date` in bounds, joined to its Books Sales Invoice Item rows (`parentfield = "items"`); returns are included by the same rule |
| get_best_sellers | `item` (slice key) | Books Sales Invoice Item `item_code` |
| get_best_sellers | `amount` per item | `SUM(row.amount × COALESCE(NULLIF(invoice.conversion_rate, 0), 1))`, then `accounting.money.rounded`; sign from the row (returns negative) |
| get_best_sellers | which items are slices | rounded amount `> 0`, sorted by amount desc then `item_code`, first five |
| get_best_sellers | `item_name` (label) | `names.get(code) or code` from Books Item `item_name`; `label (code)` when two of the five labels repeat |
| get_best_sellers | `total` | `rounded(sum_decimal(...))` of every item's rounded amount that is `> 0` in the period (the five and the rest); precision is the base currency unit (`accounting.money.rounded`) |
| BestSellers.vue | formatted amounts, currency symbol | `fyo.format(value, 'Currency')` and `compactCurrency` (base currency from SystemSettings) |
| BestSellers.vue | subtitle total | the server `total` |
| BestSellers.vue | centre value and slice percent | frappe-ui `DonutChart` from the five slice values (as in `Expenses.vue`); the centre is the sum of the visible slices, labelled `t\`Top ${items.length}\``, and is at most `total`; percents are shares of the visible slices |
| BestSellers.vue | loading and error state | `isLoaded` and `error` from `BaseDashboardChart.loadData` |
| BestSellers.vue | period | the `period` prop from `Dashboard.vue`, via `BaseDashboardChart`'s watch |
| Dashboard.vue | whether the card shows | `fyo.can(ModelNameEnum.SalesInvoice, 'read')` (`canRead.sales`) |

**Key invariants**:
- `total` is at least the sum of the returned slice `amount` values, and equals it exactly when five or fewer items sold.
- Every returned `amount` is greater than zero, and `total > 0` exactly when `items` is not empty (both come from the same rows above zero).
- At most five slices, largest first, each with an item code. No Others slice.
- No draft or cancelled invoice affects any figure; a return counts in the period of its own `posting_date`.
- Amounts are in base currency (`× conversion_rate`, empty treated as `1`), before tax.
- Slice labels are unique within one response.
- The query is built with `frappe.qb` only (no raw SQL strings), so it runs on SQLite, MariaDB and Postgres.

**Security model**:
Read only. Any logged in user with read on Books Sales Invoice may call it; the server enforces this with `frappe.has_permission(SALES_INVOICE, "read", throw=True)`. The joined `frappe.qb` query and the `get_all` on Books Item skip per record user permissions on purpose: Books sets no such restrictions today, and a sales reader already sees item names on every invoice row. The client hides the card for anyone without sales read, so they never trigger the 403. Sales figures are business sensitive but not regulated data: no compliance scope, no audit log (nothing is written).

**Configuration required**: none.

**Critical test scenarios**:
- Happy path (Python, `test_dashboard.py`): under `freeze_time(TODAY)`, insert submitted sales invoices with item rows for seven items (add an `items` keyword to the `_invoice` helper: a list of `(item_code, amount)` pairs. The helper sets `conversion_rate` to `1` unless the test passes another, and since `db_insert()` on the parent writes no child rows, it inserts each Books Sales Invoice Item itself with `name=frappe.generate_hash()`, `parent`, `parenttype="Books Sales Invoice"`, `parentfield="items"`, `idx`, `item_code` and `amount`. Create the Books Item records the test uses so the names resolve). Assert the five largest come back in order with their names, the last two are not returned, and `total` equals the sum of all seven. Verifies **AC-1**, **AC-3**, **AC-5**.
- Currency (Python): an invoice with `conversion_rate = 2` counts its row at double the amount, and one with an empty `conversion_rate` counts at face value. Verifies **AC-1**.
- Labels (Python): two top items with the same `item_name` come back as `name (code)` each; an item code with no Books Item comes back labelled by its code. Verifies **AC-1**.
- Returns and status (Python): a return dated in the period lowers its item; a return that takes an item to zero or below drops it from the slices and the total; draft (`docstatus = 0`) and cancelled (`docstatus = 2`) invoices and invoices dated outside the period change nothing. Verifies **AC-2**, **AC-4**.
- Ties (Python): two items with equal amounts at fifth and sixth place come back in `item_code` order, and only the first is returned. Verifies **AC-1**, **AC-3**.
- Few items (Python): with three items all three come back and `total` equals their sum; when every item nets to zero or below, or with none the result is `{"items": [], "total": 0}`. Verifies **AC-3**, **AC-8**.
- Permission (Python): a user without Books Sales Invoice read gets `frappe.PermissionError`. Verifies **AC-7**.
- UI (Playwright, new `dashboard-best-sellers.spec.ts`, routed responses): the card shows the title, the "Total sales" subtitle with the server total, the "Top N" centre ("Top 5" with five items, "Top 3" with three), and the legend with the five item names and no Others; changing the period sends a new `get_best_sellers` request with the new `period`; an empty response shows "No sales in this period"; a 500 shows `ChartLoadError` whose Try again recovers. Verifies **AC-5**, **AC-6**, **AC-8**.
- Existing specs: add a `page.route` mock for `get_best_sellers` to `mobile-dashboard.spec.ts` (next to the `get_top_expenses` mock), so those tests don't depend on site data.
- UI layout (Playwright): on desktop the card is in the right half next to Account balances; with GL read denied (mock `fyo.can` or a sales only test user) it is in the left half; on a phone it is full width on its own bordered card; clicking a slice does not navigate. Verifies **AC-7**, **AC-9**, **AC-10**.

## Build plan

Tracer Bullet: one thin thread from the server to the screen first, then thicken it with the edge rules, states and tests.

1. Add `get_best_sellers` (permission check first) and `_item_sales` to `frappe_books/reports/dashboard.py`, with Python tests for the happy path (seven items, total) and the permission (as first built this also returned an Others slice; task 6 removes it), extending the `_invoice` test helper to write item rows. Satisfies **AC-1**, **AC-3**, **AC-5**, **AC-7**.
2. Add `getBestSellers` to `frontend/src/utils/dashboard.ts` and a minimal `BestSellers.vue` (copy of `Expenses.vue`) in the right column of the Account balances row behind `canRead.sales`, with `:period`. Mock it in `mobile-dashboard.spec.ts`. This makes the thread work end to end in the browser. Satisfies **AC-1**, **AC-5**, **AC-6**, **AC-7**.
3. Add the Python tests for currency conversion, returns, draft and cancelled invoices, the zero or below rule, few items and no sales. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**.
4. Finish the card: empty copy, error state with retry, centre slot, phone card styling and `h-96`, the left column fallback when Account balances is hidden, a dark mode check. Satisfies **AC-8**, **AC-9**, **AC-10**.
5. Add `dashboard-best-sellers.spec.ts` (desktop) and the mobile layout checks for content, period reload, states, layout and no navigation on click. Satisfies **AC-5**, **AC-6**, **AC-8**, **AC-9**, **AC-10**.
6. Drop the Others slice (spec update, 2026-11-03): `get_best_sellers` returns only the top five and a `total` over every item above zero; `BestSellers.vue` labels the centre `Top ${items.length}`; `BestSeller.item` becomes `string`. Update the Python tests (seven items: five returned, total of all seven; few items; drop the item named "Others" test) and the Playwright fixtures and checks (no Others in the legend, subtitle total larger than the centre). Satisfies **AC-3**, **AC-5**.

## Consequences

**Positive**:
- What sells is visible on the dashboard from one grouped query, with every rule (period, returns, currency, top five, total) in one Python function.
- No schema change, so nothing to migrate and no patch.
- The card is a near copy of Top expenses, so the two donuts look and behave the same.

**Negative / tradeoffs**:
- The card shows two totals once more than five items sold: the subtitle (every item) and the centre (the five). The centre is labelled "Top N" (N items shown) so the two are not read as the same number, and legend percents are shares of the visible slices, not of all sales. Chosen over an Others slice because frappe-ui sorts slices by size and would draw Others first whenever the long tail outweighs an item, and its own Others label cannot be translated.
- On an invoice with `discount_after_tax` set, the discount comes off the invoice total, not the rows, so that invoice's items count at their pre discount amount. The ranking slightly overstates items sold with an after tax discount. Accepted for now; see Follow-up.
- The joined `frappe.qb` query and the `get_all` on Books Item bypass per record user permissions. If Books ever restricts invoices per user (for example by customer or company), this card must move to permission aware queries.
- A return counts in the period of its own date, so a sale in March returned in April lowers April, which can make a small period's figure for an item look low. This matches the paid and unpaid sales cards.
- Each item total is rounded once, while the ledger and `base_grand_total` round once per invoice. On foreign currency invoices the sum of the best sellers can differ from the Paid plus Unpaid sales by a cent or so. Accepted: the chart shows shares, not a reconciled figure.
- A third pattern for dashboard queries (`frappe.qb` join) beside `get_list` dict fields. It is needed because the amount and the date live in different tables.

**Neutral**:
- With a single item sold, frappe-ui draws one full ring and no legend, the same as Top expenses.
- Loyalty point redemptions and invoice level charges are not item rows, so they do not affect the ranking.
- Tie breaks use `item_code`, so two items with the same amount keep a stable order between loads.
- The dashboard ignores `company`, as every other card does (single company).
- An item renamed later shows its current `item_name` for past sales.

## Follow-up

- [ ] If after tax discounts are common for a business, decide whether to spread the invoice discount over its rows for this chart (for example by `amount / net_total` share).
- [ ] If Books ever adds user permissions on Books Sales Invoice, switch `_item_sales` to a permission aware query.
- [ ] If frappe-ui's `DonutChart` gains an option to keep the data order or a translatable Others label, decide whether to bring back an Others slice here (and fix the same ordering in Top expenses).
