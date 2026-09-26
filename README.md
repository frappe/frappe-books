# Frappe Books

This repository contains a pure Frappe Framework application for Books. It serves the Vue interface at `/books` and uses Frappe for authentication, permissions, document storage, and server workflows.

The app follows the standalone SPA structure used by ERPNext Banking. Vite writes generated assets to `frappe_books/public/books`, and a Frappe website page serves the generated entry point. The source repository does not store generated assets.

Frappe runs submit and cancel actions in one server transaction. This keeps ledger, stock, payment, pricing, and loyalty updates atomic. Draft updates also reject stale modification times.

The app currently targets only the Frappe Framework `develop` branch. It uses Frappe's database APIs with any of the database options listed below.

## Included

- Books Vue interface on the standalone `/books` route
- Standard Frappe DocTypes that back the interface schemas
- Authenticated Frappe APIs for document operations and aggregate queries
- Setup wizard, chart of accounts, number series, roles, and defaults
- Sales invoices, purchase invoices, quotes, payments, journal entries, returns, and cancellation reversals
- Quote-to-invoice, invoice-to-payment, and invoice-to-return Desk actions
- Inventory ledger, FIFO valuation, stock movements, shipments, receipts, batches, and serial numbers
- Automatic shipment or receipt creation from invoices
- POS shifts and checkout, pricing rules, coupons, and loyalty points
- India GST fields and GSTR-1/GSTR-2 reports, plus Swiss regional schema fields
- General Ledger, Trial Balance, Profit and Loss, Balance Sheet, Stock Ledger, and Stock Balance reports in the Books interface
- Native Frappe print formats for invoices, quotes, payments, shipments, and receipts
- Books workspace and Data Import/Data Export links in Desk

The browser handles downloads, file selection, and printing. Company data belongs to the current Frappe site. The app does not contain a local company-database selector, device telemetry, an updater, or an ERPNext device-sync client.

## Requirements

- Frappe Framework `develop` only
- Python 3.14
- Redis
- Node.js and Yarn
- One database from the following table

| Database | `--db-type` | Setup |
| --- | --- | --- |
| MariaDB 11.8 | `mariadb` | Install the database server and client tools. |
| PostgreSQL 18 | `postgres` | Install the database server and client tools. |
| SQLite 3 | `sqlite` | No database server is required. |

Bench installs the frontend dependencies and builds the Vue app during deployment.

The repository stores the Vue source and its lockfile. It does not store generated JavaScript, CSS, or the generated Frappe website entry.

## Install the app

Install Python and Bench:

```bash
uv python install 3.14
uv tool install frappe-bench
```

Create a Frappe `develop` bench outside this repository:

```bash
BOOKS_PYTHON="$(uv python find 3.14)"
bench init --frappe-branch develop --python "$BOOKS_PYTHON" books-bench
cd books-bench
```

Install the app from GitHub:

```bash
bench get-app https://github.com/mihir-kandoi/frappe-books.git
bench set-config -g developer_mode 1
```

Choose the database type from the table above. This example uses `mariadb`:

```bash
BOOKS_DB_TYPE=mariadb
bench new-site books.localhost \
  --db-type "$BOOKS_DB_TYPE" \
  --set-default
```

Bench prompts for the required passwords. For a database server, set `--db-host`, `--db-port`, and `--db-root-username` as needed.

Install the app and start the bench:

```bash
bench --site books.localhost install-app frappe_books
bench --site books.localhost migrate
bench start
```

Open `http://books.localhost:8000/books`. Sign in and complete the original Books setup wizard.

To move existing data between database engines, create a separate site and migrate the data.
Changing `db_type` in `site_config.json` does not convert a database or an original desktop Books file.

## Build the web app

Install the frontend dependencies from the app root:

```bash
yarn install
```

Build the production assets:

```bash
yarn build
```

Vite writes the asset graph to `frappe_books/public/books`. The build then copies the generated HTML entry to `frappe_books/www/books.html`.

Bench uses the root `build` script during `bench build --app frappe_books`. This follows the same source-to-generated-output pattern as ERPNext Banking.

The app also keeps the `/app/books` Desk workspace for administration.

Use standard Frappe **Data Import** and **Data Export** for CSV-based transfers.

## Schema changes

The DocType JSON files are the source of truth. When you change a DocType field that the Vue app uses, update the matching file in `frontend/schemas` and `frappe_books/schema_mapping.json`. `yarn --cwd frontend test` checks that the three agree.

## Tests and checks

Create a separate test site with the database type selected during installation:

```bash
BOOKS_TEST_SITE=books-test.localhost
bench new-site "$BOOKS_TEST_SITE" \
  --db-type "$BOOKS_DB_TYPE" \
  --admin-password admin
bench --site "$BOOKS_TEST_SITE" install-app frappe_books
bench --site "$BOOKS_TEST_SITE" set-config allow_tests 1 --parse
bench --site "$BOOKS_TEST_SITE" migrate
bench --site "$BOOKS_TEST_SITE" run-tests --app frappe_books
uvx ruff check apps/frappe_books/frappe_books
uvx ruff format --check apps/frappe_books/frappe_books
yarn --cwd frontend typecheck
yarn --cwd frontend test
```

The integration suite covers the UI data layer, posting, reversals, payments, valuation, stock, POS, setup, and printing.
Database regressions cover legacy date repair, native Date columns, singleton settings, and large numeric record names.
Use a separate test site for each database and run the same suite against Frappe `develop`.
GitHub Actions runs installation, migration, and the integration suite on all three databases against Frappe `develop`.

## Site maintenance

Back up the database and files through Bench:

```bash
bench --site books.localhost backup --with-files
```

Keep a copy of `site_config.json` with the backup.

After updating this app, always run:

```bash
bench --site books.localhost migrate
```

## License

AGPL-3.0-only
