# 0003. Choose the accounts the dashboard lists

**Date**: 2026-11-09
**Status**: In Progress

Decision history: [rationale.md](rationale.md). Verify steps: [verify.md](verify.md).

## Summary

Accounting Settings gets a "Dashboard" section with a table of accounts, and the Account balances card lists only those accounts once any are picked. You may pick any leaf (non group) Asset or Liability account, so a petty cash box or a loan can sit next to the bank. With the table empty, or when no picked account still qualifies, the card lists every Cash and Bank account, exactly as it does today. The rules live in the Accounting Settings controller, and the card gets a small settings button for users who may change the list.

## Requirements

**User stories**:
- As a Books Manager, I want to pick which accounts the Account balances card lists, so the dashboard shows the money accounts my business actually watches (for example petty cash, or a loan).
- As a Books Manager, I want to reach that setting from the card itself, so I don't have to hunt for it in Settings.
- As any ledger reader, I want the card to keep working with no setup, so a new company sees its Cash and Bank accounts right away.

**Acceptance criteria**:
- **AC-1**: The General tab of Settings (Books Accounting Settings) has a "Dashboard" section, after the Fiscal Year section, holding a "Dashboard Accounts" table with one Account link per row and the help line "The accounts the dashboard's Account balances card lists. Leave empty to list every cash and bank account." Users who can write Accounting Settings (System Manager, Books Manager) can add, remove and save rows, with no limit on the number of rows (the card body already scrolls); other users see the table read only, as they see the rest of the tab.
- **AC-2**: The Account picker in that table offers only leaf (`is_group = 0`) accounts whose `root_type` is Asset or Liability, and offers no Create.
- **AC-3**: Saving Accounting Settings is refused, with a message naming the account, when a newly added or changed row holds a group account or an account whose root type is not Asset or Liability. Saving is always refused when the same account is on the table more than once. A row that was valid when saved and has since stopped qualifying does not block saving other settings. These rules live in the controller.
- **AC-4**: When at least one picked account is still a leaf Asset or Liability account, the card lists exactly those accounts (and no others), in chart of accounts order (`lft`), each with its balance as of today and the Total, following every rule of spec 0001 (AC-2 to AC-11). A liability shows its debit minus credit balance (usually negative, so in red with a minus sign) and lowers the Total.
- **AC-5**: When the table is empty, or none of the picked accounts is still a leaf Asset or Liability account, the card lists every leaf Cash and Bank account, exactly as spec 0001 AC-1 describes. Its empty copy stays "No cash or bank accounts" and its subtitle stays "As of today" in every case. The fallback is silent on purpose: the card does not say that picked accounts were skipped, even while the table still holds them.
- **AC-6**: After the settings are saved, the card shows the new list once the user accepts the "Reload RareBooks?" prompt that Settings shows after every save, or the next time the dashboard page is opened. Closing the Settings dialog without the reload leaves the card as it was (the dialog opens over the dashboard, so the card is not loaded again), the same as every other setting.
- **AC-7**: The card header shows a small ghost icon button (settings icon) with the tooltip and aria label "Choose accounts", only to users who can write Accounting Settings, in every state of the card (loading, error, empty and loaded). It opens Settings on the General tab (`/settings?tab=AccountingSettings`): the settings dialog on desktop, the settings page on a phone.
- **AC-8**: Deleting an account that is on the dashboard table is refused by Frappe's link check, which names Books Accounting Settings, and the card is unchanged.
- **AC-9**: `get_cash_balances` keeps its signature, response shape and permission check (Books GL Entry read). A ledger reader sees the picked accounts without needing read on Accounting Settings or Books Account.
- **AC-10**: The new doctype, field and queries work on SQLite, MariaDB and Postgres, and an existing site needs only `bench migrate` (no patch): its table starts empty, so its card is unchanged until someone picks accounts.

## Decision

**Chosen option**: Option 1: A child table of accounts on Books Accounting Settings, read by the existing `_dashboard_accounts()` seam with a Cash and Bank fallback.

Add a `dashboard_accounts` table (child doctype Books Dashboard Account, one required `account` link) to Books Accounting Settings, validate it in that controller, and change `_dashboard_accounts()` in `dashboard.py` to list the picked leaf Asset or Liability accounts in chart order, falling back to the leaf Cash and Bank accounts when none qualify.

Every leaf Asset or Liability account may be picked on purpose, not just money accounts: receivables, stock and fixed assets included. The business decides what the card means; the setting does not narrow it to cash.

**Implementation skills**: `frappe-app-dev` (`frappe/skills`, `.agents/skills/frappe-app-dev/`) · `frappe-ui` (`frappe/frappe-ui`, `.agents/skills/frappe-ui/`) · `vue-best-practices` (`vuejs-ai/skills`, `.agents/skills/vue-best-practices/`) · `playwright-best-practices` (`currents-dev/playwright-best-practices-skill`, `.agents/skills/playwright-best-practices/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

| DocType | Field | Type | Required | Notes |
|---|---|---|---|---|
| Books Accounting Settings (single, existing) | `dashboard_section_break` | Section Break | | label "Dashboard", placed after the Fiscal Year section's fields and before `default_section_break_30` (the regional GSTIN section) |
| | `dashboard_accounts` | Table, options Books Dashboard Account | no | label "Dashboard Accounts", `description` holds the help line from AC-1 |
| Books Dashboard Account (new child doctype) | `account` | Link, options Books Account | yes | label "Account", `reqd = 1`, `in_list_view = 1` (this is what makes it the table's column), `link_filters` `[["Books Account","is_group","=",0],["Books Account","root_type","in",["Asset","Liability"]]]` |

The child doctype JSON copies `books_mode_of_payment_account.json` for its doctype keys: `istable: 1`, `editable_grid: 1`, `module: "Frappe Books"`, `engine: "InnoDB"`, `row_format: "Dynamic"`, `field_order: ["account"]`, `permissions: []` (a child table takes its parent's permissions), and no `track_changes` (the parent single already has `track_changes: 1`, so row changes land in its version history). The two new fields on the single take the default `permlevel` 0, are not `read_only`, and go into its `field_order` right after the Fiscal Year section's last field.

Relationships: Books Accounting Settings 1:N Books Dashboard Account (rows, `parentfield = dashboard_accounts`). Books Dashboard Account N:1 Books Account (`account` → `Books Account.name`).

Constraints (in the controller, not the database): each `account` at most once per table; each newly added or changed row is a leaf Asset or Liability account. No index (a handful of rows). No retention rule: rows live as long as the setting.

Migration: the new child doctype and the two fields arrive through `bench migrate`. No patch, since an empty table is the intended starting state (fallback).

**State transitions**: none.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `frappe_books.reports.dashboard.get_cash_balances` (unchanged) | POST via `call()` | none | `accounts: [{account, account_name, balance}]`, `total`, `as_of` (unchanged) | logged in, Books GL Entry read | `frappe.PermissionError` (403) without GL read |
| Save of Books Accounting Settings (existing `/api/v2` document save through `FrappeDoc.sync`) | PUT | the single, with `dashboard_accounts` rows `[{account}]` | the saved single | write on Books Accounting Settings | `frappe.ValidationError` (417) for a duplicate, a group, or a root type other than Asset or Liability |
| Delete of a Books Account (existing) | DELETE | account name | | existing | `frappe.LinkExistsError` when a dashboard row links it |

Server shape:
- `frappe_books/frappe_books/doctype/books_dashboard_account/`: `__init__.py`, the `.json`, and a `.py` with an empty `BooksDashboardAccount(Document)` and its auto generated typing block (let Frappe generate it).
- `frappe_books/accounting/accounts.py`: add the module constant `DASHBOARD_ROOT_TYPES = ("Asset", "Liability")` beside `PAYMENT_ACCOUNT_TYPES`, a tuple like it (Frappe's `in` filter takes a tuple). It is the one source of the allowed root types. Both the controller and `dashboard.py` import it from here, so the report never imports a doctype controller (which pulls in `coa`, `company` and regional code).
- `books_accounting_settings.py`:
  - `validate()` calls a new `self.validate_dashboard_accounts()`:
    - Rows with an empty `account` are skipped in every step below. Frappe's required field check runs after `validate()` and reports them.
    - Duplicates first, over every row: the first account seen twice throws `_("{0} is on the dashboard more than once.").format(account)`.
    - Then only rows that are new or whose `account` changed, compared row by row by identity (the child row's `name`), not against the set of accounts the table held before. `before = self.get_doc_before_save()`, `previous = {row.name: row.account for row in before.dashboard_accounts} if before else {}`, and a row is checked when `previous.get(row.name) != row.account`. A new row has no `name` in `previous`, so it is checked. This also checks a row edited to an account that another row held until it was removed in the same save: a set of previous accounts would wrongly skip it. This relies on the client sending each saved row's `name`, which it does: `frontend/src/frappe/document.ts` (lines 476 to 480) sends the names of rows in `_savedRows`, and Desk does the same. The Python tests send the rows with their `name`s, as that payload does. A save without row names would count every row as new, so a stale row would then block the save; no Books client sends that. For each such row call `validate_account(row, "account", root_types=DASHBOARD_ROOT_TYPES)` from `frappe_books.accounting.accounts`, which already throws for a group account and for a wrong root type, with the field label ("Account") and the account name in the message. (`settings.py` already uses `get_doc_before_save()` on this single for its one way switches.)
  - Keep the auto generated typing block in sync (Frappe regenerates it with `dashboard_accounts: DF.Table[BooksDashboardAccount]`).
- `dashboard.py`, `_dashboard_accounts()` (the seam spec 0001 left for this feature), docstring "The accounts the dashboard lists: the picked ones, else the leaf cash and bank accounts, in chart order.":
  - `picked = frappe.get_all("Books Dashboard Account", filters={"parenttype": "Books Accounting Settings", "parentfield": "dashboard_accounts"}, pluck="account")`. Read the child rows directly, not `frappe.get_single`, which loads the whole single and its virtual fields for one list.
  - If `picked`: `accounts = frappe.get_all("Books Account", filters={"name": ["in", picked], "is_group": 0, "root_type": ["in", DASHBOARD_ROOT_TYPES]}, fields=["name", "account_name"], order_by="lft")`, then `if accounts: return accounts`.
  - After that `if` (reached when nothing is picked, or every picked account is stale), return today's Cash and Bank query unchanged. Write it as an early return plus one fall through, not an `else`, so both empty cases share the same final line.
  - Keep the existing comment on why `get_all` (no Account read) is fine, and add that `get_list` on a child doctype would also need `parent_doctype`.
  - A rename with merge of two picked accounts (Books Account has `allow_rename`) can leave one account on two rows. The `name in picked` filter still lists it once on the card, and the next save of the settings reports the duplicate, so no extra handling is needed.
- `get_cash_balances` itself does not change.

Client shape:
- `frontend/models/baseModels/AccountingSettings/AccountingSettings.ts`:
  - A row model `DashboardAccount extends FrappeDoc` with `static override presentation = { label: 'Dashboard Account', fields: withoutCreate(['account']) }`, written like `RealisedTax` (`frontend/models/baseModels/PaymentEntry/RealisedTax.ts`), a row model that turns off Create on its account links.
  - `static override rowModels = { dashboard_accounts: DashboardAccount };` and `declare dashboard_accounts?: (FrappeDoc & { account?: string })[];`. `rowModels` is the only registration: row models are not listed in `frappeModels` (`RealisedTax` is not), and the schema name comes out as `DashboardAccount`.
  - The picker's filters come from the DocField `link_filters` (`schema.ts` turns them into list filters), so no `static filters` entry is needed.
- `frontend/src/pages/Settings/SettingsField.vue`: one edit. Today the stacked branch (every Table field) shows the table's label but never `field.sub_label`, so the help line from the DocField `description` would not appear. Under the `<Table>` in that branch, add `<p v-if="field.sub_label" class="text-p-sm text-ink-gray-5">{{ field.sub_label }}</p>`, matching how the non stacked branch shows a description. Nothing else in Settings changes: the General tab renders the new section and table the way the Defaults tab renders `pos_cash_denominations`. (Runner up: show `df.sub_label` inside `Table.vue` itself. That would reach every form table, which is more than this feature needs.)
- `frontend/src/pages/Dashboard/AccountBalances.vue`: fill FrappeChartContainer's `#actions` slot with a frappe-ui `Button` (`variant="ghost"`, icon `lucide-settings-2`, `:tooltip` set to ``t`Choose accounts` ``, and an explicit `aria-label` attribute with the same text, which gives the icon only button its accessible name) that navigates with `router.push({ path: '/settings', query: { tab: ModelNameEnum.AccountingSettings } })`, rendered only when `fyo.can(ModelNameEnum.AccountingSettings, 'write')` (`fyo.can` takes the Books schema name, as `Link.vue` and `LinkCard.vue` already call it). The router guard already opens the dialog on desktop and the page on a phone, and Settings already reads `query.tab`. The `#actions` slot sits in the container's header, outside the loading, error and empty templates the card overrides, so the button shows in every state (AC-7). Check this in the browser in each state.
- The card is not refetched when the Settings dialog closes. It follows the reload prompt like every other setting (AC-6), so no watcher or event is added.
- The empty copy and subtitle do not change.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Settings | whether the table can be edited | the existing Settings save permission (`doc.canSave`, from write on Books Accounting Settings), which the Table's row edit check follows, as for every other field on the tab |
| Settings save | the picked accounts | the user's rows, stored as Books Dashboard Account `account` under Books Accounting Settings |
| Settings save | "unchanged row" for the stale row rule | `get_doc_before_save().dashboard_accounts`, matched to the current rows by row `name` |
| Settings save | allowed root types and leaf rule | `DASHBOARD_ROOT_TYPES` in `frappe_books/accounting/accounts.py`, plus `validate_account`'s `is_group` check |
| Account picker | the accounts offered | the DocField `link_filters` (leaf, Asset or Liability), applied by `schema.ts` and by Desk |
| Account picker | no Create | `withoutCreate(['account'])` on the `DashboardAccount` row model |
| `_dashboard_accounts` | which accounts are listed | picked rows filtered by `is_group = 0` and `root_type in DASHBOARD_ROOT_TYPES`; when that is empty, leaf Cash and Bank accounts (spec 0001) |
| `_dashboard_accounts` | row order | Books Account `lft`, in both branches |
| `get_cash_balances` | balances, Total, `as_of` | unchanged from spec 0001 |
| AccountBalances.vue | whether the settings button shows | `fyo.can(ModelNameEnum.AccountingSettings, 'write')` (the boot permissions) |
| AccountBalances.vue | where the button goes | route `{ path: '/settings', query: { tab: 'AccountingSettings' } }` |
| Settings | the help line | the `dashboard_accounts` DocField `description`, mapped to `sub_label` by `schema.ts` and shown by the stacked branch of `SettingsField.vue` (translated by Frappe) |
| Card refresh after a save | the new list | the existing "Reload RareBooks?" prompt in `useSettings.ts`, or the next dashboard page load |

**Translations**: the new strings follow the usual path, with no extra step. The Python message `"{0} is on the dashboard more than once."` is wrapped in `_()`. The DocField labels ("Dashboard", "Dashboard Accounts", "Account") and the help line come from the doctype JSON, which Frappe extracts. "Choose accounts" is a `t` tag. Run the project's usual extraction (`babel_extractors.csv`) with the change.

**Key invariants**:
- The card never lists a group account, so no amount is counted twice (spec 0001's leaf invariant still holds).
- The card is never empty only because of the setting: a table that yields no qualifying account falls back to Cash and Bank.
- The allowed root types are defined once (`DASHBOARD_ROOT_TYPES` in `accounting/accounts.py`) and used by both the save rule and the read filter. The DocField `link_filters` mirror them for the picker only, and a Python test keeps the mirror in step.
- `get_cash_balances` still takes no arguments and never depends on the period selector.
- The queries use only `frappe.get_all` / `frappe.get_list` dict filters, so they run on SQLite, MariaDB and Postgres.

**Security model**:
Changing the list needs write on Books Accounting Settings (System Manager and Books Manager have it; Books User and Books Cashier read only). Frappe's document save enforces that, and the client shows the button only to those users. Reading the list happens inside `get_cash_balances` through `get_all`, which skips permissions on purpose: the caller already passed the Books GL Entry read check, and a ledger reader already sees these account names on its entries. Nothing new is exposed. No regulated data, no compliance scope, no audit log beyond Frappe's own version history of the single.

**Configuration required**: none.

**Critical test scenarios**:
- Picked list (Python, `test_dashboard.py`): set two leaf accounts on the table (a Bank and a Liability made with `make_account`), post entries, and assert the card returns exactly those two, in `lft` order, with the liability negative and the Total their sum. Verifies **AC-4**.
- Fallback (Python): an empty table returns the Cash and Bank leaves. A table whose only account was turned into a group (set `is_group` directly with `frappe.db.set_value` to simulate drift) also returns the Cash and Bank leaves. A table with one stale and one valid account returns only the valid one. Verifies **AC-5**.
- Save rules (Python, `frappe_books/tests/test_settings_accounts.py`, beside the other Accounting Settings account rules): a duplicate throws; a group account throws; an Income account throws; a valid Asset and a valid Liability save. With a saved row made stale by `db.set_value`, saving another field still succeeds. Editing that stale row to a different invalid account throws. With two saved rows, the first on a since-staled account, removing the first row and editing the second to that stale account in the same save throws (the account was on the table before, but not on that row). Verifies **AC-3**.
- Delete (Python, in `test_dashboard.py`): deleting an account on the table raises `frappe.LinkExistsError`. This is the least certain claim in the spec (a link from a child row of a single), so the test is written in build step 1, before anything is built on it. If Frappe's link check does not raise it, the fallback is decided: in the existing `BooksAccount.on_trash`, before `super().on_trash()`, throw `frappe.LinkExistsError` with ``_("{0} is on the dashboard. Remove it from Accounting Settings first.")`` when `frappe.db.exists("Books Dashboard Account", {"account": self.name})`, and keep the same test. No Books code deletes accounts in bulk (`coa.py` only creates them), so nothing bypasses either check. Verifies **AC-8**.
- Mirror (Python): the `dashboard_accounts` child's `account` DocField `link_filters`, parsed from the doctype meta, name exactly the root types in `DASHBOARD_ROOT_TYPES` plus `is_group = 0`. Verifies **AC-2**.
- Permission (Python): a user with Books GL Entry read but no Accounting Settings read still gets the picked accounts; a user without GL read still gets `PermissionError`. Verifies **AC-9**.
- Settings flow (Playwright, desktop): open Settings, General tab, Dashboard section; the picker lists no group, Income or Expense account and no Create; add a bank and a liability, save, accept the reload; the card shows only those two. Clear the table, save; the card shows Cash and Bank again. Verifies **AC-1**, **AC-2**, **AC-4**, **AC-5**, **AC-6**.
- Settings button (Playwright, desktop and `mobile-dashboard.spec.ts`): as a Books Manager the button shows, its tooltip reads "Choose accounts", and it opens the General tab (dialog on desktop, page on a phone). As a user who can read the ledger but not write Accounting Settings, the button is absent. Verifies **AC-7**.
- Migrate (CI): the existing three database CI jobs run `bench migrate` on a fresh site and the Python suite on each engine. Verifies **AC-10**.
- No Create (node): `link-create.test.mjs` only visits the fields listed in `previousForms.linkCreate`, so it never sees the new link. Add one test (in `settings-models.test.mjs`) asserting that `getSchema('DashboardAccount').fields.find((f) => f.fieldname === 'account').create` is falsy, and that `AccountingSettings` lists `dashboard_accounts` as a Table of `DashboardAccount`. Then `yarn test` passes. Verifies **AC-2**.

## Build plan

Tracer Bullet: first one thin thread from the setting to the card (schema, seam, Settings screen), then thicken it with the rules, the button and the tests.

1. Add the Books Dashboard Account child doctype and the `dashboard_section_break` / `dashboard_accounts` fields on Books Accounting Settings (with `link_filters` and the description), run `bench migrate`, and write the delete block test first: if `LinkExistsError` is not raised, add the `on_trash` fallback named in Critical test scenarios before going on. Then change `_dashboard_accounts()` to read the picked rows with the Cash and Bank fallback, and add the Python tests for the picked list and the empty table fallback. Satisfies **AC-4**, **AC-5**, **AC-8**, **AC-10**.
2. Add the `DashboardAccount` row model (no Create) and `rowModels` on `AccountingSettings`, add the help line to the stacked branch of `SettingsField.vue`, add the node no Create test, then check in the browser that the General tab shows the Dashboard section and its help line, a pick saves, and after the reload the card lists the pick. This closes the thread end to end. Satisfies **AC-1**, **AC-2**, **AC-6**.
3. Add `DASHBOARD_ROOT_TYPES` to `accounting/accounts.py` and `validate_dashboard_accounts()` to the Accounting Settings controller, filter the picked rows by leaf and root type in `_dashboard_accounts()`, and add the Python tests for the save rules, the stale row, the stale fallback, the liability sign, the permission and the `link_filters` mirror. Satisfies **AC-3**, **AC-4**, **AC-5**, **AC-9**.
4. Add the "Choose accounts" icon button to the card's `#actions` slot, gated on write to Accounting Settings, and check it shows while loading, on error, when empty and when loaded, on a phone and in dark mode. Satisfies **AC-7**.
5. Add the Playwright tests for the settings flow and the button (desktop and the mobile dashboard spec), and run the node guards. Satisfies **AC-1**, **AC-2**, **AC-4**, **AC-5**, **AC-6**, **AC-7**.

## Consequences

**Positive**:
- The change lands in one seam (`_dashboard_accounts()`) that spec 0001 left for it. `get_cash_balances`, its response and its client code stay as they are.
- No new settings single, tab or endpoint. The Settings screen, its save and its reload prompt are reused as is.
- A new company still sees its Cash and Bank accounts with zero setup.

**Negative / tradeoffs**:
- Any leaf Asset may be picked, so a business that adds receivables, stock or fixed assets gets a Total that is no longer money it can spend. The card does not warn about it.
- Once a liability is picked, the Total is a net figure (money minus debt), not cash on hand. The card title "Account balances" still fits, but nobody is told the Total changed meaning.
- A picked account that stops qualifying is skipped silently, and its row stays in the table until someone removes it. Nobody is warned.
- The General tab gets longer, and the setting sits far from the dashboard. The card button only helps users who can write the settings.
- Only new or changed rows are checked on save. This keeps an unrelated settings save from failing, but it means the stored table can hold an account that would no longer pass.
- A Frappe link from a single's child table now blocks deleting a picked account. Someone cleaning up the chart of accounts has to remove the row first.

**Neutral**:
- Spec 0001's AC-1 (every Cash and Bank account) is now the fallback rule, not the only rule.
- The order stays chart order. Reordering rows in the table has no effect on the card.
- `get_all` on the child rows and on accounts skips permissions, as `_dashboard_accounts()` already did. If Books ever restricts account visibility per user, this card must be revisited (same note as spec 0001).

## Follow-up

- [ ] Tick spec 0001's Follow-up item "Feature 3 replaces `_dashboard_accounts()`" once this ships.
- [ ] If people pick liabilities often, consider labelling the Total "Net", or adding a tooltip on it, when any listed account is a liability. Left out of this feature on purpose, to keep spec 0001's card unchanged. Revisit after the first users pick a liability.
