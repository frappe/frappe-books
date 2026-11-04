# Verify: Best sellers chart · spec 0002 · updated 2026-11-03
_Steps derived from spec 0002 acceptance criteria (steps 1 and 2 reworded and a hide step added on 2026-11-03, when the Others slice was dropped). `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [x] Submit sales invoices this month for seven items with different amounts, open `/books` → Best sellers draws only the five largest, largest first, with no Others slice or legend entry → AC-1, AC-3
- [x] Hover each slice → the tooltip shows the Books Item name; the subtitle "Total sales: …" equals the server `total` (all seven items) and the centre "Top 5" equals the sum of the five; with only three items sold the centre reads "Top 3" and equals the subtitle → AC-1, AC-5
- [x] Give two of the top items the same item name → each shows `name (item code)` → AC-1
- [x] Submit an invoice in a foreign currency (exchange rate 2) → its item counts at double the row amount → AC-1
- [x] Submit a return (credit note) for part of an item this month → that item drops by the returned amount; return it fully → the item leaves the chart and the total → AC-2, AC-4
- [x] Save a draft invoice and cancel a submitted one → neither changes the chart → AC-2
- [x] Change the period selector → a new `get_best_sellers` request goes out with the new period and the chart redraws → AC-6
- [x] Pick a period with no sales → "No sales in this period" → AC-8
- [x] Block the request in dev tools (500) → "Failed to load" with Try again; unblock and click it → the chart loads → AC-8
- [x] Desktop: the card sits in the right half beside Account balances → AC-9
- [x] Sign in as a user who can read sales invoices but not the ledger → Account balances is gone and Best sellers takes the left half → AC-7, AC-9
- [x] Sign in as a user who cannot read sales invoices → no Best sellers card, and no `get_best_sellers` request → AC-7
- [x] Phone (390 px wide): the card is full width on its own bordered card, 384 px tall → AC-9
- [x] Switch to dark mode → the card, legend and centre text read clearly → AC-9
- [x] Click a slice and a legend entry → nothing but the tooltip, the URL stays `/books` → AC-10
- [x] Set the site timezone far from UTC and check near midnight on the first of a month → "This Month" starts on the site's first of the month (period bounds come from `get_period_dates`) → AC-6

## Commands
- [x] `bench --site <site> run-tests --app frappe_books --module frappe_books.tests.test_dashboard` → all pass, including `IntegrationTestBestSellers` → AC-1, AC-2, AC-3, AC-4, AC-5, AC-7
- [x] Hide two legend entries → the centre and the percents recompute over the slices still shown, and the last slice cannot be hidden → AC-5
- [ ] Same command on SQLite, MariaDB and Postgres sites → all pass (the query is `frappe.qb` only) → AC-1
- [x] `cd frontend && yarn test:ui tests/ui/dashboard-best-sellers.spec.ts tests/ui/mobile-dashboard.spec.ts` → all pass → AC-5, AC-6, AC-8, AC-9, AC-10
- [x] As a user without sales invoice read: `POST /api/method/frappe_books.reports.dashboard.get_best_sellers` with `period=This Month` → 403 → AC-7

## Acceptance-criteria coverage
- AC-1: steps 1, 2, 3, 4, bench tests · AC-2: steps 5, 6 · AC-3: step 1 · AC-4: step 5 · AC-5: step 2 · AC-6: steps 7, 16 · AC-7: steps 11, 12, 403 command · AC-8: steps 8, 9 · AC-9: steps 10, 11, 13, 14 · AC-10: step 15
