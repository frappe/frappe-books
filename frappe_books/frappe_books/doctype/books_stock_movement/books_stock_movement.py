# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe_books.inventory.transaction import StockMovementController


class BooksStockMovement(StockMovementController):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_stock_movement_item.books_stock_movement_item import (
			BooksStockMovementItem,
		)

		amended_from: DF.Link | None
		amount: DF.Currency
		date: DF.Datetime
		items: DF.Table[BooksStockMovementItem]
		movement_type: DF.Literal["MaterialIssue", "MaterialReceipt", "MaterialTransfer", "Manufacture"]
		number_series: DF.Link
		status: DF.Literal["Saved", "Submitted", "Cancelled"]
	# end: auto-generated types

	pass
