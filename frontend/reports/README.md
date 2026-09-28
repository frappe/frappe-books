# Reports

Reports are a view of stored data, the code here doesn't alter any data.

Each report is a "Books " Script Report in `frappe_books/frappe_books/report`. The server owns the columns, rows, periods, totals and default filter values. The classes here extend `Report` in `reports/Report.ts`: they hold the filter fields, run the Script Report through `frappe.desk.query_report.run` and style its rows.
