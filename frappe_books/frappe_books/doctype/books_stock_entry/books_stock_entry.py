# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe_books.inventory.transaction import StockEntryController


class BooksStockEntry(StockEntryController):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_stock_entry_item.books_stock_entry_item import (
			BooksStockEntryItem,
		)

		amended_from: DF.Link | None
		amount: DF.Currency
		company: DF.Link | None
		date: DF.Datetime
		items: DF.Table[BooksStockEntryItem]
		movement_type: DF.Literal["MaterialIssue", "MaterialReceipt", "MaterialTransfer", "Manufacture"]
		number_series: DF.Link
		status: DF.Literal["Saved", "Submitted", "Cancelled"]
	# end: auto-generated types

	pass
