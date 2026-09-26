"""Payment validation, posting, and allocation behavior."""

from collections import defaultdict

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc
from frappe.utils import now_datetime

from frappe_books.accounting.ledger import LedgerPosting, delete_entries, reverse_entries
from frappe_books.accounting.money import as_decimal, rounded, sum_decimal
from frappe_books.accounting.outstanding import update_party_outstanding
from frappe_books.series import SeriesNamingMixin

REFERENCE_DOCTYPES = {
	"SalesInvoice": "Books Sales Invoice",
	"PurchaseInvoice": "Books Purchase Invoice",
	"Books Sales Invoice": "Books Sales Invoice",
	"Books Purchase Invoice": "Books Purchase Invoice",
}


class PaymentController(SeriesNamingMixin, Document):
	def before_validate(self):
		self.amount_paid = rounded(as_decimal(self.amount) - as_decimal(self.writeoff))
		for row in self.payment_references:
			row.reference_type = REFERENCE_DOCTYPES.get(row.reference_type, row.reference_type)

	def validate(self):
		if as_decimal(self.amount) <= 0:
			frappe.throw(_("Payment amount must be greater than zero."))
		if as_decimal(self.writeoff) < 0 or as_decimal(self.writeoff) > as_decimal(self.amount):
			frappe.throw(_("Write-off must be between zero and the payment amount."))
		if self.account == self.payment_account:
			frappe.throw(_("The From and To accounts cannot be the same."))
		self.validate_payment_method()
		self.set("taxes", _realised_taxes(_validate_allocations(self)))

	def validate_payment_method(self):
		method = frappe.db.get_value(
			"Books Payment Method", self.payment_method, ["type", "requires_clearance_date"], as_dict=True
		)
		if not method:
			return
		if method.type != "Cash" and not self.reference_id:
			frappe.throw(_("Set a reference ID for {0} payments.").format(self.payment_method))
		if method.requires_clearance_date and not self.clearance_date:
			frappe.throw(_("Set a clearance date for {0} payments.").format(self.payment_method))

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
	invoice = frappe.get_doc(doctype, name, for_update=True)
	if invoice.docstatus != 1:
		frappe.throw(_("Submit invoice {0} before allocating a payment to it.").format(name))
	if invoice.party != payment.party:
		frappe.throw(_("Invoice {0} belongs to {1}, not to {2}.").format(name, invoice.party, payment.party))
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
		base_tax = abs(as_decimal(tax.amount)) * as_decimal(invoice.exchange_rate or 1)
		yield {
			"account": payment_accounts[tax.account],
			"from_account": tax.account,
			"rate": tax.rate,
			# Realise the share paid so far, so partial payments add up to the full tax.
			"amount": rounded(base_tax * (paid + amount) / total) - rounded(base_tax * paid / total),
		}


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
	payment.update(
		{
			"date": now_datetime(),
			"payment_type": payment_type_for(invoice.doctype, bool(invoice.return_against)),
			"payment_method": "Cash",
			"payment_account": _default_payment_account(invoice.doctype),
			"amount": outstanding,
		}
	)
	payment.append(
		"payment_references",
		{"reference_type": invoice.doctype, "reference_name": invoice.name, "amount": outstanding},
	)


def _default_payment_account(invoice_doctype):
	fieldname = (
		"sales_payment_account" if invoice_doctype == "Books Sales Invoice" else "purchase_payment_account"
	)
	account = frappe.db.get_single_value("Books Defaults", fieldname) or frappe.db.get_value(
		"Books Payment Method", "Cash", "account"
	)
	if not account:
		frappe.throw(_("Set a default payment account in Books Defaults."))
	return account
