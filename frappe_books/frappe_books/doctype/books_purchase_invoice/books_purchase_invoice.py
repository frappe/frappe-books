# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe

from frappe_books.accounting.invoice import PostingInvoiceController
from frappe_books.accounting.payment import map_invoice_payment
from frappe_books.accounting.returns import map_return
from frappe_books.inventory.invoice_transfer import map_invoice_transfer
from frappe_books.inventory.stock import create_series_batches


class BooksPurchaseInvoice(PostingInvoiceController):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_item_wise_tax_detail.books_item_wise_tax_detail import (
			BooksItemWiseTaxDetail,
		)
		from frappe_books.frappe_books.doctype.books_purchase_invoice_item.books_purchase_invoice_item import (
			BooksPurchaseInvoiceItem,
		)
		from frappe_books.frappe_books.doctype.books_purchase_taxes_and_charges.books_purchase_taxes_and_charges import (
			BooksPurchaseTaxesandCharges,
		)

		amended_from: DF.Link | None
		base_grand_total: DF.Currency
		buying_price_list: DF.Link | None
		company: DF.Link | None
		conversion_rate: DF.Float
		credit_to: DF.Link
		currency: DF.Link | None
		discount_after_tax: DF.Check
		grand_total: DF.Currency
		is_fully_returned: DF.Check
		is_return: DF.Check
		item_wise_tax_details: DF.Table[BooksItemWiseTaxDetail]
		items: DF.Table[BooksPurchaseInvoiceItem]
		make_auto_payment: DF.Check
		make_auto_stock_transfer: DF.Check
		naming_series: DF.Link
		net_total: DF.Currency
		outstanding_amount: DF.Currency
		per_received: DF.Percent
		posting_date: DF.Date
		posting_time: DF.Time | None
		return_against: DF.Link | None
		status: DF.Literal[
			"Draft", "Unpaid", "Partly Paid", "Paid", "Return", "Debit Note Issued", "Cancelled"
		]
		supplier: DF.Link
		taxes: DF.Table[BooksPurchaseTaxesandCharges]
		taxes_and_charges: DF.Link | None
		terms: DF.TextEditor | None
		total_taxes_and_charges: DF.Currency
	# end: auto-generated types

	transaction_type = "purchase"
	is_purchase = True
	party_type = "Books Supplier"
	party_field = "supplier"
	party_account_type = "Payable"
	party_account_field = "credit_to"
	item_account_field = "expense_account"

	def create_batches(self):
		"""Give batch rows without a batch a new one from the item's series; a return keeps the original's."""
		if not self.return_against:
			create_series_batches(self.items)


@frappe.whitelist()
def make_payment(source_name: str):
	return map_invoice_payment("Books Purchase Invoice", source_name)


@frappe.whitelist()
def make_return(source_name: str):
	return map_return("Books Purchase Invoice", source_name)


@frappe.whitelist()
def make_purchase_receipt(source_name: str):
	return map_invoice_transfer("Books Purchase Invoice", source_name)
