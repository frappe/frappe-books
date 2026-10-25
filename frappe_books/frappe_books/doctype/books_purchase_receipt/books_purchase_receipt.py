# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe

from frappe_books.inventory.invoice_transfer import map_transfer_invoice
from frappe_books.inventory.returns import map_transfer_return
from frappe_books.inventory.transaction import StockTransferController


class BooksPurchaseReceipt(StockTransferController):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_purchase_receipt_item.books_purchase_receipt_item import (
			BooksPurchaseReceiptItem,
		)

		amended_from: DF.Link | None
		company: DF.Link | None
		grand_total: DF.Currency
		is_return: DF.Check
		items: DF.Table[BooksPurchaseReceiptItem]
		naming_series: DF.Link
		per_billed: DF.Percent
		per_returned: DF.Percent
		posting_date: DF.Date
		posting_time: DF.Time | None
		return_against: DF.Link | None
		status: DF.Literal[
			"Draft", "To Bill", "Partly Billed", "Completed", "Return", "Return Issued", "Cancelled"
		]
		supplier: DF.Link
		terms: DF.TextEditor | None
	# end: auto-generated types

	transfer_type = "purchase"
	party_type = "Books Supplier"
	party_field = "supplier"


@frappe.whitelist()
def make_purchase_invoice(source_name: str):
	return map_transfer_invoice("Books Purchase Receipt", source_name)


@frappe.whitelist()
def make_return(source_name: str):
	return map_transfer_return("Books Purchase Receipt", source_name)
