# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.mapper import get_mapped_doc

from frappe_books.accounting.invoice import InvoiceController
from frappe_books.inventory.availability import validate_sale_batch_stock


class BooksQuotation(InvoiceController):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_quotation_item.books_quotation_item import (
			BooksQuotationItem,
		)
		from frappe_books.frappe_books.doctype.books_tax_summary.books_tax_summary import (
			BooksTaxSummary,
		)

		amended_from: DF.Link | None
		attachment: DF.Attach | None
		base_grand_total: DF.Currency
		company: DF.Link | None
		currency: DF.Link | None
		date: DF.Datetime
		discount_after_tax: DF.Check
		exchange_rate: DF.Float
		grand_total: DF.Currency
		is_fully_returned: DF.Check
		items: DF.Table[BooksQuotationItem]
		net_total: DF.Currency
		number_series: DF.Link
		outstanding_amount: DF.Currency
		party_name: DF.DynamicLink
		price_list: DF.Link | None
		quotation_to: DF.Link
		status: DF.Literal["Saved", "Submitted", "Cancelled"]
		taxes: DF.Table[BooksTaxSummary]
		terms: DF.Text | None
		total_discount: DF.Currency
	# end: auto-generated types

	transaction_type = "quote"
	is_purchase = False
	party_field = "party_name"
	party_account_type = None
	item_account_field = "income_account"

	def validate(self):
		if self.quotation_to not in ("Books Customer", "Books Lead"):
			frappe.throw(_("A quotation goes to a customer or a lead."))
		super().validate()
		validate_sale_batch_stock(self)

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
				"field_no_map": ["date", "number_series", "attachment"],
			},
			"Books Quotation Item": {"doctype": "Books Sales Invoice Item"},
		},
		postprocess=lambda _quote, invoice: invoice.fill_mapped_values(),
	)
