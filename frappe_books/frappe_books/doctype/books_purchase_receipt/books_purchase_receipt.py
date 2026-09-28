# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe

from frappe_books.inventory.returns import map_transfer_return
from frappe_books.inventory.transaction import StockTransferController, map_transfer_invoice


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
		attachment: DF.Attach | None
		back_reference: DF.Link | None
		date: DF.Datetime
		grand_total: DF.Currency
		is_fully_billed: DF.Check
		is_returned: DF.Check
		items: DF.Table[BooksPurchaseReceiptItem]
		number_series: DF.Link
		party: DF.Link
		return_against: DF.Link | None
		status: DF.Literal["Saved", "Submitted", "Return", "Return Issued", "Cancelled"]
		terms: DF.Text | None
	# end: auto-generated types

	transfer_type = "purchase"


@frappe.whitelist()
def make_purchase_invoice(source_name: str):
	return map_transfer_invoice("Books Purchase Receipt", source_name)


@frappe.whitelist()
def make_return(source_name: str):
	return map_transfer_return("Books Purchase Receipt", source_name)
