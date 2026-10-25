"""Customers and suppliers, and the documents made out to them."""

import frappe
from frappe import _
from frappe.contacts.doctype.address.address import get_address_display
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc

from frappe_books.accounting.accounts import validate_party_account
from frappe_books.accounting.money import company_currency
from frappe_books.accounting.party_contacts import (
	delete_primary_records,
	make_primary_records,
	party_field,
	validate_primary_records,
)
from frappe_books.company import default_company
from frappe_books.regional import validate_gstin

# The account a new party's ledger defaults to, when the chart has it.
CHART_ACCOUNTS = {"Books Customer": "Debtors", "Books Supplier": "Creditors"}


class PartyController(Document):
	"""A customer or supplier: its ledger account, currency, primary Contact and Address and GST registration."""

	def before_validate(self):
		self.default_currency = self.default_currency or company_currency()
		self.set_company_account()

	def validate(self):
		self.validate_accounts()
		validate_primary_records(self)
		self.set_primary_address()
		if self.gst_category != "Registered Regular":
			self.gstin = None
		elif not self.gstin:
			frappe.throw(_("GSTIN is required for a registered party."))
		else:
			self.gstin = validate_gstin(self.gstin)

	def after_insert(self):
		make_primary_records(self)

	def on_trash(self):
		delete_primary_records(self)

	def set_company_account(self):
		"""Rows belong to the one company, which takes the chart's party account when it has no row."""
		company = default_company()
		for row in self.accounts:
			row.company = row.company or company
		account = not self.get("accounts", {"company": company}) and _chart_account(self.doctype)
		if account:
			self.append("accounts", {"company": company, "account": account})

	def set_primary_address(self):
		"""The primary address as the Address Template renders it, which prints show."""
		address = self.get(party_field(self.doctype, "primary_address"))
		self.primary_address = get_address_display(address) if address else None

	def validate_accounts(self):
		companies = [row.company for row in self.accounts]
		if len(companies) != len(set(companies)):
			frappe.throw(
				_("There can only be 1 Account per Company in {0} {1}").format(_(self.doctype), self.name)
			)
		for row in self.accounts:
			validate_party_account(row, "account", self.doctype)


class PartyDocumentMixin:
	"""A document made out to a customer or supplier, held in its `party_field`."""

	party_type: str
	party_field: str

	@property
	def party(self):
		return self.get(self.party_field)


def party_account(party_type, party):
	"""The party's ledger account for the one company, if it has one."""
	filters = {"parenttype": party_type, "parent": party, "company": default_company()}
	return frappe.db.get_value("Books Party Account", filters, "account")


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
