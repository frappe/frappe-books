# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe

from frappe_books.inventory.invoice_transfer import map_transfer_invoice
from frappe_books.inventory.returns import map_transfer_return
from frappe_books.inventory.transaction import StockTransferController


class BooksDeliveryNote(StockTransferController):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_delivery_note_item.books_delivery_note_item import (
			BooksDeliveryNoteItem,
		)

		amended_from: DF.Link | None
		attachment: DF.Attach | None
		back_reference: DF.Link | None
		company: DF.Link | None
		customer: DF.Link
		date: DF.Datetime
		grand_total: DF.Currency
		is_fully_billed: DF.Check
		is_returned: DF.Check
		items: DF.Table[BooksDeliveryNoteItem]
		naming_series: DF.Link
		return_against: DF.Link | None
		status: DF.Literal["Saved", "Submitted", "Return", "Return Issued", "Cancelled"]
		terms: DF.Text | None
	# end: auto-generated types

	transfer_type = "sales"
	party_type = "Books Customer"
	party_field = "customer"


@frappe.whitelist()
def make_sales_invoice(source_name: str):
	return map_transfer_invoice("Books Delivery Note", source_name)


@frappe.whitelist()
def make_return(source_name: str):
	return map_transfer_return("Books Delivery Note", source_name)
