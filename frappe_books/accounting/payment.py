"""Payment validation, posting, and allocation behavior."""

from collections import defaultdict

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc

from frappe_books.accounting.accounts import (
	latest_ledger_account,
	validate_party_account,
	validate_payment_account,
)
from frappe_books.accounting.ledger import LedgerPosting, delete_entries, reverse_entries
from frappe_books.accounting.money import as_decimal, rounded, sum_decimal
from frappe_books.accounting.outstanding import update_party_outstanding
from frappe_books.commerce.pos import counter_cash_account, is_cash_method
from frappe_books.permissions import check_preview_permission
from frappe_books.series import SeriesNamingMixin
from frappe_books.status import StatusMixin

REFERENCE_DOCTYPES = {
	"SalesInvoice": "Books Sales Invoice",
	"PurchaseInvoice": "Books Purchase Invoice",
	"Books Sales Invoice": "Books Sales Invoice",
	"Books Purchase Invoice": "Books Purchase Invoice",
}


class PaymentController(StatusMixin, SeriesNamingMixin, Document):
	def before_validate(self):
		for row in self.payment_references:
			row.reference_type = REFERENCE_DOCTYPES.get(row.reference_type, row.reference_type)
		self.set_missing_values()

	@frappe.whitelist()
	def preview(self):
		"""Fill the values a save would fill, without saving, for the form to show them."""
		check_preview_permission(self)
		self.set_number_series()
		self.set_missing_values()
		# The fills show what the invoices hold, which only their readers may see.
		for row in self.payment_references:
			if row.reference_name:
				frappe.has_permission(row.reference_type, "read", doc=row.reference_name, throw=True)
		self.settle_only_reference()

	def settle_only_reference(self):
		"""In the form, a payment's only reference settles all of it, as the Books app kept them equal."""
		if len(self.payment_references) == 1 and self.amount:
			self.payment_references[0].amount = self.amount

	def set_missing_values(self):
		"""Fill the party, payment type, accounts and amounts the way the Books app does while editing."""
		party = self.get_party()
		self.set_reference_types(party)
		invoice = self.get_first_invoice()
		if not party and invoice:
			self.party = invoice.party
			party = self.get_party()
		self.payment_type = self.payment_type or _default_payment_type(party, invoice)
		self.reference_type = _reference_type(invoice, self.payment_type) or self.reference_type
		self.account = self.account or _default_party_account(party, invoice, self.payment_type)
		self.payment_account = self.payment_account or _default_payment_account(self.payment_method, invoice)
		self.set_amounts()

	def get_party(self):
		fields = ["role", "default_account"]
		return self.party and frappe.db.get_value("Books Party", self.party, fields, as_dict=True)

	def set_reference_types(self, party):
		"""A reference without a type is a supplier's purchase invoice, else a sales invoice."""
		is_supplier = party and party.role == "Supplier"
		doctype = "Books Purchase Invoice" if is_supplier else "Books Sales Invoice"
		for row in self.payment_references:
			row.reference_type = row.reference_type or doctype

	def set_amounts(self):
		"""Allocate each invoice what it owes, and settle what is allocated unless an amount is set."""
		for row in self.payment_references:
			row.amount = row.amount or _outstanding(row)
		self.amount = self.amount or sum_decimal(row.amount for row in self.payment_references)
		self.amount_paid = rounded(as_decimal(self.amount) - as_decimal(self.writeoff))

	def get_first_invoice(self):
		"""Return the doctype, party, return link, account and POS flag of the first referenced invoice."""
		row = self.payment_references[0] if self.payment_references else None
		if not row or row.reference_type not in REFERENCE_DOCTYPES.values():
			return None
		fields = ["party", "return_against", "account"]
		if row.reference_type == "Books Sales Invoice":
			fields.append("is_pos")
		invoice = frappe.db.get_value(row.reference_type, row.reference_name, fields, as_dict=True)
		return invoice and frappe._dict(invoice, doctype=row.reference_type)

	def validate(self):
		if as_decimal(self.amount) <= 0:
			frappe.throw(_("Payment amount must be greater than zero."))
		if as_decimal(self.writeoff) < 0 or as_decimal(self.writeoff) > as_decimal(self.amount):
			frappe.throw(_("Write-off must be between zero and the payment amount."))
		if self.account == self.payment_account:
			frappe.throw(_("The From and To accounts cannot be the same."))
		self.validate_accounts()
		self.validate_payment_method()
		allocations = _validate_allocations(self)
		self.validate_counter_account([invoice for invoice, _amount in allocations])
		self.set("taxes", _realised_taxes(allocations))

	def validate_accounts(self):
		"""The account is the party's ledger; the payment account suits the payment method."""
		validate_party_account(self, "account", frappe.db.get_value("Books Party", self.party, "role"))
		method_type = self.payment_method and frappe.get_cached_value(
			"Books Payment Method", self.payment_method, "type"
		)
		validate_payment_account(self, "payment_account", method_type)

	def validate_payment_method(self):
		validate_payment_details(self.payment_method, self.reference_id, self.clearance_date)

	def validate_counter_account(self, invoices):
		"""Cash for POS sales goes through the counter, which closing the POS shift reconciles."""
		if not any(invoice.get("is_pos") for invoice in invoices):
			return
		if not is_cash_method(self.payment_method):
			return
		counter = counter_cash_account()
		if self.payment_account != counter:
			frappe.throw(
				_("Cash payments for POS invoices must use the counter cash account {0}.").format(counter)
			)

	def on_submit(self):
		posting = LedgerPosting(self)
		if self.payment_type == "Receive":
			posting.debit(self.payment_account, self.amount_paid, self.party)
			posting.credit(self.account, self.amount, self.party)
		else:
			posting.debit(self.account, self.amount, self.party)
			posting.credit(self.payment_account, self.amount_paid, self.party)
		_post_taxes(self, posting)
		_post_writeoff(self, posting)
		posting.post()
		_apply_allocations(self, reverse=False)
		update_party_outstanding(self.party)

	def on_cancel(self):
		reverse_entries(self)
		_apply_allocations(self, reverse=True)
		update_party_outstanding(self.party)

	def on_trash(self):
		delete_entries(self)


def _outstanding(row):
	"""What the referenced invoice owes; returns owe a negative balance, but allocations are positive."""
	if not row.reference_name or row.reference_type not in REFERENCE_DOCTYPES.values():
		return 0
	return abs(as_decimal(frappe.db.get_value(row.reference_type, row.reference_name, "outstanding_amount")))


def _default_payment_type(party, invoice):
	if invoice:
		return payment_type_for(invoice.doctype, bool(invoice.return_against))
	if party:
		return "Pay" if party.role == "Supplier" else "Receive"
	return None


def _reference_type(invoice, payment_type):
	"""The list a payment shows in: its invoice's, else Purchase Payments for Pay and Sales Payments for Receive."""
	if invoice:
		return "PurchaseInvoice" if invoice.doctype == "Books Purchase Invoice" else "SalesInvoice"
	if payment_type:
		return "PurchaseInvoice" if payment_type == "Pay" else "SalesInvoice"
	return None


def _default_party_account(party, invoice, payment_type):
	"""The party's ledger, else the invoice's, else the newest payable or receivable ledger."""
	if party and party.role != "Both" and party.default_account:
		return party.default_account
	if invoice:
		return invoice.account
	return latest_ledger_account("Payable" if payment_type == "Pay" else "Receivable")


def _default_payment_account(payment_method, invoice):
	"""POS cash goes to the counter, other payments to the method's account, else the newest ledger
	of the method's kind."""
	fields = ["type", "account"]
	method = payment_method and frappe.db.get_value(
		"Books Payment Method", payment_method, fields, as_dict=True
	)
	if not method:
		return None
	if method.type == "Cash" and invoice and invoice.get("is_pos"):
		return counter_cash_account()
	if method.account:
		return method.account
	return latest_ledger_account("Cash" if method.type == "Cash" else "Bank")


def _validate_allocations(payment):
	allocated = defaultdict(as_decimal)
	for row in payment.payment_references:
		if as_decimal(row.amount) <= 0:
			frappe.throw(_("Allocated amounts must be greater than zero."))
		allocated[row.reference_type, row.reference_name] += as_decimal(row.amount)
	allocations = [(_referenced_invoice(payment, *key), amount) for key, amount in allocated.items()]
	for invoice, amount in allocations:
		_validate_allocation(payment, invoice, amount)
	if sum_decimal(allocated.values()) > as_decimal(payment.amount):
		frappe.throw(_("Payment allocations cannot exceed the settled amount, including the write-off."))
	return allocations


def _validate_allocation(payment, invoice, amount):
	outstanding = abs(as_decimal(invoice.outstanding_amount))
	if amount > outstanding:
		frappe.throw(_("Allocated amount exceeds the invoice outstanding amount."))
	if amount < outstanding and not frappe.db.get_single_value(
		"Books Accounting Settings", "enable_partial_payment"
	):
		frappe.throw(
			_("Enable partial payments to pay less than the outstanding amount of {0}.").format(invoice.name)
		)
	payment_type = payment_type_for(invoice.doctype, bool(invoice.return_against))
	if payment.payment_type != payment_type:
		frappe.throw(_("A payment for {0} must be a {1} payment.").format(invoice.name, payment_type))


def _referenced_invoice(payment, doctype, name):
	if doctype not in REFERENCE_DOCTYPES.values():
		frappe.throw(_("Select a sales or purchase invoice reference."))
	invoice = frappe.get_doc(doctype, name, for_update=True, check_permission="read")
	if invoice.docstatus != 1:
		frappe.throw(_("Submit invoice {0} before allocating a payment to it.").format(name))
	if invoice.party != payment.party:
		frappe.throw(_("Invoice {0} does not belong to party {1}.").format(name, payment.party))
	return invoice


def _realised_taxes(allocations):
	"""Move invoice taxes that have a payment account to it, in proportion to what is paid."""
	taxes = {}
	for invoice, amount in allocations:
		for tax in _invoice_realised_taxes(invoice, amount):
			key = (tax["account"], tax["from_account"])
			taxes.setdefault(key, {**tax, "amount": as_decimal(0)})["amount"] += tax["amount"]
	return [tax for tax in taxes.values() if tax["amount"]]


def _invoice_realised_taxes(invoice, amount):
	payment_accounts = _tax_payment_accounts(invoice)
	total = abs(as_decimal(invoice.base_grand_total))
	if not payment_accounts or not total:
		return
	paid = total - abs(as_decimal(invoice.outstanding_amount))
	for tax in invoice.taxes:
		if tax.account not in payment_accounts:
			continue
		yield {
			"account": payment_accounts[tax.account],
			"from_account": tax.account,
			"rate": tax.rate,
			"amount": tax_share(invoice, tax, amount, paid),
		}


def tax_share(invoice, tax, amount, paid=0):
	"""Return the base-currency part of an invoice tax that `amount` settles after `paid`."""
	total = abs(as_decimal(invoice.base_grand_total))
	base_tax = abs(as_decimal(tax.amount)) * as_decimal(invoice.exchange_rate or 1)
	# Share what is paid so far, so partial payments add up to the full tax.
	return rounded(base_tax * (paid + amount) / total) - rounded(base_tax * paid / total)


def _tax_payment_accounts(invoice):
	"""Map each invoice tax account to the account its tax moves to on payment."""
	accounts = {}
	for tax_name in {row.tax for row in invoice.items if row.tax}:
		for detail in frappe.get_cached_doc("Books Tax", tax_name).details:
			if not detail.payment_account:
				continue
			if accounts.setdefault(detail.account, detail.payment_account) != detail.payment_account:
				frappe.throw(
					_("Tax account {0} moves to more than one payment account.").format(detail.account)
				)
	return accounts


def _apply_allocations(payment, reverse):
	for row in payment.payment_references:
		invoice = frappe.db.get_value(
			row.reference_type, row.reference_name, ["outstanding_amount", "return_against"], as_dict=True
		)
		settled = -as_decimal(row.amount) if invoice.return_against else as_decimal(row.amount)
		if reverse:
			settled = -settled
		frappe.db.set_value(
			row.reference_type,
			row.reference_name,
			"outstanding_amount",
			rounded(as_decimal(invoice.outstanding_amount) - settled),
			update_modified=False,
		)


def _post_taxes(payment, posting):
	for tax in payment.taxes:
		if payment.payment_type == "Receive":
			posting.debit(tax.from_account, tax.amount)
			posting.credit(tax.account, tax.amount)
		else:
			posting.credit(tax.from_account, tax.amount)
			posting.debit(tax.account, tax.amount)


def _post_writeoff(payment, posting):
	writeoff = as_decimal(payment.writeoff)
	if writeoff == 0:
		return
	writeoff_account = frappe.db.get_single_value("Books Accounting Settings", "write_off_account")
	if not writeoff_account:
		frappe.throw(_("Set a write-off account in Books Accounting Settings."))
	if payment.payment_type == "Pay":
		posting.credit(writeoff_account, writeoff)
	else:
		posting.debit(writeoff_account, writeoff)


def payment_type_for(invoice_doctype, is_return):
	"""Money comes in for sales and for purchase returns, and goes out otherwise."""
	return "Receive" if (invoice_doctype == "Books Sales Invoice") != is_return else "Pay"


def map_invoice_payment(invoice_doctype, invoice_name):
	"""Return an unsaved payment that settles the invoice's outstanding amount."""
	return get_mapped_doc(
		invoice_doctype,
		invoice_name,
		{
			invoice_doctype: {
				"doctype": "Books Payment",
				"validation": {"docstatus": ["=", 1]},
				"field_no_map": ["date", "number_series", "attachment"],
			},
			"Books Tax Summary": {"doctype": "Books Tax Summary", "ignore": True},
		},
		postprocess=_settle_invoice,
	)


def _settle_invoice(invoice, payment):
	outstanding = abs(as_decimal(invoice.outstanding_amount))
	if not outstanding:
		frappe.throw(_("Invoice {0} has no outstanding amount.").format(invoice.name))
	account = _settling_account(invoice)
	payment.update(
		{
			"payment_type": payment_type_for(invoice.doctype, bool(invoice.return_against)),
			"payment_method": _settling_method(account),
			"payment_account": account,
			"amount": outstanding,
		}
	)
	payment.append(
		"payment_references",
		{"reference_type": invoice.doctype, "reference_name": invoice.name, "amount": outstanding},
	)


def validate_payment_details(payment_method, reference_id, clearance_date):
	"""A non-cash payment needs a reference number, and its method may need a clearance date."""
	method = frappe.db.get_value(
		"Books Payment Method", payment_method, ["type", "requires_clearance_date"], as_dict=True
	)
	if not method:
		return
	if method.type != "Cash" and not reference_id:
		frappe.throw(_("Please enter a reference number."))
	if method.requires_clearance_date and not clearance_date:
		frappe.throw(_("Please select a clearance date."))


def default_payment_account(invoice_doctype) -> str | None:
	"""Return the Books Defaults account that pays invoices of the doctype."""
	fieldname = (
		"purchase_payment_account" if invoice_doctype == "Books Purchase Invoice" else "sales_payment_account"
	)
	return frappe.db.get_single_value("Books Defaults", fieldname)


def _settling_account(invoice):
	if invoice.get("is_pos"):
		return counter_cash_account()
	account = default_payment_account(invoice.doctype) or frappe.db.get_value(
		"Books Payment Method", "Cash", "account"
	)
	if not account:
		frappe.throw(_("Set a default payment account in Books Defaults."))
	return account


def _settling_method(account):
	"""Return the oldest payment method of the account's type: Cash for cash, Bank for bank."""
	account_type = frappe.db.get_value("Books Account", account, "account_type")
	method = frappe.db.get_value(
		"Books Payment Method", {"type": account_type}, "name", order_by="creation asc"
	)
	if not method:
		frappe.throw(_("Add a {0} payment method to pay from {1}.").format(_(account_type), account))
	return method
