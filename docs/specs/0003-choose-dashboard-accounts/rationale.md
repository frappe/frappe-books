# 0003. Choose the accounts the dashboard lists: rationale

Build spec: [index.md](index.md).

## Context

The Account balances card (spec 0001) lists every leaf Cash and Bank account. That is a good default, but real books disagree with it in both directions. A business may keep an old bank account it no longer uses, which clutters the card. It may also watch accounts that are not typed Cash or Bank: a petty cash box filed as a plain asset, a card clearing account, or a loan it pays down every month. The scope asks for a setting where you pick the accounts, falling back to Cash and Bank when none are picked, with the rule in the Python controller.

Spec 0001 already prepared for this. `_dashboard_accounts()` in `frappe_books/reports/dashboard.py` is the only place that decides which accounts the card lists, and `get_cash_balances` builds every figure from what it returns. Whatever stores the choice only has to feed that seam.

The forces: Books stores company wide choices in settings singles that the Settings screen shows as tabs and saves together, then offers a page reload. `Books Defaults` already holds a child table (`pos_cash_denominations`) that this screen renders, so a table of rows is a proven path. Every Books role can read Books Accounting Settings, but only System Manager and Books Manager can write it. The card's balance is debit minus credit, which makes a liability's normal balance negative. The code must run on SQLite, MariaDB and Postgres, and existing sites must keep working after `bench migrate` with no data patch.

The engineer settled the requirements: one company wide list; any leaf Asset or Liability account may be picked; the card keeps chart order; picks that stop qualifying are skipped, and an empty result falls back to Cash and Bank; duplicates are refused; Frappe's own link check blocks deleting a picked account; the picker offers no Create; the card gets an icon button for users who can write the setting; the subtitle stays "As of today".

## Options considered

### Option 1: A child table on Books Accounting Settings

A new child doctype, Books Dashboard Account, with one required `account` link, held by a `dashboard_accounts` table in a new "Dashboard" section of Accounting Settings (the General tab). The controller validates the rows; `_dashboard_accounts()` reads them and falls back to Cash and Bank.

**Pros**:
- Reuses the Settings screen, its save and its reload, with no new tab or single.
- One place to see and change the whole list, which is what the scope describes.
- Every Books role can read the single, so the read path needs no new rights.

**Cons**:
- Adds a small child doctype for a single field.
- The General tab, already long, grows another section.

### Option 2: A "Show on dashboard" check on Books Account

Add a Check field to Books Account and list the checked accounts, falling back to Cash and Bank when none are checked.

**Pros**:
- No new doctype. The choice sits next to the account in the chart of accounts.
- Deleting an account takes its choice with it, with no link to clear.

**Cons**:
- There is no single place to see the list. You open accounts one by one to find which are checked.
- Changing it needs write on Books Account, a broader right than the settings.
- It is not "a settings screen" as the scope asks, and it puts a dashboard concern on a core accounting doctype.

### Option 3: A new Books Dashboard Settings single

A new single with its own Dashboard tab in Settings, holding the same child table, with room for more dashboard options later.

**Pros**:
- A clear home for future dashboard settings (default period, hidden cards).
- Keeps the General tab short.

**Cons**:
- A new single, model, `SETTINGS_SCHEMAS` entry, tab label, icon and permission rows, all for one field today.
- Builds for options nobody has asked for yet.

### Option 4: A list per user

Each user picks their own accounts, stored in Frappe's User Settings or a new per user doctype.

**Pros**:
- Each person sees what they personally watch.

**Cons**:
- Needs its own store and screen outside the shared Settings tabs.
- Two people looking at "the dashboard" see different Totals, which invites confusion over company figures.
- The engineer chose a company wide list.

## Rationale

Option 1 wins because it meets the scope with the least new machinery. The seam spec 0001 left means only `_dashboard_accounts()` changes on the read side, and the Settings screen already renders and saves a child table on a single, so the write side is a doctype JSON, a row model and a controller rule. Accounting Settings is the right single, not Books Defaults: Defaults is about what new documents start with, while Accounting Settings already holds company wide accounting choices and is readable by every Books role. A new Dashboard Settings single (Option 3) is the natural move once a second dashboard option exists; until then it is ceremony. A check on each account (Option 2) loses the one thing users need, seeing the whole list in one place, and asks for a broader right to change it.

Allowing any leaf Asset or Liability account covers the scope's own examples (petty cash and a loan) while keeping out Income and Expense accounts, whose all time balance as of today mixes fiscal years and means little on this card. Leaf only keeps spec 0001's promise that no amount is counted twice. Checking only newly added or changed rows on save, and filtering stale picks at read time, means a later change to an account never breaks an unrelated settings save, and the card never goes blank by surprise. The allowed root types live in one constant in `accounting/accounts.py`, used by both the save rule and the read filter, which honours the rule that business logic lives in the Python controller; the picker's `link_filters` only mirror it.

Reading the child rows with `get_all` rather than loading the whole single keeps `get_cash_balances` cheap and avoids running the single's virtual field properties for one list. It skips permissions for the same reason spec 0001 gave: the caller has already passed the ledger read check and already sees these names.

The decisions made at write time, with their runner up:
- **Where the root types live**: a `DASHBOARD_ROOT_TYPES` constant in `accounting/accounts.py` beside `PAYMENT_ACCOUNT_TYPES`, imported by both the controller and `dashboard.py`. Runner up (the first draft's pick): the controller, `books_accounting_settings.py`. A cross check showed that would make a report import a doctype controller that pulls in `coa`, `company` and regional code, which risks a circular import and inverts the layering. A dashboard rule in the shared ledger module is the smaller cost.
- **Help line on a table**: render `field.sub_label` in the stacked (Table) branch of `SettingsField.vue`, which today drops it. Runner up: render `df.sub_label` inside `Table.vue`, which would change every form table at once.
- **Refreshing the card after a save**: rely on the "Reload RareBooks?" prompt Settings already shows after every save. Runner up: refetch the card when the Settings dialog closes, which needs a new event or route watcher for one card while every other setting waits for the reload.
- **How to tell a stale row from a new one**: compare against `get_doc_before_save()`. Runner up: validate every row on every save, which is simpler but lets one drifted account block saving any General setting.
- **Picker filter**: DocField `link_filters`, so Desk and /books filter the same way. Runner up: a `static filters` entry on the row model, which only /books would apply.
- **Reading the list**: `get_all` on Books Dashboard Account by `parenttype` and `parentfield`. Runner up: `frappe.get_single("Books Accounting Settings").dashboard_accounts`, which loads the whole single.
- **Section placement**: after Fiscal Year on the General tab. Runner up: right after Features, which pushes Fiscal Year down for a less used setting.
