# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.contacts.address_and_contact import delete_contact_and_address
from frappe.contacts.doctype.address.address import get_default_address
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc

from frappe_books.accounting.party_contacts import make_lead_address
from frappe_books.settings import require_feature


class BooksLead(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		company: DF.Link | None
		email_id: DF.Data | None
		lead_name: DF.Data
		mobile_no: DF.Data | None
		status: DF.Literal[
			"Lead",
			"Open",
			"Replied",
			"Opportunity",
			"Quotation",
			"Lost Quotation",
			"Interested",
			"Converted",
			"Do Not Contact",
		]
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Lead"

	def validate(self):
		require_feature("enable_lead")

	def after_insert(self):
		make_lead_address(self)

	def on_trash(self):
		# Addresses link to the lead by Dynamic Link; they go with it unless they link elsewhere too.
		delete_contact_and_address(self.doctype, self.name)


@frappe.whitelist()
def make_customer(source_name: str):
	"""Return an unsaved customer made from the lead, named like it, with the lead's address."""
	return get_mapped_doc(
		"Books Lead",
		source_name,
		{"Books Lead": {"doctype": "Books Customer", "field_map": {"name": "lead_name"}}},
		postprocess=_set_customer,
	)


def _set_customer(lead, customer):
	customer.name = customer.customer_name = lead.lead_name
	customer.customer_primary_address = get_default_address(lead.doctype, lead.name)


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
