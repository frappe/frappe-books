# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe_books.inventory.transaction import StockEntryController


class BooksStockEntry(StockEntryController):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_stock_entry_detail.books_stock_entry_detail import (
			BooksStockEntryDetail,
		)

		amended_from: DF.Link | None
		company: DF.Link | None
		items: DF.Table[BooksStockEntryDetail]
		naming_series: DF.Link
		posting_date: DF.Date
		posting_time: DF.Time | None
		purpose: DF.Literal["Material Issue", "Material Receipt", "Material Transfer", "Repack"]
		total_amount: DF.Currency
	# end: auto-generated types

	pass
