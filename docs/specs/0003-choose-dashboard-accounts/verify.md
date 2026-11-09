# Verify: Choose dashboard accounts · spec 0003 · updated 2026-11-09
_Steps derived from spec 0003 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] Sign in as a Books Manager, open Settings → the General tab has a "Dashboard" section after Fiscal Year, with a "Dashboard Accounts" table and the help line about the fallback → AC-1
- [ ] Sign in as a Books User → the same table shows read only → AC-1
- [ ] Open the Account picker in a row → only leaf Asset and Liability accounts appear (no group, no Income, no Expense, no Equity) and there is no Create option → AC-2
- [ ] Add the same account twice and save → the save is refused with a message naming that account → AC-3
- [ ] In Desk, add an Income account to the table and save → refused with a message naming the account and the allowed types → AC-3
- [ ] Save a valid row, then turn that account into a group with `frappe.db.set_value` in the bench console, then change another General setting and save → the save succeeds → AC-3
- [ ] Pick a bank account and a loan (liability), save, accept the reload → the card lists only those two, in chart order; the loan shows a minus sign in red and the Total is bank minus loan → AC-4, AC-6
- [ ] Save the settings but answer No to the reload and close the dialog → the card still shows the old list (expected); leave the dashboard and come back → the card shows the new list → AC-6
- [ ] Clear the table and save → the card lists every leaf Cash and Bank account again, subtitle "As of today" → AC-5
- [ ] With only one picked account, turn it into a group in the bench console (`frappe.db.set_value("Books Account", <account>, "is_group", 1)`), run `frappe.db.commit()`, then reload the dashboard → the card falls back to Cash and Bank, not an empty card → AC-5
- [ ] As a Books Manager, hover the settings icon in the card header → tooltip "Choose accounts"; click it → the Settings dialog opens on the General tab → AC-7
- [ ] Throttle the network (and then block `get_cash_balances`) → the icon still shows while the card loads and when it shows its error; on a site with no Cash or Bank account it shows on the empty card too → AC-7
- [ ] At 390px wide, tap the same icon → the Settings page opens on the General tab → AC-7
- [ ] As a user who can read the ledger but cannot write Accounting Settings → the card shows, the icon does not → AC-7
- [ ] Switch to Dark → the icon button follows the theme → AC-7
- [ ] Try to delete a picked account from the chart of accounts → refused, naming Books Accounting Settings; the card is unchanged → AC-8
- [ ] As a ledger reader without Accounting Settings read (a custom role), call `get_cash_balances` → the picked accounts come back; as a user without GL read → 403 → AC-9
- [ ] On an existing SQLite site, `bench migrate` → no errors, the table is empty, the card is unchanged → AC-10
- [ ] On an existing MariaDB site, `bench migrate` → no errors, the table is empty, the card is unchanged → AC-10
- [ ] On an existing PostgreSQL site, `bench migrate` → no errors, the table is empty, the card is unchanged → AC-10

## Value sourcing
- [ ] Picked accounts: the rows in `tabBooks Dashboard Account` with parent Books Accounting Settings match the table on screen
- [ ] Allowed types: changing `DASHBOARD_ROOT_TYPES` (in `frappe_books/accounting/accounts.py`) is the only edit needed to change both the save rule and the card filter (the picker's `link_filters` is a mirror)
- [ ] Row order: move a picked account under a different parent in the chart of accounts (edit its Parent Account and save, which changes `lft`) → its row moves on the card; reordering table rows changes nothing
- [ ] Balances, Total, `as_of`: unchanged from spec 0001 for the same accounts
- [ ] Button visibility follows `fyo.can('AccountingSettings', 'write')` from the boot permissions
- [ ] Help line comes from the DocField description, shows under the table (the stacked branch of `SettingsField.vue`), and shows translated in another language

## Commands
- [ ] `bench --site <site> run-tests --app frappe_books --module frappe_books.tests.test_dashboard` → `IntegrationTestDashboardAccounts` passes (picked list, empty and stale fallback, delete block, ledger reader) → AC-4, AC-5, AC-8, AC-9
- [ ] `bench --site <site> run-tests --app frappe_books --module frappe_books.tests.test_settings_accounts` → `IntegrationTestDashboardAccountRules` passes (duplicate, group, wrong root type, stale row, moved row, `link_filters` mirror) → AC-2, AC-3
- [ ] `cd frontend && yarn test` → "the dashboard table picks leaf asset and liability accounts without Create" passes → AC-1, AC-2
- [ ] `cd frontend && yarn test:ui tests/ui/dashboard-accounts.spec.ts` → the settings flow, the button in every state, and the no write case pass → AC-1, AC-2, AC-4, AC-5, AC-6, AC-7
- [ ] `cd frontend && yarn test:ui tests/ui/mobile-dashboard.spec.ts -g "choose accounts"` → the phone opens the Settings page on General → AC-7
