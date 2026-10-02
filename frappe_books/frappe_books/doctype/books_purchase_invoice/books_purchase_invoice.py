# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe

from frappe_books.accounting.invoice import PostingInvoiceController
from frappe_books.accounting.payment import map_invoice_payment
from frappe_books.accounting.returns import map_return
from frappe_books.inventory.auto_transfer import map_invoice_transfer


class BooksPurchaseInvoice(PostingInvoiceController):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_purchase_invoice_item.books_purchase_invoice_item import (
			BooksPurchaseInvoiceItem,
		)
		from frappe_books.frappe_books.doctype.books_tax_summary.books_tax_summary import (
			BooksTaxSummary,
		)

		account: DF.Link
		amended_from: DF.Link | None
		attachment: DF.Attach | None
		back_reference: DF.Link | None
		base_grand_total: DF.Currency
		currency: DF.Link | None
		date: DF.Datetime
		discount_after_tax: DF.Check
		exchange_rate: DF.Float
		grand_total: DF.Currency
		is_fully_returned: DF.Check
		is_returned: DF.Check
		items: DF.Table[BooksPurchaseInvoiceItem]
		make_auto_payment: DF.Check
		make_auto_stock_transfer: DF.Check
		net_total: DF.Currency
		number_series: DF.Link
		outstanding_amount: DF.Currency
		party: DF.Link
		price_list: DF.Link | None
		return_against: DF.Link | None
		status: DF.Literal["Saved", "Unpaid", "Partly Paid", "Paid", "Return", "Return Issued", "Cancelled"]
		stock_not_transferred: DF.Float
		taxes: DF.Table[BooksTaxSummary]
		terms: DF.Text | None
		total_discount: DF.Currency
	# end: auto-generated types

	transaction_type = "purchase"


@frappe.whitelist()
def make_payment(source_name: str):
	return map_invoice_payment("Books Purchase Invoice", source_name)


@frappe.whitelist()
def make_return(source_name: str):
	return map_return("Books Purchase Invoice", source_name)


@frappe.whitelist()
def make_purchase_receipt(source_name: str):
	return map_invoice_transfer("Books Purchase Invoice", source_name)
