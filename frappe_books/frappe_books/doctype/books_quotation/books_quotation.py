# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.mapper import get_mapped_doc

from frappe_books.accounting.invoice import InvoiceController


class BooksQuotation(InvoiceController):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_item_wise_tax_detail.books_item_wise_tax_detail import (
			BooksItemWiseTaxDetail,
		)
		from frappe_books.frappe_books.doctype.books_quotation_item.books_quotation_item import (
			BooksQuotationItem,
		)
		from frappe_books.frappe_books.doctype.books_sales_taxes_and_charges.books_sales_taxes_and_charges import (
			BooksSalesTaxesandCharges,
		)

		amended_from: DF.Link | None
		base_grand_total: DF.Currency
		company: DF.Link | None
		conversion_rate: DF.Float
		currency: DF.Link | None
		discount_after_tax: DF.Check
		grand_total: DF.Currency
		item_wise_tax_details: DF.Table[BooksItemWiseTaxDetail]
		items: DF.Table[BooksQuotationItem]
		naming_series: DF.Link
		net_total: DF.Currency
		party_name: DF.DynamicLink
		quotation_to: DF.Link
		selling_price_list: DF.Link | None
		status: DF.Literal["Draft", "Open", "Cancelled"]
		taxes: DF.Table[BooksSalesTaxesandCharges]
		taxes_and_charges: DF.Link | None
		terms: DF.TextEditor | None
		total_taxes_and_charges: DF.Currency
		transaction_date: DF.Date
	# end: auto-generated types

	transaction_type = "quote"
	is_purchase = False
	party_field = "party_name"
	party_account_type = None
	party_account_field = None
	item_account_field = None
	date_field = "transaction_date"

	def validate(self):
		if self.quotation_to not in ("Books Customer", "Books Lead"):
			frappe.throw(_("A quotation goes to a customer or a lead."))
		super().validate()

	@property
	def party_type(self):
		return self.quotation_to

	def on_submit(self):
		if self.quotation_to == "Books Lead":
			lead = frappe.get_doc("Books Lead", self.party_name)
			lead.status = "Quotation"
			lead.save()


@frappe.whitelist()
def make_sales_invoice(source_name: str):
	return get_mapped_doc(
		"Books Quotation",
		source_name,
		{
			"Books Quotation": {
				"doctype": "Books Sales Invoice",
				"validation": {"docstatus": ["=", 1], "quotation_to": ["=", "Books Customer"]},
				"field_map": {"party_name": "customer"},
				"field_no_map": ["naming_series"],
			},
			"Books Quotation Item": {"doctype": "Books Sales Invoice Item"},
			"Books Sales Taxes and Charges": {"doctype": "Books Sales Taxes and Charges"},
		},
		postprocess=lambda _quote, invoice: invoice.fill_mapped_values(),
	)
