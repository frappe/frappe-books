# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc

from frappe_books.accounting.accounts import company_party_account, validate_party_account
from frappe_books.accounting.money import company_currency
from frappe_books.accounting.settlement import party_outstanding
from frappe_books.commerce.loyalty import get_available_points
from frappe_books.regional import validate_gstin
from frappe_books.settings import require_features

ROLE_ACCOUNTS = {"Customer": ("Receivable", "Debtors"), "Supplier": ("Payable", "Creditors")}


class BooksParty(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		address: DF.Link | None
		currency: DF.Link | None
		default_account: DF.Link | None
		email: DF.Data | None
		from_lead: DF.Link | None
		gst_type: DF.Literal["Unregistered", "Registered Regular", "Consumer"]
		gstin: DF.Data | None
		image: DF.AttachImage | None
		loyalty_points: DF.Int
		loyalty_program: DF.Link | None
		outstanding_amount: DF.Currency
		phone: DF.Data | None
		role: DF.Literal["Both", "Supplier", "Customer"]
		tax_id: DF.Data | None
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Party"

	def before_validate(self):
		self.default_account = self.default_account or _default_account(self.role)
		self.currency = self.currency or company_currency()
		self.set_balances()

	def set_balances(self):
		"""What the party owes and its points come from its invoices and point entries, whatever a save sends."""
		is_new = self.is_new()
		self.outstanding_amount = 0 if is_new else party_outstanding(self.name, self.role)
		self.loyalty_points = 0 if is_new else get_available_points(self.name)

	def validate(self):
		require_features(self, {"loyalty_program": "enable_loyalty_program"})
		validate_party_account(self, "default_account", self.role)
		if self.gst_type != "Registered Regular":
			self.gstin = None
		elif not self.gstin:
			frappe.throw(_("GSTIN is required for a registered party."))
		else:
			self.gstin = validate_gstin(self.gstin)

	def on_update(self):
		if not self.from_lead:
			return
		lead = frappe.get_doc("Books Lead", self.from_lead)
		if lead.status != "Converted":
			lead.status = "Converted"
			lead.save()

	def on_trash(self):
		if not self.from_lead:
			return
		lead = frappe.get_doc("Books Lead", self.from_lead)
		lead.status = "Interested"
		lead.save()


def _default_account(role):
	"""The company's default receivable or payable, else Debtors or Creditors when the chart has them."""
	if role not in ROLE_ACCOUNTS:
		return None
	account_type, name = ROLE_ACCOUNTS[role]
	return company_party_account(account_type) or (name if frappe.db.exists("Books Account", name) else None)


@frappe.whitelist()
def make_sales_invoice(source_name: str):
	return _map_invoice(source_name, "Books Sales Invoice")


@frappe.whitelist()
def make_purchase_invoice(source_name: str):
	return _map_invoice(source_name, "Books Purchase Invoice")


def _map_invoice(party, invoice_doctype):
	"""Return an unsaved invoice to the party, with the defaults a save would give it."""
	return get_mapped_doc(
		"Books Party",
		party,
		{
			"Books Party": {
				"doctype": invoice_doctype,
				"field_map": {"name": "party"},
				# a party's point balance is not what an invoice redeems
				"field_no_map": ["loyalty_points"],
			}
		},
		postprocess=lambda _party, invoice: invoice.fill_mapped_values(),
	)
