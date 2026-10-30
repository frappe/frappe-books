# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from frappe_books.accounting.accounts import PAYMENT_ACCOUNT_TYPES, validate_changed_accounts
from frappe_books.printing import default_print_format, update_default_print_formats, validate_print_format

ACCOUNT_TYPES = {
	"sales_payment_account": {"account_types": PAYMENT_ACCOUNT_TYPES},
	"purchase_payment_account": {"account_types": PAYMENT_ACCOUNT_TYPES},
}
# Virtual fields that show the default print format each DocType keeps; set_print_formats sets it.
PRINT_FORMAT_FIELDS = {
	"quotation_print_template": "Books Quotation",
	"sales_invoice_print_template": "Books Sales Invoice",
	"purchase_invoice_print_template": "Books Purchase Invoice",
	"journal_entry_print_template": "Books Journal Entry",
	"payment_print_template": "Books Payment Entry",
	"delivery_note_print_template": "Books Delivery Note",
	"purchase_receipt_print_template": "Books Purchase Receipt",
	"stock_entry_print_template": "Books Stock Entry",
}


def print_format_field(fieldname: str) -> property:
	return property(lambda _doc: default_print_format(PRINT_FORMAT_FIELDS[fieldname]))


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
		journal_entry_print_template: DF.Link | None
		pay_button_colour: DF.Color | None
		payment_number_series: DF.Link | None
		payment_print_template: DF.Link | None
		pos_cash_denominations: DF.Table[BooksDefaultCashDenominations]
		pos_customer: DF.Link | None
		pos_print_template: DF.Link | None
		purchase_invoice_number_series: DF.Link | None
		purchase_invoice_print_template: DF.Link | None
		purchase_invoice_terms: DF.Text | None
		purchase_payment_account: DF.Link | None
		purchase_receipt_location: DF.Link | None
		purchase_receipt_number_series: DF.Link | None
		purchase_receipt_print_template: DF.Link | None
		purchase_receipt_terms: DF.Text | None
		return_button_colour: DF.Color | None
		sales_invoice_number_series: DF.Link | None
		sales_invoice_print_template: DF.Link | None
		sales_invoice_terms: DF.Text | None
		sales_payment_account: DF.Link | None
		quotation_number_series: DF.Link | None
		quotation_print_template: DF.Link | None
		save_button_colour: DF.Color | None
		delivery_note_location: DF.Link | None
		delivery_note_number_series: DF.Link | None
		delivery_note_print_template: DF.Link | None
		delivery_note_terms: DF.Text | None
		stock_entry_number_series: DF.Link | None
		stock_entry_print_template: DF.Link | None
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Defaults"

	quotation_print_template = print_format_field("quotation_print_template")
	sales_invoice_print_template = print_format_field("sales_invoice_print_template")
	purchase_invoice_print_template = print_format_field("purchase_invoice_print_template")
	journal_entry_print_template = print_format_field("journal_entry_print_template")
	payment_print_template = print_format_field("payment_print_template")
	delivery_note_print_template = print_format_field("delivery_note_print_template")
	purchase_receipt_print_template = print_format_field("purchase_receipt_print_template")
	stock_entry_print_template = print_format_field("stock_entry_print_template")

	def validate(self):
		validate_changed_accounts(self, ACCOUNT_TYPES)
		validate_print_format(self.pos_print_template, "Books Sales Invoice")


@frappe.whitelist(methods=["POST"])
def set_print_formats(print_formats: dict[str, str | None]) -> None:
	"""Set the default print formats Books Defaults shows, by its fieldnames.

	A save of the settings leaves them alone, so no stored copy can set them back.
	"""
	# The write right on the settings is the right to choose their print formats.
	frappe.has_permission("Books Defaults", "write", throw=True)
	if unknown := set(print_formats) - set(PRINT_FORMAT_FIELDS):
		frappe.throw(_("Books Defaults has no print format field {0}.").format(", ".join(sorted(unknown))))
	update_default_print_formats(
		{PRINT_FORMAT_FIELDS[fieldname]: value for fieldname, value in print_formats.items()}
	)
