# Reports

Reports are a view of stored data, the code here doesn't alter any data.

All reports should extend the `Report` class in `reports/Report.ts`, depending
on the report it may have custom `.vue` files. Check the `type.ts` file for the
shape of the report data.

The server computes report values in `frappe_books/reports` and returns them through the bespoke bridge (`fyo.db.getReportData`). The classes here only send filters and render rows.
