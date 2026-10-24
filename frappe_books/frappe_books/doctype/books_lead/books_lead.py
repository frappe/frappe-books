# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc

from frappe_books.settings import require_feature


class BooksLead(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		address: DF.Link | None
		company: DF.Link | None
		email: DF.Data | None
		mobile: DF.Data | None
		status: DF.Literal[
			"Open", "Replied", "Interested", "Opportunity", "Converted", "Quotation", "Do not Contact"
		]
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Lead"

	def validate(self):
		require_feature("enable_lead")


@frappe.whitelist()
def make_customer(source_name: str):
	"""Return an unsaved customer made from the lead, named like it."""
	return get_mapped_doc(
		"Books Lead",
		source_name,
		{
			"Books Lead": {
				"doctype": "Books Customer",
				"field_map": {"name": "lead_name", "mobile": "phone", "address": "customer_primary_address"},
			}
		},
		postprocess=_set_customer,
	)


def _set_customer(lead, customer):
	customer.name = customer.customer_name = lead.name


@frappe.whitelist()
def make_quotation(source_name: str):
	"""Return an unsaved sales quote to the lead."""
	return get_mapped_doc(
		"Books Lead",
		source_name,
		{"Books Lead": {"doctype": "Books Quotation", "field_map": {"name": "party_name"}}},
		postprocess=_quote_the_lead,
	)


def _quote_the_lead(_lead, quote):
	quote.quotation_to = "Books Lead"
