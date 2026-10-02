# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.mapper import get_mapped_doc

from frappe_books.accounting.invoice import InvoiceController
from frappe_books.inventory.availability import validate_sale_batch_stock


class BooksSalesQuote(InvoiceController):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_sales_quote_item.books_sales_quote_item import (
			BooksSalesQuoteItem,
		)
		from frappe_books.frappe_books.doctype.books_tax_summary.books_tax_summary import (
			BooksTaxSummary,
		)

		amended_from: DF.Link | None
		attachment: DF.Attach | None
		base_grand_total: DF.Currency
		currency: DF.Link | None
		date: DF.Datetime
		discount_after_tax: DF.Check
		exchange_rate: DF.Float
		grand_total: DF.Currency
		is_fully_returned: DF.Check
		items: DF.Table[BooksSalesQuoteItem]
		net_total: DF.Currency
		number_series: DF.Link
		outstanding_amount: DF.Currency
		party: DF.DynamicLink
		price_list: DF.Link | None
		reference_type: DF.Link
		status: DF.Literal["Saved", "Submitted", "Cancelled"]
		taxes: DF.Table[BooksTaxSummary]
		terms: DF.Text | None
		total_discount: DF.Currency
	# end: auto-generated types

	transaction_type = "quote"

	def validate(self):
		super().validate()
		validate_sale_batch_stock(self)

	def on_submit(self):
		if self.reference_type == "Books Lead":
			lead = frappe.get_doc("Books Lead", self.party)
			lead.status = "Quotation"
			lead.save()


@frappe.whitelist()
def make_sales_invoice(source_name: str):
	return get_mapped_doc(
		"Books Sales Quote",
		source_name,
		{
			"Books Sales Quote": {
				"doctype": "Books Sales Invoice",
				"validation": {"docstatus": ["=", 1], "reference_type": ["=", "Books Party"]},
				"field_no_map": ["date", "number_series", "attachment"],
			},
			"Books Sales Quote Item": {"doctype": "Books Sales Invoice Item"},
		},
		postprocess=_set_invoice_details,
	)


def _set_invoice_details(quote, invoice):
	invoice.account = frappe.db.get_value("Books Party", quote.party, "default_account")
	invoice.fill_mapped_values()
