"""The fieldnames of a row's item, units, quantities, batch and serial numbers.

Quote and invoice rows take ERPNext's names. Stock transfer and stock entry rows keep
Books' names until the stock rows are renamed too; helpers that take both read `row_fields`.
"""

import frappe

INVOICE_DOCTYPES = ("Books Sales Invoice", "Books Purchase Invoice", "Books Quotation")

INVOICE_ROW = frappe._dict(
	item="item_code",
	qty="qty",
	stock_qty="stock_qty",
	uom="uom",
	stock_uom="stock_uom",
	factor="conversion_factor",
	batch="batch_no",
	serial="serial_no",
)
STOCK_ROW = frappe._dict(
	item="item",
	qty="transfer_quantity",
	stock_qty="quantity",
	uom="transfer_unit",
	stock_uom="unit",
	factor="unit_conversion_factor",
	batch="batch",
	serial="serial_number",
)


def row_fields(row) -> frappe._dict:
	"""The fieldnames of a quote or invoice row, by the doctype it is in, else of a stock row."""
	return INVOICE_ROW if row.get("parenttype") in INVOICE_DOCTYPES else STOCK_ROW


def row_values(row, *names) -> tuple:
	"""The row's values under `row_fields` names, e.g. `row_values(row, "item", "batch")`."""
	fields = row_fields(row)
	return tuple(row.get(fields[name]) for name in names)
