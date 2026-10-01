# Browser regression tests

Run the link control tests against a configured local Books test site after `yarn build`.
Tests that open stored records save them first through `/api/v2` (`helpers/records.ts`), or answer their requests in the browser.

```sh
yarn playwright install chromium
yarn test:ui
```

The default site is `http://books-test.localhost:8000` with the local `Administrator` / `admin` login.
Set `BOOKS_TEST_URL`, `BOOKS_TEST_USER`, and `BOOKS_TEST_PASSWORD` to use another test site.
Set `BOOKS_BROWSER_CHANNEL=chrome` to use an installed Chrome browser.

`list-filter-database.spec.ts` seeds records on the site with `bench execute` and checks the rows its list filters return. It runs only when `BOOKS_FILTER_TEST_BENCH` (the bench folder) and `BOOKS_FILTER_TEST_SITE` (a site with `allow_tests`) are set.

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
