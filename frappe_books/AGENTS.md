# frappe_books (Frappe app)

## Overview

The server side of Books: 77 `books_*` DocTypes with their controllers, plus plain Python modules for accounting, inventory, commerce (POS, pricing, loyalty) and reports. It owns every business rule; the Vue app in `frontend/` only renders and calls into it.

## Key files

| File | Owns |
|---|---|
| `hooks.py` | Routes for `/books`, install and test hooks, doc events, scheduler, type annotation flags |
| `frappe_books/doctype/books_*/` | One DocType each: `.json`, `.py` controller, optional `.js`, `test_*.py` |
| `frappe_books/report/`, `print_format/`, `workspace/` | "Books " script reports, print formats, the workspace |
| `accounting/`, `inventory/`, `commerce/`, `reports/` | Shared domain logic the controllers call (ledger, stock posting, valuation, POS, financial statements, GST) |
| `meta.py` | `get_books_meta`: all model meta in one request for the frontend |
| `search.py` | The SQLite search index (`BooksSearch`) behind the search palette |
| `setup.py`, `setup_service.py`, `coa.py`, `data/` | Install, setup wizard, charts of accounts, country info |
| `www/books.py`, `pwa/` | Serves `/books` and its service worker |
| `tests/accounting.py` | `before_tests` helper that enables features and default accounts |

## Commands

```bash
bench --site <site> run-tests --app frappe_books
bench --site <site> run-tests --app frappe_books --module frappe_books.tests.test_ledger
```

## Conventions

- DocType folders are `books_<snake_name>`, DocType names are `Books <Title>`.
- Controllers keep Frappe's auto generated typing block (`# begin: auto-generated types`); let Frappe regenerate it rather than editing by hand.
- Whitelisted methods must have type annotations (`require_type_annotated_api_methods = True`), or Frappe refuses them.
- Server filled values come from a whitelisted `preview` method that fills and does not save. Mapped documents come from a whitelisted mapper in the source DocType's controller.
- Labels, placeholders (use `placeholder`, not `description`), options, defaults and required live in the DocType JSON.
- Shared logic goes in the domain modules (`accounting/`, `inventory/`, ...), not copied between controllers.
- Code must work on SQLite, MariaDB and Postgres: use the query builder or `frappe.db` helpers, not engine specific SQL.

## Gotchas

- `patches.txt` has only its section headers; add a patch there when a change needs existing sites migrated.
- Doc events on `"*"` update the search index on every save and trash, so heavy `on_update` work slows every doctype.
- The test site must have the setup wizard completed (`books_setup_wizard.complete_setup`) before the Playwright tests run.
- No ERPNext doctypes exist anymore. Do not add links, checks or fallbacks for them.
- `frappe.qb` skips row level permissions: in a whitelisted report, pick the readable names with `frappe.get_list` first, then aggregate over them (see `reports/dashboard.py`).
- `Sum` comes back as a float on SQLite and a Decimal elsewhere, so round before comparing or sorting. On Postgres, an `ORDER BY` on an expression alias gets wrapped in `MAX()`; sort in Python instead.

## Agent skills

- [frappe-app-dev](../.agents/skills/frappe-app-dev/): `frappe/skills`, building Frappe apps: doctypes, controllers, hooks
- [mariadb-query-optimization](../.agents/skills/mariadb-query-optimization/): `mariadb/skills`, MariaDB query tuning (code must still run on SQLite and Postgres)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
