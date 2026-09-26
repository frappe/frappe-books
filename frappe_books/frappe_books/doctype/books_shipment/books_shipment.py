# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe_books.inventory.transaction import StockTransferController


class BooksShipment(StockTransferController):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_shipment_item.books_shipment_item import (
			BooksShipmentItem,
		)

		amended_from: DF.Link | None
		attachment: DF.Attach | None
		back_reference: DF.Link | None
		date: DF.Datetime
		grand_total: DF.Currency
		is_returned: DF.Check
		items: DF.Table[BooksShipmentItem]
		number_series: DF.Link
		party: DF.Link
		return_against: DF.Link | None
		status: DF.Literal["Saved", "Submitted", "Return", "ReturnIssued", "Cancelled"]
		terms: DF.Text | None
	# end: auto-generated types

	transfer_type = "sales"
