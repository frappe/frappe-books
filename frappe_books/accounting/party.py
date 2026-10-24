"""Customers and suppliers, and the documents made out to them."""

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc

from frappe_books.accounting.accounts import validate_party_account
from frappe_books.accounting.money import company_currency
from frappe_books.regional import validate_gstin

# The account a new party's ledger defaults to, when the chart has it.
CHART_ACCOUNTS = {"Books Customer": "Debtors", "Books Supplier": "Creditors"}


class PartyController(Document):
	"""A customer or supplier: its ledger account, currency and GST registration."""

	def before_validate(self):
		self.default_account = self.default_account or _chart_account(self.doctype)
		self.default_currency = self.default_currency or company_currency()

	def validate(self):
		validate_party_account(self, "default_account", self.doctype)
		if self.gst_category != "Registered Regular":
			self.gstin = None
		elif not self.gstin:
			frappe.throw(_("GSTIN is required for a registered party."))
		else:
			self.gstin = validate_gstin(self.gstin)


class PartyDocumentMixin:
	"""A document made out to a customer or supplier, held in its `party_field`."""

	party_type: str
	party_field: str

	@property
	def party(self):
		return self.get(self.party_field)


def _chart_account(party_type):
	account = CHART_ACCOUNTS[party_type]
	return account if frappe.db.exists("Books Account", account) else None


def map_invoice(party_type, party, invoice_doctype):
	"""Return an unsaved invoice to the party, with the defaults a save would give it.

	Frappe's mapper links the invoice's customer or supplier field to the party.
	"""
	return get_mapped_doc(
		party_type,
		party,
		{
			party_type: {
				"doctype": invoice_doctype,
				# a customer's point balance is not what an invoice redeems
				"field_no_map": ["loyalty_points"],
			}
		},
		postprocess=lambda _party, invoice: invoice.fill_mapped_values(),
	)
