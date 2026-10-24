# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe

from frappe_books.accounting.party import PartyController, map_invoice
from frappe_books.accounting.party_contacts import link_lead_records
from frappe_books.settings import require_features


class BooksCustomer(PartyController):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_party_account.books_party_account import (
			BooksPartyAccount,
		)

		accounts: DF.Table[BooksPartyAccount]
		customer_name: DF.Data
		customer_primary_address: DF.Link | None
		customer_primary_contact: DF.Link | None
		default_currency: DF.Link | None
		email_id: DF.ReadOnly | None
		gst_category: DF.Literal["Registered Regular", "Unregistered"]
		gstin: DF.Data | None
		image: DF.AttachImage | None
		lead_name: DF.Link | None
		loyalty_points: DF.Int
		loyalty_program: DF.Link | None
		mobile_no: DF.ReadOnly | None
		outstanding_amount: DF.Currency
		primary_address: DF.TextEditor | None
		tax_id: DF.Data | None
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Customer"

	def validate(self):
		require_features(self, {"loyalty_program": "enable_loyalty_program"})
		super().validate()

	def after_insert(self):
		super().after_insert()
		link_lead_records(self)

	def on_update(self):
		if not self.lead_name:
			return
		lead = frappe.get_doc("Books Lead", self.lead_name)
		if lead.status != "Converted":
			lead.status = "Converted"
			lead.save()

	def on_trash(self):
		super().on_trash()
		if not self.lead_name:
			return
		lead = frappe.get_doc("Books Lead", self.lead_name)
		lead.status = "Interested"
		lead.save()


@frappe.whitelist()
def make_sales_invoice(source_name: str):
	return map_invoice("Books Customer", source_name, "Books Sales Invoice")
