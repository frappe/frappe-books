# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document

from frappe_books.accounting.accounts import PAYMENT_ACCOUNT_TYPES, validate_changed_accounts
from frappe_books.printing import validate_print_format

ACCOUNT_TYPES = {
	"sales_payment_account": {"account_types": PAYMENT_ACCOUNT_TYPES},
	"purchase_payment_account": {"account_types": PAYMENT_ACCOUNT_TYPES},
}


class BooksDefaults(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_default_cash_denominations.books_default_cash_denominations import (
			BooksDefaultCashDenominations,
		)

		cancel_button_colour: DF.Color | None
		held_button_colour: DF.Color | None
		journal_entry_number_series: DF.Link | None
		pay_and_print_button_colour: DF.Color | None
		pay_button_colour: DF.Color | None
		payment_number_series: DF.Link | None
		pos_cash_denominations: DF.Table[BooksDefaultCashDenominations]
		pos_customer: DF.Link | None
		pos_print_template: DF.Link | None
		purchase_invoice_number_series: DF.Link | None
		purchase_invoice_terms: DF.Text | None
		purchase_payment_account: DF.Link | None
		purchase_receipt_location: DF.Link | None
		purchase_receipt_number_series: DF.Link | None
		purchase_receipt_terms: DF.Text | None
		return_button_colour: DF.Color | None
		sales_invoice_number_series: DF.Link | None
		sales_invoice_terms: DF.Text | None
		sales_payment_account: DF.Link | None
		sales_quote_number_series: DF.Link | None
		save_button_colour: DF.Color | None
		shipment_location: DF.Link | None
		shipment_number_series: DF.Link | None
		shipment_terms: DF.Text | None
		stock_movement_number_series: DF.Link | None
		submit_button_colour: DF.Color | None
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Defaults"

	def validate(self):
		validate_changed_accounts(self, ACCOUNT_TYPES)
		validate_print_format(self.pos_print_template, "Books Sales Invoice")
