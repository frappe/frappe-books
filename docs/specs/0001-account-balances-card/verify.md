# Verify: Account balances card · spec 0001 · updated 2026-11-03
_Steps derived from spec 0001 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [x] Sign in as a Books Manager, open `/books` → a new row below Profit and Loss / Top expenses shows "Account balances" with the subtitle "As of today" → AC-2, AC-10
- [x] Compare the card with the Chart of Accounts → every leaf Cash and Bank account is listed, in chart order, by its account name; no group account and no non cash account appears → AC-1
- [x] Post a journal entry to a bank account dated tomorrow, and cancel another entry on it → neither changes that row → AC-2
- [x] Switch the period selector between all four periods → the figures stay the same and no `get_cash_balances` request appears in the network tab → AC-2, AC-11
- [x] Add up the visible rows → the pinned Total row equals that sum to the cent → AC-3
- [x] Find (or make) an account with no entries → it is listed at `0.00` in the default ink → AC-4
- [x] Overdraw a bank account (credit more than debit) → its row shows a minus sign in red, and the Total drops by that amount → AC-5
- [x] A positive row and a positive Total show in green (`text-ink-green-5`) → AC-5
- [x] Click an account → the General Ledger opens filtered to that account, to date = the card's as of date, no from date, and its closing balance equals the row's balance; the Total row is not a link → AC-6
- [x] Sign in as a Books User (no GL Entry read) → the card is not on the dashboard, and calling `frappe_books.reports.dashboard.get_cash_balances` returns 403 → AC-7
- [x] With more accounts than fit (or a routed response of 30 rows), scroll the card → body rows scroll, the header and Total stay visible → AC-8
- [x] Throttle the network on reload → three skeleton bars show at the card's final height; route an empty `accounts` list → "No cash or bank accounts"; route a 500 → "Failed to load" with Try again, which recovers → AC-9
- [x] At 390px wide → the card is full width on its own bordered card, 288px tall; a very long account name truncates instead of widening the card → AC-10
- [x] On desktop with only the ledger readable (feature 2 not built) → the card keeps the left half of the row → AC-10
- [x] Switch the desk theme to Dark → the card text, borders, sticky header and Total backgrounds all follow the theme, with no light patches → AC-10
- [x] Leave the dashboard and come back → one new `get_cash_balances` request; Try again → one request; nothing else triggers one → AC-11

## Value sourcing
- [x] Which accounts: change an account's type from Bank to Expense → it drops off the card on the next visit (rule is `account_type in (Cash, Bank)`, `is_group = 0`)
- [x] Row order: move an account in the chart (changes `lft`) → its row moves to match
- [x] Link key vs label: rename an account's `account_name` → the label changes and the ledger link still opens the same account (`name`)
- [x] "Today": with a site timezone ahead of or behind the browser, an entry dated the site's today counts and the link's `toDate` is the site's date, not the browser's
- [x] Balance: for one account, debit minus credit of its uncancelled ledger entries up to today equals the row
- [x] Total: equals the sum of the rounded rows, even when the raw amounts have more decimals than the currency
- [ ] Formatting: change the System Settings currency → amounts and the symbol follow it
- [x] Color: the class follows the sign of the server rounded value (an amount like `-0.004` rounds to zero and shows in default ink)
- [x] Visibility: grant a custom role GL Entry read only → the card shows for it

## Commands
- [x] `bench --site <site> run-tests --app frappe_books --module frappe_books.tests.test_dashboard` → all pass → AC-1, AC-2, AC-3, AC-4, AC-5
- [x] `bench --site <site> run-tests --app frappe_books --module frappe_books.tests.test_permissions` → all pass → AC-7
- [ ] `cd frontend && yarn build && yarn test:ui tests/ui/dashboard-account-balances.spec.ts tests/ui/mobile-dashboard.spec.ts` → all pass (from Windows against the WSL bench, set `BOOKS_TEST_URL=http://localhost:8000`, since Node on Windows cannot resolve `books.localhost`) → AC-2, AC-5, AC-6, AC-8, AC-9, AC-10, AC-11

## Acceptance-criteria coverage
- AC-1: UI step 2, Value sourcing 1 to 3, `test_dashboard` · AC-2: UI steps 1, 3, 4, Value sourcing 4 · AC-3: UI step 5, Value sourcing 6 · AC-4: UI step 6 · AC-5: UI steps 7, 8, Value sourcing 8 · AC-6: UI step 9 · AC-7: UI step 10, Value sourcing 9, `test_permissions` · AC-8: UI step 11 · AC-9: UI step 12 · AC-10: UI steps 1, 13, 14, 15 · AC-11: UI steps 4, 16
