# 0002. Best sellers chart: rationale

The decision record behind [index.md](index.md).

## Context

The dashboard tells you how much you sold (the paid and unpaid sales cards) but not what you sold. To find the items that earn the most, a user has to export invoices or build a report by hand. Feature 2 of the scope fills the right half of the row that Account balances opened with a donut, built like Top expenses, that ranks items by sales amount in the selected period.

Forces that shape the design:
- **Every rule lives in Python** (root `AGENTS.md`). Which invoices count, how returns and currencies are handled, the top five cut and the total belong on the server. The client only formats.
- **Three databases.** The query must run on SQLite, MariaDB and Postgres. `dashboard.py` notes that Postgres mishandles an `ORDER BY` on an expression alias, so ranking happens in Python, as in `get_top_expenses`.
- **The data is split across two tables.** The sold amount is on the Books Sales Invoice Item row, in the invoice's currency. The date, the submitted status and the exchange rate (`conversion_rate`) are on the Books Sales Invoice. Return rows carry a negative quantity, so a negative amount.
- **The ledger cannot answer this.** Books GL Entry posts by income account, not by item, so the existing `get_list` on the ledger used by the other charts does not apply.
- **Existing patterns.** `Expenses.vue` is the donut to copy (legend, centre slot, loading, empty, error and retry). `BaseDashboardChart.vue` reloads on a period change. The row in `Dashboard.vue` already shows when `canRead.ledger || canRead.sales`.

## Options considered

### Option 1: One joined `frappe.qb` query, invoice read check (chosen)

`frappe.has_permission` on Books Sales Invoice, then one query that joins the item rows to their invoices, filters submitted invoices in the period, sums `amount × conversion_rate` per item, and ranks the result in Python.

**Pros**:
- One query, whatever the number of invoices in the period.
- Portable: `frappe.qb` builds the SQL for each database; `inventory/stock.py` already uses it this way.
- All rules in one function.

**Cons**:
- `frappe.qb` skips per record user permissions, so access is checked at the DocType level only.

### Option 2: Two `get_list` calls

`get_list` the period's submitted invoices (with their `conversion_rate`), then `get_list` their item rows in batches with `parent_doctype`, as `reports/gst.py` does, and sum in Python.

**Pros**:
- Honours per record user permissions exactly.
- Uses the same `get_list` style as the rest of `dashboard.py`.

**Cons**:
- One query per batch of invoices; a busy year means many round trips and all the rows held in memory.
- The summing moves into Python loops over every row instead of the database.

### Option 3: Rank by quantity sold

Sum `stock_qty` instead of the amount.

**Pros**:
- No currency conversion, and it shows volume.

**Cons**:
- The scope asks for sales amount: a cheap item sold often would outrank the items that earn the money.

## Rationale

The amount and its filters live in two tables, so a join is unavoidable; the question is whether the database or Python does it. Option 1 lets the database group and sum, which keeps the cost flat as invoices grow, and `frappe.qb` keeps it portable across the three databases. Option 2 buys per record permissions that Books does not use today, at the cost of many queries. The tradeoff is recorded in Consequences with a clear trigger to revisit it. Option 3 answers a different question than the scope asked.

Calls made in the design conversation:
- **Base currency row amount** (`amount × conversion_rate`, before tax, after row discounts) is the measure, so foreign currency invoices compare fairly and tax does not inflate the ranking.
- **Returns count on their own date**, the same rule as the paid and unpaid sales cards, and a single query.
- **Group by item**, labelled with `item_name`.
- **Items at zero or below are left out entirely**, as Top expenses keeps only positive balances; a donut cannot draw a negative slice.
- **Best sellers moves to the left half** when Account balances is hidden, rather than leaving a gap; grid auto placement does this without extra code.
- **No click action**, the same as Top expenses.
- ~~**"Total sales"** wording for the subtitle and centre, "Others" for the rest (already translated for Top expenses).~~ Superseded on 2026-11-03: no Others slice, and the centre has its own label (see the update below).

Calls made while writing, each with its runner up:
- **The server returns `{items, total}`**, and the total is the sum of rounded amounts computed on the server (superseded on 2026-11-03 in part: the total now covers every item above zero, not only the slices, see the update below). Runner up: return a list like `get_top_expenses` and sum in the client, which moves money arithmetic into JavaScript floats (rejected for the same reason in spec 0001).
- **Round each item before the zero or below filter**, so dust amounts (a few hundredths left after a return) never become a slice. Runner up: filter the raw sum, which can show a 0.00 slice.
- **Tie break on `item_code`**, so equal amounts keep a stable order. Runner up: database order, which can change between loads.
- **Item names from a second `get_all` for the top five codes only**, instead of grouping by `item_name` in the join, so two items with the same name stay separate slices and the `GROUP BY` stays on one column. Runner up: join Books Item in the main query and group by both columns.
- **A new `getBestSellers` helper** shaped like `getInvoiceSummary`, rather than widening `getDashboardData`'s union, because the return shape differs from the other period charts.

## Update 2026-11-03: no Others slice

**Why it came up**: `/check verify` drove the real app and found Others drawn first, not last. frappe-ui 1.0.2's `DonutChart` sorts every slice biggest first (`donutChartOptions.ts`, `groupRows`), so once the long tail outweighs one item, Others leads the ring and the legend, against AC-3. Top expenses has the same behaviour.

**Options weighed**:
- **Follow the chart's size order** (keep Others, relax AC-3). No code change, matches Top expenses, but Others can lead the legend and read as the best seller.
- **Let frappe-ui group the tail** (send every item, `max-slices` 6). Its own Others is always last, but its label is a fixed English "Others" with no translation hook (`OTHERS_LABEL` in `utils.ts`), the response grows with every item sold, and the server's ranking rules move into the chart.
- **Change frappe-ui first**: out of this repo's hands, and the feature would stay failing until then.
- **Show only the top five** (chosen by the engineer): no Others slice at all, so nothing can be drawn in the wrong place.

**What the total means now**: the engineer chose to keep "Total sales" in the subtitle as the total of every item, for context, while the centre and the legend percents cover the five. Runner up: make every number on the card the top five only ("Top 5 sales"), which agrees with itself but drops how much of all sales the five make.

**Calls made while writing**: the centre gets its own label so the centre (the five) is not read as the subtitle's total (every item). The rule that renamed an item called "Others" goes away, since no Others slice can clash with it. The exchange rate guard is recorded as `COALESCE(NULLIF(rate, 0), 1)`, which the build found necessary because Frappe stores an empty Float as `0`.

**Settled after the cross check** (engineer accepted the recommended picks):
- The centre label is `Top ${items.length}`, not a fixed "Top 5", so it stays true when fewer than five items sold. Runner up: a neutral word such as "Shown", which says less.
- Hiding legend entries recomputes the centre and the percents over the visible slices, as frappe-ui does on every donut; AC-5 says so. Runner up: pin the centre to the five, which needs a custom `#center` value and diverges from Top expenses.
- The user story reads "see the top five next to my total sales". Runner up: also show the five's share of the total, which adds a third figure to the card.
