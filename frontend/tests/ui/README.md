# Browser regression tests

Run the link control tests against a configured local Books test site after `yarn build`.
Most tests create documents in browser memory. Frappe serves some doctypes, such as Party and Address, from their stored records, so tests that open them save their fixture records first.

```sh
yarn playwright install chromium
yarn test:ui
```

The default site is `http://books-test.localhost:8000` with the local `Administrator` / `admin` login.
Set `BOOKS_TEST_URL`, `BOOKS_TEST_USER`, and `BOOKS_TEST_PASSWORD` to use another test site.
Set `BOOKS_BROWSER_CHANNEL=chrome` to use an installed Chrome browser.

The report table tests build and serve an isolated fixture with in-memory rows.
They do not need a Books site or a separate build:

```sh
yarn test:ui tests/ui/report-table.spec.ts
```

The POS layout tests use the real components and models with in-memory records.
They cover both layouts, every POS dialog, small windows, invoice selection, and keypad validation.
They do not need a running Books site:

```sh
yarn test:ui tests/ui/pos-layout.spec.ts
```
